# Bake a film's Blender scene for three.js: Blender lights it once, the browser draws every frame (library/three/baked-scene.js).
#   nohup blender -b -P <tool>/scripts/blender/bake.py -- --config <film>/blender/bake.json > <out>/bake.log 2>&1 &
# The scene comes from the film's own scene script (everything above its render section), so the bake and any Cycles
# reference frames share one source. Resume-safe: a map already on disk is not baked again (delete it to rebake).
#
# What it writes into config.out (three.js coordinates, y up):
#   anim.json     per frame: the camera's world matrix and focus distance; each moving object's world matrix; the
#                 two-pose weight (0 = pose a, 1 = pose b) for hinged parts
#   <group>.bin   positions, normals, lightmap UVs; scene.json lists groups, their materials, lights, the world
#   <group>-albedo.png             diffuse colour (sRGB)
#   <group>-<pose>.png             diffuse light with the moving part at pose a / pose b (sRGB-encoded, ×scale in scales.json)
#   <group>-glow.png               light from an emissive object (a screen) alone, to be scaled by the film per frame
#   <name>-view<i>.png             COMBINED shading baked from the camera at a frame along its path (view-dependent heroes)
#
# Light is stored apart from colour, so it can be small (it is soft) while a wood grain keeps 4096.
# Per-view bakes are for metal or glass heroes whose look is all reflection (brushed metal, bevels, a lamp's gradient):
# they reproduce Cycles exactly along THIS camera path, at the cost of a rebake when the camera changes (C's machine:
# 7 views at 2048 ≈ 14 min). Objects in a view bake keep their own transforms (Principled anisotropy brushes around each
# object's own origin; joining them changes the look) and share one UV layout.
#
# config (JSON; paths relative to the config file):
# { "scene": "../../films/focus/direction/_blender/scene.py", "marker": "# ---------- render ----------",
#   "args": ["--anim", "--shot", "1"], "out": "../assets/bake", "frames": [1, 300], "fps": 30, "samples": 512,
#   "camera": "cam", "focus": "aim",
#   "moving": ["hinge"],                                  objects whose world matrix is sampled per frame
#   "poses": { "object": "hinge", "a": 1, "b": 300 },     two-pose bake for a hinged part: frames of its two poses
#   "groups": [ { "name": "desk", "objects": ["desk"], "light": 1024, "albedo": 4096, "poses": true, "glow": true },
#               { "name": "base", "children_of": "laptop", "light": 1024, "albedo": 2048, "poses": true, "glow": true },
#               { "name": "lid", "children_of": "hinge", "exclude": ["screen"], "space": "hinge", "light": 512, "albedo": 1024 } ],
#   "export": [ { "name": "screen", "object": "screen", "space": "hinge" } ],     meshes exported with their own UVs, not baked
#   "glow": { "object": "screen", "image": "tex/inbox.png", "strength": 3.0, "res_div": 2 },
#   "lights": ["lamp", "rim"], "world": { "strength": 0.06, "rotation": 120, "tint": [1, 0.82, 0.66], "hdri": "interior" },
#   "views": { "name": "machine", "children_of": "machine", "exclude": ["logo"], "frames": [1, 16, 31, 46, 61, 76, 91], "res": 2048,
#              "extra": [ { "name": "logo", "object": "logo", "size": [1024, 256], "image": "tex/logo.png" } ],
#              "groups": ["desk"],
#              "world": { "color": "#0b0a0d", "strength": 0.6 }, "unlink": ["Normal", "Roughness"] } }
# views.world / views.unlink: only to match Cycles reference frames rendered with older scene settings (C's were: a flat
# world, no bevel or roughness-variation nodes). Check the reference first; normally leave them out.
import bpy, sys, os, json, math, time, shutil
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
CFG_PATH = os.path.abspath(argv[argv.index("--config") + 1]); CFG = json.load(open(CFG_PATH)); BASE = os.path.dirname(CFG_PATH)
rel = lambda p: os.path.normpath(os.path.join(BASE, p))
OUT = rel(CFG.get("out", "bake")); os.makedirs(OUT, exist_ok=True)
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else CFG.get("samples", 512)
T0 = time.time(); log = lambda *a: print(f"[bake {time.time() - T0:7.1f}s]", *a, flush=True)

# ---------- the scene, from the film's scene script (its render section left out) ----------
SCENE = rel(CFG["scene"])
src = open(SCENE).read().split(CFG.get("marker", "# ---------- render ----------"))[0]
sys.argv = ["blender", "--", *CFG.get("args", [])]
G = {"__file__": SCENE, "__name__": "scene"}; exec(compile(src, SCENE, "exec"), G)
sc = bpy.context.scene; OB = bpy.data.objects
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lookdev
lookdev.render(sc, "final", samples=SAMPLES)   # Cycles on the GPU
C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))   # Blender z-up → three.js y-up
CI = C.inverted()
flat = lambda m: [round(m[r][c], 6) for c in range(4) for r in range(4)]   # column-major, as three.js Matrix4.fromArray
F0, F1 = CFG.get("frames", [1, 300])

# ---------- 1. the motion ----------
cam, focus = OB[CFG.get("camera", "cam")], OB.get(CFG.get("focus", "")) if CFG.get("focus") else None
moving = [OB[n] for n in CFG.get("moving", [])]
P = CFG.get("poses")
if P:
    po = OB[P["object"]]; qs = {}
    for k in ("a", "b"): sc.frame_set(P[k]); bpy.context.view_layer.update(); qs[k] = po.matrix_local.to_quaternion()
    span = qs["a"].rotation_difference(qs["b"]).angle or 1.0
frames = []
for f in range(F0, F1 + 1):
    sc.frame_set(f); bpy.context.view_layer.update()
    cm = cam.matrix_world.copy(); fr = {"cam": flat(C @ cm)}
    fr["focus"] = round(-(cm.inverted() @ focus.matrix_world.translation).z, 5) if focus else round(cam.data.dof.focus_distance, 5)
    if moving: fr["moving"] = {o.name: flat(C @ o.matrix_world @ CI) for o in moving}
    if P: fr["pose"] = round(min(1.0, qs["a"].rotation_difference(po.matrix_local.to_quaternion()).angle / span), 5)
    frames.append(fr)
cd = cam.data
json.dump({"fps": CFG.get("fps", 30), "first": F0, "lens": cd.lens, "sensor": cd.sensor_width, "fstop": cd.dof.aperture_fstop, "frames": frames},
          open(os.path.join(OUT, "anim.json"), "w"))
log(f"anim.json: {len(frames)} frames")

# ---------- 2. groups: joined copies with a lightmap UV each ----------
if P: sc.frame_set(P["b"]); bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
def pick(spec):
    objs = [OB[n] for n in spec.get("objects", [])]
    if spec.get("children_of"): objs += [o for o in OB[spec["children_of"]].children_recursive if o.type == "MESH"] if spec.get("recursive") else [o for o in OB[spec["children_of"]].children if o.type == "MESH"]
    return [o for o in objs if o.name not in spec.get("exclude", [])]
def unwrap(objs):
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004); bpy.ops.uv.pack_islands(margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs: o.select_set(False)
built = {}
for spec in CFG.get("groups", []):
    name, objs, space = spec["name"], pick(spec), OB.get(spec.get("space", "")) if spec.get("space") else None
    inv = space.matrix_world.inverted() if space else Matrix(); parts = []
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg); me.transform(inv @ o.matrix_world)
        ob = bpy.data.objects.new(f"{name}_part", me); sc.collection.objects.link(ob); parts.append(ob); o.hide_render = True; o.hide_set(True)
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, selected_objects=parts): bpy.ops.object.join()
    g = parts[0]; g.name = name
    for s in g.material_slots: s.material = s.material.copy()          # each group bakes into its own images
    if space: g.parent = space; g.matrix_parent_inverse = Matrix(); g.matrix_basis = Matrix()
    uv = g.data.uv_layers.new(name="bake"); g.data.uv_layers.active = uv; uv.active_render = True
    unwrap([g]); built[name] = (g, space, spec); log(f"group {name}: {len(objs)} objects, {len(g.data.polygons)} faces")

V = CFG.get("views"); vparts, vmats = [], {}
if V:   # the view-baked hero: separate objects, own transforms, one shared UV layout
    for o in pick(V):
        c = o.copy(); c.data = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg); c.modifiers.clear(); c.name = f"v_{o.name}"
        sc.collection.objects.link(c); c.parent = o.parent; c.matrix_parent_inverse = o.matrix_parent_inverse.copy(); c.matrix_basis = o.matrix_basis.copy()
        for sl in c.material_slots:
            m = sl.material; sl.link = "OBJECT"; sl.material = vmats.setdefault(m.name, m.copy())
        uv = c.data.uv_layers.new(name="bake"); c.data.uv_layers.active = uv; uv.active_render = True
        o.hide_render = True; o.hide_set(True); vparts.append(c)
    bpy.context.view_layer.update(); unwrap(vparts); log(f"view hero {V['name']}: {len(vparts)} objects kept apart, one UV layout")

# ---------- 3. export the geometry ----------
def bsdf(m): return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.node_tree else None
def export_mesh(name, ob, uvname):
    me = ob.data; me.calc_loop_triangles(); uvl = me.uv_layers[uvname].data
    tris = sorted(me.loop_triangles, key=lambda t: t.material_index); n = len(tris) * 3
    Pp = np.zeros((n, 3), np.float32); N = np.zeros((n, 3), np.float32); U = np.zeros((n, 2), np.float32); ranges = {}
    for i, t in enumerate(tris):
        for j, li in enumerate(t.loops):
            v = me.vertices[me.loops[li].vertex_index].co; nn = me.loops[li].normal if t.use_smooth else t.normal
            Pp[i * 3 + j] = (v.x, v.z, -v.y); N[i * 3 + j] = (nn.x, nn.z, -nn.y); U[i * 3 + j] = uvl[li].uv
        r = ranges.setdefault(t.material_index, [i * 3, 0]); r[1] += 3
    np.concatenate([Pp.ravel(), N.ravel(), U.ravel()]).astype(np.float32).tofile(os.path.join(OUT, f"{name}.bin"))
    mats = []
    for mi, (start, count) in sorted(ranges.items()):
        m = ob.material_slots[mi].material if mi < len(ob.material_slots) else None; b = bsdf(m)
        col = tuple(b.inputs["Base Color"].default_value)[:3] if b and not b.inputs["Base Color"].is_linked else (0.0, 0.0, 0.0)
        mats.append({"name": m.name.split(".")[0] if m else "", "start": start, "count": count, "color": [round(c, 5) for c in col],
                     "metal": b.inputs["Metallic"].default_value if b else 0.0, "rough": b.inputs["Roughness"].default_value if b else 0.5,
                     "coat": b.inputs["Coat Weight"].default_value if b else 0.0, "coatRough": b.inputs["Coat Roughness"].default_value if b else 0.03})
    return {"count": n, "materials": mats}
def copy_in(o, M):   # an unlinked copy of o's evaluated mesh, transformed by M (for export only)
    bpy.context.view_layer.update(); d = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(d), depsgraph=d); me.transform(M)
    ob = bpy.data.objects.new(f"x_{o.name}", me)
    for i, sl in enumerate(o.material_slots):
        if i < len(me.materials): me.materials[i] = sl.material
    return ob
man = {"groups": {}, "export": {}, "lights": {}, "world": CFG.get("world", {}), "poses": bool(P)}
for name, (g, space, spec) in built.items():
    if space and space.name in [o.name for o in moving]: man["groups"][name] = {"space": space.name, **export_mesh(name, g, "bake")}
    else: man["groups"][name] = {"space": "world", **export_mesh(name, copy_in(g, g.matrix_world), "bake")}
    man["groups"][name].update({k: spec[k] for k in ("poses", "glow") if k in spec})
for e in CFG.get("export", []):
    o = OB[e["object"]]; sp = OB.get(e.get("space", "")) if e.get("space") else None
    ob = copy_in(o, (sp.matrix_world.inverted() if sp else Matrix()) @ o.matrix_world)
    man["export"][e["name"]] = {"space": sp.name if sp else "world", **export_mesh(e["name"], ob, ob.data.uv_layers[0].name)}
if V:
    xs = [copy_in(c, c.matrix_world) for c in vparts]
    for x in xs: sc.collection.objects.link(x)
    with bpy.context.temp_override(active_object=xs[0], selected_editable_objects=xs, selected_objects=xs): bpy.ops.object.join()
    man["view"] = {"name": V["name"], "times": [(f - F0) / CFG.get("fps", 30) for f in V["frames"]], **export_mesh(V["name"], xs[0], "bake"), "extra": {}}
    sc.collection.objects.unlink(xs[0])
    for x in V.get("extra", []):
        o = OB[x["object"]]; ob = copy_in(o, o.matrix_world)
        man["view"]["extra"][x["name"]] = {"image": os.path.basename(x["image"]) if x.get("image") else None, **export_mesh(x["name"], ob, ob.data.uv_layers[0].name)}
        if x.get("image"): shutil.copy(rel(x["image"]) if not os.path.isabs(x["image"]) else x["image"], os.path.join(OUT, os.path.basename(x["image"])))   # the asset itself, untouched
    man["view"]["groups"] = V.get("groups", [])
for ln in CFG.get("lights", []):
    o = OB[ln]; d = o.data; p = o.matrix_world.translation; z = (o.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
    man["lights"][ln] = {"type": d.type, "pos": [p.x, p.z, -p.y], "dir": [z.x, z.z, -z.y], "color": list(d.color), "energy": d.energy,
                         "size": getattr(d, "size", 0), "spot": getattr(d, "spot_size", 0), "blend": getattr(d, "spot_blend", 0)}
if man["world"].get("hdri"):   # the HDRI three.js reflects (Blender's bundled studio light), copied next to the bakes
    hp = os.path.join(bpy.utils.system_resource("DATAFILES", path="studiolights/world"), man["world"]["hdri"] + ".exr")
    if os.path.exists(hp): shutil.copy(hp, os.path.join(OUT, os.path.basename(hp))); man["world"]["file"] = os.path.basename(hp)
log("geometry exported")

# ---------- 4. bake ----------
GL = CFG.get("glow"); lights = [OB[n].data for n in CFG.get("lights", [])]
bg = sc.world.node_tree.nodes.get("Background") if sc.world else None
STATE = {"energy": [l.energy for l in lights], "world": bg.inputs["Strength"].default_value if bg else 0.0}
glow_b = bsdf(OB[GL["object"]].data.materials[0]) if GL else None
def set_lights(on, glow):
    for l, e in zip(lights, STATE["energy"]): l.energy = e if on else 0.0
    if bg: bg.inputs["Strength"].default_value = STATE["world"] if on else 0.0
    if glow_b:
        glow_b.inputs["Emission Strength"].default_value = GL.get("strength", 3.0) if glow else 0.0
        if glow and GL.get("image"):
            tn = next(n for n in OB[GL["object"]].data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
            tn.image = bpy.data.images.load(rel(GL["image"]) if not os.path.isabs(GL["image"]) else GL["image"], check_existing=True)
SPATH = os.path.join(OUT, "scales.json"); SCALES = json.load(open(SPATH)) if os.path.exists(SPATH) else {}
def to_png(img, path, light):
    a = np.array(img.pixels[:], np.float32).reshape(img.size[1], img.size[0], 4)[..., :3]
    scale = max(float(np.percentile(a, 99.99)) * 1.05, 1e-4) if light else 1.0
    v = np.clip(a / scale, 0, 1); v = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)   # sRGB, so the darks keep their steps
    out = bpy.data.images.new(os.path.basename(path), img.size[0], img.size[1], alpha=False)
    px = np.ones((img.size[1], img.size[0], 4), np.float32); px[..., :3] = v; out.pixels = px.ravel(); out.filepath_raw = path; out.file_format = "PNG"; out.save()
    return scale
def bake(objs, name, size, frame, kind, passes, on, glow, samples, view=False):
    path = os.path.join(OUT, f"{name}.png")
    if os.path.exists(path): log(f"skip {name} (on disk)"); return
    sc.frame_set(frame); bpy.context.view_layer.update(); set_lights(on, glow); sc.cycles.samples = samples
    sc.render.bake.view_from = "ACTIVE_CAMERA" if view else "ABOVE_SURFACE"
    img = bpy.data.images.new(name, size[0], size[1], float_buffer=True, alpha=False)
    for o in objs:
        for s in o.material_slots:
            nt = s.material.node_tree; nd = nt.nodes.get("BAKE") or nt.nodes.new("ShaderNodeTexImage"); nd.name = "BAKE"; nd.image = img; nt.nodes.active = nd
    t = time.time()
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.bake(type=kind, pass_filter=passes, margin=8, use_clear=True) if kind == "DIFFUSE" else bpy.ops.object.bake(type=kind, margin=8, use_clear=True)
    SCALES[name] = to_png(img, path, passes != {"COLOR"}); json.dump(SCALES, open(SPATH, "w"), indent=1)
    log(f"baked {name} {size[0]}x{size[1]} {samples} spp at frame {frame}{' from the camera' if view else ''} in {time.time() - t:.1f}s")
LIGHT = {"DIRECT", "INDIRECT"}; fb = P["b"] if P else F0
for name, (g, space, spec) in built.items():
    bake([g], f"{name}-albedo", (spec["albedo"],) * 2, fb, "DIFFUSE", {"COLOR"}, True, False, 16)
    bake([g], f"{name}-b" if P and spec.get("poses") else f"{name}-light", (spec["light"],) * 2, fb, "DIFFUSE", LIGHT, True, False, SAMPLES)
    if P and spec.get("poses"): bake([g], f"{name}-a", (spec["light"],) * 2, P["a"], "DIFFUSE", LIGHT, True, False, SAMPLES)
    if GL and spec.get("glow"): bake([g], f"{name}-glow", (spec["light"] // GL.get("res_div", 2),) * 2, fb, "DIFFUSE", LIGHT, False, True, SAMPLES // 2)
if V:
    vw = V.get("world")
    if vw and bg:   # match old reference frames: a flat world instead of today's (see the header)
        for lk in list(bg.inputs["Color"].links): sc.world.node_tree.links.remove(lk)
        h = vw["color"]; lin = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in lin]
        bg.inputs["Color"].default_value = (*lin, 1); STATE["world"] = vw["strength"]
    for m in vmats.values():
        b = bsdf(m)
        for k in V.get("unlink", []):
            for lk in list(b.inputs[k].links): m.node_tree.links.remove(lk)
    vs = max(128, SAMPLES // 2)
    for i, f in enumerate(V["frames"]):
        bake(vparts, f"{V['name']}-view{i}", (V.get("res", 2048),) * 2, f, "COMBINED", None, True, False, vs, view=True)
        for x in V.get("extra", []): bake([OB[x["object"]]], f"{x['name']}-view{i}", tuple(x.get("size", [1024, 1024])), f, "COMBINED", None, True, False, vs, view=True)
        for gname in V.get("groups", []): bake([built[gname][0]], f"{gname}-view{i}", (V.get("res", 2048),) * 2, f, "COMBINED", None, True, False, vs, view=True)
json.dump(man, open(os.path.join(OUT, "scene.json"), "w"))
log("done")
