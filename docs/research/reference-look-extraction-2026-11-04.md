# 找參考與抽質感：現況審核與外部做法（2026-11-04）

使用者：「我覺得可以做一個找 Reference 的 Skill，並且可以抓裡面的設計元素、光暈、陰影、材質：參考與做法，先幫我找找看，先不做 skill」。

## 結論

- **找參考已經有，抽質感沒有**。toolkit 找參考、記參考、把參考綁到每一拍的流程很完整（`refs.mjs`、`refcards.mjs`、`hunt`、圖庫），但卡片只抽關鍵影格和 6 色色票。光暈、陰影、材質沒有量測，也沒有一份「效果 → 做法」的對照表。
- **外面沒有現成的 skill 能直接用**。找到的都是從**網頁**抽 CSS（`designlang`、Dembrandt），或是通用的光暈陰影數值表（和參考無關）。**從影片或截圖反推光暈、陰影參數的工具沒有找到**，這部分要自己量。
- **做法的來源其實已經在手上**：HyperFrames 登錄庫有 118 個和光、材質有關的元件；Figma MCP 讀得到精確的陰影與模糊參數；陰影有 Josh Comeau 的分層做法可以照抄原理。
- 建議的 skill 形狀見 §4：「參考 → 量 → 對到做法 → 試一小段和參考並排」，產出寫回參考卡片和一份新的做法表。

## 1. 現況審核

| 項目 | 現況 | 缺口 |
|---|---|---|
| 找參考 | `refs.mjs add/search`、`hunt()` 依缺口列出要找什麼、個人層 `reference-sites.md` 85 行、圖庫「範例」「參考網站」分頁 | 沒有依「光暈／陰影／材質」找的來源分類 |
| 記參考 | `references-log.jsonl` **318 筆**（309 件作品、9 個網站） | — |
| 參考卡片（可綁進 script.json） | **只有 8 張**；面向分布：交棒 8、構圖 6、顏色 5、字 3、鏡頭 2 | **材質面向 0 張**；318 筆裡只有 2.5% 做成卡片 |
| 從參考抽東西 | `refcards.mjs`：關鍵影格 ＋ `palette()` 6 色 | 沒有光暈半徑、陰影偏移與柔度、顆粒、暈影、反光這些數字 |
| 質感的規則 | `video-direction` 的 `looks.md`（深色、玻璃約 35% 不透明、借尺不搬外觀）、`finish-layers.md`（五層逐拍對尺） | 都是從回饋整理的原則，沒有數值範圍可以量 |
| 現成做法 | 登錄庫、`media-use` 的顆粒與調色、Paper Shaders、ambientCG／Poly Haven（見 `quality-sources-2026-10-31.md`） | 沒有依效果索引：想做「柔的藍色光暈」時不知道該用哪個元件 |
| 量測 | `hyperframes measure look`：亮度、對比、飽和、冷暖、色塊格 | 量不到光暈、陰影、顆粒 |

`ref-axes.json` 已經有 `material` 軸（flat、paper、glass、metal、photo、volume），卡片也有 `material` 面向，只是從來沒有人填過。

## 2. 外部有什麼

### Skills（skills.sh）

| Skill | 做什麼 | 結論 |
|---|---|---|
| [manavarya09/design-extract `extract-design`](https://github.com/manavarya09/design-extract)（MIT，4.5k★） | 跑 `npx designlang <url>`，從網頁抽色、字、間距、**陰影**、元件、動畫，輸出 8 種格式 | 只吃網址；skills.sh 的安全稽核有兩項 Warn。網頁參考可以用，但 toolkit 自己的 Playwright 抽法更好控制 |
| [Dembrandt](https://github.com/dembrandt/dembrandt)（MIT，CLI＋MCP） | 從網頁的計算後樣式與 CSS 變數抽設計 token，可輸出 DESIGN.md | 同上，只限網頁 |
| [nexu-io/open-design `reference-design-contract`](https://github.com/nexu-io/open-design)（Apache-2.0） | 把參考拆成 Keep／Change／Do not copy，寫成 DESIGN.md 與交接文件 | 觀念 toolkit 已經有（卡片的 `take`／`avoid`、D7 不搬外觀）；它不量任何數字 |
| [soilmass/motion-design-agent `glow-shadow`](https://github.com/soilmass/motion-design-agent)（MIT，7★） | 通用的光暈半徑（4／16／32／80 px）、M3 陰影層級、霓虹與掃光的 CSS | 和參考無關的預設值表，不符合「從參考長出來」 |
| [iart-ai `motion-art-direction`](https://skills.sh/iart-ai/motion-design-skills/motion-art-direction) | 先定動態語言再動畫 | 只有原則、沒有光與材質 |
| impeccable 的 `extract` | 把程式裡重複的元件與 token 收成設計系統 | 是重構程式，不是讀參考，不相關 |

### 參考庫與服務

| 來源 | 內容 | 結論 |
|---|---|---|
| [Refero MCP](https://doc.refero.design/) | 12.5 萬個產品介面畫面、8,000 個流程，可依美感方向搜尋，有給 agent 用的 MCP | 介面靜態畫面，Pro 付費；做產品介面片時可以考慮 |
| [60fps MCP](https://abduzeedo.com/60fps-curated-library-ui-animation-design/) | 介面動態作品庫，有付費的唯讀 MCP | 依互動情境分類，不依光暈、材質分類 |
| Figma MCP（這台機器已經接上） | 讀得到 drop shadow／inner shadow 的顏色、偏移、模糊、擴散，以及 layer blur 與 background blur（[Figma Effect 型別](https://developers.figma.com/docs/widgets/api/type-Effect)） | **最精確的來源**：參考是 Figma 檔或 Community 檔時，數值可以直接讀。noise 與 texture 效果讀不讀得到還沒確認 |
| Savee、Cosmos、Godly | 找靈感 | 沒找到 API 或 MCP |

### 做法的來源

- **陰影**：[Designing Beautiful Shadows in CSS](https://www.joshwcomeau.com/css/designing-shadows)（同一個光源、多層疊加、陰影帶表面的色相）與 [Shadow Palette Generator](https://www.joshwcomeau.com/css/introducing-shadow-palette-generator)；開源的 [supershad](https://github.com/jaukia/supershad) 會自動產生分層陰影。
- **光與材質元件**：HyperFrames 登錄庫 448 個裡有 118 個相關，例如 `godrays`、`lens-flare`、`light-edge`、`light-leak`、`organic-light-leak-overlay`、`chrome-orb`、`liquid-metal`、`thin-film`、`prism`、`glass-hero`、`ios26-liquid-glass`、`macos-tahoe-liquid-glass`、`lt-neon-border`、`marble`、`obsidian`、`halftone-field`、`fractal-noise`、`gabor-noise`（`npx hyperframes catalog --query …`）。
- **表面貼圖與 shader**：Paper Shaders、ambientCG、Poly Haven（已寫在 `quality-sources-2026-10-31.md`）。

### 從影片或截圖反推參數

搜尋沒有找到現成的工具能讀一張參考畫面、輸出光暈或陰影的參數。找得到的都是正向設定（給參數、畫出光暈），或是 AR 的即時光源估計 API，都不適用。

## 3. 怎麼抽：依參考的來源分三種

| 參考是 | 抽法 | 精確度 |
|---|---|---|
| **網頁** | Playwright 讀計算後樣式：`box-shadow`、`text-shadow`、`filter`（`drop-shadow`、`blur`）、`backdrop-filter`、漸層、`mix-blend-mode`、`mask`。toolkit 的 `assets.mjs capture` 已經用 Playwright，加一個讀樣式的步驟即可 | 精確數值 |
| **Figma 檔** | Figma MCP 讀節點的 effects 與變數 | 精確數值 |
| **影片或截圖**（我們大部分的參考） | 用程式量，再和做出來的版本並排對照：<br>・光暈：亮邊外側亮度掉到 50% 與 10% 的距離（半徑）、光暈顏色和核心的差<br>・陰影：物件下緣的偏移、由深到淺的距離（柔度）、最深處的濃度<br>・顆粒：平坦區域的高頻雜訊強度<br>・暈影：由中心往外的亮度衰減<br>・整體：`hyperframes measure look` 的亮度、對比、飽和、冷暖 | 估計值，要靠並排對照確認 |

量到的數字對到做法（登錄庫元件、CSS 分層陰影、shader、Blender 烘焙），試做一小段，再用 `hyperframes diff` 或 `render-match` 和參考並排。這和 toolkit 現在「從參考逐格量轉場尺」是同一種做法，只是量的是光與材質。

## 4. 如果要做成 skill：建議的形狀（這次不做）

**一句話**：參考 → 量光與材質 → 對到做法 → 試一小段並排 → 寫回參考卡片與做法表。

- **輸入**：一筆已記錄的參考（網址、影片、截圖、Figma 連結），加上要看的時間點或區域。
- **產出**：
  1. 參考卡片的 `material` 面向（現在 0 張）：`take` 寫量到的數字，`avoid` 寫不能照搬的部分。
  2. 新的做法表 `library/finish-recipes.json`，格式比照 `text-effects.json` 和 `camera-presets.json`：每種效果有固定名稱（中／英）、量到的數字範圍、對應的登錄庫元件或 CSS／shader 做法、來源參考。
  3. 一段試片和參考的並排圖。
- **和現有 skill 的分界**：
  - `video-direction`：決定要找什麼參考、綁到哪一拍。這個 skill 只負責把一筆參考的光與材質拆成數字和做法。
  - `video-motion-craft`：動態與時間。這個 skill 不管動，只管光與材質。
  - `media-use`：整片調色、LUT、顆粒的素材處理。這個 skill 決定要哪一種顆粒、多強，再交給 `media-use` 做。
- **要先回答的問題**：
  1. 做成獨立 skill，還是併進 `video-direction` 的一份 reference 加 `refs.mjs` 的一個指令？依目前的分工，後者比較不會和 `video-direction` 搶觸發。
  2. 做法表一開始要收哪些效果？建議先從最常出問題的三類開始：光暈、陰影、玻璃。
  3. 影片參考的量測，要先拿哪 2–3 支已核可的參考片校準數字？
