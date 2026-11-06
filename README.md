# marketing-video-studio

行銷影片創作系統：HyperFrames 引擎＋品味與公司層（創意方向、素材庫、品牌檢查）。決策見 [DECISIONS.md](DECISIONS.md)。

> 這個 repo 只放工具（skills、scripts、pipelines、風格、測試、示範品牌）。影片與公司品牌套件放在工作資料夾（例如 marketing-video-studio），在那裡開 Claude Code session，並把這個 repo 加進 session（`--add-dir`／`/add-dir`／桌面版「加資料夾」），skills 就從這裡載入；指令寫成 `node <tool>/scripts/…`。路徑見 `node scripts/profile.mjs`。

**從需求到上架的完整做法見 [docs/PLAYBOOK.md](docs/PLAYBOOK.md)。**平常怎麼用（在哪開 session、怎麼叫 skill、怎麼改工具）見 [docs/USAGE.md](docs/USAGE.md)。

## 安裝

```bash
npm install
npm run doctor
node scripts/check-skills.mjs                             # 確認個人層沒有同名 skill 蓋掉這裡的
python3 -m venv .venv && .venv/bin/pip install edge-tts numpy   # 旁白（pipelines/tts）與量測（scripts/measure）用
```

ffmpeg／ffprobe 用專案內的版本，不需要 brew。HyperFrames 指令一律透過 `npm run hf -- <指令>`（例如 `npm run hf -- render`）執行。

## 結構

| 位置 | 內容 |
|---|---|
| `videos/` | 不在這裡：每支影片一個 HyperFrames 專案，放在工作資料夾 |
| `brand-kits/` | 示範品牌與共用字型（`_fonts`）；真實品牌放在工作資料夾的 `brand-kits/` |
| `styles/` | 風格配方（`recipes/`）、範例實作（`examples/`）、預覽模板（`_preview/`） |
| `pipelines/` | 語音、配樂、網頁截圖等腳本 |
| `scripts/lib/paths.mjs` | 決定工具、個人層（`~/.video-studio`）、工作資料夾、品牌套件各在哪裡；`node scripts/profile.mjs` 列出實際路徑 |
| `.claude/skills/` | HyperFrames、GSAP 官方 skills、earshot（聽審音效）與自建的 `video-direction`、`video-motion-craft`、`video-draft-review`、`video-brand-qa`、`semantic-type` |

## 移除

刪掉 `node_modules/` 即可；Chrome 快取在 `~/.cache/puppeteer`。

## 素材庫（每個專案自建）

```bash
node scripts/assets.mjs init videos/<影片> --brand kestrel         # 建立 assets-library/
node scripts/assets.mjs add <庫> <檔案或資料夾> --type logo|screenshot|photo|video|audio|copy --product <產品> --license <授權>
node scripts/assets.mjs capture <庫> <網址> --hide "<要隱藏的選擇器>"   # 網頁截圖，30 天後提醒重抓
node scripts/assets.mjs claim <庫> --text "<數據或宣稱>" --source <出處> --approved-by <核可人>
node scripts/assets.mjs check <庫> needs.json --out ASSETS.md    # 盤點：已有／過期／缺少
node scripts/assets.mjs promote <庫> videos/<影片>               # 定版後列出可回存的新素材
node scripts/assets.mjs link <庫> <別人的庫>                      # 連結他人的庫（品牌素材不會從這裡取）
```

搜尋順序：專案的庫 → 個人的庫（個人層的 `assets/`，舊的 `~/.video-assets` 也會讀）→ 連結的庫。未核可的宣稱不會被當成「已有」。

## 風格與參考庫（瀏覽與選擇）

風格庫只存文字配方，不存影片；要定風格時才用該片內容產生幾個候選預覽。完整流程見 [docs/video-direction-flow.md](docs/video-direction-flow.md)。

```bash
node scripts/preview.mjs videos/<影片> swiss,collage,op-art       # 第一輪：靜態分鏡
node scripts/preview.mjs videos/<影片> collage,swiss --motion     # 第二輪：前兩名的動態預覽
node scripts/gallery.mjs --video videos/<影片>                     # 開 http://localhost:4320
```

圖庫的分頁：「本片候選」（該片的預覽）、「範例」（Prompt Motion、我的收藏、41 份配方）、「色票」、「文字效果」、「運鏡」、「HyperFrames 元件」、「參考網站」、「關係圖」；每個分頁的內容見 [library/README.md](library/README.md)。選好後可填調整需求（用途、長度、色彩、字體、創意幅度、節奏），按「送出選擇」寫進 `<影片>/selection.json`。

## 自建 skills（流程）

| Skill | 何時用 | 背後的工具 |
|---|---|---|
| `video-direction` | 新片：訪談 → 素材盤點 → 參考與腳本 → 從參考長出 4–6 個候選風格 → 使用者選 → 動態預覽 → 分鏡 → 文字效果 → 轉場 → 寫 `BRIEF.md`、`STORYBOARD.md`、`frame.md` 交給 `/hyperframes` | `scripts/preview.mjs`、`gallery.mjs`、`refs.mjs` |
| `video-direction` 的 `references/assets.md` | 建立與整理素材庫、匯入、截網頁、登記數據、新片盤點（`ASSETS.md`）、定版後回存（原本的 video-assets skill，已併入規劃） | `scripts/assets.mjs` |
| `video-motion-craft` | 做與修改草稿的動態：讀點與停留、轉場尺、節拍、流暢度、材質變形（數字只在 `library/rules/motion.json`，SKILL.md 的表由 `scripts/rules.mjs` 產生；使用者核可與退回的片段在 `scripts/exemplar.mjs`） | `library/motion/*`、`scripts/script-lint.mjs`、`scripts/measure/*` |
| `video-draft-review` | 每一版草稿與試片給使用者看之前的關卡：審片包、量測（直接判不通過的項目）、引用影格的清單、綁定 render 的 `PASS.json`；frontmatter 帶擋送檔的 hook | `scripts/review-pack.mjs`、`scripts/hooks/draft-gate.mjs` |
| `video-brand-qa` | 定版前：lint、色彩、字型、禁用詞、旁白發音、素材授權，加截圖目視檢查（`QA.md`） | `scripts/brand-qa.mjs` |
| `semantic-type` | 標題用一個真實動作演出自己的意思（語意文字動畫）：讀懂字 → 三個動作挑一個 → 測試底座 → 客觀檢查 → 只出片段 | skill 內的 `scripts/semtype.mjs`、`lib/semantic-type.js` |

```bash
node scripts/brand-qa.mjs videos/<影片>     # 結果寫在 <影片>/QA.md
```

品牌套件的 `brand.json` 可加 `forbidden`（禁用詞清單），QA 會在畫面文字與旁白裡找。

## 回歸測試

```bash
npm test     # 全部，約 6 分鐘
node scripts/test-related.mjs <檔…>   # 只跑碰到這些檔的測試（--list 只列出）
```

commit 前 `.githooks/pre-commit` 自動跑碰到 staged 檔的測試（`npm install` 會設好 `core.hooksPath`；這次不跑用 `git commit --no-verify`）。只改文件不跑。

測試在 `tests/.tmp/` 用複本執行，不會改到真正的影片與素材庫。

## 授權

本 repo 的程式與文件用 MIT（[LICENSE](LICENSE)）。上游的 skill、字型與音效保留各自的授權，見 [THIRD-PARTY.md](THIRD-PARTY.md)。文件裡的 Kestrel、NovaMind、Acme 都是示範用的虛構品牌。
