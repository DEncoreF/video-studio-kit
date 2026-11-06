# 從參考抽光、陰影與材質

**用在**：第 3 步標卡時，參考要借的是光暈、陰影、玻璃、顆粒這類質感（卡片的 `material` 面向）；第 4 步出方向、寫 `frame.md` 的質感數字；草稿和參考比質感的時候。怎麼用這些質感（深色的規則、玻璃的透明度、借尺不搬外觀）在 [looks.md](looks.md) 與 [finish-layers.md](finish-layers.md)；這一份只管**把參考的質感拆成數字和做法**。

背景：2026-11-04 盤點，318 筆參考只有 8 張卡，`material` 面向 0 張；外面沒有能從影片反推光暈、陰影參數的工具（`<tool>/docs/research/reference-look-extraction-2026-11-04.md`）。

## 1. 先查做法表

`<tool>/library/finish-recipes.json`：每一種質感一筆，有固定名稱、看起來怎樣、數字（1920×1080 的 px）、CSS 或登錄庫元件、出處與 `status`：

- `approved`：使用者核可過的片子裡的元件，數值照抄（換成該片的強調色）。
- `measured`：從參考量到，做法是起點；做完量自己的版本，和參考的數字比。
- `untested`：只有做法，還沒有參考量過。用到時先量一件參考，補上數字。

表裡有的就用表裡的名稱寫進卡片和 `frame.md`，不要另取名字。

## 2. 依參考的來源量

| 參考是 | 用什麼 | 得到什麼 |
|---|---|---|
| 網頁 | `node <tool>/scripts/measure/css-effects.mjs <網址> [--shot out.png] [--json out.json]` | 頁面上每一種 `box-shadow`、`text-shadow`、`filter`、`backdrop-filter`、漸層、混合模式、遮罩的**精確值**，各用了幾次、在哪個元素 |
| Figma 檔 | Figma MCP 讀節點（drop／inner shadow 的顏色、偏移、模糊、擴散，layer blur、background blur） | 精確值 |
| 影片或截圖 | `<tool>/.venv/bin/python <tool>/scripts/measure/finish.py` | 估計值，見 §3 |

影片參考照樣先用 /watch 看過，挑出質感最清楚的那一格再量。

## 3. finish.py：在畫面上畫一條線

```bash
PY=<tool>/.venv/bin/python; M=<tool>/scripts/measure/finish.py
$PY $M <影片> --at 10 glow   --line 849,295,960,295 --mark /tmp/line.png   # 光暈：從亮的東西邊緣往外，到純背景
$PY $M <影片> --at 12 shadow --line 600,262,600,170                         # 陰影：從投影的物件邊緣往外，穿過陰影到背景
$PY $M <影片> --at 12 frame [--roi x,y,w,h]                                  # 整格：顆粒、暈影、黑白位準
```

- **線怎麼畫**：起點貼在物件邊緣外側，往外穿過光暈或陰影，終點落在乾淨的背景上（線的最後七分之一當背景）。不要穿過別的物件、漸層描邊或另一個光源。`--mark` 存一張畫了線的圖，先看線在不在對的地方。
- **讀結果**：`css_blur_px`（CSS 的 blur，等於 2σ）、`edge_offset_px`（偏移加擴散，沿線的方向）、`reach_px`（淡到 10% 的距離）；陰影另有 `alpha`、`tint`（陰影有沒有帶色相），光暈另有 `halo`（緊貼邊緣的顏色）。
- **`ok: false` 不要用**：代表這條線上不是單一一道模糊的邊（兩個光源、漸層背景、紋理），或強度、範圍不合理。換一條線。
- **精度**：拿已知的 CSS 驗證過，blur 在 ±15% 內，偏移差幾 px、透明度差 0.02 以內（`<tool>/tests/finish.test.mjs`）。字的光暈是細筆畫，偏移會是負的，看 blur 和 reach 就好。
- **同一個質感量兩條線**：兩條差超過 20% 就是線畫得不好，或那個質感本身不均勻；寫進卡片時兩個數字都記。
- 尺片多是 1280×720，量到的 px 要 ×1.5 才是 1080p 的數字。
- `frame` 的 `vignette` 只在背景大致均勻時有意義；`grain_std` 是平坦區域的高頻雜訊（0–255），拿來和自己的片比，不是絕對標準。

## 4. 寫進卡片與做法表

1. **卡片**：`refs.mjs card <id> --take material="字的光暈 glow-text-halo：blur 66px（1080p）、邊緣 #33223c、只給主角字" --avoid "…"`。借什麼寫成做得出來的一句、帶數字、帶做法表的 id。
2. **做法表**：
   - 量到表裡沒有的質感，新增一筆（`status: measured`、`source` 寫參考、時間點、線、720p 的原始數字）。
   - 表裡 `untested` 的，補上數字改成 `measured`。
   - 使用者核可的片子用到的，改成 `approved`，`source` 寫片名與日期。
   - 改表要給使用者看過再寫（同品味檔的規則）。
3. **自己的版本**：做完那一拍，用同一條線量自己的 render，和參考的數字並排寫進審片回報；差超過 20% 先修再送。

## 5. 不要做的事

- 不要用通用的預設值（例如網路上的「光暈 16px、陰影五級」）代替量測：數字要從這支片的參考來。
- 不要整套搬一件參考的質感：借一兩種、換成該片的顏色（looks.md §3「借尺的品質，不搬尺的外觀」）。
- 量不到就寫量不到：`ok: false` 的數字不進卡片，也不進做法表。
