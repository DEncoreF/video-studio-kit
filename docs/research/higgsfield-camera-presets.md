# Higgsfield 運鏡 preset 盤點（2026-10-31）

成果：`library/motion/camera-presets.json`（67 種）。這頁記來源、量法與限制。

## 來源

- `https://higgsfield.ai/camera-controls` 的 SSR 頁面裡有 TanStack Router 的 dehydrated 資料（`$R[...]`），每個 preset 一筆：`name`、`id`、`params`、`preview`（預覽影片）、`mediaDescription`。共 233 筆、67 個名稱，同一個名稱會因底層模型不同而有多筆。
- 只讀公開頁，沒有登入、沒有呼叫 `fnf-api-gw.higgsfield.ai` 的 API。前端 JS 用 REA（`capture_browser_scenario` → `export_web_scripts`）抓過一次，1,384 個 chunk，只有 PostHog 帶 source map。

## 從 params 看得出的事（推論，沒有看到伺服器端）

| `preset_family` | 筆數 | params |
|---|---|---|
| `higgsfield` | 175 | `steps:20, frames:81, strength:1, guide_scale:6, motion_id` |
| `wan2_5_video` | 28 | `motion_id` |
| `minimax` | 26 | `motion_id` |
| `kling` | 4 | `motion_id` |

`higgsfield` 這一族的參數（81 格、20 步、guidance 6、strength 1）看起來像在 WAN 類開源影片模型上套一個每種運鏡各自訓練的 motion LoRA（`strength` 是 LoRA 權重），這一點是推論。另外三族只送 `motion_id`，應是交給合作模型自己的運鏡選項。不管哪一族，運鏡都是模型生成出來的，前端拿不到可以重現的軌跡。

## 量法

`scripts/measure/globalmotion.py`：每支預覽片縮到 192 px 寬，逐格先用相位相關抓大致平移，再做 16 px 區塊比對，擬合一個相似變換（平移、縮放、旋轉），丟掉離群的區塊後累計。

- 檢查過：Pan Left/Right、Tilt up、Crash Zoom、Whip Pan、Super Dolly In、Through Object 的量測和逐格圖一致（方向、量級、峰值時間）。
- 每個 preset 只有一支 AI 生成的樣本，所以數值只代表方向、量級與節奏的參考。動得很小的 preset 另外量了其他模型的預覽，取動最多的那支。
- `confidence`：clear 56、weak 9、none 2（Dolly Zoom Out、Double Dolly 的預覽幾乎沒動）。
- 2D 擬合量不到深度：環繞、弧繞、滑動變焦、子彈時間的視差，以及移焦、慢快門、縮時這類非鏡頭效果。這些在 JSON 裡附有 `limit` 欄位，用 `look` 和 `gsap` 欄位就好。`needs3d: true` 的要分前後景層做視差，或用 three.js。

## 怎麼用

- 腳本與分鏡寫運鏡時用 `zh`／`en` 這套名稱（和 `text-effects.json` 同一個做法）。
- 做的時候照 `gsap` 欄位起手，量級與時間對 `measured`（例：急推 `zoom 3.17`、`t90 0.2`，代表前 20% 就推完再停住）。鏡頭的分寸仍以 video-motion-craft 的規則為準：快推只給重音、推進去要拉出來。
- 預覽片沒有存進 repo，要看就開 `higgsfield.preview` 的網址。

## 重做

```bash
curl -sL https://higgsfield.ai/camera-controls -o camera-controls.html   # 解析最大的 <script> 裡的 {name:$R[..]=[..],params:..,id:..}
uv run --with numpy python scripts/measure/globalmotion.py <preview.mp4>
```

## 界線

Higgsfield 的服務條款通常限制逆向工程。這次只做觀察與學習：讀公開頁面、量公開預覽片，沒有呼叫 API，也沒有把對方的素材放進作品。運鏡名稱是業界通用詞，作法是自己用 GSAP 重做的。
