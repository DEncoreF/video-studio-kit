# 關卡怎麼判：量測、清單、PASS.json、豁免

`<tool>/scripts/review-pack.mjs` 是這一關唯一的判定者；這份說明它判什麼、怎麼判，數字的出處是 `<tool>/library/rules/motion.json`（`review-pack.mjs` 的 `GATE` 讀它，video-motion-craft 的數字表由 `scripts/rules.mjs --write` 從它產生）。改數字只改那個檔。

**目錄**：1 量測（FAIL 與 WARN）· 2 清單的規則 · 3 PASS.json · 4 豁免 · 5 試片 · 6 hook 擋得住什麼

## 1. 量測：腳本自己判，不靠勾

`--check` 每次都重新量 render，不相信 `pack.json`。

**FAIL**（擋住；只有使用者的豁免能放行）：

| 代碼 | 什麼情況 | 從哪量 |
|---|---|---|
| `stutter` | 動 → 停 ≤ 0.25 秒 → 動（頓點），停 **3 格以上**；停 1–2 格只提醒（同一個代碼，WARN：正常速度幾乎看不到，2026-10-29 使用者同意放寬：「一鏡到底，是個方法，但不應該是限制」） | 成片每格的動態（`scripts/lib/motion.mjs`，和 motion-profile.py 同一個量法） |
| `snap` | 主體一格跳掉：某一格突然換掉畫面 ≥ 15% 的結構（前後 0.1 秒內的變化都不到它的 1/3），之後 0.5 秒內又動回原來的樣子 ≥ 30%，或下一格就回來（壞掉的一格）。例：白紙飛機一格縮成遠處的小點再長回來 | 成片每格的**邊緣**（Sobel，32×18；`scripts/lib/motion.mjs` 的 `jumps()`，和 motion-profile.py 的 snaps 同一個量法）：白底上的白色主體亮度差幾乎是 0，邊緣量得到。接縫 ±0.4 秒內只提醒（`snap-seam`） |
| `flash` | 閃格：連續 1–3 格和前後兩格都不一樣（亮度差 ≥ 2.5／255，且 ≥ 前後兩格彼此差距的 3 倍），前後兩格卻一致——空白、沒畫完、跑錯狀態的一格。例：E 片試片 v6 掛了 filmed-screen 後，截圖擷取和立體書頁搶時間，開頭 2 秒閃了 6 次；`snap` 只抓到 1 次，使用者看到了（「有一些格數有閃畫面的問題」） | 成片每格的亮度，96×54（`scripts/lib/motion.mjs` 的 `flashes()`）。正片與試片都擋，接縫旁也擋：閃白、閃黑這類轉場本來就在 frame-spec.md 的禁用清單。校準：三把尺、oner v5、C 片 draft 12、D 片 draft 7、E 片 draft 35 都是 0；科技風那支片 在 29.4 秒有一格真的閃格（面板一格跳亮再回來）。另有逐塊的版本（`areaFlashes()`，192×108、12 px 一塊，畫面 15% 以上的塊同時閃 1–3 格）：旁邊正好有真的變化時整張比對看不出來——之前一支片 2026-11-01，59.65 秒紫色圖層在 clip-path 補間開始前先滿版顯示 3 格（「0:59-1:00 好像一閃一下畫面」）；整支 106 秒只抓到這一處 |
| `frozen-tail` | 結尾完全靜止超過 0.5 秒 | 同上（亮度） |
| `seam-beat` | **開場、結尾，和 script.json 標了 `major: true` 或 `bar: true` 的接縫**，離拍超過 0.1 秒（60 fps 6 格）：一般接縫和 `major`／`bar` 量成片上的動態峰值；開場與結尾是淡入淡出、沒有單一峰值，照 script.json 寫的時間判，片子在配樂第一個重拍之前開始（弱起）時，開場算落在那個重拍上。其他接縫離拍超過 0.1 秒只提醒（同一個代碼，WARN）：2026-10-29 使用者同意放寬（「一鏡到底，是個方法，但不應該是限制」），一般的交棒差半拍看不出來，主角拍、段落換場才要準。哪幾個接縫是主要的，在接縫表上寫 `major: true` | beat-check，`t` 前後 0.4 秒內動得最多的那一格 |
| `seam-bar` | 大變化（open、close、`bar: true`）離小節線超過 0.1 秒（`major: true` 只要在拍上，不要求小節線） | 同上 |
| `read-short` | 重要讀點的時間不夠（字的預算、畫面 0.6／1.0 秒、動作落定後 0.5／0.8 秒），或動作還沒落定就被下一件事蓋掉。英文（整行沒有中日韓字）照英文字數算：大字 max(1.0, 0.8 + 0.08 × 字數)，兩到五個字的一行約 1.0–1.2 秒（使用者：「停個1.0-1.2就好」）；小字 max(1.8, 0.9 + 0.15 × 字數)（taste.md 英文副標約 1.8 秒）；中英夾雜時英文一個字算一個中文字。以前每支英文片都要寫的 read-short 豁免不用再寫，已寫的照樣有效 | 讀點表（script-lint） |
| `read-overlap` | 兩個重要讀點重疊（容許 1 格） | 讀點表 |
| `last-read-late` | 最後一個讀點離片尾不到 1.0 秒 | 讀點表 |
| `hold-long` | 一拍最後一個讀點看完，到成片的下一個變化超過 1.2 秒（最後一拍 2.2 秒）：「停太久」 | 成片：讀點表的 t1 → 第一個新動作、接縫峰值，或畫面重新動起來 |
| `hard-open`、`hard-close` | 第一格或最後一格已經是完整畫面 | 成片的亮度 |
| `seam-dissolve` | 接縫（不含開場與結尾）是溶接：舊畫面和新畫面同時半透明。使用者 2026-10-29：硬切、甩鏡、條狀掃過、色塊在拍上蓋過去都是好的交棒，接縫也不一定要配對剪接；**唯一不行的是溶接**。E 片 draft 28 的 S5、S7 寫的是「字爆成數字」「段落甩上去」，獨立審片看到的是原地模糊溶接，量測卻全過 | 成片：接縫寫的時間與量到的峰值各 ±0.3 秒內，每一段「從靜到靜」的變化（動態 ≥ 0.6，最長 1 秒）取前後兩格靜止的畫面 A、B；在 48×27 上逐格追每個變了 ≥ 12 的格子：溶接是所有格子在同幾格裡一起從 A 單調走到 B（50% 的時刻在中位數 ±2 格內、20→80% 至少 2 格、路徑 ≥ 70% 是淨變化）。一起走的比例 `share` ≥ 0.25，且其中舊的結構離開、新的結構出現各佔 ≥ 20%（`bal`，局部對比）與 ≥ 25%（`mix`，格數）才算：淡出到空畫面再淡入、一個元素自己淡掉都不算。`scripts/lib/motion.mjs` 的 `dissolves()`，每個接縫的數字在 `dissolve.txt`。試片也擋 |
| `safe-zone`、`logo-moved` | 字整個在畫面裡卻進到外圈 5%（action-safe 外）、Logo 在 action-safe 外，或 Logo 進場後移動、縮放（被畫面邊切掉的字是刻意出血，不算）。字在 title-safe（四邊 10%）外只提醒 `safe-title`（之前一支片 2026-10-29：「logo 在哪？主畫面要在哪？」） | 合成本身：每 0.5 秒 seek，讀看得到的文字與 Logo 的位置（`scripts/measure/safe-zone.mjs`，看得到＝透明度 ≥ 0.15 且沒被蓋住或裁掉），結果在 `safe-zone.txt`。試片也擋 |
| `asymmetric`、`label-off` | 兩個並排的同類主體（同類別、同大小、同高度）中點偏離畫面中線 x 960 超過 24 px；主體正上方或正下方的名稱、說明、註解線，中心偏離主體中心超過 16 px（之前一支片 2026-10-31，03 結尾：「注意每顆鏡頭的物件、文字、的位置是否合理」——手算位置讓名稱偏離機身 66 px、兩台中點偏右 40 px）。刻意不對稱的區塊標 `data-layout-free` | 合成本身：每 0.25 秒 seek，只看停定、看得到的元素（`scripts/measure/layout.mjs`），結果在 `layout.txt`。試片也擋 |
| `text-overlap`、`uneven-row`、`glyph-fallback` | 兩個帶字的東西（字、或裡面有字的色塊）停定時互相重疊超過較小者 4%；同類一整組（同 class、同高）排成一排時間距差超過 4 px，或本該等寬（差 10% 內）卻差超過 2%；同一段字有些字掉到系統字型（載入的字型缺字）。之前一支片 2026-11-01：03 疊在中間的兩個名稱重疊 12 px、04 六格被 stagger 上的 yoyo 留成三種大小、未來熒黑沒有「教」字被 PingFang 補上（「教 這個字比其他字還細／兩個大標重疊了／6格間隔不一致」） | 合成本身（`scripts/measure/layout.mjs`）：停定是前後 0.1 秒框不變；字型讀 Chrome 實際用的字型（CSS.getPlatformFontsForNode）。試片也擋 |
| `fill-variable` | 補字用的 unicode-range 字型是可變字型：它照元素要求的字重畫，不是照主字型實際的粗細。之前一支片 2026-11-01：未來熒黑 Medium 標 600、墨量約等於 Noto Sans TC 450，用 Noto 可變字型補的字比旁邊粗（「副標有個字的字體和其他字不一樣」） | 合成本身（`layout.mjs`）讀每個 unicode-range @font-face 的檔案有沒有 fvar 表。修法：fonttools `subset` 只留那幾個字、`varLib.instancer` 切成靜態字重，字重用墨量對（Chrome canvas 比同一組字）；每個字重範圍一個 @font-face。試片也擋 |
| `flicker` | 同一塊地方一再出現「這一格和前後兩格都不一樣、前後兩格彼此一樣」——整張平均的 `flash` 看不到的小範圍閃格（3 次以上、每次相隔 2 格以上、0.3 秒內接著來）。之前一支片 2026-11-01：一張卡片的進場 y 和浮起 y 兩個補間重疊，算圖時大部分格是 0、每 6 格一格是 −18（「進入到下一段時會不停上下閃現」） | 成片（`scripts/lib/motion.mjs` `flickers`）：192×108 灰階、12 px 一塊逐塊比。修法：同一個屬性同時只歸一個補間（進場改用縮放或透明度），兩端都寫死的 fromTo。試片也擋 |
| `render-mismatch` | 成片在關鍵姿勢畫的和合成（seek）不一樣：每格切成 96×54 格，平均顏色差 > 48 的格子超過 12%（少了元素、翻成背面、整塊換色）。兩次試片（2026-10-29：同一時間的兩個 set，渲染器和 seek 解讀不同；2026-10-31：算圖動態模糊把 preserve-3d 翻板畫成背面）都是量測通過、成片畫錯 | 合成 seek 截圖 vs 成片同一格（前後各容許一格），每個重要讀點結束前 0.1 秒與每拍的關鍵姿勢（`scripts/measure/render-match.mjs`），並排圖在 `render-match/`。試片也擋 |
| `loudness`、`true-peak` | 成片整體響度不在 −14 LUFS ±1，或真峰值高於 −1 dBTP（video-motion-craft references/sound.md §4 的母帶規格；已交件的 focus 是 −14.0／−1.6）。試片只擋真峰值；突然變大聲 ≥ 5 LU（`loud-jump`）與沒有音軌的正片（`no-audio`）只提醒 | 成片音軌：EBU R128（`scripts/lib/sound.mjs`，和 film-metrics 同一個量法），結果在 `sound.txt` |
| `layout-repeat` | 連續 3 拍以上同一個版型：每拍取關鍵姿勢（最後一個重要讀點結束前 0.1 秒，沒有讀點取中點），和前一拍比構圖，相似度 ≥ 0.55 算同一個（D 片草稿 4、5 各連 6 拍被擋；草稿 6、7 最多連 2 拍，通過） | 成片：結構分布重疊（Sobel 32×18）與內容遮罩 IoU（48×27，離畫面中位亮度 > 40）的平均；`scripts/lib/motion.mjs` 的 `layouts()`，每拍的數字在 `layout.txt`。試片只提醒 |
| `subject-small` | 重要讀點的關鍵姿勢上，主體太小、畫面大半是空的（failure-list「重點太小、空白太多」；E 片 draft 28 的 catch、compare 只靠獨立審片抓到）。正片才量 | 成片：每個重要讀點（`size` 不是 small）結束前 0.1 秒那一格。`line`＝最大的一行字的高度（含上下伸部，約字高的 1.3–1.5 倍）、`object`＝最大的一塊物件的高度、`subject`＝兩者取大，都換算成 1080p 的像素；`area`＝畫面上有內容的格子比例（48×27）。**subject < 130 px 且 area < 35% 判 FAIL**。`scripts/lib/motion.mjs` 的 `subjects()`，每個讀點的數字在 `subject.txt` |
| `energy-sag` | 片子的中段塌掉：中間三分之一的秒數裡，每秒平均動態 ≥ 1.0 的不到 30%（前面衝完、後面只剩擺著）。正片、12 秒以上才量 | 成片每秒的平均動態（60 fps 尺度，一格截在 20，硬切只算一格）；`scripts/lib/motion.mjs` 的 `energy()`，曲線與五項檢查在 `energy.txt`。校準見下 |
| `slide-risk` | 投影片風險 ≥ 60（35–59 只提醒）：快速動態太少、中段有空畫面、相鄰兩拍同一個版型，加起來像在翻簡報。正片才量 | 成片：`scripts/lib/motion.mjs` 的 `slideRisk()`，分數與各項在 `slide.txt`。校準見下 |
| `no-grid` | 沒有 `build/sections.json` 的 BPM | — |
| `no-reads` | script.json 沒有重要讀點：量不到讀點與停留 | — |
| `no-ruler` | 正片沒有 `direction/rulers.json`，或某把尺沒寫 `moments`：和尺並排是必過項（D 片四版沒做，使用者：「感覺整體不夠專業」） | — |
| `ruler-file` | `rulers.json` 寫的尺的影片不在（暫存被清掉）：重新下載到 `~/.video-studio/rulers/` | — |
| `no-ref` | 主角拍（`hero: true`）或 `major`／`bar` 接縫在 script.json 沒有綁參考（`refs`），也沒有標成使用者同意的實驗（`experimental`）：參考是流程節點，主角時刻要照一張標好「借什麼」的卡做（video-direction 第 5 步、`refs.mjs card`）。正片才擋，試片只提醒 | script-lint |
| `ref-unknown` | `refs` 裡的 id 不在參考紀錄裡（打錯或卡被刪了；`refs.mjs cards` 列出 id） | script-lint |
| `experimental-unapproved` | 拍或接縫寫了 `experimental` 卻沒有使用者同意首創的原話（寫成 `true` 或空字串）。有原話的實驗只提醒（`experimental`），量測照跑，回報標成實驗 | script-lint |

讀點表是成片的規格：讀點的 `t0`、`t1` 要照成片寫（看 `reads/` 的起訖靜圖與 `timing.txt` 對過）。表和成片對不上時會出 `plan-mismatch` 提醒；改表讓它說實話，不要為了過關把 `t1` 往後寫。

`subject-small` 的校準（2026-10-29）：D 片 draft 6、7 最小的 subject 是 140 px（「A new draft.」單獨在畫面上，area 4%），其次 184（「Say it.」），全部通過；E 片 draft 28 的 04 catch #1 100 px（area 17%）、05 compare 104（27%）、02 marks 兩個讀點 120（27%、10%）FAIL。界線只差 10 px（130 對 140），而且 04 catch #2 的 166 px 是把 Source 標籤的光暈量成一行字（高估）；量不到「主體大、但這一拍要看的那個元素小」（例如大標題下的 0.3%），那一種仍靠清單 §3 和尺並排與 failure-list 逐格看。

`seam-dissolve` 的校準（2026-10-29）：

| 片 | 接縫 | share | bal | mix | 判定 |
|---|---|---|---|---|---|
| E draft 28 | S5「字爆成數字」（9.78–10.15 秒，原地模糊溶接） | 0.33 | 0.26 | 0.36 | FAIL |
| E draft 28 | S11「最後一筆變成燈條」（31.78–32.27 秒，紙頁與機器雙重曝光） | 0.97 | 0.35 | 0.47 | FAIL |
| E draft 28 | S4（段落變暗、三個字浮出來） | 0.36 | 0.14 | — | 過 |
| E draft 28 | S8、S12（淡出到空畫面再淡入） | 0.58、0.54 | ≤ 0.01 | — | 過 |
| E draft 35 | S1（「標題」自己淡掉，筆移開露出字） | 0.80 | 0.23 | 0.19 | 過 |
| D draft 6、7 | 全部接縫（硬切、條狀掃過、甩鏡、推進、壓成表頭） | ≤ 0.19 | — | — | 過 |

**量不到**：兩層同時在動的溶接。E draft 28 的 S7（舊段落糊掉往上、兩版段落從右邊糊著滑進來）share 只有 0.11，量測放過了，要靠 [failure-list.md](failure-list.md)「交棒時新舊字疊在一起」逐格看 `seams/`。界線很窄（S5 的 bal 0.26 對 draft 35 S1 的 0.23），有新的漏抓或誤判就加進 evals、重新校準。

`energy` 與 `slide-risk` 的校準（2026-10-29，E draft 28、35（使用者：「有點怪 沒有讓我很驚艷」）、D draft 4–7（「draft-6 比 draft-5 好很多」）、C draft 12m（交片），和 `~/.video-studio/rulers/` 的三把尺；出處 `research/ai-animation-cases-A.md`、`-B.md`：3 秒內 hook、最密的一段在 30–60%、最大高峰在 75–90%、超過兩小節沒有新東西就是 bug；huashu `deliver.py` 快速動態 < 0.035 紅、< 0.06 黃，中段 ≥ 0.3 秒空畫面紅，藍紫底 > 30% 紅）：

| 片 | 第一個事件 | 中段在動的秒數 | 最密 15% 的位置 | 最大 2 秒的位置 | 超過 2 小節沒有事件 | 快速動態的格 | 相鄰同版型 | 藍紫畫面 | 投影片風險 |
|---|---|---|---|---|---|---|---|---|---|
| E draft 28 | 3.02 秒 | **21%** | 31% | 32% | 13.9 秒 2.5 小節、32.0 秒 2.3 | 13.7% | 0/10 | 58% | 0 |
| E draft 35 | 3.02 秒 | **21%** | 7% | 12% | 14.1 秒 2.5、32.0 秒 2.3 | 9.9% | 0/10 | 58% | 0 |
| D draft 4 | 1.47 秒 | 40% | 43% | 38% | 32.5 秒 2.7 | 4.7% | 5/10 | 0% | **56** |
| D draft 5 | 1.48 秒 | 47% | 13% | 38% | 28.0 秒 2.3、32.5 秒 2.8 | 6.6% | 5/10 | 25% | 30 |
| D draft 6 | 1.85 秒 | 60% | 13% | 9% | 32.4 秒 2.8 | 11.0% | 1/10 | 50% | 6 |
| D draft 7 | 1.85 秒 | 60% | 13% | 9% | — | 12.7% | 1/10 | 51% | 6 |
| C draft 12m | 1.93 秒 | 60% | 28% | 36% | 41.8 秒 2.2 | 9.2% | 3/11 | 0% | 16 |
| 尺 Apple Creator Studio | 0.42 秒 | 100% | 27% | 7% | — | 48% | — | 0% | 10 |
| 尺 Google Vids | 0.57 秒 | 97% | 49% | 7% | — | 40% | — | 0% | 20 |
| 尺 Raycast | 0.93 秒 | 77% | 35% | 29% | 8.9 秒 2.5 | 19% | — | 0% | 0 |

- **只有「中段在動的秒數」分得開好壞**：E 兩版 21%，其他全部 ≥ 40%（尺 ≥ 77%），所以 `energy-sag` 判 FAIL，界線 30%。E 的動態全擠在 4–5 秒與 12–14 秒，15 秒以後每秒都不到 3（`energy.txt` 的曲線一眼看得出來）。只有一支壞片（兩個版本）當證據：有新的誤判或漏抓就加進 evals、重新校準；設計好的安靜中段由使用者豁免。
- **其他四項只提醒**：hook（E 3.02 秒，好片 ≤ 1.93，差太少，WARN `energy-hook`）、最密的位置（D 6、7 在 13%，尺 7–49%，WARN `energy-dense`）、最大高峰在 75–90%（**沒有一支做到，三把尺也沒有**：WARN `energy-peak`，當成方向不當成規則）、超過兩小節沒有事件（好片和尺都有，WARN `energy-gap`；片尾最後一個事件之後是結尾卡、最後 1 秒的淡出不算事件，都不算）。
- 事件：0.1 秒平均的動態出現一個 ≥ 1.0、而且是前 0.5 秒最低點 2 倍以上的峰（一個動作開始、一刀、一個打點），相隔至少 0.25 秒。
- **投影片風險** = 100 ×（0.5 動態 + 0.2 空畫面 + 0.3 版型重複）。動態：快速動態的格（60 fps 尺度動態 ≥ 5）≥ 6% 為 0、≤ 3.5% 為 1（huashu 的線，這個量法下的校準：D draft 4 的 4.7% 最低，其餘 ≥ 6.6%）；空畫面：中段（頭尾 1 秒以外）≥ 0.3 秒、亮度 2–98 百分位差 < 6 的畫面，0／1／2 段以上 = 0／0.5／1（我們的片子都沒有，Google Vids 有 4 段設計好的黑場：只提醒 `slide-blank`）；版型重複：`layout.txt` 相鄰兩拍 same ≥ 0.55 的比例 ÷ 0.5。**≥ 35 提醒、≥ 60 擋**：校準裡最高的是 D draft 4 的 56（它已經被 `layout-repeat` 擋），所以沒有一支被 `slide-risk` 擋；要擋得同時幾乎沒有快速動態，又有空畫面或版型重複。
- **藍紫只提醒**（`slide-violet`，不計分）：一半以上是藍紫色（色相 220–300°、飽和度 ≥ 0.25）的畫面超過 30%。品牌是紫色：E 58%、D 6、7 約 50% 都會提醒，回報時說，紫色留給重點。
- D draft 4–6 的「相鄰同版型」用的是現在（draft 8）的 script.json 取關鍵姿勢，數字是近似的。

量不到、靠清單的：暗部吃掉主體（[failure-list.md](failure-list.md)「暗部吃掉主體」，還沒有量測）。

`flash` 的修法是找出那一格為什麼沒畫好：關掉可疑的元件（例如 filmed-screen 這類會切換成截圖擷取的鏡頭）重新渲染比對；是渲染器的問題就分段渲染、只在用到的鏡頭掛那個元件（E 片試片的 `build/render.sh`），不要只用前一格把它補掉。`snap` 的修法是找出那一格的狀態從哪來（兩個物件換手的那一格、時間軸重設、seek 到預設值），讓前後兩格接得上。設計好的硬切本來就是接縫，寫進 `seams`；但不要為了過關在跳格的地方補一個接縫——接縫旁的 `snap-seam` 一樣要看 `seams/` 那一條逐格表確認。量不到的：主體只佔畫面不到 15% 的結構、一格只跳幾十像素的小位移，這些靠 [failure-list.md](failure-list.md) 的「一格跳掉」用眼睛看。

**WARN**（不擋，寫進 PASS.json，回報時說）：`pop`（接縫以外一格就換掉、之後沒有回來：硬切、換件、東西一格就出現；看那一拍的表確認是設計）、`snap-seam`（接縫旁的一格跳掉）、`seam-beat`（一般接縫離拍超過 0.1 秒）、`stutter`（停 1–2 格）、`seam-beat-near`（離拍 3 格到 0.1 秒）、`hit-beat`（打點離拍超過 3 格）、`loose-spike`（接縫表以外的跳動離拍）、`seam-contrast`（接縫的爆衝不到周圍的 2 倍）、`plan-mismatch`、`dead-hold`（停超過 3 秒、裡面沒有讀點）、`hold-long-plan`（計畫上的停太久）、`head-cross`、`head-zone`、`energy-hook`、`energy-dense`、`energy-peak`、`energy-gap`、`slide-risk`（35–59）、`slide-blank`、`slide-violet`，以及 script-lint 的其他提醒。

`head-cross`：標題還在畫面上（從它站穩到大半退場，淡出中、退到 50% 都算還在），有內容穿過它的區域。量法在 `scripts/lib/motion.mjs` 的 `headCross`：區域是 script.json 的 `headline_zone`（或讀點自己的 `zone`，video-motion-craft 的 reads-and-beat.md 資料格式），逐格找「這一格新出現、離上一格的墨跡 3 px 以上」的墨跡，不算標題自己的筆畫。印出每一段的秒數與最多幾 px。它分不出刻意的例外（夜景的標題陪鏡頭穿進螢幕、面板的邊在標題上方慢慢漂），所以只提醒：逐一看那幾格（`seams/`、`beats/`），不是刻意的就交回修改，刻意的回報時說明。回測（`evals/backtest.mjs`）：深色草稿 6 抓到作者看到的三處（S4、S8、S10），深色草稿 10 這三處都沒有。`head-zone`：腳本有標題卻沒寫 `headline_zone`，量不到。

## 2. 清單的規則（正片）

清單只留**沒有別的東西在看**的三件事（2026-10-29 使用者同意精簡：「一鏡到底，是個方法，但不應該是限制，你先改吧！」）：

1. **§1 常見失敗**：[failure-list.md](failure-list.md) 每一條一格。看過 `sheet.jpg`、`beats/`、`seams/`，沒有就勾 `[x]`，有就標 `[!]` 並寫影格。
2. **§2 第一個畫面**：最早的重要讀點，單看 `reads/` 開始那張讀得出來發生了什麼嗎、標題是不是在它之後才來（使用者原話變成的題目：「第一個畫面應該是要說明有信件進來」，reads-and-beat.md §10）。
3. **§3 和尺並排**：一題總結，構圖、主體、材質、數字（`ruler/metrics.txt`）差最多的是哪一項、差在哪，引用 `ruler/side-by-side.jpg` 上這支片的影格。

拿掉的：每一拍「事件讀得出來嗎」、每個接縫「慢 → 爆衝 → 滑停、轉進煞車是圓的嗎」、每個讀點「觀眾看哪裡、看懂了沒」。這些由量測（`timing.txt` 的停留與讀點、`hold-long`、`read-short`、`seam-contrast`、`seam-dissolve`、`snap`、`layout-repeat`、`subject-small`、`energy.txt`）和獨立審片（§2b，它逐張看 `beats/` 與 `seams/`）看；逐格看的習慣照舊（review-scales.md §1），看到問題就寫進 §1 的 `[!]`。

- 每一格都要勾。
- 每個「答：」要引用**這一項自己**的影格：第一個畫面 → 它的起訖靜圖，或那一拍表上落在讀點時間內的格；和尺並排 → `ruler/side-by-side.jpg` 上面那一列（這支片每一拍一格）。編號在每格左上角（`f0732`），清單每一項也印了範圍。
- 引用的影格不在審片包裡、不在這一項的範圍裡、或沒有引用，都不算答；`[!]` 也要寫影格。
- 「沒過：…」照樣要引用影格；它是品味的意見，變成提醒，回報時說出來，不擋。

## 2b. 獨立審片（正片）

審片包也會寫一份 `INDEPENDENT.md`。`--check` 要它：寫了審片者、答了「先看片」的四題、至少一行發現（`- [!] …`）或 `- [ok] …`、每一行都引用審片包裡的影格、每個 `[!]` 底下都有製作方的「處理：」。

- **先看片，再讀那一句話**（使用者：「不確定你想要表達什麼」「我覺得我沒有被驚艷到」）：審片者先只看 `sheet.jpg` 和 `beats/`，在讀 script.json 的 `message`、聽到這支片要講什麼之前，寫下「這支片在說什麼」「最記得的一刻」「哪裡無聊」；之後才讀那一句話，寫「對得上嗎」。對不上、或最記得的一刻說不出來（寫「沒有」），就是一行 `[!]`：`--check` 看到「沒有」或「對不上」而發現裡沒有任何 `[!]`，不會過。四題的答案照抄進 `PASS.json` 的 `independent.first_look`，回報時說給使用者聽。
- **誰看**：新開一個 subagent（Agent tool，general-purpose；不要 fork，fork 會帶著製作的對話）。brief 分兩段：第一段只給審片包路徑（先看 `sheet.jpg`、`beats/`）和 INDEPENDENT.md 的格式，請它先答「先看片」的三題就停；它回了之後再用 SendMessage 給 `direction/script.json`、[failure-list.md](failure-list.md) 和這支片想讓觀眾懂的一句話，請它答「對得上嗎」並找問題。**不給** CHECKLIST.md 的答案、製作時的取捨、上一版的意見，也不說自己覺得哪裡好：它要的是沒被帶著走的眼睛。請它照 INDEPENDENT.md 開頭的格式回，只找問題、不打分數。
- **怎麼處理**：它的原文照貼進「發現」，審片者寫它是誰。量得出來或明顯的錯（跳格、讀點讀不到、東西穿過大字）→ 修、重 render、開新的審片包重來；品味層的 → `處理：交給使用者判斷`，寫進回報、問使用者；不同意 → 寫原因並引用影格。
- **它不是使用者**：它抓過我們漏掉的（C 草稿 12d，46.03 秒紙飛機一格縮成小點），也放行過使用者後來否決的（深色第二版）。它的 `[ok]` 不代表使用者會滿意，它的話也不是使用者核可，不能拿來寫豁免。
- 試片（`tests/_*`）不用。

## 3. PASS.json

`--check` 結束代碼 0 時在審片包裡寫 `PASS.json`：

```json
{ "mode": "full", "render": "/…/renders/draft-12.mp4", "sha256": "…", "script_sha256": "…", "checklist_sha256": "…",
  "counts": { "fail": 0, "waived": 1, "warn": 6, "taste": 2, "independent": 1 }, "independent": { "reviewer": "fresh subagent", "findings": [ { "note": "…", "response": "…" } ] }, "waived": [ { "code": "seam-bar", "id": "S10", "approved_by": "使用者", "quote": "…" } ],
  "warns": [ … ], "taste": [ … ], "derived": [ { "path": "/…/draft-12-small.mp4", "sha256": "…" } ] }
```

- render 或 script.json 一改，`--verify` 就不過。
- 一版 render 一包（`--out <片>/review-draft-N`）。審片包不會寫進一個還有有效 PASS.json、或清單已經勾過或答過的資料夾（結束代碼 3，印出改用的 `--out`）；`--force` 才會丟掉那份審片。舊的 PASS 已經失效（render 改過）就不擋。
- 小檔（`draft-N-small.mp4`）是另一個檔、另一個指紋：`review-pack.mjs --attach <片>/review-draft-N <小檔>` 比對長度與每半秒的亮度後記進 `derived`。
- 回報時貼 `--check` 印出的那一行：`PASS draft-12.mp4 1a2b3c4d5e6f · FAIL 0 · 豁免 1 · 提醒 6 · 品味 2 · 獨立 1`。
- 審片包裡已經寫過發現的 `INDEPENDENT.md` 也不會被新包覆寫。

## 4. 豁免：只有使用者能給

寫在片子（或試片）資料夾的 `review-waivers.json`，會進版控：

```json
[{ "check": "seam-bar", "id": "S10", "reason": "回到夜裡的換場刻意晚半拍，跟著音樂的停頓", "quote": "S10 晚一點沒關係，跟音樂走", "approved_by": "使用者", "date": "2026-10-25" }]
```

- `check` 是代碼，`id` 是那一項（沒有 `id` 就涵蓋那個代碼的全部，少用）。
- `quote` 是使用者在對話裡的原話，`approved_by` 是使用者；沒有原話、或核可人是 Claude／模型，腳本不認。
- 只在使用者明白說「這個可以不用修」之後才寫。不要替使用者寫，也不要為了趕時間建議豁免：先修，修不掉再把數字和影格給使用者決定。

## 5. 試片（`tests/_*`，或 `--test`）

語意文字的 4 秒片段、轉場的 2–3 種做法、材質變形的試驗：只跑量測，不產生清單。

- 會擋的只有 `ease-unknown`、`stutter`、`snap`、`flash`、`seam-beat`、`seam-bar`、`seam-dissolve`、`read-short`、`read-overlap`、`hold-long`（有 script.json 時才有後六項）；和正片一樣，`stutter` 只擋停 3 格以上，`seam-beat` 只擋開場、結尾與 `major`、`bar` 接縫（轉場試片要擋，就在那個接縫寫 `major: true`）。
- 片段本來就是摘錄，硬開、結尾停住、沒有 BPM、沒有讀點表都只提醒。
- 轉場試片放在片子的 `direction/transitions/` 時（hook 把它當預覽，不擋；要量就照這樣跑），把那個資料夾當成 `<dir>`：`review-pack.mjs videos/<片>/direction/transitions <片段.mp4> --test`（審片包在 `direction/transitions/review/`；要量節拍與讀點，就在那裡放一份這個片段的 `direction/script.json` 和 `build/sections.json`）。

## 6. hook 擋得住什麼

`<tool>/scripts/hooks/draft-gate.mjs` 掛在兩個地方：studio 的 `.claude/settings.json`（2026-11-03 起，使用者「三個都補」：之前只掛在 skill 的 frontmatter，沒叫到 skill 的 session 就沒有它，10/31 發生過一次），以及兩個 skill 的 frontmatter（給別的工作資料夾用；兩處都在時跑兩次，結果一樣）。

- **PreToolUse（SendUserFile）**：送的是 `videos/` 底下的影片（mp4、mov、webm、gif），而同一支片或同一個試片資料夾裡沒有仍然有效的 PASS.json，就擋下並印出要跑的指令。正片的草稿要完整審片（`mode: full`）；試片只要量測。**還在挑的候選**不擋：`direction/` 或 `candidates/` 底下的影片、campaign 的 `compare.*`、聲音的 audition。`previews/` 底下其他的影片和檔名有 `preview` 的影片是選定版本的預覽，要有 `--link` 連到仍然有效的審片（`renders/` 底下的叫什麼名字都要審），見 SKILL.md「候選與預覽」。只用 `--check --candidate` 過的試片不能單獨送。
- **聲音**（2026-11-03 起）：專案裡有自己混的音（某個 `build/score.json`），送出的影片又有音軌，就要有一份 `SOUND-PASS.json` 記著它解碼後的音訊（`<tool>/scripts/sound-gate.mjs <片> <檔>`：earshot critique 與 timeline，評分要 launch-grade、沒有 critical／major、≥ 95% 的 cue 在 100 ms 內聽得到、沒有完全沒聲音的 cue；數字在 `library/rules/motion.json` 的 `sound.ears`）。只對畫面的 PASS.json 管不到新混音：之前一支片 v6b 到 v6d 換了整批音效，PASS 都是同一個。`previews/` 底下的也要過；音訊直接複製的手機版沿用同一份；檔名或路徑有 `audition`／`candidate` 的試聽片不擋。豁免照 §4，代碼 `sound-verdict`、`sound-issues`、`sound-heard`、`sound-missed`。畫面切點沒有聲音（timeline 的 NO HIT）只提醒。
- **Stop**：回覆裡指向一個 12 小時內的 render、它沒有有效的 PASS.json（或該有卻沒有 SOUND-PASS），就要 Claude 先過關卡再結束；已經被 hook 推著繼續（`stop_hook_active`）時不再擋。
- **擋不住**：在對話裡描述畫面、給 Studio 預覽網址或圖庫頁、送 `videos/` 以外的檔、超過 12 小時的舊檔。這些靠 SKILL.md 的規則：凡是讓使用者看動態，都先過這一關。
