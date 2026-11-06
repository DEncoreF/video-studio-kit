# Look-dev defaults for product renders in Blender (Cycles / EEVEE), imported by a film's scene script:
#   import sys; sys.path.insert(0, "<tool>/scripts/blender"); import lookdev
#   lookdev.render(scene, quality)            draft = EEVEE at half size (seconds a frame), final = Cycles on the GPU only
#   lookdev.world_hdri(scene, "interior", strength=0.35)   Blender's bundled studio HDRIs: metal needs something to reflect
#   lookdev.bevel(material) · lookdev.vary_roughness(material, base) · lookdev.camera(cam_data, lens, fstop)
# Why (research 2026-10-24, video-direction references): nothing real has a razor edge; roughness that never varies reads
# as CG; metal without an environment looks flat; animation without motion blur looks cheap.
import bpy, os, math

def render(sc, quality="draft", samples=None, fps=30):
    sc.render.fps = fps
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception: pass
    sc.render.use_motion_blur = True
    sc.render.use_overwrite = False; sc.render.use_placeholder = True   # a stopped render picks up where it left off
    if quality == "draft":
        sc.render.engine = "BLENDER_EEVEE"; sc.render.resolution_percentage = 50
        ee = sc.eevee
        for k, v in (("taa_render_samples", samples or 16), ("use_raytracing", True), ("use_shadows", True)):
            try: setattr(ee, k, v)
            except Exception: pass
    else:
        sc.render.engine = "CYCLES"; sc.render.resolution_percentage = 100
        sc.cycles.samples = samples or 128; sc.cycles.use_denoising = True; sc.cycles.use_adaptive_sampling = True
        try:   # the GPU only: the CPU stays free for the person at the computer
            pr = bpy.context.preferences.addons["cycles"].preferences; pr.compute_device_type = "METAL"; pr.get_devices()
            for dv in pr.devices: dv.use = dv.type != "CPU"
            sc.cycles.device = "GPU"
        except Exception as e: print("lookdev: GPU setup failed, rendering on the CPU:", e)

def world_hdri(sc, name="interior", strength=0.35, rotation_deg=0.0, tint=None):
    path = os.path.join(bpy.utils.system_resource("DATAFILES", path="studiolights/world"), name + ".exr")
    w = sc.world or bpy.data.worlds.new("world"); sc.world = w; w.use_nodes = True; nt = w.node_tree
    bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(path)
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Rotation"].default_value[2] = math.radians(rotation_deg)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    src = env.outputs["Color"]
    if tint:
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
        mx.inputs["B"].default_value = (*tint, 1); nt.links.new(src, mx.inputs["A"]); src = mx.outputs["Result"]
    nt.links.new(src, bg.inputs["Color"]); bg.inputs["Strength"].default_value = strength
    return w

def _bsdf(m): return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")

def bevel(m, radius=0.0012):
    nt = m.node_tree; b = _bsdf(m); bv = nt.nodes.new("ShaderNodeBevel"); bv.inputs["Radius"].default_value = radius; bv.samples = 8
    nt.links.new(bv.outputs["Normal"], b.inputs["Normal"]); return m

def vary_roughness(m, base=None, amount=0.08, scale=60.0):
    nt = m.node_tree; b = _bsdf(m); base = b.inputs["Roughness"].default_value if base is None else base
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 8.0
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = max(0.05, base - amount); mr.inputs["To Max"].default_value = min(0.95, base + amount)
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"]); nt.links.new(mr.outputs["Result"], b.inputs["Roughness"]); return m

def camera(cd, lens=40, fstop=2.8, focus=None):
    cd.lens = lens; cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    if focus is not None: cd.dof.focus_object = focus
    return cd
