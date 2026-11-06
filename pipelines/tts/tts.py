"""Narration for a video project with edge-tts, with brand-name respelling and caption timing.

Reads <video>/narration.json:
  { "voice": "zh-TW-YunJheNeural", "rate": "+0%",
    "lines": [ { "key": "s1", "start": 0, "slot": 5, "text": "…", "offset": 0.3, "rate": "+10%" }, … ] }
and <video>/brand/pronunciation.json (from the brand kit: [{ "text": "NovaMind", "say": "Nova Mind" }, …]).
Writes <video>/assets/vo/<key>.mp3 and <video>/assets/vo/manifest.json (start, slot, offset, spoken,
captions — caption text as written, timing from the respelled audio).

  .venv/bin/python pipelines/tts/tts.py videos/<video>
"""
import asyncio, json, pathlib, re, sys
import edge_tts

video = pathlib.Path(sys.argv[1]).resolve()
spec = json.loads((video / "narration.json").read_text())
VOICE = spec.get("voice", "zh-TW-YunJheNeural")
RATE = spec.get("rate", "+0%")
OUT = video / "assets" / "vo"
OUT.mkdir(parents=True, exist_ok=True)
pron_file = video / "brand" / "pronunciation.json"
PRON = json.loads(pron_file.read_text()) if pron_file.exists() else []


def respell(text):
    """Apply the brand pronunciation table, longest names first, whole words only."""
    for p in sorted(PRON, key=lambda p: -len(p["text"])):
        text = re.sub(rf"(?<![A-Za-z]){re.escape(p['text'])}(?![A-Za-z])", p["say"], text)
    return text


async def synth(key, text, rate, tries=3):
    """edge-tts occasionally returns no audio; retry a few times."""
    for attempt in range(tries):
        try:
            comm = edge_tts.Communicate(text, VOICE, rate=rate, boundary="WordBoundary")
            words, audio = [], bytearray()
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    audio += chunk["data"]
                elif chunk["type"] == "WordBoundary":
                    words.append({"text": chunk["text"], "start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7})
            (OUT / f"{key}.mp3").write_bytes(audio)
            return words
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == tries - 1:
                raise
            await asyncio.sleep(2)


def captions(display, spoken_text, words):
    """Split at ，：。 ; time each chunk by the respelled words it covers; show the written text."""
    norm = lambda t: re.sub(r"\s", "", t)
    parts = [p.strip() for p in re.split(r"[，：。]", display) if p.strip()]
    sparts = [p.strip() for p in re.split(r"[，：。]", spoken_text) if p.strip()]
    out, i = [], 0
    for shown, said in zip(parts, sparts):
        need, got, first, last = norm(said).replace("、", ""), "", None, 0
        while i < len(words) and len(got) < len(need):
            first = first if first is not None else words[i]["start"]
            got += norm(words[i]["text"]); last = words[i]["end"]; i += 1
        out.append({"text": shown, "start": round(first or 0, 2), "end": round(last, 2)})
    return out


async def main():
    manifest = []
    for ln in spec["lines"]:
        said = respell(ln["text"])
        words = await synth(ln["key"], said, ln.get("rate", RATE))
        spoken = words[-1]["end"] if words else 0
        offset = ln.get("offset", 0.3)
        manifest.append({"key": ln["key"], "start": ln["start"], "slot": ln["slot"], "offset": offset, "text": ln["text"],
                         "spoken": round(spoken, 2), "captions": captions(ln["text"], said, words)})
        warn = "  <-- runs past its slot" if offset + spoken > ln["slot"] + offset - 0.15 else ""
        print(f"{ln['key']:5} slot {ln['slot']:>4}s spoken {spoken:4.2f}s{warn}")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")

asyncio.run(main())
