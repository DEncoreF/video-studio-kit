---
name: video-brand-qa
description: 行銷影片定版前的品牌與授權驗證（marketing-video-studio）：準備出正式版（1080p）之前，或使用者說「定版前檢查」「幫我 QA」「檢查品牌」「有沒有出現價格」「授權有沒有問題」「重新驗一下已核可的片」時使用；跑唯讀的 brand-qa.mjs 加目視檢查，產出 QA.md，違反品牌硬性規範一律不通過。只驗不改；草稿審片用 video-draft-review，素材授權怎麼登記看 video-direction 的 references/assets.md。
---

# video-brand-qa

這一步是**獨立的驗證**：它回答「這支片能不能送出去」，不負責修。修正要另外做、由使用者決定，修完再重新驗一次。所以整個 QA 過程不改影片、音訊或素材——腳本會比對執行前後的檔案指紋，有變動就判不通過。

指令在任何資料夾都能執行，影片路徑相對於目前的資料夾（放影片的工作資料夾）。`<tool>` 是工具根目錄（這個 skill 所屬的 repo），用 `realpath "${CLAUDE_SKILL_DIR}/../../.."` 取得；資料放在哪裡由 `<tool>/scripts/lib/paths.mjs` 決定，`node <tool>/scripts/profile.mjs` 會列出工具、個人層、工作資料夾與品牌套件的實際路徑，對使用者用繁體中文。各項檢查的細節、判定規則與資料格式在 [references/checks.md](references/checks.md)。

## 規則從哪來

品牌規範只有一個來源：`brand-kits/<kit>/brand.json`（`forbidden`、`forbid_prices`、`allowed_brands`、`logo`、`rules`、`pronunciation`）。這個 skill 不另外定義規則，也不能放寬規則：

- 違反明確的品牌規範就是 **FAIL**，不論字出現在字幕、旁白、截圖、照片或介面裡；不可以因為「影響不大」「原本網站就有」而放行。
- 唯一的例外是使用者在該片 `BRIEF.md` 寫明 `allow_terms: [詞]`（例如這支片的主題就是醫療方案）。
- 無法確認的（OCR 信心低、OCR 不能跑、沒有 frame.md、還沒目視）是 **NEEDS_REVIEW**，不是 PASS。

## 流程

1. **跑腳本**
   ```bash
   node <tool>/scripts/brand-qa.mjs videos/<slug> [--kit <kit>] [--at 2,6,11,…] [--render videos/<slug>/renders/<正式檔>.mp4]
   ```
   預設每 2 秒截一張影格，另外在片尾前 3 秒截三張看結尾卡；有分鏡時用 `--at` 指定每個鏡頭文字最完整的時間點。結尾卡要有品牌套件 `rules.end_card` 規定的 Logo（「片尾要記得幫我補Acme 集團的logo」）；用了重建或示意的介面，畫面上要有「情境示意／Illustrative」；有正式檔時（`--render`、`approval.json` 的 `render`，或 renders/ 裡不是 draft 的檔），幀率要等於 BRIEF 的 `fps`，預設 60。輸出 `QA.md`、`qa/report.json`、`qa/stills/`（總覽圖 `contact-sheet*.jpg` 可能不只一張，以報告列出的為準）。結束代碼：0 PASS、2 NEEDS_REVIEW、1 FAIL。

2. **目視檢查**：讀報告列出的**每一張**總覽圖，有疑慮的影格開單張看。照 QA.md 的「目視檢查清單」逐項判斷，特別留意 OCR 可能漏抓的：小字、斜放或被遮一半的字、Logo 與圖示裡的字。沒有 `frame.md` 的片子，用影格確認品牌主色沒被替換（`check: "色彩"`）。

3. **記錄目視結果**到 `videos/<slug>/qa-review.json`（`digest` 用報告上的內容指紋；格式見 references/checks.md），再跑一次腳本得到最終結果。內容一改，指紋就變，舊的目視紀錄自動失效。

4. **回報**：給使用者一段摘要——結果、每個 FAIL／NEEDS_REVIEW 的問題、時間點、嚴重度、判定依據、修正建議（QA.md 的表格已有，摘要挑重點）。需要使用者決定的事一項一句。**不要自己動手修**，也不要在使用者同意前 render 正式版。

## 已核可的影片

`approval.json` 記錄核可狀態與當時的內容指紋。重新驗證時：

- 內容與品牌規則都沒變：只補 QA 紀錄。缺少的「紀錄類」項目（例如影片裡沒有 `brand/pronunciation.json`，但旁白當初確實照發音表合成；素材沒登記授權）可以在使用者同意後補紀錄，**不重跑** `brand-kit apply`、TTS 或素材生成——那會改到已核可的畫面與聲音。
- 發現新的重大違規：腳本會把 `approval.json` 改成 `revoked` 並寫下原因（這是 QA 唯一會寫的影片外紀錄）。提出修正要求，由使用者決定怎麼修；不擅自覆寫影片。

## 修正（QA 之外，使用者同意後）

處理違規的優先順序：重新截圖 → 裁切 → 局部遮蓋或移除 → 最後才模糊。修改已核可的素材時另存新檔（例如 `assets/portal-v2/`），保留原檔備查；修完重新跑這個 skill。

## 豁免

只有技術檢查（lint 誤報）可以豁免，要在 `qa-waivers.json` 寫明原因與核可人（使用者本人）；品牌規範不能豁免。能修掉誤報就修掉，不要靠豁免。
