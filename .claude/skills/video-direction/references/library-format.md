# 素材庫格式

```
<專案>/assets-library/
├── library.json   名稱、品牌套件 id、預設授權、連結的其他庫
├── index.json     每個素材一筆
├── brand/         logo
├── products/      截圖、照片、文案
├── claims/        （宣稱只記在 index.json）
└── media/         影片、音訊、其他
```

## index.json 欄位

| 欄位 | 說明 |
|---|---|
| `id` `sha` | 檔案內容雜湊（同內容不重複入庫） |
| `path` | 相對庫的路徑 |
| `type` | logo／screenshot／photo／video／audio／copy／other／claim |
| `product` | `brand.json` 的正式產品名稱（含允許的合作品牌產品） |
| `tags` | 盤點用的關鍵字 |
| `license` | 授權，例如 `company-owned`、`CC BY 4.0`、`reference-only` |
| `source` | 出處（網址、提供者、生成工具） |
| `approved_by` | 核可人（宣稱必填才算可用） |
| `expires` | **授權**到期日；過期不能用 |
| `captured` | 截圖日期（截圖必填，不知道就留空＝需重新確認） |
| `valid_until` | 截圖內容的有效期（預設截圖日＋30 天）；過了要重新確認，不是刪除 |
| `brand_marks` | 匯入時在畫面上看到的其他品牌，或 `logo-version`（不是品牌套件的 Logo 檔） |
| `marks_review` | `{ by, date, note }`：使用者審核通過其他品牌標誌 |
| `note` `added` | 備註、入庫日 |

## plan.json（add-plan）

使用者確認過的匯入草稿，一個檔一筆：

```json
[
  { "file": "~/Downloads/novamind/IMG_2041.png", "type": "photo", "product": "NovaMind Enterprise", "tags": ["產品圖", "正面"], "license": "company-owned", "source": "產品部 2026-10 提供" },
  { "file": "~/Downloads/novamind/portal.png", "type": "screenshot", "tags": ["官網"], "source": "https://…", "captured": "2026-10-12", "valid_days": 30 }
]
```

## needs.json（check）

```json
[
  { "type": "logo", "label": "Logo（深底反白）" },
  { "type": "photo", "label": "產品圖", "product": "NovaMind Enterprise", "how": "請產品部提供" },
  { "type": "claim", "label": "部署時間", "tags": ["部署"], "how": "請 PM 核可" }
]
```

## 品牌規範從哪來

產品名稱、允許的合作品牌（`allowed_brands`）、禁用詞都在 `brand-kits/<kit>/brand.json`；這個庫不另存規則。`products` 可以是字串，或 `{ "name": "正式名稱", "aliases": ["別名"] }`。
