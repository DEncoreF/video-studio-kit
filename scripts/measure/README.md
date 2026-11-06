# measure：逐格量參考片與自己的片

量轉場尺（`video-motion-craft/references/transition-ruler.md`）時用的小工具。參考影片先用 /watch 下載到暫存資料夾，這些工具只讀那個檔，不另外下載。需要 `ffmpeg` 在 PATH 上（或 `PATH="$(dirname $(node -e 'console.log(require("ffmpeg-static"))')):$PATH"`），Python 的要 numpy：README 的安裝步驟裝在 `.venv`，用 `.venv/bin/python <tool>.py` 跑（`area.py`、`energy.py`、`track.py`、`globalmotion.py` 需要；`motion-profile.py` 不需要）。

| 工具 | 用法 | 量什麼 |
|---|---|---|
| `strip.sh` | `strip.sh <video> <start秒> <長度秒> <out.jpg> [cols] [step]` | 連續格拼成一張，看轉場前後每一格 |
| `sheet.sh` | `sheet.sh <video> <start> <dur> <step格> <out.jpg> [crop] [cols] [tilew]` | 同上，可裁切 |
| `track.py` | `track.py <video> <W> <H> <縮小倍數> <門檻> [x0 y0 x1 y1]` | 每格「非背景」像素的外框：位置、大小 → 彈簧曲線、過頭、停穩 |
| `area.py` | `area.py <video> <W> <H> <起格> <迄格> <亮度> <最少像素>` | 每格亮區面積：填滿畫面、淹沒的速度 |
| `energy.py` | `energy.py <video> <W> <H> <fps>` | 每格和前一格的差異：切點、動作起訖 |
| `onsets.py` | `onsets.py <video> <start> <dur>` | 音訊起音：節拍與變形起動的對齊 |
| `period.py` | `period.py <video> <start> <dur> [高通Hz]` | 節拍週期（BPM） |
| `motion-profile.py` | `python3 motion-profile.py <video> […]` | 逐格速度曲線：頓點（動 → 停 ≤ 0.25 秒 → 動）、跳動、一格跳掉（snaps／pops，量邊緣：白底白物也量得到）、結尾凍住多久、每 0.1 秒一格的走勢；流暢度先看這個 |
| `globalmotion.py` | `.venv/bin/python globalmotion.py <video>` | 整個畫面的鏡頭運動：逐格平移（pan/tilt）、縮放、旋轉，累計量、速度十等分、峰值時間；殘差大代表有 2D 量不到的深度（環繞、滑動變焦）。`library/motion/camera-presets.json` 的量法 |
| `render-match.mjs` | `node render-match.mjs <filmDir> <render.mp4> --at t,t,… [--json out] [--png dir]` | 成片和合成（seek）同一格比：差異的格子比例、並排圖；審片包的 `render-mismatch` |
| `seek.mjs` | `node seek.mjs <filmDir> <out-prefix> <t,t,…> [scale]` | 自己的片：跳到指定時間存圖 |
| `critic-loop.mjs` | `node critic-loop.mjs <filmDir> --ref <frames/f%04d.png> --at 1,4,8.8 [--regions r.json] [--crop x,y,w,h] [--query …]` | 3D 評審迴圈：在指定時間截自己的合成，各區域和 Cycles 參考影格比亮度（±10%）與色相（±15°），出並排總覽圖與 report.json；有區域不過就結束代碼 1 |
| `beat-check.mjs` | `node beat-check.mjs <filmDir> [--render renders/draft-N.mp4] [--script …] [--bpm 120 --offset 0.03]` | 接縫與重要讀點離最近的拍、小節線幾格（BPM 讀 `build/sections.json`）；有成片時量每個接縫實際的動態峰值與表外的跳動；離拍超過 ±3 格、大變化不在小節線就提醒（`video-motion-craft/references/reads-and-beat.md` §9）；`--json` 給審片關卡讀 |
| `camtrack.mjs` | `node camtrack.mjs <filmDir> <a> <b> [selector]` | 自己的片：以 60 Hz 讀鏡頭元素的位移，印出速度起伏、停頓、最大加速度 |
| `finish.py` | `.venv/bin/python finish.py <image|video> [--at t] glow|shadow --line x0,y0,x1,y1 [--mark out.png]`；`frame [--roi x,y,w,h]` | 參考的光暈、陰影：沿線擬合模糊邊，給 CSS blur、偏移、透明度、色相；整格的顆粒、暈影、黑白位準（video-direction 的 `references/look-extraction.md`） |
| `css-effects.mjs` | `node css-effects.mjs <url|page.html> [--shot out.png] [--json out.json]` | 網頁參考實際用的陰影、濾鏡、毛玻璃、漸層、混合模式，精確值與用了幾次 |

都是一次性的量測腳本，參數照上表傳；輸出是給人讀的數字，不是給其他工具吃的格式。

審片包 `scripts/review-pack.mjs`（不在這個資料夾，是給使用者看之前的關卡）會一起跑 beat-check、動態量測（`scripts/lib/motion.mjs`，和 motion-profile.py 同一個量法）、film-metrics 與 script-lint，再做總覽表、逐格表、讀點靜圖、計畫 vs 成片的時間圖和 `CHECKLIST.md`，`--check` 通過才寫 `PASS.json`；見 `video-draft-review` skill。beat-check 和審片包用 toolkit 裡的 ffmpeg-static，不必在 PATH 上。
