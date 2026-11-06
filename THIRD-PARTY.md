# Third-party material

The MIT license in `LICENSE` covers this repo's own code and docs. These parts come from elsewhere and keep their own licenses:

| Path | Source | License |
|---|---|---|
| `.claude/skills/{figma,hyperframes,hyperframes-cli,hyperframes-registry,media-use,remotion-to-hyperframes}` | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 (see upstream) |
| `.claude/skills/media-use/audio/assets/sfx/*.mp3` | bundled with HyperFrames, from Pixabay | Pixabay Content License |
| `.claude/skills/gsap-*` | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | see upstream |
| `.claude/skills/earshot` | [Leonxlnx/earshot](https://github.com/Leonxlnx/earshot) | MIT |
| `brand-kits/_fonts/*`, `.claude/skills/hyperframes/assets/frame-presets/*/fonts/*` | Instrument Serif, Noto Sans/Serif TC, LXGW WenKai TC, EB Garamond, Inter, JetBrains Mono | SIL Open Font License 1.1 (`OFL*.txt` next to each) |

`skills-lock.json` pins the upstream skills. `brand-kits/kestrel` and `brand-kits/novamind` are made-up demo brands.
