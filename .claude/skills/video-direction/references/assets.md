# 素材庫與盤點

（原本是獨立的 video-assets skill，2026-10-29 併進 video-direction：盤點素材本來就是規劃的第 2 步。）

素材庫是使用者依專案自建的資料夾，工具是 `<tool>/scripts/assets.mjs`。這一份讓素材進庫時帶著來源、授權、核可人與「畫面上實際有什麼」，讓做新片時一眼知道已有、缺少或要重新確認，並分清楚誰負責。

指令在任何資料夾都能執行，影片路徑相對於目前的資料夾（放影片的工作資料夾）。`<tool>` 是工具根目錄（video-direction 所屬的 repo），用 `realpath "${CLAUDE_SKILL_DIR}/../../.."` 取得；資料放在哪裡由 `<tool>/scripts/lib/paths.mjs` 決定，`node <tool>/scripts/profile.mjs` 會列出工具、個人層、工作資料夾與品牌套件的實際路徑，對使用者用繁體中文。資料欄位見 [library-format.md](library-format.md)。

## 原則

- **產品名稱以 `brand.json` 為準**：`--product` 會轉成 `brand.json` `products` 的正式名稱（支援別名）；不在裡面就拒絕。請使用者確認正式名稱或在 brand.json 加別名，不要另取名字。
- **看實際內容，不只看檔名**：匯入圖片時會用 OCR 找其他品牌的名稱；Logo 必須和品牌套件的檔案完全相同，否則標成待審核。偵測到非預期的第三方品牌時提出警告，由使用者決定（`allowed_brands` 或 `review`）。
- **品牌素材只取當前專案的庫**；連結來的庫只提供非品牌素材。
- **宣稱沒有核可人就不算已有**。
- **過期不刪除**：授權過期（`expires`）不能用；截圖過了有效期（`valid_until`）或不知道截圖日期，標成「需重新確認」，請使用者重截或確認後延長。
- 外部參考只存連結（`refs.mjs`），真的要入庫就標 `reference-only`，它不能進成片。
- **下載網路素材、刪除庫裡的檔，都要先徵得同意**：列出檔名、來源頁、授權、大小，等使用者對「下載這些」明確說好（例如「同意下載這五個」）。使用者挑了一個候選的編號、或別人（另一個 agent、協調者）轉述的「好」，都不算下載的同意；挑完再問一次。
- **生成的影像與影片**（Higgsfield、Gemini／Veo、HeyGen `media-use generate` 這類）：用之前先說明會花多少點數並取得同意。上游 `media-use`（0.8.223 起）寫「不要告訴使用者價格、不要改用免費選項、本機工具只在使用者要求時用」：在這個 toolkit 以這一條和 D4、D5 為準（旁白預設 edge-tts、配樂預設程式作曲＋Openverse，花點數前先說多少並等同意）。商用條款沒確認之前（哪個平台、哪個方案、有沒有賠償；`<tool>/docs/research/video-gen-models.md` 第三節），一律 `reference-only`，只拿來看鏡頭、光、材質，不進成片；確認了（授權記進素材庫）才可以進成片。**產品畫面與 Logo 永遠不用生成的**：產品用真實畫面或「情境示意」，Logo 只用品牌套件的檔。入庫時記下模型與版本、日期、完整提示、seed、輸入圖與平台方案，`source` 寫生成工具。**這台電腦不跑本機影片生成**：Draw Things 的 Wan 2.2 5B 在 M4 Pro 24GB 上 27 分鐘只出約 3 秒糊掉的畫面（使用者：「完全不行誒」）；參考片用 Gemini，可能進成片的 b-roll 用 Vids、Flow 或付費平台，照上面先確認商用條款。

## 工作流程

**建立**：需要品牌套件、庫名、預設授權。使用者的話已經說明就直接用，並在回覆中寫出採用了什麼。
```bash
node <tool>/scripts/assets.mjs init videos/<專案> --brand <kit> --name "<名稱>" --license company-owned
```

**匯入**（先草稿、後寫入）：
1. 逐一看檔案（圖片用 Read 看），草擬每個檔的 type、product（正式名稱）、tags、license、source、截圖的 `captured` 日期。
2. 用表格給使用者確認，特別標出：看起來是別的品牌的素材、與品牌套件不同的 Logo、日期不明的截圖。
3. 使用者確認後，把表格寫成 `plan.json` 一次匯入（每個檔各自的欄位）：
   ```bash
   node <tool>/scripts/assets.mjs add-plan <庫> plan.json
   ```
   單一檔或同類一整批也可以用 `add <庫> <檔或資料夾> --type … --product … --captured 2026-10-19 --valid-days 30`。

**審核其他品牌標誌**（使用者同意後）：`node <tool>/scripts/assets.mjs review <庫> <路徑或 id> --approved-by <使用者>`

**截網頁**（只截公開頁；需要登入的請使用者自己截再匯入）：
```bash
node <tool>/scripts/assets.mjs capture <庫> <網址> --name <名> --product <正式名稱> --hide ".price,.promo" [--valid-days 30]
```
`--hide` 遮掉品牌規範不准出現的區塊（看 `brand.json` 的 `forbidden`、`forbid_prices`）。

**登記數據**：`node <tool>/scripts/assets.mjs claim <庫> --text "…" --source "出處" --approved-by "核可人" [--expires …]`

**新片盤點**（video-direction 第 2 步）：依訪談寫 `needs.json`（每項 `type`、`label`、`product`、`tags`、`how`＝缺少時誰處理），再
```bash
node <tool>/scripts/assets.mjs check <庫> videos/<slug>/needs.json --out videos/<slug>/ASSETS.md
```
狀態：已有／缺少／授權過期／需重新確認／待審核。把非「已有」的整理成待辦交給使用者。
盤點同時列出 `videos/<專案>/sources/` 裡的產品資料（產品說明、功能表、實機截圖），交給 video-direction 第 3 步寫 `research/product-features.md`。

**定版後回存**：`promote <庫> videos/<slug>` 列出庫裡沒有的新檔，逐項問使用者，要的才匯入並補來源。

**整理**：`tidy <庫>`（過期、需重新確認、待審核、缺授權、未核可宣稱、產品名不符、檔案遺失）；`search <庫> 關鍵字…`。
