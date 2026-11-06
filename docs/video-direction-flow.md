# 創意方向流程（video-direction）

目的：在需求訪談之後、正式製作之前，先用參考把故事和風格找出來，再用**這支影片自己的內容**讓使用者比較三個方向，最後一關一關確認分鏡、文字效果與轉場。風格庫不存預覽影片，預覽只為這支影片產生。步驟編號和 [PLAYBOOK.md](PLAYBOOK.md) 的總覽一致。

指令寫成在工具根目錄執行；在放影片的工作資料夾執行時，`scripts/` 換成 `<tool>/scripts/`（見 [PLAYBOOK.md](PLAYBOOK.md)〈個人層與路徑〉）。

⏸ 表示這一步要等使用者決定。每一關都要走；真的用不到某一步時，明白說出跳過哪一步、為什麼，不默默略過。

## 前提（第 1–2 步）

- 需求訪談已完成：影片要做什麼、給誰看、長度、要講的重點、這支片要的樣子（`direction/axes.json`；形式不在訪談問，跟著方向的 seed 參考）、有沒有腳本、需要的素材（見 video-direction 的 `references/assets.md`）。
- 已決定品牌套件（`brand-kits/<kit>`），影片專案已建立。

## 步驟

### 3. 參考與腳本 ⏸

先找參考，再談風格。依有沒有腳本走兩條路：

| | 沒有腳本 | 有腳本 |
|---|---|---|
| 先做 | 廣泛找 4–10 件真實作品，看它們怎麼講故事（開場、收尾、主角、鏡頭） | 把腳本整理成表格（段落、秒數、畫面、畫面上的字），不懂的問清楚，使用者確認 ⏸ |
| 再做 | 從參考提 2–3 條主線，每條一句話的故事線＋出自哪件參考 | 每一景、每個接縫各找參考：這一景要演什麼、這個接縫怎麼交棒 |
| 最後 | 使用者挑主線後寫腳本，確認 ⏸ | — |

腳本寫在 `videos/<影片>/direction/script.md`。有腳本時不自行改寫，該改的地方提出來讓使用者決定。

找參考的規則：

- 使用者給的參考先看（`node scripts/refs.mjs list --by user`、`node scripts/refs.mjs inbox`），再看過去收過的（`node scripts/refs.mjs search <關鍵字>`）。
- 往外找，任何網站都可以：個人層的 `reference-sites.md` 是分類好的起點；常用的有 Prompt Motion、Skillry、Behance、Vimeo、Dribbble、Motionographer／STASH、動態設計工作室官網、Eyecandy（鏡頭與轉場手法庫）。Pinterest、Instagram 只在使用者已經登入時看，不替使用者登入；沒看就說沒看。
- 每一輪至少 3 件新作品，既不在使用者的收藏，也不在 `styles/recipes` 與個人層配方裡。
- 給使用者看過或用到的參考都要記：`node scripts/refs.mjs add <影片> --url … --title … --why …`，同時寫進該片的 `references.md` 與個人層的 `references-log.jsonl`（D10）；使用者給的加 `--by user`，用在哪一景加 `--note 用在=第 N 景`。

### 4. 從參考長出三個方向 ⏸

配方是詞彙，不是來源：方向要從第 3 步的參考長出來，再用配方的詞彙描述與實作。只從既有配方挑選或重組，想法會固化。

1. **挑方向**：讀 `styles/recipes/*.md` 與個人層配方，用 `tags`（用途）與「方向」「注意」篩，挑 **3 個**，三個在動態語言或材質上不同（不只換色），依使用者的品味檔（個人層 `taste.md`）排序，「不要」清單裡的不放。每個方向寫一句為什麼適合，並寫出**它建立在哪件新參考上**、借了什麼。好方向不在配方裡時，先補一份配方（`status: radar`）再預覽。
2. **寫本片內容**：在 `direction/content.json` 填這支片四個節拍的真實文字（從確認的腳本取）、產品正式名稱（以 `brand.json` 為準）、核心訊息、可選的 QR 與 `must`（本片不能拿掉的元素）。欄位說明與範例見 [content-and-styles.md](../.claude/skills/video-direction/references/content-and-styles.md)。沒有這個檔時，會用 `styles/_preview/content.json` 的示範內容。
3. **準備每個方向的程式**：
   - 有範例程式（`styles/examples/<id>/`）：直接用，`preview.mjs` 會複製進來。
   - 沒有範例：依參考與配方寫 `direction/<id>/style/style.js` 與 `style.css`（約定見 `styles/README.md`）。這份程式屬於這支影片，可以依內容調整。
   - 範例也可以針對本片修改：改 `direction/<id>/style/` 裡的副本即可，不會動到範例。
4. **靜態畫面**：

   ```bash
   node scripts/preview.mjs videos/<影片> swiss,collage,wabi-sabi
   ```

   每個風格輸出四張畫面（Logo・產品・數據・行動呼籲）到 `direction/<id>/stills/`。另外每個方向做一張**真渲染的關鍵影格**：這支片的主角時刻，最終解析度、字型、顏色，旁邊附色票 hex、字、三種緩動、節奏的小卡（[frame-spec.md](../.claude/skills/video-direction/references/frame-spec.md) §1）；選方向看的是這一張。先自己看過 contact-sheet 與關鍵影格，修掉重疊、斷字、對比不足，對過 frame-spec.md §2 的禁用清單，再給使用者看。若某個風格的配方禁用項與品牌規範或本片必備內容衝突（例如歐普藝術禁用照片，但這支片一定要有產品照），`preview.mjs` 不會產生它，並以結束代碼 3 回報衝突。把衝突交給使用者決定，品牌規範優先於配方。
5. **使用者選擇** ⏸：

   ```bash
   node scripts/gallery.mjs --video videos/<影片>
   ```

   「本片候選」分頁顯示每個方向的畫面；使用者選一個、可填調整需求（用途、長度、色彩、字體、其他、創意幅度、節奏），送出後寫進 `videos/<影片>/selection.json`。也可以直接在對話裡回覆。
6. **動態從最難的鏡頭開始**：不再為前幾名各出動態預覽。使用者想先看選定方向動起來的樣子時，出 10 秒草稿動態（`direction/<id>/preview.mp4`），依 `selection.json` 的調整需求修改後，先過 `video-draft-review` 的試片量測或標「未審片預覽」再給使用者看：

   ```bash
   node scripts/preview.mjs videos/<影片> collage --motion --no-stills
   ```

### 5. 節奏單、分鏡、最難的鏡頭 ⏸

先寫節奏單 `direction/treatment.md`：每小節的事件與能量、能量曲線（3 秒內 hook、最密在 30–60%、最大高峰在 75–90%）、四張關鍵靜幀（hook、主角、最密、結尾）、連續性鏈（見 [script-craft.md](../.claude/skills/video-direction/references/script-craft.md) §7.5）。沒寫完不開工。

再用定版的風格把腳本排成 `STORYBOARD.md`（格式見 `.claude/skills/hyperframes/references/storyboard-format.md`）：每一景的秒數、畫面、畫面上的字、用到的參考，關鍵畫面附靜態示意。

- 每支片都寫接縫表（欄位見 [transitions.md](../.claude/skills/video-direction/references/transitions.md)「接縫表」）。選了一鏡到底的片子，再列全片不變的東西（主角記號、空間、線寬、動態語言）。
- 對拍的片子：秒數由小節決定，配樂方向與 BPM 要在這一步定，曲子本身在第 11 步做。
- 分鏡核可後，先把全片最難的那一鏡用最終解析度、字型、顏色做到位，和尺並排比（[finish-layers.md](../.claude/skills/video-direction/references/finish-layers.md) §3）。

### 6. 文字效果 ⏸

先刪字：大字只在畫面說不出時才出現，一次一個 1–4 字的片段（[script-craft.md](../.claude/skills/video-direction/references/script-craft.md) §6）。留下來的每個標題與大字配一個效果，用一張表確認（標題 → 效果 → 為什麼），寫進 `STORYBOARD.md` 的 `text_effect`。一般效果用 `library/text-effects.json` 的名稱；要演出字義的標題交給 `semantic-type`，在 `videos/<專案>/tests/_semantic-<slug>` 測試底座做 4 秒片段，核可後才搬進正片。

### 7. 轉場與交棒 ⏸

全片 6–8 種手法、每種最多兩次，另一個從品牌標誌長出來的招牌轉場用在開場、中段、結尾。先挑一個接縫做成幾秒的片段，出 2–3 種做法給使用者挑（`direction/transitions/`），選定後才套到所有接縫，寫進 `STORYBOARD.md` 的 `transition_in`。每支片都要做，不只科技風。

### 8. 定版

- 把風格、調整內容、採用的參考記在該片的 `references.md`，並更新 `references-log.jsonl` 的 `used`。
- 寫 `frame.md`（外觀寫成數字＋禁用清單，見 [frame-spec.md](../.claude/skills/video-direction/references/frame-spec.md)）、`BRIEF.md` 與 `SPEC.md`（見 `video-direction` 的 [handoff.md](../.claude/skills/video-direction/references/handoff.md)），交給 `/hyperframes` 依 `SPEC.md` 與 `STORYBOARD.md` 擴充成完整片長，沿用 `direction/<id>/style/` 的構圖與動態語言。
- 若這個風格原本沒有範例，定版後可把程式收進 `styles/examples/<id>/`，配方狀態升為 trial。

## 檔案位置

| 檔案 | 進 git | 說明 |
|---|---|---|
| `direction/script.md` | 是 | 確認過的腳本 |
| `direction/content.json` | 是 | 本片內容 |
| `direction/<id>/style/` | 是 | 本片用的風格程式 |
| `direction/<id>/meta.json` | 是 | 來源（範例／本片撰寫）、產生時間 |
| `direction/transitions/` | 否 | 接縫測試；選定的做法記在 `STORYBOARD.md` |
| `direction/treatment.md` | 是 | 節奏單：每小節的事件、能量曲線、關鍵靜幀 |
| `STORYBOARD.md` | 是 | 分鏡、接縫表、文字效果、轉場 |
| `direction/<id>/stills/`、`preview.mp4`、其他產物 | 否 | 隨時可重建 |
| `selection.json` | 否 | 使用者在圖庫的選擇 |
