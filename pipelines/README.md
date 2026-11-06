# pipelines

| 工具 | 做什麼 | 指令 |
|---|---|---|
| `tts/tts.py` | 依 `<影片>/narration.json` 用 edge-tts 生成每句旁白；套用品牌套件的發音表（NovaMind→Nova Mind）；輸出 `assets/vo/*.mp3` 與字幕時間 `manifest.json` | `.venv/bin/python pipelines/tts/tts.py videos/<影片>` |
| `music/compose.py` | 依提示表（cue sheet）程式作曲，剪接點落在拍點上，含撕紙、紙張拍擊音效；只用 Python 標準函式庫 | `python3 pipelines/music/compose.py <cues.json> videos/<影片>/assets/music/score.wav [--keys epiano\|none]` |
| `mix/master.mjs` | 一支片的音樂加音效混音：`sections.json` 的曲子與小節對照加上 `build/cues.mjs` 的音效表（`mix/cues.mjs` 的工具寫），`edit.py` 剪接疊音效，傾斜 EQ、響度與限幅，Apple AAC；`--trim N` 跑 N 輪「分軌 → `mix/measure.py` 量每個 cue 高出音樂底多少 → 修 `trim.json`」。說明在 video-motion-craft 的 `references/sound.md` §9 | `node pipelines/mix/master.mjs videos/<片> [--stems] [--trim 3]` |
| `sfx/resynth.py` | 用真實錄音當原料做音效（tick 雨、漩渦、掃描、glide）：每個顆粒都是 CC0 錄音，程式只排位置、密度與濾波，底下墊一層真實房間底噪；`--check` 跑 earshot 的檢查與 realness | `~/Projects/earshot/.venv/bin/python pipelines/sfx/resynth.py <rain\|swirl\|scan\|glide> --src a.wav … --out dir/name --takes 3 --check` |
| `audio/clips.mjs` | 把旁白與配樂寫成 HyperFrames `<audio>` 片段（插在 `index.html` 的 `<!-- hf-audio:start/end -->` 之間），配樂在人聲下自動降到 0.2 | `node pipelines/audio/clips.mjs videos/<影片>` |

第一次使用先建 Python 環境：`python3 -m venv .venv && .venv/bin/pip install edge-tts`。

旁白預設聲音 `zh-TW-YunJheNeural`（使用者選定）。studio 裡一支片的提示表：intro、hit、groove、steps（每 N 秒換一個和弦，例如每台機器一個）、lift、outro，加上音效時間點與鼓過門。
