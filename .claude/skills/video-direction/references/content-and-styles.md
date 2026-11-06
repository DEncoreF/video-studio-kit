# content.json 與風格程式

## direction/content.json

本片四個節拍的文字與素材。`preview.mjs` 會檢查必填欄位，並把品牌資料另外交給風格程式（`window.BRAND`），所以這裡**不放品牌規則**。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `brand` | ✓ | 品牌套件 id |
| `KICKER` `TAG` `TITLE` `LINE` `NUM` `LABEL` `CTA` | ✓ | 四個節拍的文字：Logo 拍的小標、產品拍的標籤／標題／說明、數據拍的數字與說明、結尾的行動呼籲。要自己斷行就在文字裡放 `\n`，否則依詞自動斷 |
| `PRODUCT` | | 產品正式名稱，必須是 `brand.json` 的 `products` 或其別名（不在裡面會警告） |
| `MESSAGE` | | 觀眾要記住的一句話（給規劃用，風格可選擇是否顯示） |
| `URL` | | 結尾網址；展場片可以不給 |
| `QR` | | `null` 或 `{ "image": "路徑", "url": "…", "label": "掃碼預約" }`；沒有 `image` 時顯示佔位框 |
| `product` | | 產品圖路徑（相對影片資料夾或 repo） |
| `must` | | 這支片不能拿掉的元素，例如 `["product-photo", "qr"]`；有 `product` 時自動含 `product-photo` |

```json
{
  "brand": "novamind",
  "PRODUCT": "NovaMind Enterprise",
  "MESSAGE": "企業的 AI 用量，一張報表看清楚",
  "KICKER": "企業級 AI 管理", "TAG": "用量透明", "TITLE": "每一次呼叫都有紀錄",
  "LINE": "部門用量、成本、權限，同一個儀表板", "NUM": "100%", "LABEL": "呼叫可追溯",
  "CTA": "預約 30 分鐘導入諮詢", "QR": { "label": "掃碼預約" },
  "product": "assets/products/enterprise.png"
}
```

數據（NUM／LABEL）要有出處與核可人，登記在素材庫的 claim（見 [assets.md](assets.md)）。

## 配方與衝突

配方 frontmatter 的 `bans` 是機器可讀的禁用項（目前用到 `photo`、`color`）。`preview.mjs` 在產生前比對：

- `photo` vs 本片 `must` 含 `product-photo` → 衝突
- `color` vs 品牌 Logo 有彩色（品牌規則：Logo 不換色）→ 衝突

衝突時該風格不產生、結束代碼 3。回報使用者並請他選；不要偷偷改 content 或配方繞過去。

## 風格程式（style.js）

`window.STYLE = { build(tl, S, C, root) }`，`S` 是四個節拍時間，`C` 是 content，另有全域 `BRAND`（`id`、`name`、`logo` 規則、`colors`）與 `H` 工具：

| 工具 | 用途 |
|---|---|
| `H.logo(src, {x,y,w,h,align}, parent)` | 依 Logo 真實比例放進框內（寬版、方形都行），外層是 `.brand-locked` |
| `H.lines(text, max)` / `H.br(text, max)` | 依詞斷行（中英混排可用），回傳陣列／`<br>` 字串 |
| `H.qr(C, {x,y,size}, parent)` | 有 `C.QR` 才畫，沒有回傳 `null` |
| `H.rnd(seed)` `H.torn` `H.noise` `H.el` `H.chars` | 有種子的亂數、撕紙邊、雜訊、建元素、逐字拆分 |

規則：
- 不寫死品牌名、產品名、文案、品牌色（品牌色用 CSS 變數 `var(--brand)`、`var(--accent)`，來自 `brand/theme.css`）。
- `.brand-locked` 只能有進場與退場動畫；停留期間不可抖動、漂浮、變形、換色或加遮罩。其他元素（紙片、形狀、文字）可以自由動。
- 不讀系統時間；亂數一律用 `H.rnd`。
- 一個風格要有自己的構圖與動態語言，不是共用版型換顏色。

回歸測試 `npm test`（`tests/templates.test.mjs`）會用兩組不同品牌與產品的資料跑範例，檢查沒有殘留的樣本文字、Logo 停留時不動。新增範例時也跑一次。
