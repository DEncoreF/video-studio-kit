---
name: video-direction
description: 行銷影片的前期與創意方向（marketing-video-studio）：要做新的宣傳片、產品片、品牌片、展會開場或社群短片，或要找參考、提方向、寫腳本、排分鏡、換風格，或要建素材庫、盤點與匯入素材、截產品網頁、登記數據、查授權與有效期時，先用這個 skill 再進 /hyperframes，即使使用者只說「幫我做一支影片」。它訪談、找並標參考、盤點素材、從參考長出方向與形式、寫腳本與分鏡，交出 BRIEF.md、STORYBOARD.md、frame.md 與 SPEC.md；動態工藝、審片、品牌驗證交給 video-motion-craft、video-draft-review、video-brand-qa。
---

# video-direction

在 `/hyperframes` 正式製作之前，把「要做什麼」「講什麼故事」「長什麼樣」定下來，最後交出 `BRIEF.md`、`STORYBOARD.md`、`frame.md` 與 `SPEC.md`，讓 `/hyperframes` 不再重複訪談、不重跑故事線。這個 skill 只負責**規劃**：素材庫與盤點在 [references/assets.md](references/assets.md)，標題的語意動畫交給 semantic-type，做草稿時的動態工藝（讀點與停留、轉場尺、節拍、流暢度）交給 **video-motion-craft**，每一版給使用者看之前的審片交給 **video-draft-review**，定版前的品牌驗證交給 video-brand-qa。

指令在任何資料夾都能執行，影片路徑相對於目前的資料夾（放影片的工作資料夾）。`<tool>` 是工具根目錄（這個 skill 所屬的 repo），用 `realpath "${CLAUDE_SKILL_DIR}/../../.."` 取得；資料放在哪裡由 `<tool>/scripts/lib/paths.mjs` 決定，`node <tool>/scripts/profile.mjs` 會列出工具、個人層、工作資料夾與品牌套件的實際路徑，對使用者用繁體中文。資料格式與風格程式的寫法在 [references/content-and-styles.md](references/content-and-styles.md)。

## 誰決定什麼

品味的判斷給使用者，其他 Claude 自己做完；能從參考推出來的（形式、字的效果、交棒手法），照參考定，不另外問。全權交辦時 🙋 也由 Claude 照尺與參考決定、寫進 `direction/decisions.md`，**只有「參考不足」那一題一定問**。

| 步驟 | 🙋 使用者決定 | 🤖 Claude 自己做 |
|---|---|---|
| 1 訪談 | 一句話、觀眾與播放場所、必出現／不能出現、片長、旁白；確認「這支片要的樣子」（`axes.json`） | 從回答整理摘要與 `axes.json` |
| 2 素材 | 補缺的素材 | 盤點、列缺口 |
| 3 參考與腳本 | 挑 2–3 件當尺；挑一條主線；核可腳本 | `refs.mjs hunt` 找參考、`card` 標卡（借什麼、別抄、設計軸、影格）、提主線、寫腳本、標每一拍誰做得出來 |
| 3.5 鎖腳本 | 核可灰階分鏡板 | 做分鏡板 |
| 4 方向 | 挑一個方向（連同它的形式） | `refs.mjs match` 排 seed、三個方向各從 seed 長出來、真渲染關鍵影格 |
| 5 分鏡 | 最難的鏡頭：campaign 挑一版；**參考不足：改需求或首創** | 節奏單、分鏡、`made_by`、讀點與接縫、綁 `refs`、`refs.mjs board`、做 campaign 的各版本 |
| 6 字 | — | 照參考卡定每個標題的效果，表附在草稿回報 |
| 7 轉場 | 代表性接縫：campaign 挑一版 | 每個接縫照參考卡定手法 |
| 8 定版 | — | `frame.md`、`BRIEF.md`、`SPEC.md` |
| 製作與審片 | 看草稿、給意見 | 照參考板做、量測、和尺與參考並排、獨立審片、修到 PASS；同一個問題修兩輪還不行就開 campaign |
| 收尾 | 配樂方向、核可交件 | 音效、品牌 QA |

## 必須成立的數字

| 項目 | 數字 |
|---|---|
| 參考 | 每一輪至少 3 件新作品（不在收藏、不在配方）；影片參考一律用 /watch 看過才算看過 |
| 尺 | 使用者挑 2–3 件；`direction/ruler.md` 每一項都有數字 |
| 參考是流程節點 | 找（`refs.mjs hunt`：每輪 3–5 件，每件寫為什麼值得看）→ 標（`refs.mjs card`：面向、借什麼、別抄、設計軸、本機影格）→ 方向從 seed 長出來（`refs.mjs match` 對 `direction/axes.json`）→ 綁（`script.json` 主角拍與 `major`／`bar` 接縫的 `refs`，沒綁 script-lint 與審片都 FAIL）→ 用（`refs.mjs board` 參考板、審片包 `refs/` 並排）。主角時刻找不到參考就停下來問：改需求或首創（`experimental`） |
| 腳本 | 一句話 ≤ 25 字、一個主張；主角拍 ≤ 3；材質變形 ≤ 3、只在主角拍；script-lint 沒有 FAIL |
| 字 | 大字只在畫面說不出時才有；一次一個 1–4 字的片段，字和畫面輪流；每 10 秒至少 1.5 秒無字（[script-craft.md](references/script-craft.md) §6） |
| 能量 | 3 秒內 hook；一階一階爬；段落交界至少改兩樣（script-craft.md §7.5）。方向（量測只提醒，校準過的片子都沒做到，不當硬規定）：最密在片長 30–60%、最大高峰在 75–90%、兩小節以上沒有新事件要有理由。數字的出處是 `library/rules/motion.json` |
| 方向 | 3 個，各一張真渲染的關鍵影格（本片的主角時刻，最終解析度、字型、顏色）＋一張色票／字／緩動／節奏小卡；三個在動態語言或材質上不同，不只換色；至少一個使用者沒看過、至少一個純 2D 動態設計、最多一個實驗方向（huashu-motion） |
| 外觀 | `frame.md` 全部寫成數字：hex 色票與一個有意義的強調色、字族字重字級、約 3 種命名的緩動（cubic-bezier 或彈簧阻尼比 0.7–0.85）、格數、**版面規矩**（安全區、Logo、字卡列、主畫面；frame-spec.md §1.5）；加禁用清單（[references/frame-spec.md](references/frame-spec.md)） |
| 質感 | 要驚艷的片子：五層（元件、字體、顏色、動態效果、過場組成）逐拍對到使用者的參考；節奏單寫完後先做最難的鏡頭（10–12 秒、最終品質）和尺並排比 |
| 轉場 | 每個接縫（含開場、結尾）一種手法；全片 6–8 種、每種最多兩次，加一個從品牌標誌長出來的招牌轉場用在開場、中段、結尾；下一個狀態從上一個的材質長出來；代表性接縫出 2–3 種做法 |
| 能力 | 每一景寫 `made_by: code | asset | outsource`：文字、介面、數據、版面用程式；插畫、角色、有機變形用素材；寫實 3D 與人物外包（[capabilities.md](references/capabilities.md)）。主角時刻要落在程式擅長的或已經有的素材上 |
| 比較 | 主角時刻與代表性接縫用 campaign 同時做 2–3 種做法、並排給使用者挑（`scripts/campaign.mjs`）；一個問題修兩輪還不行就開 campaign 或換做法，不繼續微調 |
| 一輪 | 只改一個變數（腳本、字句、節奏、風格、材質擇一） |

## 製作順序：先看到，再做整支

外部案例的共同做法（huashu-motion、Cinetic、@twoclipping；內部研究筆記 跨案例第 1–2 條、`aiposthub-crawl.md` 第十節）：
1. 三個方向，各一張真渲染的關鍵影格，使用者挑一個（第 4 步）；
2. 節奏單：每小節的事件、能量曲線、四張關鍵靜幀（第 5 步），沒寫完不開工；
3. 最難的鏡頭，用最終解析度、字型、顏色做到位，開 campaign 同時做 2–3 種做法讓使用者挑（第 5 步最後，[finish-layers.md](references/finish-layers.md) §3）；
4. 全片渲染前，每拍先渲一格，修掉擠的、難讀的、不在格上的（video-motion-craft 第 2 步）；
5. 整支。

中途要讓使用者挑方向，可以送放在 `direction/` 或 `candidates/` 底下的候選（條件在 video-draft-review 的「候選與預覽」）；草稿和要定案的片段照樣要過審片關卡。

## 開始前先讀

- 使用者的品味檔 `<個人層>/taste.md`（預設 `~/.video-studio/taste.md`）：喜歡什麼、不要什麼、預設旁白與配樂、被否決過的做法。風格排序與配樂方向以它為準；檔案不存在時先跑 `node <tool>/scripts/profile.mjs init`，在訪談時順便問品味並寫進去（使用者確認後）。
- `<個人層>/taste-log.jsonl`：過去選了、否決了哪些風格與配樂。
- 品味檔要改時（使用者選擇、否決、給參考後），先把要加或改的句子給使用者看，同意才寫，並在個人層 commit。
- **出方向（第 4 步）之前必讀，不是寫 frame.md 時才讀**：[references/frame-spec.md](references/frame-spec.md) §1.5 版面規矩與 §2 禁用清單、`<tool>/.claude/skills/hyperframes/SKILL.md`「Keep it editable」的安全區（90% action-safe、80% title-safe）。品味檔和禁用清單衝突（例如喜歡 HUD 小字、時間碼）時，把衝突寫出來問使用者，不要自己挑一邊。之前一支片 2026-10-29 三份都沒讀就出方向：字卡貼邊、框線跑到 Logo 後面、帶著禁用的角落計數器與小眉標送出（使用者：「為什麼沒先查」）。
- 品牌套件 `brand-kits/<kit>/brand.json`：品牌規範的唯一來源（產品正式名稱、禁用詞、Logo 規則、允許的合作品牌）。這裡不重述規則，用到時去讀。

## 流程（⏸ = 等使用者回覆）

每一關都要走。這支片真的用不到某一步（例如只有一個鏡頭、沒有接縫），**明白說出跳過哪一步、為什麼**，不可以默默略過。

**全權交辦**：使用者說「全部交給你決定 不要問我任何問題唷」（或同樣意思）時，每一關照樣走，但 ⏸ 改成自己依尺決定：選項、選了哪個、為什麼，逐關寫進 `direction/decisions.md`。只把完成的成果給使用者看，請他回答「行／不行」（使用者：「你應該要變成專業的，我並不專業，我只有自己的喜好跟審美而已」）。仍然要先問的只有：下載、花點數的生成、和品牌規範衝突、刪檔。

### 1. 訪談 ⏸
一次問完、讓使用者一次答；能從對話推得的直接寫出來請他確認。
- **要做什麼**：看完要記住的一句話（`message`）與要做的動作；給誰看、在哪播（決定比例）；一定要出現／不能出現的內容；長度；旁白。
  - **旁白預設**：一般影片用 edge-tts `zh-TW-YunJheNeural`；**展場、門市、大螢幕這類靜音循環播放，預設不做旁白**，除非使用者明確要求。循環片的結尾要能接回開頭。
- **有沒有腳本**：已經有腳本或分鏡稿就請使用者貼上或給檔案。這決定第 3 步走哪條路。
- **要的樣子（設計軸）**：從回答裡把這支片在各軸上要什麼寫進 `direction/axes.json`（節奏、調性、材質、空間感、鏡頭語言、文字使用、轉場手法；值的清單在 `<tool>/library/rules/ref-axes.json`），例如 `{"pacing": "fast", "tone": ["premium", "bold"], "text": "minimal"}`，請使用者確認。找參考和挑方向都靠它排序。
- **要準備什麼**：品牌套件；已有的素材與數據來源；結尾要不要 QR code（可有可無）。
- **產品名稱以 `brand.json` 的 `products`（含 aliases）為準**。使用者說的名稱不在裡面時，問清楚正式名稱，必要時建議在 brand.json 加別名，不要自己發明。

回一段摘要（message＋規格＋有沒有腳本＋必出現／不能出現＋這支片要的樣子），使用者確認才往下。**形式（一鏡到底、蒙太奇、混合）和風格都不在這裡問**：它們從參考來，第 4 步每個方向帶著自己的形式給使用者挑（使用者：「形式感覺跟參考有關」）。

### 2. 建立影片專案、盤點素材
同一個案子的片子、試片、原始素材、研究都放在 `videos/<專案>/`（`PROJECT.md`、`films/`、`tests/`、`sources/`、`research/`、共用 `assets-library/`，見 `<tool>/docs/USAGE.md`「專案」）。下面的 `videos/<slug>` 指 `videos/<專案>/films/<片>`；試片、測試底座一律放 `videos/<專案>/tests/_<名稱>`。新片先看是否屬於既有專案；新專案先寫 `PROJECT.md`，每次多一支片、試片或改了現行版就更新它。
```bash
node <tool>/scripts/hf.mjs init videos/<slug> --example blank --non-interactive --resolution landscape   # 或 portrait / square
node <tool>/scripts/brand-kit.mjs apply <kit> videos/<slug>
```
`init` 只接受空資料夾，所以先 init 再放其他檔。

素材盤點照 [references/assets.md](references/assets.md) 的「新片盤點」，產出 `ASSETS.md`；素材庫的建立、匯入、截網頁、登記數據、授權與有效期、定版後回存也都在那一份。匯入素材前的草稿要給使用者確認。缺素材不擋提案，預覽可先用佔位並標清楚。腳本或分鏡定了之後多出新需求，再回 references/assets.md 的新片盤點補一次。

### 3. 參考與腳本 ⏸
先找參考，再談風格。依有沒有腳本走兩條路。

**先讀懂產品**（兩條路都要）：先讀 `videos/<專案>/sources/` 裡的產品資料（說明、功能表、實機截圖；新片盤點會列出來），寫 `videos/<專案>/research/product-features.md`，一列一個功能：功能 → 解決觀眾的哪個痛點 → 畫面上用什麼證明。主線和每一拍都要對到表裡的一列。

**沒有腳本：先找參考，再從參考長出腳本**
1. 依 message 與觀眾廣泛找 4–10 件真實作品，看它們怎麼講故事：怎麼開場、怎麼收尾、主角是誰、鏡頭怎麼走，不只看外觀。
2. 從參考提 **2–3 條主線**：每條一句話的故事線，加上它從哪件參考長出來。
   **概念關**：每條主線還要寫出：
   - 一句話（script-craft.md §1）；
   - 驚艷的那一刻：看完觀眾記得的那個畫面，一個沒在別的片看過的主角時刻；
   - 手法和一句話的關係：說不出來就是形式大於內容；
   - 誰做得出那一刻：程式、現有素材，還是要外包（[references/capabilities.md](references/capabilities.md)）。同一個意思挑程式做得到頂的演法；要外包的先問使用者預算與時間。

   那一刻就是第 5 步節奏單寫完後先做的「最難的鏡頭」（[references/finish-layers.md](references/finish-layers.md) §3）；這裡要寫得出來、說得出它和一句話的關係。自由發揮的片子也要走這一關（使用者：「感覺有點無聊喔」「不確定你想要表達什麼」「我覺得我沒有被驚艷到」）。
3. 使用者挑一條（或混合）後寫腳本 ⏸：段落、秒數、畫面、畫面上的字，寫進 `videos/<slug>/direction/script.md`。
   - 照 [references/script-craft.md](references/script-craft.md) 自評：一句話、策略敘事五拍、主角拍 ≤ 3、每拍有動詞與證據、字的預算、首尾呼應。
   - 每一拍先做 [references/visual-verbs.md](references/visual-verbs.md) 的「動詞 → 三個畫面比喻 → 選一個」，寫進 `direction/visual-verbs.md`。
   - 每一拍選呈現層：介面互動（預設）、材質變形（主角拍，最多 3 個）、實景（只在頭尾），見 [references/visual-verbs.md](references/visual-verbs.md)。
   - 同時寫 `direction/script.json`，跑 `node <tool>/scripts/script-lint.mjs videos/<slug>/direction/script.json`，FAIL 要先修。
   - 腳本確認才往下。

**有腳本：先確認腳本，再逐景找參考**
1. 把腳本整理成同樣的表格（段落、秒數、畫面、畫面上的字），看不懂或缺的地方問清楚 ⏸。不要自行改寫；覺得該改的地方提出來讓使用者決定。確認後寫進 `direction/script.md`。
2. **每一景、每個接縫各找參考**：這一景要演什麼（構圖、主角的動作、文字效果），這個接縫怎麼交棒（轉場、鏡頭運動）。每一景至少一件，記錄時用 `--note 用在=第 N 景` 或 `--note 用在=接縫 N→N+1` 標註。

**找參考是一個獨立的步驟，不是邊做邊順手**（兩條路都適用）。每一輪：
1. `node <tool>/scripts/refs.mjs hunt videos/<slug>`：寫出 `direction/ref-hunt.md`——這支片要的樣子、還缺哪些參考（主角拍、主要接縫排最前面）、每個缺口要哪一類（交棒、鏡頭、構圖、字…），以及收過的卡裡最接近的候選。還沒有 script.json 時，它只列這支片要的樣子和收過的候選。
2. 照缺口的類型分開搜，只用認可的來源；每輪 **3–5 件**，每件寫一句為什麼值得看（`--why`，片子的參考沒有就不收）。
3. 看過就記、要用就標：`refs.mjs add` → `refs.mjs card <id> --take 面向=借什麼 --axis 軸=值`。
4. 再跑一次 hunt，直到主角時刻都有參考；`refs.mjs match videos/<slug>` 列出最適合當這支片 seed 的卡。

**找參考的規則**
- **使用者提供的參考優先**：先跑 `node <tool>/scripts/refs.mjs list --by user` 和 `node <tool>/scripts/refs.mjs inbox`（使用者丟在 `<個人層>/inbox/` 的檔案）。逐一看過，用一句話說出可借用什麼（構圖、色彩、字體、動態、節奏、轉場、配樂）和不借用什麼，再用 `refs.mjs add <片> (--url|--file) --by user --learn "…"` 記錄。和品牌規範或 `video-taste-profile` 衝突時，說出衝突讓使用者決定。
- **看影片參考一律用 /watch**（本機模式；指令見 `<tool>/docs/PLAYBOOK.md`「看影片參考的方法」）：看開場、收尾、重點時刻與轉場前後的連續格和逐字稿，再下判斷。只看標題、說明、縮圖或網頁文字不算看過；沒用 /watch 看的參考，回報時標「未看」。下載的影片只放暫存資料夾。（使用者 2026-10-23：「要看參考就使用 /watch」）
- **先看收過什麼**：`node <tool>/scripts/refs.mjs search <關鍵字…>`。
- **往外找，任何網站都可以**：個人層的 `reference-sites.md`（有的話）是分類好的起點；常用的有 Prompt Motion、Skillry、Behance、Vimeo、Dribbble、Motionographer／STASH、動態設計工作室的官網、Eyecandy（鏡頭與轉場手法庫）。Pinterest、Instagram 要登入才看得到：使用者已經在瀏覽器登入才看，**不替使用者登入**；沒看就在回報裡說沒看。
- **每一輪至少 3 件新作品**：既不在使用者的收藏（`refs.mjs list --by user`），也不在 `<tool>/styles/recipes` 與個人層配方裡。只在自己的收藏和配方裡挑，想法會固化。
- **看過就記**：給使用者看過或用到的參考，每一件都用 `node <tool>/scripts/refs.mjs add <片> --url U --title "…" --why "…" [--at 4.5-6.5]` 記錄（只存連結與理由，不下載、不進成片；會先打開連結，打不開的不記）；使用者給的加 `--by user`。
- **會用到的就標成卡**（參考是流程節點，不是旁邊的連結）：要拿來做某一拍、某個接縫的參考，標出它是哪方面的參考、借什麼、別抄什麼：
  ```bash
  node <tool>/scripts/refs.mjs card <id> --take transition="條狀掃過，新畫面緊跟在條後" --take type="大字只佔一行、字重 800" --avoid "不抄它的藍紫配色" [--file <本機檔>]
  ```
  面向：構圖、字、顏色、材質、動態、交棒、鏡頭、節奏、聲音、概念（`composition type color material motion transition camera pacing sound concept`）。「借什麼」寫成做得出來的一句（有數字更好），不是「很有質感」。有本機檔（使用者給的檔、尺、使用者同意下載的影片）就加 `--file`，會切出 `--at` 時刻的影格和色票，製作和審片才看得到它；沒有本機檔的卡只有文字。`refs.mjs cards [--facet transition]` 列出全部的卡和 id。
  **材質面向（光暈、陰影、玻璃、顆粒）要量**：先查 `<tool>/library/finish-recipes.json` 有沒有，再用 `css-effects.mjs`（網頁）、Figma MCP 或 `finish.py`（影片、截圖）量出數字，「借什麼」寫做法表的 id 加 1080p 的數字（[references/look-extraction.md](references/look-extraction.md)）。
- 參考指向風格庫沒有的方向時，提議新增配方（`status: radar`）；指向既有配方的補強時，提議要改的那一句。兩者都等使用者同意才改。

**選尺、拆成工藝表 ⏸**（使用者 2026-10-23：先選參考，再產風格）
參考不是靈感板，是量品質的尺。只借表面風格、不拿成片回頭比，做出來會退回 Claude 的預設，看起來廉價又呆板。
1. 把候選參考（使用者給的優先，加上新找的）列給使用者，請他挑 **2–3 件當「尺」**；可以分項選：強調與字、轉場與鏡頭、光與材質、聲音。
2. 用 **/watch** 逐件看（影片看轉場前後與重點時刻的連續格，不只看幾張靜圖），寫成 `direction/ruler.md`：每一項都要有數字——
   - **強調**：哪幾個時刻被強調、用什麼手法（字級對比、顏色、停留秒數、鏡頭推近、音效），其餘怎麼讓位；
   - **轉場**：每一種手法、長度、緩動曲線、模糊量、靠什麼帶過去（物件、點擊、配對剪接、遮罩）；
   - **鏡頭**：推、拉、平移、3D 視角、景深、速度；
   - **字**：字級佔畫面的比例、字重、進場方式、停留時間；
   - **節奏**：鏡頭長度分布、靜止最長多久；
   - **光與材質**、**聲音**（重拍、音效落點、音樂起伏）。
3. 尺用 `refs.mjs add … --note 用途=尺:<項目>` 記錄，並用 `refs.mjs card <id> --file ~/.video-studio/rulers/<id>.mp4 --take …` 標成卡（ruler.md 的每一項就是一個「借什麼」）。ruler.md 給使用者看過再往下。
4. 同時寫 `direction/rulers.json`：每把尺一份本機影片（下載到 `~/.video-studio/rulers/<id>.mp4`，不進 repo、不進成片）與要拿來對照的 `moments`（主角拍、元件特寫、轉場，每把 3–6 個時刻）。審片關卡每一版都拿它並排，沒有就過不了關（video-draft-review 第 4 步）。

### 3.5 鎖腳本：灰階分鏡板 ⏸
風格之前先鎖腳本。使用者 2026-10-23：「我不確定現在是腳本問題還是風格問題」；原因是腳本沒鎖就一直換風格，每一版又同時改了腳本、字句、節奏和風格。
1. 做一頁灰階分鏡板，只放：
   - 每一拍的真實畫面（或「情境示意」的灰框）；
   - 畫面上的字；
   - 動詞與變形；
   - 秒數；
   - 主角拍標記。
   不上色、不用風格。
2. 給使用者判斷：講什麼、怎麼證明、順序、長度。核可後腳本鎖定，之後的風格輪次不再動腳本。
3. 之後每一輪只改一個變數（腳本、字句、節奏、風格、材質擇一），回報時寫出改了哪一個。

### 4. 從參考長出三個方向 ⏸
**配方是詞彙，不是來源。** 方向要從第 3 步選定的尺長出來（每個方向寫明用到 `ruler.md` 的哪幾條），再用 `<tool>/styles/recipes/*.md` 與個人層配方的詞彙描述、實作；只從既有配方挑選或重組的方向不算數。理由是使用者的原話：「最怕的是你的想法固化……我希望你驚艷我，也不要停止吸收新做法。」

#### 挑方向
光與材質（深色畫面、半寫實、玻璃、借尺不搬外觀）先讀 [references/looks.md](references/looks.md)；使用者要驚艷時，方向從他給過的參考與核可元件出發，五層逐拍對尺（[references/finish-layers.md](references/finish-layers.md)），不另外發明外觀。每個方向先寫它的 **seed**：從 `refs.mjs match videos/<slug>` 排在前面的卡挑 1–3 張，寫明卡 id、它在哪幾個軸上符合這支片、這個方向借它什麼——沒有 seed 的方向是憑空發明的，不提出來。**方向的形式跟著 seed**：seed 卡的 `form` 軸（一鏡到底、蒙太奇、連續主幹加快切；沒標就先補標）就是這個方向的形式，三個方向的形式可以不同，使用者挑方向時一起定。依用途與 message 篩、依品味排序，挑 **3 個方向**：三個在動態語言或材質上不同（不只換色、換字），至少一個使用者沒看過的，至少一個純 2D 動態設計，最多一個實驗方向。風格不設限，依這支片的內容與觀眾決定（手作、科技感、編輯版面都可以）；科技感方向要以使用者提供的頂尖參考為標準（`refs.mjs list --by user`），做不到那個完成度就不要放進來。每個方向寫一句「為什麼適合」，並**寫出它建立在哪件新參考上**（至少一件是第 3 步新找的，不能只有收藏或配方）、從那件借了什麼。好方向不在配方裡時，先補一份配方（`status: radar`）。

#### 關鍵影格
1. 寫 `videos/<slug>/direction/content.json`（格式見 references）：從確認的腳本取真實文案，加上產品正式名稱、核心訊息、可選的 QR、`must`（這支片一定要有的東西）。
2. 有範例程式的風格直接用；沒有的，依參考與配方寫 `direction/<id>/style/style.{js,css}`。**風格只負責構圖與動態**：品牌資訊從 `BRAND`、文字從 `CONTENT`、Logo 用 `H.logo`（進場後不動），不寫死任何品牌、產品名或文案。
3. 產生：`node <tool>/scripts/preview.mjs videos/<slug> <id1>,<id2>,…`
4. **規則衝突（結束代碼 3）**：配方的禁用項與品牌硬性規範或本片必備內容衝突時，該風格不會產生。**停下來把衝突原文回報給使用者**，給選項（換風格、調整配方、改本片必備內容），不可以自行忽略任何一方；品牌規範優先於配方。
5. **每個方向一張真渲染的關鍵影格**：本片的主角時刻（第 3 步概念關寫的那一刻），用最終解析度、字型、顏色，不是佔位，**照這個方向的版面規矩排**（frame-spec.md §1.5：Logo 的角落、字卡列、主畫面、安全區）；可以把 preview.mjs 的其中一張改成這一刻，或在 `direction/<id>/` 另做一頁截圖。旁邊附一張小卡：色票 hex 與強調色的意義、字族與字級、三種緩動性格、節奏（[references/frame-spec.md](references/frame-spec.md) §1）。選方向看的是關鍵影格，preview.mjs 的四張畫面是附帶的。
6. **先自己看**每個 `stills/contact-sheet.jpg` 與關鍵影格：重疊、斷字、對比、Logo 被裁、溢出、字在 title-safe 外，再對 frame-spec.md §2 的禁用清單——修好再給人看；改不掉的（使用者的品味檔就喜歡）寫在方向旁邊問使用者。

#### 使用者選擇 ⏸
`node <tool>/scripts/gallery.mjs --video videos/<slug>`（背景執行，http://localhost:4320，「本片候選」分頁），或直接在對話回覆。選擇與否決原因各記一行到 `<個人層>/taste-log.jsonl`。`selection.json` 的 `picked` 主要是 `ref:<網址>`（使用者在「範例」挑的作品）：讀該筆參考的 `site_tags`、`prompt`、`direction`，有配方就用（`direction`），沒有就照範例寫 `direction/<id>/style/`，並把新配方存進個人層。也可能有 `style:<id>`（直接挑配方）或 `palette:<id>`（色票，輔助色與氣氛；品牌色永遠優先）。

#### 動態從最難的鏡頭開始
選定方向後，不再為前幾名各出動態預覽；動態從第 5 步節奏單寫完後的「最難的鏡頭」開始。使用者想先看選定方向動起來的樣子時，依選擇修改 `direction/<id>/style/`，出 10 秒：`node <tool>/scripts/preview.mjs videos/<slug> <id> --motion --no-stills`，給人看之前照樣過 video-draft-review 的試片量測（`node <tool>/scripts/review-pack.mjs videos/<slug>/direction/<id> videos/<slug>/direction/<id>/preview.mp4 --test`，再 `--check`），或標「未審片預覽」送（見上面「製作順序」）。

### 5. 節奏單、分鏡、最難的鏡頭 ⏸
先寫節奏單 `direction/treatment.md`（huashu-motion 的 treatment）：每小節一列（事件數、能量等級）、能量曲線（[script-craft.md](references/script-craft.md) §7.5，標出 hook、最密、最大高峰）、四張關鍵靜幀（hook、主角、最密、結尾）、連續性鏈（什麼東西從哪一拍帶到哪一拍、招牌轉場在哪三處）。沒寫完不排分鏡、不開工。

再用定版的風格把腳本排成分鏡，寫 `videos/<slug>/STORYBOARD.md`（格式見 `<tool>/.claude/skills/hyperframes/references/storyboard-format.md`）：每一景一節，寫秒數、畫面、畫面上的字、用到的參考（`refs`），關鍵畫面附一張靜態示意。
- **接縫表**每支片都寫（[references/transitions.md](references/transitions.md)）：每個接縫寫「上一景最後停在什麼 → 怎麼交棒 → 下一景從什麼開始」。說不出怎麼交棒的接縫，就是還沒想好的地方。選了一鏡到底時，再列全片不變的東西（主角記號、空間、線寬、動態語言），做法見 transitions.md「選了一鏡到底時的故事設計」。
- **對拍的片子**：段落從小節線開始、秒數由小節決定，所以配樂方向與 BPM 要在這一步一起確認；曲子本身在製作後的配樂步驟才做。
- **讀點、伏筆、接縫寫進 `direction/script.json`**（格式與規則在 video-motion-craft 的 [reads-and-beat.md](../video-motion-craft/references/reads-and-beat.md) §1–5、§10；這份讀點表之後也是審片關卡量成片的規格）：每一拍的 `reads`（觀眾依序要看懂什麼、各給多久、眼睛怎麼過去）、全片的 `setups`（埋了在哪收）與 `seams`（含開場與結尾）。跑 script-lint，FAIL 要先修：讀點塞不進就加長這一拍或刪讀點，不要壓縮。
- **把參考綁進計畫**：`script.json` 每一拍、每個接縫用 `"refs": ["<卡 id>"]` 寫它照哪張卡做；主角拍與 `major`／`bar` 接縫一定要有（script-lint 的 `no-ref`，審片關卡也擋），其他的盡量有。然後 `node <tool>/scripts/refs.mjs board videos/<slug>` 產生 `direction/refboard/`：每一拍、每個接縫的參考影格與「借什麼／別抄」，製作時一拍一拍照著看。找不到合適參考的主角時刻，回到第 3 步再找（`refs.mjs hunt`），不要沒有參考就開工。
- **參考不足就停下來** ⏸：找過一輪還是缺的主角拍或主要接縫，把 `direction/ref-hunt.md` 的「參考不足」那節（缺什麼、找過哪些來源、為什麼都不合）給使用者，請他二選一：**改需求**（換成找得到參考的演法，通常也是程式做得好的演法），或**首創**（在 script.json 那一拍或接縫寫 `"experimental": "使用者的原話"`；量測照跑，但不算主線的品質承諾，回報與審片包都標成實驗）。全權交辦時一樣要問這一題：這是品質承諾的範圍，不是製作細節。
- **每一景標 `made_by`**（code／asset／outsource，[references/capabilities.md](references/capabilities.md)）：asset 與 outsource 的景列出缺什麼、誰提供；缺了就改寫這一景，不硬用程式補。
- **最難的鏡頭** ⏸：節奏單與分鏡核可後，先做全片最難的那一鏡（通常是主角時刻或最強的接縫），用最終解析度、字型、顏色做到位。用 campaign 同時做 2–3 種**做法不同**的版本（不只換參數），各自過試片量測，並排給使用者挑：
  ```bash
  node <tool>/scripts/campaign.mjs new videos/<專案> <名稱> --kind <seam|text|camera|…> --question "這一刻用哪一種？" --variant "a=做法@<卡id>" --variant "b=做法@<卡id>" [--from <片>]
  node <tool>/scripts/campaign.mjs render videos/<專案>/campaigns/<名稱>    # 各自 render 60 fps 並跑試片量測
  node <tool>/scripts/campaign.mjs compare videos/<專案>/campaigns/<名稱>   # previews/campaign-<名稱>/：同時播放的並排影片、每版 8 格、COMPARE.md
  node <tool>/scripts/campaign.mjs pick videos/<專案>/campaigns/<名稱> <版本> --why "好在哪" --quote "原話"   # 贏的與輸的都記成範例
  ```
  贏的那一版和尺並排比（[references/finish-layers.md](references/finish-layers.md) §3），過了才往下。全權交辦時照尺自己挑，理由寫進 `direction/decisions.md`，比較影片照樣附上。

### 6. 文字效果（Claude 自己定，結果附在第一版草稿的回報）
先刪字：大字只在畫面說不出來時才出現，不是每一拍都要有標題；長句拆成 1–4 字的片段（[script-craft.md](references/script-craft.md) §6）。再列出留下來的每個標題與大字，逐一決定效果：先看那一拍綁的參考卡有沒有「借字」（`take.type`），有就照它；沒有才從 text-effects.json 挑。寫進 `STORYBOARD.md` 該景的 `text_effect`，表（標題 → 效果 → 照哪張卡或為什麼）附在第一版草稿的回報裡，不另外停下來問；使用者看了草稿要換再換。
- 一般進場效果用 `<tool>/library/text-effects.json` 的固定名稱（圖庫「文字效果」分頁有示意）。
- 要「演出字義」的標題（落地、關門、量表填滿這類）交給 **semantic-type**：在 `videos/<專案>/tests/_semantic-<slug>` 測試底座做，只出 4 秒片段，核可後才搬進正片。片段給使用者看之前，照樣過 **video-draft-review** 的試片量測。

### 7. 轉場與交棒（手法 Claude 自己定；代表性接縫的 campaign ⏸）
每個接縫的手法先照它綁的參考卡的「借交棒」（`take.transition`），沒有綁卡的才照 [references/transitions.md](references/transitions.md) 指定一種手法並寫出理由，**開場和結尾也是接縫**（不從硬的畫面開始、不直接停），大變化落在小節線、其他接縫盡量在拍上；全片 6–8 種手法、每種最多兩次，另一個從品牌標誌長出來的招牌轉場用在開場、中段、結尾（Cinetic），下一個狀態從上一個的材質長出來；主角拍的接縫用最強的手法。這一步只**選**手法；長度、緩動、速度對比與節拍怎麼做到，照 **video-motion-craft**（[transition-ruler.md](../video-motion-craft/references/transition-ruler.md)、`library/motion/ruler-ease.js`）；這支片另有尺時，用 /watch 量那支尺補進 ruler.md。
每支片都要過這一關，不只科技風。轉場從 `ruler.md` 的轉場清單挑；每個接縫寫明**靠什麼帶過去**（物件延續、點擊穿過、配對剪接、遮罩，或打在拍上的硬切、甩鏡、條狀掃過、色塊淹沒；溶接不當交棒；不用 glitch、漏光、閃白、漩渦這類現成特效），整支不要同一招。先挑一個最有代表性的接縫，用 campaign 出 **2–3 種**做法給使用者挑（`campaign.mjs`，同第 5 步；每個版本先過試片量測，compare 只放量測通過的）；選定後才套到所有接縫，寫進 `STORYBOARD.md` 各景的 `transition_in`。選了一鏡到底的片子，測的是接縫表裡的交棒。

### 8. 定版與交接
1. 寫 `frame.md`（檔案格式見 `<tool>/.claude/skills/hyperframes/references/look.md`「The project's design spec」；內容照 [references/frame-spec.md](references/frame-spec.md)）：外觀全部寫成數字——hex 色票與唯一強調色的意義、字族字重字級、約 3 種命名的緩動、格數——加禁用清單（模型的預設長相＋配方與本片的禁用項）；品牌色是那個強調色（衝突時品牌色優先），品牌套件規定的字型照規定，其餘字體從尺選；鎖定的概念、使用者的調整。
2. 寫 `BRIEF.md`（[references/handoff.md](references/handoff.md) §1）：使用者確認過的事實——`message`、`audience`、`destination`、`aspect`、`fps`、`length`、`language: zh-TW`、`brand: <kit>`、`narration`，核可的禁用詞例外寫 `allow_terms`；body 列素材、調整需求、不能出現的內容、定版風格與 `direction/<id>/style/` 路徑、腳本與分鏡的位置、`direction/ruler.md`。
3. 寫 `SPEC.md`（handoff.md §2）：照上游 `spec.md` 的九行範本，把 BRIEF、frame.md、STORYBOARD.md 的數字抄成摘要，開頭固定三行（故事線與分鏡已核可、用 /video-motion-craft 與 /video-draft-review、和尺並排比）。上游 `/hyperframes` 不再讀 BRIEF.md，超過 15 秒的新片會先寫三條故事線再寫 SPEC.md；有這份 SPEC.md，製作的 session 才會照已核可的分鏡做，也才叫得到這兩個 skill。
4. 把定版方向與用到的參考改成 `used: yes`。
5. 告訴使用者：接著用 `/hyperframes` 依 `SPEC.md` 與 `STORYBOARD.md` 製作（每拍先渲一格、再整支；動態照 **/video-motion-craft**，時間與緩動集中在一個參數檔）→ 每一版先過 **/video-draft-review** → 草稿回饋（通常 2–3 輪）⏸ → 配樂與音效 ⏸ → **video-brand-qa** → 核可與交件 ⏸（見 `docs/PLAYBOOK.md`）。

## 給使用者看之前
- 每一版草稿、預覽片段、轉場與語意文字試片都要過 **/video-draft-review**：`review-pack.mjs` 量成片、`--check` 寫出綁定這一版 render 的 `PASS.json` 才可以送。例外是還在挑的候選（條件在那個 skill 的「候選與預覽」）。這一步的規則只寫在那個 skill，這裡不重述。
- 修改動態時用 **/video-motion-craft**：使用者的「太快」「停太久」「節奏不對」先在審片包的 `timing.txt` 上找到量得到的原因，再改。
- **出片媒介**：預設用 HyperFrames 做 2D 動態設計（配對剪接、變形、動態字、速度變化、遮罩、穿越）。即時的 three.js 材質（MeshPhysicalMaterial、CanvasTexture 紙、粒子、看板貼圖）不當寫實 3D 的主角（使用者：「請你認知一點 hyperframe three.js 做3D 的效果真的不好」）。寫實 3D 只用在主角靜幀或幾秒的插入鏡頭，用 Blender 算；開算前先跟使用者說每格幾秒、總共多久（使用者：「全用 Blender 會生很久喔！…Graphic and Motion 各種轉場、效果做到最好？」「雖然我覺得 Blender 很好 但真的太久了」）。C 片核可的「Blender 烘焙＋瀏覽器出片」是另一條有限的路，見 [references/3d-bake.md](references/3d-bake.md)。

## 原則
- 參考影片只分析風格，不進成片；不替使用者登入。生成的影像與影片（點數、商用條款、能用在哪）照 [references/assets.md](references/assets.md) 的「原則」。
- 預覽只放在 `videos/<slug>/direction/`；量測、尺、研究筆記放 `videos/<專案>/research/`，不要只留在對話的暫存資料夾；`styles/` 只放配方與範例程式。
- 方向出三個；使用者已指定風格時，三個方向改成同一風格的三種構圖（huashu-art-motion：指定了風格也不豁免）。
- **質感不是換字型**：要有主角時刻的層級（5–6 個重點各有強調手法，其餘讓位）與有理由的轉場；整支同一種進場、同一招轉場就是廉價。質感是元件、字體、顏色、動態效果、過場組成五層一起的感覺，見 [references/finish-layers.md](references/finish-layers.md)。
