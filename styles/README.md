# 風格系統

風格庫只存**文字配方**，不存影片。要為某支影片定風格時，才挑幾個適合的風格、用該片的內容與品牌套件產生預覽（流程見 [docs/video-direction-flow.md](../docs/video-direction-flow.md)）。品牌色、字型、Logo 來自品牌套件；風格決定構圖、動態語言、質感與適用情境。

```
styles/
├── catalog.json        families：21 種「呈現效果」的定義（gallery 的風格分頁一個效果一張卡）；styles：每個風格屬於哪個效果，以及圖庫小動畫用的母題（不是內容的權威來源）
├── palettes.json       色票：和呈現效果分開選的配色（從各風格抽出）
├── recipes/<id>.md     風格配方（權威來源）
├── examples/<id>/      已實作的範例程式：style.js＋style.css（6 種）
└── _preview/           預覽模板：template.html、helpers.js、預設內容 content.json
```

## 風格怎麼定義：呈現效果＋色票

一個風格先看**呈現效果**（catalog 的 `families`），再看色票，配方內文寫的是這個效果在某個年代或質感下的做法：

| 欄位 | 寫什麼 |
|---|---|
| 構圖 | 畫面怎麼組織（網格、形狀、巨字、物件、介面卡片…） |
| 動態 | 東西怎麼進場、移動、退場 |
| 轉場 | 段落之間怎麼接 |
| 文字 | 字怎麼處理，`textEffects` 連到文字效果清單（個人層可以追加自己的） |
| 質感 | 平面、紙張、顆粒、霓虹、立體材質… |
| 節奏 | 對拍、跟操作走、慢而有停頓… |

同一個效果下的風格（例如瑞士國際主義、編輯雜誌、報紙頭版都是「網格編排」），差別在年代、質感與色票，不是另一種效果。色票在 `palettes.json`，獨立挑選；品牌片以品牌套件的顏色為準，色票只定輔助色與氣氛。

新增風格時：先判斷它屬於哪個呈現效果（`family`）；真的是新的呈現方式，才在 `families` 加一類，並寫出上面六項。個人層的 `catalog.json` 也可以有 `families`：同 id 會合併，`textEffects` 會追加。

## 配方格式

開頭的 frontmatter：`id`、`name`、`en`、`group`（A 幾何現代／B 藝術實驗／C 科技未來／D 材質動畫）、`status`、`tags`（用途：產品介紹、知識解說、品牌形象、數據呈現、功能展示、高階主管、社群行銷、活動宣傳）、`example`（有範例程式才填）、`updated`。

內文段落：

| 段落 | 寫什麼 |
|---|---|
| 一句話 | 這個風格在畫面上長什麼樣、怎麼動 |
| 需要提供 | 做這個風格要向使用者要的素材與資訊 |
| 方向 | 視覺與動態原則，最後一行是**禁用**清單 |
| 結構 | 四個節拍（Logo → 產品一句話 → 數據 → 行動呼籲）各自怎麼呈現 |
| 製作 | HyperFrames／GSAP 的做法、緩動、字體 |
| 注意 | 容易出錯的地方（可讀性、中文斷行、光敏） |
| 參數 | 色票與緩動，和 `catalog.json` 的 `preview` 一致 |
| 參考 | 來源 |

## 範例程式的約定

風格只負責構圖、視覺語言與動態；品牌資訊來自 `brand.json`（預覽時是 `window.BRAND`），文字來自 `content.json`（`window.CONTENT`），素材透過素材庫流程取得。完整約定與工具（`H.logo`、`H.lines`、`H.qr`）見 [video-direction 的 references](../.claude/skills/video-direction/references/content-and-styles.md)。重點：

- 不寫死品牌名、產品名、文案或品牌色（用 `var(--brand)`、`var(--accent)`）。
- Logo 一律用 `H.logo` 放進 `.brand-locked`：可以進場、退場，停留時不動、不變形、不換色；其他元素可以自由動。
- **每個風格要有自己的構圖與動態**，不要用共用版型換顏色（第一版這樣做，被使用者否決）。
- 配方 frontmatter 的 `bans`（例如 `[photo, color]`）是機器可讀的禁用項；與品牌規範或本片必備內容衝突時，`preview.mjs` 會停下來回報，不會自行取捨。

`npm test` 會用兩組不同品牌與產品的資料跑範例，確認沒有殘留的樣本文字、Logo 停留時不動。

## 狀態與更新

生命週期：radar（觀察中）→ trial（試用）→ adopted（採用）→ classic（經典）→ retired（淘汰）。有範例程式的是 trial。

定期更新（每月風格雷達）：新增或修改配方、更新 `updated` 日期；新風格同時在 `catalog.json` 加一筆小動畫色票。被使用者在實際影片中選用並定版的風格，可升為 adopted，並把該片的 `direction/<id>/style/` 收進 `examples/`。

## 瀏覽

```bash
node scripts/gallery.mjs                       # 只看風格與參考
node scripts/gallery.mjs --video videos/<影片>  # 多一個「本片候選」分頁
```
