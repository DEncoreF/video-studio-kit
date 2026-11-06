# 行銷影片製作手冊（從需求到上架）

這份手冊整理一支片從訪談到交件的完整做法，可以重複使用。內容來自一支 70 秒的產品片（2026-10-19 定版）的實際流程與三輪回饋；2026-10-22 調整了前期順序：先找參考、定腳本，候選風格從新參考長出來，並加上分鏡、文字效果、轉場三道關；2026-10-29 照外部案例研究改成「三個方向的真渲染關鍵影格 → 節奏單 → 最難的鏡頭 → 每拍一格 → 整支」，一鏡到底改成方法之一。每一步的細節寫在對應的 skill 與文件裡，這裡只講順序、關卡和容易出錯的地方。

⏸ 表示這一步要等使用者決定；沒有使用者明確同意，不往下做。每一關都要走，真的用不到某一步時，明白說出跳過哪一步、為什麼，不默默略過。使用者說「全部交給你決定 不要問我任何問題唷」時，關卡照走，⏸ 改成自己依尺決定並寫進 `direction/decisions.md`，只拿完成的成果請使用者說行或不行；下載、花點數的生成、品牌規範衝突、刪檔仍要先問（video-direction「流程」開頭）。

## 個人層與路徑

工具和資料分開放，換人用或工具更新都不會互相影響：

| 放什麼 | 預設位置 | 改位置 |
|---|---|---|
| 工具：scripts、pipelines、內建風格、skills | 這個 repo | — |
| 個人層：品味檔、選擇紀錄、參考紀錄、inbox、個人素材庫、個人風格 | `~/.video-studio/`（自己的 git repo） | `VSO_PROFILE` |
| 工作資料夾：`videos/` | 有 `videos/` 的目前資料夾，否則是工具 repo | 個人層 `config.json` 的 `workspace`，或 `VSO_WORKSPACE` |
| 品牌套件 | 工作資料夾或工具 repo 裡的 `brand-kits/` | `config.json` 的 `brand_kits`，或 `VSO_BRAND_KITS` |

```bash
node scripts/profile.mjs                  # 列出實際路徑與個人層內容
node scripts/profile.mjs init --name <名字>  # 建立個人層（已有的品味檔不會被覆蓋）
```

本手冊的指令寫成在工具根目錄執行（`node scripts/…`）。平常在放影片的工作資料夾（例如 marketing-video-studio）開 session，這時寫成 `node <tool>/scripts/…`，`<tool>` 是這個 repo 的路徑；skills 裡已經這樣寫。skills 只在這個 repo：在工作資料夾開 session 時把這個 repo 加進來（`--add-dir`／`/add-dir`／桌面版「加資料夾」）才會載入。

個人風格放在 `~/.video-studio/styles/recipes/<id>.md`，同名時優先於內建；要在圖庫顯示，另在 `~/.video-studio/styles/catalog.json` 加一筆。

## 總覽

| # | 階段 | 產出 | 工具 |
|---|---|---|---|
| 1 | 訪談 ⏸ | 需求摘要（有沒有腳本）與這支片要的樣子（`direction/axes.json`）；形式不在這裡問，跟著方向的 seed 參考 | `video-direction` |
| 2 | 建專案、盤點素材 | `videos/<專案>/PROJECT.md`、`films/<片>/`、`needs.json`、`ASSETS.md` | `video-direction`（references/assets.md）、`scripts/assets.mjs` |
| 3 | 參考與腳本 ⏸ | `references.md`、`direction/script.md` | `scripts/refs.mjs`、`video-direction` |
| 4 | 三個方向 ⏸ | 每個方向一張真渲染的關鍵影格＋色票／字／緩動小卡、`selection.json` | `scripts/preview.mjs`、`gallery.mjs` |
| 5 | 節奏單、分鏡、最難的鏡頭 ⏸ | `direction/treatment.md`、`STORYBOARD.md`（含接縫表）、最難的那一鏡的試片 | `video-direction` |
| 6 | 文字效果 ⏸ | 標題 → 效果表、語意文字 4 秒片段 | `video-direction`、`semantic-type` |
| 7 | 轉場與交棒 ⏸ | 一個接縫的 2–3 種測試片段 | `video-direction` |
| 8 | 定版文件 | `BRIEF.md`、`frame.md`（外觀寫成數字＋禁用清單）、`SPEC.md`（給 /hyperframes 的規格） | `video-direction` |
| 9 | 正式製作（每拍一格 → 整支） | `index.html`、`scenes.js`、參數檔、`kit/` | `/hyperframes`、`video-motion-craft`、`npm run hf -- …` |
| 10 | 審片關卡 → 草稿回饋 ⏸（通常 2–3 輪） | 草稿 mp4、`review-draft-N/PASS.json` | `video-draft-review`、`scripts/review-pack.mjs` |
| 11 | 配樂與音效 ⏸ | `assets/audio/*.wav` | `pipelines/music/` |
| 12 | 品牌 QA | `QA.md`、`qa-review.json` | `video-brand-qa`、`scripts/brand-qa.mjs` |
| 13 | 核可與交件 ⏸ | 1080p 正式檔、`approval.json` | `npm run hf -- render` |

看過或用到的參考，不管在哪一步，都用 `node scripts/refs.mjs add` 記錄（使用者給的加 `--by user`）。

每完成一個工作單位就 commit，訊息寫「做了什麼＋為什麼」。

## 1. 訪談 ⏸

一次問完，讓使用者一次回答。那支產品片用的題目如下，可以照用：

- 這支片要做什麼：一句話訊息，看完要做的動作（例如上官網、預約 Demo）。
- 給誰看、在哪播：決定比例與要不要旁白。上 YouTube 用 16:9；展場循環播放預設不做旁白。
- 內容重點：功能、情境、產品順序。
- 長度：先講目標秒數，草稿後通常會再縮短。
- 形式：連續（0–2 刀，一鏡到底）、蒙太奇，或混合（一條連續主幹，中段一兩次快切爆發）。一鏡到底是一種方法，不是預設（使用者 2026-10-29：「一鏡到底，是個方法，但不應該是限制」）。形式從方向的 seed 參考來（參考卡的 `form` 軸），使用者挑方向時一起定，不在訪談問（使用者：「形式感覺跟參考有關」）。接縫表每支片都寫。
- 腳本：已經有腳本或分鏡稿了嗎？決定第 3 步走哪條路。
- 素材：已有哪些素材、哪些要從官網或網路找。
- 結尾：要不要 QR code、官網連結、公司 Logo。

產品正式名稱一律以 `brand-kits/<kit>/brand.json` 的 `products`（含別名）為準。回一段摘要給使用者確認，確認後才往下。

## 2. 建專案、盤點素材

```bash
node scripts/assets.mjs init videos/<片> --brand <kit>
node scripts/assets.mjs add videos/<片>/assets-library <檔案> --type … --license … --source …
node scripts/assets.mjs check videos/<片>/assets-library videos/<片>/needs.json --out videos/<片>/ASSETS.md
```

- 每個進成片的檔案都要在素材庫登記來源與授權（D7）；QA 找不到紀錄就判 FAIL。
- 沒有真實畫面的產品，做「情境示意」：用模擬介面加道具，畫面蓋「情境示意」章，畫面上的數字都是示意。
- 示範影片要先確認是不是真的產品畫面。那支產品片裡有一支示範片不是真實介面，所以改用情境示意。

## 3. 參考與腳本 ⏸

先找參考，再談風格。完整步驟見 [video-direction-flow.md](video-direction-flow.md)。依有沒有腳本走兩條路：

- **沒有腳本**：先上網廣泛找參考，看它們怎麼講故事；從參考提 2–3 條主線（每條一句話的故事線＋出自哪件參考）；使用者挑主線後寫腳本 ⏸。
- **有腳本**：先確認腳本 ⏸（不自行改寫，該改的地方提出來）；再每一景、每個接縫各找參考：這一景要演什麼、這個接縫怎麼交棒。

找參考的範圍：任何網站都可以。個人層的 `reference-sites.md` 是分類好的起點；常用的有 Prompt Motion、Skillry、Behance、Vimeo、Dribbble、Motionographer／STASH、動態設計工作室官網、Eyecandy（鏡頭與轉場手法庫）。Pinterest、Instagram 要登入才看得到，只在使用者已經登入時看，不替使用者登入；沒看就說沒看。每一輪至少 3 件既不在使用者收藏、也不在 `styles/recipes` 與個人層配方裡的作品。全部記到該片的 `references.md` 和個人層的 `references-log.jsonl`（D10）。

### 使用者提供參考

任何時候都可以給參考，不限於這一步：

- **網址**：直接貼在對話裡（YouTube、Vimeo、Behance、Pinterest、官網都可以）。
- **檔案**：截圖、影片、PDF 丟進 `~/.video-studio/inbox/`，然後說「看 inbox」。檔案不進 git，也不放進成片（D7）。
- 說一句想借用什麼更好，例如「喜歡它的轉場」「顏色太暗不要」。

Claude 收到後會：

1. 影片用 `/watch` 看過（方法見下方「看影片參考的方法」；只看標題或縮圖不算看過），說出可借用的點和不借用的點；和品牌規範衝突的地方，會說出來讓你決定。
2. 記錄：`node scripts/refs.mjs add <片> (--url U | --file ~/.video-studio/inbox/<檔>) --by user --learn "…"`。不屬於特定影片的參考，用 `-` 代替影片路徑。影片只看其中一段時加 `--at 4.5-6.5`（同一支片的不同片段各記一筆），標註用 `--note 隱喻=…`（依序保留）；原網站的播放器不能內嵌時，用 `--video`（例如 YouTube 上的同一段）或 `--image`（例如示範 GIF）指定要顯示的媒體。
   在圖庫「範例 → 我的收藏」可以只播那一段、看標註，按「喜歡／不喜歡」並寫原因；結果存回該筆紀錄，用 `node scripts/refs.mjs verdicts [--tag <標籤>]` 讀出。做 skill 時收集的範例也在這裡標。
3. 依參考的性質，套用到不同層次：

| 參考影響的範圍 | 更新哪裡 | 要不要先問 |
|---|---|---|
| 這支片 | `references.md`、`frame.md`、草稿 | 不用，改完給你看 |
| 風格庫的新方向 | 新增 `styles/recipes/<id>.md`（`status: radar`） | 要 |
| 既有風格的補強 | 修改該配方的「方向」或「注意」 | 要 |
| 長期品味 | 個人層的 `taste.md`、`taste-log.jsonl` | 要（要改的句子先給你看） |

**看影片參考的方法**：用 `watch` plugin（[claude-video](https://github.com/bradautomates/claude-video) v0.3.2，2026-10-20 審過程式碼後安裝，**只用本機模式**：`~/.config/watch/.env` 設 `WATCH_ENGINE=local`、`WATCH_WHISPER_BACKEND=none`，影片不會上傳到 Google 或其他服務）。它用 yt-dlp 下載原解析度影片，依場景變化抽出帶時間碼的影格；再把音軌交給 `pipelines/music/analyze.py` 算出節拍，就能對照「每拍發生什麼」。

```bash
python3 ~/.claude/plugins/cache/claude-video/watch/0.3.2/skills/watch/scripts/watch.py "<網址>" --engine local --resolution 1024 --out-dir <暫存資料夾>
ffmpeg -i <暫存資料夾>/watch-*/download/run-*/video.mp4 -vn -ac 2 -ar 44100 ref.wav && python3 pipelines/music/analyze.py ref.wav
```

下載的參考影片只用來分析，放暫存資料夾，不進 repo、不進成片（D7）。公司未公開的影片也只用本機模式。

下一支片開始前，先跑 `node scripts/refs.mjs list --by user` 和 `node scripts/refs.mjs search <關鍵字>`，看過去收過什麼。

## 4. 三個方向 ⏸

方向從第 3 步的參考長出來；`styles/recipes/` 和個人層配方是描述與實作用的詞彙，不是來源。只從既有配方挑選或重組，想法會固化——使用者的原話：「最怕的是你的想法固化……我希望你驚艷我，也不要停止吸收新做法。」

1. 挑 3 個方向，三個在動態語言或材質上不同（不只換色），每個寫出建立在哪件新參考上、借了什麼；排序依使用者的品味檔 `~/.video-studio/taste.md`（個人層，見上方「個人層與路徑」）。
2. 每個方向出一張**真渲染的關鍵影格**（這支片的主角時刻，最終解析度、字型、顏色）＋一張小卡（色票 hex、字、三種緩動、節奏）；自己看過、修掉重疊與斷字、對過禁用清單（`video-direction` 的 `references/frame-spec.md`），再給使用者。
3. 使用者在圖庫（`node scripts/gallery.mjs --video videos/<片>`）選一個。動態從第 5 步的「最難的鏡頭」開始；中途想先看動起來的樣子，出那個方向的 10 秒，先過 `video-draft-review` 的試片量測，或標「未審片預覽」送（條件在 `video-draft-review/references/gate.md`）。

## 5. 節奏單、分鏡、最難的鏡頭 ⏸

先寫節奏單 `direction/treatment.md`：每小節的事件、能量曲線（3 秒內 hook、最密在片長 30–60%、最大高峰在 75–90%、兩小節沒有新事件就是 bug）、四張關鍵靜幀（hook、主角、最密、結尾）。沒寫完不開工（`video-direction` 的 `references/script-craft.md` §7.5）。

再用定版的風格把腳本排成 `STORYBOARD.md`：每一景的秒數、畫面、畫面上的字、用到的參考，關鍵畫面附靜態示意。

- **接縫表**每支片都寫（上一景最後停在什麼 → 怎麼交棒 → 下一景從什麼開始）。說不出怎麼交棒的接縫，就是還沒想好的地方。選了一鏡到底時，再列全片不變的東西（主角記號、空間、線寬、動態語言）。
- **對拍的片子**：段落從小節線開始，秒數由小節決定，所以配樂方向與 BPM 要在這一步定；曲子本身在第 11 步做。
- **最難的鏡頭**：分鏡核可後，先把全片最難的那一鏡用最終解析度、字型、顏色做到位，和尺並排比（`video-direction` 的 `references/finish-layers.md` §3），過了才往下。

## 6. 文字效果 ⏸

先刪字：大字只在畫面說不出來時才出現，一次一個 1–4 字的片段，每 10 秒至少 1.5 秒無字（`video-direction` 的 `references/script-craft.md` §6）。再列出留下來的每個標題與大字，用一張表確認「標題 → 效果 → 為什麼」。一般效果用 `library/text-effects.json` 的名稱（圖庫「文字效果」分頁有示意）。標題要「演出字義」（語意文字動畫，例如落地、關門、粉筆寫字）時用 `semantic-type` skill：先在 `videos/<專案>/tests/_semantic-<slug>` 測試底座做，跑 `semtype.mjs check`（最後一格等於原版面、不碰鄰近元素、不多加字、音效落在關鍵瞬間），只出 4 秒片段（給人看之前先過 `video-draft-review` 的試片量測），核可後才搬進正片。

## 7. 轉場與交棒 ⏸

每支片都要做，不只科技風。全片 6–8 種手法、每種最多兩次，另一個從品牌標誌長出來的招牌轉場用在開場、中段、結尾；下一個狀態從上一個的材質長出來；不用 glitch、漏光、閃白、漩渦這類現成特效（`video-direction` 的 `references/transitions.md`）。先挑一個最有代表性的接縫，做成幾秒的片段，出 2–3 種做法給使用者挑（`direction/transitions/`，每個片段先過 `video-draft-review` 的試片量測）；選定後才套到所有接縫。手法在這一步選；長度、緩動、速度對比與節拍怎麼做到，照 `video-motion-craft`。選了一鏡到底的片子，測的是接縫表裡的交棒。

## 8. 定版文件

- `BRIEF.md`：訊息、規格、段落秒數表、素材清單、客製項目、注意事項。之後每次改長度或結構都要同步更新這份表。
- `frame.md`：外觀全部寫成數字——hex 色票與唯一強調色的意義（NovaMind 紫是強調色，不是預設的滿版漸層）、字族字重字級（從尺選，不預設 EB Garamond）、約 3 種命名的緩動（cubic-bezier 或彈簧阻尼比）、格數——加禁用清單（角落 HUD、眉標、左字右卡、空底小卡、光暈粒子、大片藍紫漸層、到處淡入淡出、軟緩動 0.6–0.8 秒、長的靜止結尾卡、現成轉場特效）。寫法見 `video-direction` 的 `references/frame-spec.md`。QA 用它檢查色彩。
- `STORYBOARD.md` 已在第 5–7 步寫好（分鏡、文字效果、轉場），`/hyperframes` 依它製作。
- `SPEC.md`：給 `/hyperframes` 的導演規格（上游 `spec.md` 的九行），數字從上面三份抄成摘要；開頭寫明故事線與分鏡已核可、製作用 `video-motion-craft`、送審前過 `video-draft-review`。上游不再讀 BRIEF.md，沒有 SPEC.md 的新片會被當成還沒定故事、先寫三條故事線。寫法見 `video-direction` 的 `references/handoff.md`。

## 9. 正式製作

製作與修改動態（讀點與停留、變形、轉場、鏡頭、節拍、流暢度）時用 `video-motion-craft`：它的 SKILL.md 開頭是每一版都要對的數字，`SPEC.md` 開頭也寫了這一句。

- **時間集中在一個參數檔**（例如 `assets/js/params.js`）：停留、緩動、蓄力、拍點都用名字讀，回饋就能寫成「蓋章前多 4 格蓄力」「簽名停 1.2 → 2.0 秒，後面順延」（`video-motion-craft` 第 3 步）。
- **每拍先渲一格**：全片 render 之前，每一拍至少一格排成一張先看，修掉擠的、難讀的、不在格上的，才跑整支（`video-motion-craft` 第 2 步）。

結構（沿用 `videos/<專案>/films/<片>` 即可）：

- `index.html`：每個段落一個 `<section class="clip scene" data-start data-duration>`。時間只寫在這裡，`scenes.js` 用 `T(id)` 讀取，改秒數只要動 HTML。
- `scenes.js`：一條暫停的 GSAP 主時間軸，最後在 HTML 內以 inline script 註冊 `window.__timelines["<id>"]`。用外部檔註冊，lint 會誤報缺少時間軸。
- 共用動作做成函式（`lay`、`slap`、`clear`、`count`、`wobble`），每種產品畫面套同一個樣板（`appliance()`），版面規則寫在樣板的註解裡。
- 有時間的 `<video>` 不能放在有時間的 section 裡，要放在沒有時間的外層容器（`.frame-wrap`）。
- 編輯檔案前先停掉 Studio 預覽（`npm run hf -- preview --stop`）。預覽會在檔案裡寫入 `data-hf-id`，造成寫入衝突。
- 第 6 步核可的語意文字片段，從測試底座搬進正片；第 7 步選定的交棒做法套到所有接縫。

每次修改後：

```bash
npm run hf -- check videos/<片>
npm run hf -- snapshot videos/<片> --at 12,41.5    # 看修改過的畫面
```

## 10. 草稿回饋 ⏸

```bash
npm run hf -- render videos/<片> --quality draft --output videos/<片>/renders/draft-N.mp4
node scripts/review-pack.mjs videos/<片> videos/<片>/renders/draft-N.mp4 --out videos/<片>/review-draft-N   # 一版一包：審片包、量測、時間圖、清單
node scripts/review-pack.mjs --check videos/<片>/review-draft-N                                           # 0 才寫出綁定這一版的 PASS.json
```

**每一版都先過 `video-draft-review`**，過了才用 SendUserFile 傳給使用者，回報時貼 `--check` 印出的 PASS 那一行。頓點（主體停 ≥ 3 格）、凍住的結尾、開場結尾與大變化離小節線超過 0.1 秒、讀點不夠、停太久、硬開硬停是量出來的，直接不通過，只有使用者能豁免；一般接縫離拍只提醒。中途看方向的片段可以標「未審片預覽」先送；確切的規則以 `video-draft-review/references/gate.md` 為準。清單的每個答案要引用審片包裡的影格。審片包不會覆寫還有效的 PASS 或填過的清單，所以每一版用自己的 `--out`。試片（`tests/_*`）只跑量測。叫到這兩個 skill 之後，hook 會擋下沒有 PASS 的草稿（不改任何 settings，見 `video-draft-review/references/gate.md`）。

那支產品片三輪回饋的問題都很典型，送草稿前也照這幾項看：

| 問題 | 做法 |
|---|---|
| 節奏太慢 | 每個產品約 7 秒、章節卡 1.5 秒；90 秒草稿最後縮到 70 秒 |
| 畫面「停住」的感覺 | 停留時構圖不漂移、不晃；要撐住的停留，讓有意義的事繼續長：依序打勾、逐句回覆、長條成長、數字跑動。不為了怕靜加無目的的小動作（video-motion-craft 第 4 步） |
| 疊圖蓋住文字 | 新元素進場前先清掉舊的；章與標籤留固定位置；帳單之類的卡片放在空白區 |
| 斷行留孤字 | 用 `lines()`（Intl.Segmenter）依詞斷行 |
| 圖表語意錯 | 百分比是相對什麼要畫清楚。例如「用量上限」是 100% 時，畫配額軌道，上限線在軌道終點，數字排在線外 |
| 假畫面 | 不是真實產品介面就不要用，改做情境示意 |
| 太生硬（科技風） | 介面元件用彈簧動態，不用 steps；拍與拍的交棒要快而果斷、打在拍上，硬切、甩鏡、條狀掃過都可以，只有溶接不行（video-motion-craft 第 4 步）；介面讓游標真的去點、拖、開關，不要只是「展示」 |
| 七個產品同一個版型 | 每個產品各自一種構圖（左右互換、上方標題帶、全寬對話、大數字量表、左右對比、紙本卡），不要只換內容 |
| 放大鏡頭沒有目的 | 推鏡要對準結果；為了避開標題而偏離結果的推鏡，乾脆不要 |
| 英文副標太快消失 | 至少停約 1.8 秒 |

## 11. 配樂與音效 ⏸

先給使用者看方向，再做。對拍的片子，方向與 BPM 已在第 5 步定好，這裡依它找曲或作曲。有三條路：

| 方式 | 何時用 | 指令 |
|---|---|---|
| 程式作曲（流行、對拍） | 預設（D5），不用授權 | `python3 pipelines/music/compose.py <cues.json> <out.wav>` |
| 程式作曲（lo-fi、手作感） | 想要溫暖、慢一點；不用鋼琴音色 | `python3 pipelines/music/lofi.py <cues.json> <out.wav>` |
| 現成曲庫（Pixabay） | 使用者想要真人製作的曲子 | 下面五步 |

用現成曲子的做法：

1. **找曲、給選項**：給 5–6 首可試聽的連結，分 2–3 個方向，記到 `references.md`。
2. **確認授權** ⏸：打開曲目頁，看授權和有沒有標示「Content ID Registered」。有標示的曲子上 YouTube 很可能被自動聲明版權，要先讓使用者知道再下載。下載要使用者對「下載這首」明確說好（挑了曲子不等於同意下載，見 video-direction `references/assets.md` 的「原則」）；Pixabay 擋 curl，用內建瀏覽器從頁面取得 mp3 連結。
3. **分析曲子**：
   ```bash
   FF=$(node -e 'console.log(require("ffmpeg-static"))')
   $FF -i track.mp3 -ac 2 -ar 44100 track.wav
   python3 pipelines/music/analyze.py track.wav    # BPM、第一個重拍、段落變化的小節
   ```
4. **剪接**：寫一份 spec（範例 studio 的 `videos/<專案>/films/<片>/bgm.json`），把曲子的段落對到畫面：
   - 曲子起來的地方對第一張章節卡；安靜段放在中段；全曲高潮對收束；曲子自己的結尾放在結尾卡。
   - 每個切點都要切在小節線上（`第一個重拍 + k × 小節長`）。在同一段裡往前或往後跳整數小節，聽不出接縫。
   - 音效寫在同一份 spec 的 `sfx`：紙片進場用 slide，蓋章用 stamp，打勾用 tick，換頁或離場用 whoosh，聊天回覆用 pop。時間從畫面的時間軸匯出（`scripts/timeline-events.mjs`），不手打；外部量到手打的同步點差 8–11 格（Cinetic，`video-motion-craft` 的 `references/sound.md` §5）。
   - 科技風用 tech kit：落字與完成用 impact、進場前的張力用 riser（結束在 cue 上）、介面回應用 blip（方波顆粒的「資料短訊」）、游標點擊用 click、點擊後的確認用 confirm、切換用 glitch 或 swish、量表一格一聲用 segtick（帶 `f` 讓音高往上爬）。使用者覺得「往上滑的正弦嗶聲」太可愛。
   - cue 多的片子用一支 `make_score.py` 產生 spec（範例 `videos/<專案>/films/<片>/make_score.py`）：段落起點用小節數寫，cue 用「段落起點 + 拍數」，和 `scenes.js` 的 `at(k)` 一一對應。新片的 cue 改從 `timeline-events.mjs` 的匯出讀，不在兩邊各寫一次。
   ```bash
   python3 pipelines/music/edit.py <spec.json> track.wav videos/<片>/assets/audio/score-<名>.wav
   ```
   音效的音量量的是「峰值高出當下的音樂底多少」，不是比音樂小；上面的合成音色只當草稿的佔位，材質聲與點擊用真實的 CC0 錄音（`sample` cue）。各層的 dB、點擊、同步與量法只寫在 `video-motion-craft` 的 `references/sound.md`。使用者要「背景音樂不要太大」時：`music_gain` 約 0.4，讓音效撐節奏（科技風那支片 整體約 −17 LUFS）。
   - 試聽：把候選曲目頁開在內建瀏覽器的分頁裡給使用者聽（一首一個分頁），我們自己聽不到。Pixabay 連續抓頁面會被擋，隔一下再試。
5. **登記**：原曲和混好的檔都用 `assets.mjs add` 登記授權與來源，備註寫 Content ID 狀態。混好的檔放在 `assets/audio/`，不要放 `assets/music/`：`music/` 是程式作曲專用，QA 不檢查授權。

## 12. 品牌 QA

```bash
node scripts/brand-qa.mjs videos/<片>
```

- QA 只讀不改，判定有三種：PASS、NEEDS_REVIEW、FAIL。品牌規則一律從嚴（fail closed），只有 lint 建議可以豁免。
- 看 `qa/stills/contact-sheet-*.jpg`，逐項目視檢查，結果寫進 `qa-review.json`，並綁定該版內容的 digest。內容改了，目視紀錄就要重看。
- 常見的剩餘項：單一 HTML 檔的「軌道太密」lint 建議，不影響畫面，記成待辦即可。

## 13. 核可與交件 ⏸

1. 使用者說可以之後，渲染 1080p：
   ```bash
   npm run hf -- render videos/<片> --output videos/<片>/renders/<片>-1080p.mp4
   ```
2. 用 ffprobe 驗證規格：1920×1080、幀率照 BRIEF（預設 60fps；30fps 時 0.1 秒以下的步驟會一頓一頓）、H.264（yuv420p）、AAC、片長。
3. 重跑 QA，更新 `qa-review.json`，寫 `approval.json`：核可人與原話、日期、digest、正式檔規格、配樂來源、待辦（例如 Content ID 申訴）。
4. commit。超過 30 MB 的檔案傳不到手機或網頁版，只能在這台電腦的桌面版打開，要跟使用者說檔案位置。
5. **整理 `renders/` 時**：保留清單從 `approval.json` 的 `render` 和 `PROJECT.md` 的現行版來，不看檔名的 `-v2` 或修改時間。被否決的版本記進失敗紀錄（`videos/<專案>/research/failure-records.md`：試什麼、使用者怎麼說、學到的、留下的檔），檔案留著當反例，不直接丟；刪檔前先問使用者（「先確認是否都沒用再丟掉，某些說不定可以當作失敗紀錄」）。

定版之後再修：只改紀錄；如果 QA 抓到新的違規，核可會被撤銷（QA 只把 `approval.json` 的狀態改成 revoked），修正等使用者決定。

## 科技風影片的做法（科技風）

個人層配方 `tech-showreel` 的實作，可以整套沿用：

- **節拍格**：段落一律從小節線開始（所以曲子方向與 BPM 在第 5 步分鏡時就要定）；`index.html` 的段落表用小節數算出秒數（改曲子或 BPM 時重算一次），`scenes.js` 只用 `BEAT` 與 `at(k)`。
- **程序圖形**（粒子、大片背景漸層、HUD 時間碼現在在 `frame-spec.md` 的禁用清單裡，新片要用得先由使用者為那支片核可）：同心環、點陣、粒子、背景漸層、HUD 時間碼都在 `render(t)` 裡畫，用一個 `ease: "none"` 的驅動 tween 的 onUpdate 呼叫，隨機用固定種子。
- **彈簧**：閉式彈簧當 GSAP ease（`springy()`），有一點過衝；需要時間函數的地方直接用 `spring(t)`。
- **游標**：`cursor()`／`moveTo()`／`click()`（按下縮小＋漣漪），座標用場景座標算，不量 DOM。
- **章節過場「點陣成字」**：把字畫到離屏 canvas 當遮罩，點陣在字裡的點亮起、最後炸開。細的明朝橫筆比點距細，取樣要看周圍 ±6px，不然會漏筆（「資」的貝）。
- **3D 產品**（歷史做法，不當寫實 3D 的主角；現在的出片媒介規則見 video-direction「給使用者看之前」與 `references/3d-bake.md`，使用者 2026-10-28：「請你認知一點 hyperframe three.js 做3D 的效果真的不好」）：`kit/aibox3d.js`（three.js r170 放在 `vendor/three/`）。材質用 MeshPhysicalMaterial（金屬＋拉絲粗糙度＋異向性），環境光用 RoomEnvironment。粒子先落到模型表面的取樣點（`sample()`＋`toScreen()`，同一個姿勢），再用噪聲溶解 shader 讓金屬從粒子位置凝結出來——使用者要「粒子轉成硬體」，不要「另外生成」。注意：
  - CSS 3D 拼出來的機器不過關，要嘛真的 3D 渲染，要嘛真實照片。
  - 先出靜態測試圖給使用者過關，再放進片裡。
  - 鏡頭不要太俯視（約 14°），產品正面朝鏡頭；DGX Spark 的產品渲染是好參考。
  - 不要對 preserve-3d 容器設 opacity 或 filter，會被壓平成一面；淡入淡出放在外層。
  - 預覽伺服器只服務專案資料夾，子資料夾的測試頁要自帶 kit／vendor 副本。
- **過場要給選項**（現在是每支片的第 7 步）：這支片的章節過場一次出五種分鏡（每種 4–5 格）＋一支短動態預覽給使用者挑（`direction/transitions/`）。

## 上 YouTube 前

- 配樂有 Content ID 的話：被聲明時到曲目頁下載 Pixabay 授權 .txt，在 YouTube Studio 選「我有授權」申訴。
- 說明欄放官網連結；用 CC BY 曲子的話，照授權寫出處。

## 下一支片怎麼開始

```text
我要做一支新片：<一句話需求>
```

從 `video-direction` 開始，照本手冊 1–13 步走。可以直接複製 `videos/<專案>/films/<片>` 的 `kit/`、`index.html` 與 `scenes.js` 結構，再換內容和風格；科技風的片子從 科技風 複製（見上方「科技風影片的做法」與該片的 `SUMMARY.md`）。
