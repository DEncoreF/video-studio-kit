# 品牌套件

每個品牌一個資料夾，`brand.json` 是唯一來源；`design.md`（HyperFrames 讀的品牌規格）、`theme.css`（HyperFrames 18 個主題權杖）、`tokens.json`（`hyperframes capture` 寫的 `extracted/tokens.json` 的色彩與字型部分）都由它產生。

```bash
node scripts/brand-kit.mjs build                      # 改完 brand.json 後重新產生
node scripts/brand-kit.mjs apply kestrel videos/<影片>   # 套到影片專案
```

`apply` 會放進影片專案：`assets/brand/`（含固定檔名 `logo.svg`、`logo-reversed.svg`，換品牌不用改畫面）、`fonts/`、`brand/theme.css`、`brand/pronunciation.json`、`capture/extracted/tokens.json`，沒有 `design.md` 時一併放入。

字型放在 `_fonts/`（皆為 OFL）。正式品牌字型待確認，目前用 Noto Sans／Serif TC。

`kestrel`、`novamind` 是虛構的示範品牌，給測試與範例使用（Logo 也是示範用的）；真實品牌的套件不放在這個 repo。

新增品牌：複製一個資料夾，改 `brand.json` 與 `logos/`，再執行 build。

## brand.json 是品牌規範的唯一來源

腳本與 skills 都從這裡讀品牌事實，不在別處重複定義：

| 欄位 | 用途 |
|---|---|
| `products` | 產品正式名稱；可寫成 `{ "name": "…", "aliases": ["…"] }`。素材庫與預覽的產品名稱都以此為準 |
| `forbidden` | 畫面、旁白、截圖、影格中都不能出現的詞（品牌檢查判 FAIL） |
| `forbid_prices` | `true` 時價格一律判 FAIL |
| `allowed_brands` | 可以同框的其他品牌（其餘品牌出現時需人工審核） |
| `logo` | Logo 規則：`motion: "static"`（進場後不動）、`clear_space`（留白倍數） |
| `rules.do` / `rules.dont` | 給人看的品牌規則，品牌檢查的目視清單會列出 |
| `pronunciation` | 旁白改拼表 |

