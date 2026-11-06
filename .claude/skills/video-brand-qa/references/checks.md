# brand-qa 檢查細節

`scripts/brand-qa.mjs` 的每一項檢查、判定與資料格式。規則值一律讀 `brand-kits/<kit>/brand.json`，這份文件只說明怎麼判。

## 判定

| 狀態 | 意思 |
|---|---|
| PASS | 自動檢查確認沒有問題 |
| NEEDS_REVIEW | 無法自動確認，需要人看（不是通過） |
| FAIL | 違反硬性規範或技術上一定出錯 |

嚴重度：**硬性**（品牌規範、授權）、**重大**（會出錯或需人工判斷的重要項目）、**一般**。整體結果取最差的一項。

## 各項檢查

| 檢查 | 看什麼 | FAIL | NEEDS_REVIEW |
|---|---|---|---|
| lint | `hyperframes lint` | 錯誤（除非有使用者簽核的豁免） | 警告 |
| 色彩 | 原始碼色碼 vs 品牌套件＋`frame.md` | — | 色票外的顏色；沒有 `frame.md`（改以影格目視，`qa-review.json` 有 `check: "色彩"` 且通過就算 PASS） |
| 字型 | `font-family` vs `@font-face`／字型檔 | 系統中文字型（算圖機沒有） | 找不到字型檔 |
| 旁白與發音 | `narration.json` vs `assets/vo/manifest.json`；`brand/pronunciation.json` vs `brand.json` | 旁白檔與文字不同步；品牌詞缺發音紀錄 | 句子超過時段 |
| 素材授權 | `assets/` 中**實際被引用**的檔 vs 素材庫 | 沒有授權紀錄、`reference-only`、授權過期（`expires`） | 截圖有效期已過（`valid_until`）或截圖日期不明；含其他品牌標誌且未審核（`brand_marks`） |
| Remotion 授權 | 片子資料夾的 `package.json`、`node_modules/`、打包後的 JS、原始碼的 import | 依賴或安裝了 `remotion`／`@remotion/*`；打包進 Remotion 的執行環境（D1、D19） | import 了 `remotion` 卻找不到 build alias 指到本機 shim |
| 禁用內容 | 原始碼文字、旁白、素材圖片 OCR、影格 OCR | `forbidden` 詞（OCR 信心 ≥ 0.5）；`forbid_prices: true` 時的價格 | OCR 信心低的命中；未禁價格品牌的價格樣式 |
| 第三方品牌 | 同上，比對其他品牌套件的名稱與產品名 | — | 出現 `allowed_brands` 以外的品牌 |
| 圖片文字 | OCR 是否可用 | — | OCR 不能跑或讀檔失敗 |
| 結尾卡 | 最後 3 秒的影格（腳本另外在片尾前 2.5、1.5、0.6 秒各截一張）OCR，比對 `brand.json` 的 `rules.end_card`（使用者：「片尾要記得幫我補Acme 集團的logo」） | 有 OCR、有影格，卻讀不到某個必有 Logo 的字，而且原始碼也沒有引用它的 Logo 檔 | 品牌套件沒寫 `rules.end_card`；沒有影格（`--no-stills`）、OCR 不能跑、Logo 沒有可辨識的字；讀不到字但原始碼有引用 Logo 檔（可能太小或被蓋住） |
| 情境示意 | 片子用了重建或示意的介面（`direction/script.json` 某一拍的 `proof` 寫「情境示意」或「示意」「重建」「Illustrative」，或 `BRIEF.md` 寫 `illustrative: true`）時，影格與結尾卡的 OCR 要讀到「情境示意」或「Illustrative」（taste.md：不是真實介面就改做「情境示意」並蓋章） | — | 讀不到、沒有影格或 OCR 不能跑 |
| 交件規格 | 正式檔（`--render <檔>`，否則 `approval.json` 的 `render`，否則 `renders/` 裡最新、檔名不是 draft 的影片）用 ffprobe 量幀率，和 `BRIEF.md` 的 `fps` 比（沒寫就是 60：變形與轉場在 30 fps 會一格一格跳） | 幀率不同 | 讀不到幀率、`--render` 的檔不在。還沒有正式檔時不判，QA.md 寫一行提醒出片後再驗 |
| 目視檢查 | `qa-review.json` | 目視項目判定不通過（嚴重度非一般） | 尚未目視、或紀錄的內容指紋不是目前內容 |
| 唯讀 | 執行前後影片檔案指紋 | QA 過程改到影片檔 | — |

未被引用的素材（例如被替換下來的原始截圖）列在報告的「未使用的素材」，不檢查。

## 資料格式

`qa-review.json`（目視結果；內容一改即失效）：
```json
{
  "digest": "<報告上的內容指紋>",
  "by": "Claude（使用者確認）",
  "date": "2026-10-19",
  "items": [
    { "item": "中文易讀", "pass": true },
    { "item": "色彩", "check": "色彩", "pass": true, "note": "沒有 frame.md；影格中品牌深藍與紫未被替換" },
    { "item": "斷行", "pass": false, "severity": "minor", "time": 57.5, "note": "手繪圈切到「的」", "fix": "圈往右移 20px" }
  ]
}
```

`approval.json`（核可狀態；只由使用者核可時寫入，QA 只會把它改成 revoked）：
```json
{ "status": "approved", "approved_by": "使用者姓名", "date": "2026-10-19", "digest": "<核可當時的內容指紋>" }
```

`qa-waivers.json`（只限 lint）：
```json
[{ "check": "lint", "match": "missing_timeline_registry", "reason": "…", "approved_by": "使用者姓名", "date": "2026-10-19" }]
```

`BRIEF.md` 例外（使用者核可的本片禁用詞例外）：frontmatter 加 `allow_terms: [醫療]`。

`brand.json` 的結尾卡規則（`rules.end_card`；品牌套件在工作資料夾的 `brand-kits/<kit>/`，由使用者核可後寫入）：
```json
"rules": {
  "end_card": {
    "logos": [
      { "id": "acme", "name": "Acme 集團", "ocr": ["Acme", "ACME"], "files": ["acme-white.svg"] },
      { "id": "kestrel", "name": "Kestrel", "ocr": ["Kestrel"], "files": ["kestrel-white.svg"] }
    ],
    "layout": "Acme去背與 Kestrel 並排，換行再放 NovaMind"
  }
}
```
- `ocr`：Logo 裡看得到的字（字標），OCR 在最後 3 秒任何一張影格讀到其中一個（信心 ≥ 0.5）就算有。純圖形、沒有字的 Logo 不寫 `ocr`，結果會是 NEEDS_REVIEW，靠目視。
- `files`：Logo 檔名；讀不到字、但原始碼有引用這個檔時是 NEEDS_REVIEW（可能太小或被蓋住），連檔都沒引用才是 FAIL。
- `layout`：排列方式，寫進修正建議與目視清單。

`BRIEF.md` 的交件幀率：frontmatter `fps: 60`（不寫就是 60）；有重建或示意的介面而 script.json 沒標時，可寫 `illustrative: true`。

## 已知限制

- OCR（macOS Vision）對小字、斜字、低對比與藝術字可能漏抓或讀錯；漏抓靠目視補，讀錯的低信心命中會是 NEEDS_REVIEW。
- 影格是取樣，只出現一瞬間的字可能剛好沒截到；有分鏡時用 `--at` 指定。
- 動態問題（抖動、閃爍、停留時間）要播放確認：`node <tool>/scripts/hf.mjs preview videos/<slug>`。
