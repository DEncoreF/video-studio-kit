# earshot-gate.py: earshot's critique and timeline on one file in one process (the models load once), for scripts/sound-gate.mjs.
#   ~/Projects/earshot/.venv/bin/python scripts/lib/earshot-gate.py <media> <out dir> [cues.json]
# Writes <out>/critique.{json,txt} and <out>/timeline.{json,txt}; prints one JSON line: the verdict and the sync numbers.
import json, pathlib, sys
from earshot import api
from earshot.critique import critique_text

media, out = sys.argv[1], pathlib.Path(sys.argv[2]); cues = sys.argv[3] if len(sys.argv) > 3 else None
out.mkdir(parents=True, exist_ok=True)
C = api.critique(media, video=media)
(out / "critique.json").write_text(json.dumps(C, ensure_ascii=False, indent=1, default=str))
(out / "critique.txt").write_text(critique_text(C) + "\n")
T = api.timeline(media, video=media, cues=cues)
(out / "timeline.json").write_text(json.dumps(T, ensure_ascii=False, indent=1, default=str))
(out / "timeline.txt").write_text(str(T.get("text", "")) + "\n")
sync = T.get("sync") or {}
stat = lambda k: (sync.get(k) or {}).get("stats") or {}
cq, ct = stat("cues"), stat("cuts")
items = (sync.get("cues") or {}).get("items") or []
# heard: an onset within 100 ms (OK, near), or a whoosh / riser peak or a level peak answering it (swell, peak); missed: none of these
print(json.dumps({
  "verdict": C.get("verdict"), "score": C.get("score"), "in_range": C.get("in_range"), "scored": C.get("scored"),
  "critical": C.get("critical_issues"), "major": C.get("major_issues"),
  "cues": {"n": len(items), "hit_100ms": cq.get("hit_within_100ms"), "heard": round(sum(i.get("status") in ("OK", "near", "swell", "peak") for i in items) / len(items), 3) if items else None,
           "median_ms": cq.get("median_abs_offset_ms")},
  "cuts": {"n": ct.get("n", 0), "hit_100ms": ct.get("hit_within_100ms"), "no_sound": ct.get("no_sound", [])},
  "cue_misses": [{"t": i.get("t"), "id": i.get("id"), "status": i.get("status")} for i in items if i.get("status") in ("no sound", "off")],
}, default=str))
