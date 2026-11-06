# 使用說明：工具（toolkit）和工作資料夾（studio）

工具只有一份，放在 toolkit；影片和公司的品牌套件放在工作資料夾（studio）。平常都在 studio 開 Claude Code，並把 toolkit 加進 session，skill 就從 toolkit 載入（只有影片的 session 會載入，其他 session 不佔 context）。

## 東西放在哪

| 位置 | 放什麼 | 什麼時候改 |
|---|---|---|
| `~/Projects/video-studio-toolkit`（toolkit） | skills、scripts、pipelines、風格配方、圖庫、測試、示範品牌、共用字型 | 要改工具、流程、skill 時，只在這裡改、這裡 commit |
| `~/Projects/marketing-video-studio`（studio） | `videos/`（每支片一個資料夾）、`brand-kits/`（公司品牌套件） | 做片子時 |
| `~/.video-studio`（個人層） | 品味檔、選擇紀錄、參考紀錄、inbox、個人素材庫、個人風格、共用音效庫 `sfx/`（CC0／Pixabay，出處在它的 CREDITS.md） | Claude 提議、你同意後才改 |
| `~/.claude/skills` | 不放任何影片 skill：同名的個人 skill 會蓋掉 toolkit 的（`node scripts/check-skills.mjs --check` 檢查） | 不用改 |

## 專案：同一個案子的片子放在一起

同一個案子（例如一個產品）會有好幾支片、很多試片、原始素材和研究。全部放在 `videos/<專案>/` 底下：

```
videos/<專案>/
  PROJECT.md        各片的關係、現行版、狀態、重要決定（有這個檔，工具才把它當成專案）
  films/<片>/       每支正片一個 HyperFrames 專案
  tests/_<試片>/    試片、semantic-type 測試底座、Blender 等試驗
  sources/          客戶給的原始素材（腳本、截圖、錄影），還沒登記進素材庫的
  research/         尺、量測數字、比對總覽圖、研究筆記（參考影片本身不放，只放暫存資料夾）
  assets-library/   共用素材庫；某支片有自己的 assets-library 時優先用它的
```

- 指令照常傳路徑：`videos/<專案>/films/<片>`。片子的代號是這段路徑（例如 `demo/films/focus`），參考紀錄同時記下 `project`。
- 查整個專案的參考：`refs.mjs list videos/<專案>` 或 `refs.mjs search <字> --project <專案>`。
- 只有一支片、沒有試片的案子，可以照舊直接放 `videos/<片>`。
- 試驗用的程式（Blender 場景、three.js）放在試片或片子裡會進版控；算出來的圖、影格不進版控。

## 平常怎麼用

1. **在 studio 開 session**：在 Claude 桌面版選 `~/Projects/marketing-video-studio`，再把 `~/Projects/video-studio-toolkit` 加進 session（「加資料夾」；CLI 是 `claude --add-dir ~/Projects/video-studio-toolkit`）。沒加的話影片 skill 不會出現。
2. **開新片**：說「我要做一支新的影片：〈一句話〉」。會照 video-direction 一步一步走，每一關都等你決定；說「全部交給你決定 不要問我任何問題唷」時，關卡照走但由 Claude 依尺決定（理由寫在 `direction/decisions.md`），只拿完成的成果問你行不行，下載、花點數、品牌衝突、刪檔仍會先問：
   訪談 → 建資料夾、盤點素材 → 參考與腳本 → 三個方向（真渲染的關鍵影格）→ 節奏單與分鏡 → 最難的鏡頭 → 文字效果 → 轉場 → BRIEF、frame.md（外觀寫成數字＋禁用清單）、SPEC.md（交給 /hyperframes）→ 製作：每拍一格 → 整支（video-motion-craft）→ 審片（video-draft-review）→ 草稿 → 配樂 → 品牌 QA → 交件。
   資料夾在第 2 步建好（`videos/<專案>/films/<片>`，英文小寫加連字號；試片放 `tests/`，前面加底線）。
3. **給素材、給參考**：
   - 腳本、截圖、錄影：直接告訴 Claude 檔案在哪，它會登記進那支片的素材庫（來源、授權）。不用先放進 `videos/`。
   - 想讓 Claude 看的參考圖、影片：丟進 `~/.video-studio/inbox/`，或貼網址。
4. **直接叫 skill**：`/video-direction`、`/video-motion-craft`、`/video-draft-review`、`/video-brand-qa`、`/semantic-type`、`/hyperframes`。也可以直接描述要做的事，例如「04 停太久了」「先自己檢查一輪再給我」「讓這個標題演出意思」「定版前幫我 QA」。

### 自己跑指令（在 studio 裡）

工具的指令都寫成 `node <tool>/scripts/…`，`<tool>` 就是 toolkit 的路徑：

```bash
node ~/Projects/video-studio-toolkit/scripts/profile.mjs                          # 看各項路徑解析到哪
node ~/Projects/video-studio-toolkit/scripts/gallery.mjs --video videos/<片>      # 圖庫 http://localhost:4320
node ~/Projects/video-studio-toolkit/scripts/hf.mjs preview videos/<片>           # 預覽
node ~/Projects/video-studio-toolkit/scripts/hf.mjs render videos/<片> --quality draft
node ~/Projects/video-studio-toolkit/scripts/brand-qa.mjs videos/<片>             # 定版前檢查
node ~/Projects/video-studio-toolkit/scripts/refs.mjs inbox                       # inbox 裡還沒記錄的參考
node ~/Projects/video-studio-toolkit/scripts/script-lint.mjs videos/<片>/direction/script.json   # 腳本、讀點、伏筆、接縫
node ~/Projects/video-studio-toolkit/scripts/review-pack.mjs videos/<片> videos/<片>/renders/draft-N.mp4 --out videos/<片>/review-draft-N   # 審片包、量測、時間圖（一版一包；不會覆寫還有效的 PASS 或填過的清單，要丟掉才加 --force）
node ~/Projects/video-studio-toolkit/scripts/review-pack.mjs --check videos/<片>/review-draft-N            # 審片關卡：0 才寫 PASS.json
node ~/Projects/video-studio-toolkit/scripts/sound-sheet.mjs videos/<片> --spec build/score.json --video <成片.mp4>   # 音效審片頁：逐個音效與沒聲音的動作、疑點，給使用者勾（sound.md §1）
node ~/Projects/video-studio-toolkit/scripts/measure/beat-check.mjs videos/<片> --render videos/<片>/renders/draft-N.mp4   # 接縫在不在拍上
```

在 studio 執行時，`videos/` 和 `brand-kits/` 會自動用 studio 的。

草稿與試片給人看之前都要過 `video-draft-review`：量測沒有 FAIL、`MOTION.md`（每一版的動態檢查）答完、審片包的 `CHECKLIST.md` 每個答案都引用了影格、正片的 `INDEPENDENT.md` 由沒參與製作的審片者（新開的 subagent）填好且每個 [!] 都有處理，`--check` 才是 0 並寫出綁定這一版 render 的 `PASS.json`。讀點表的寫法見 `video-motion-craft/references/reads-and-beat.md`，關卡的規則見 `video-draft-review/references/gate.md`。

## 參考是流程節點：找 → 標 → 綁 → 用

品質的上限取決於餵進去的參考，所以參考不是放在旁邊的連結，而是計畫的一部分：

```bash
node <tool>/scripts/refs.mjs hunt videos/<片>                                                  # 找之前：direction/ref-hunt.md 列出缺口、要哪一類、收過的候選
node <tool>/scripts/refs.mjs add videos/<片> --url U --title "…" --why "…" --at 4.5-6.5      # 找：看過就記（印出卡 id）
node <tool>/scripts/refs.mjs card <id> --take transition="條狀掃過，新畫面緊跟在條後" --avoid "不抄配色" --file <本機檔>   # 標：借什麼、別抄、切影格與色票
node <tool>/scripts/refs.mjs cards --facet transition                                          # 列出卡
node <tool>/scripts/refs.mjs match videos/<片>                                                 # 對 direction/axes.json 排出最適合當 seed 的卡（卡要用 --axis 標設計軸）
# 綁：direction/script.json 的拍與接縫寫 "refs": ["<id>"]；主角拍與 major／bar 接縫沒綁，script-lint 與審片關卡都 FAIL（no-ref）
node <tool>/scripts/refs.mjs board videos/<片>                                                 # 用：direction/refboard/ 每一拍、每個接縫的參考板
```

主角時刻找過一輪還是沒有參考，就把 ref-hunt.md 的「參考不足」給使用者決定：改需求，或首創（script.json 寫 `"experimental": "使用者原話"`，量測照跑、標成實驗）。審片包會在 `refs/` 放這一版和綁的參考並排；campaign 的每個版本要寫它借哪張卡（`--variant "a=做法@<id>"`），比較圖每版下面一列就是它的參考。影格和色票放在個人層 `~/.video-studio/refs/<id>/`，只拿來比，不進成片。

## 同時做幾個版本來比（campaign）

主角時刻和代表性接縫不要一版一版改到滿意，而是同時做 2–3 種不同的做法，並排挑一個。Claude 看得懂靜圖、看不懂動態的感覺，程式做版本又便宜，所以挑的是你，比的是做好的東西，不是文字描述。

```bash
node <tool>/scripts/campaign.mjs new videos/<專案> hero-sign --kind seam --question "簽名那一刻用哪一種？" \
  --variant "a=甩鏡帶模糊@<卡id>" --variant "b=條狀掃過@<卡id>" --variant "c=卡片打開成頁@<卡id>" --from videos/<專案>/films/<片>
node <tool>/scripts/campaign.mjs render  videos/<專案>/campaigns/hero-sign   # 每版 render 60 fps，跑試片量測
node <tool>/scripts/campaign.mjs compare videos/<專案>/campaigns/hero-sign   # previews/campaign-hero-sign/compare.mp4、compare.jpg、COMPARE.md
node <tool>/scripts/campaign.mjs pick    videos/<專案>/campaigns/hero-sign b --why "條掃過去新畫面跟著露出" --quote "這個俐落"
```

每個版本是 `tests/_<名稱>-<版本>` 的試片。compare 只放量測通過的版本（`--all` 連沒過的一起看）。pick 會把贏的和輸的都記進範例庫（`scripts/exemplar.mjs list`），下一支片從贏過的做法開始。哪些畫面適合用程式做、哪些該用素材或外包，見 `video-direction/references/capabilities.md`。

## 拿到 Remotion 寫的片子

不裝 Remotion（D1：3 人以上的公司要買授權）。兩條路，D19：
- **先出片**：React 場景照用，在 build 用 alias 把 `remotion`、`@remotion/*` 指到自家 shim，由 HyperFrames 出片。範例：`videos/<專案>/films/<片>`（`build.mjs`、`src/shim/`）。
- **要長期改**：用 `remotion-to-hyperframes` skill 移植成 HyperFrames HTML。

品牌檢查會擋真的套件（`package.json` 的依賴、`node_modules/remotion`、打包進去的 Remotion 執行環境）；只有 import、沒有 alias 的會列為待確認。

## 把片子交給 After Effects

```bash
node <tool>/scripts/ae-export.mjs videos/<片> --out videos/<片>/renders/ae-<版> --check 1.9,12,30.6
node <tool>/scripts/ae/jsx-mock.mjs videos/<片>/renders/ae-<版>/<comp>.jsx
```

`ae-export.mjs` 在 Chrome 裡逐格播放片子的 GSAP 時間軸，把每個會動的元素變成一個 After Effects 圖層，寫出 `<comp>.jsx`。在 AE 裡用 File › Scripts › Run Script File… 執行，.jsx 要和 `layers/`、`seq/` 放在同一個資料夾。
- **每個圖層**：一張透明 PNG，帶父子層級，Anchor／Position／Scale／Rotation／Opacity 是線性關鍵影格。
- **裁切與模糊**：裁切轉成遮罩（交集），甩鏡的動態模糊轉成 Gaussian Blur 效果。
- **轉成圖片序列的部分**：SVG 的描線、路徑變形，以及 CSS mask-image。

它是近似，不是原檔：
- **文字是圖片**，不是 AE 的文字圖層，要改字回 HyperFrames 改。
- **顏色、文字或排版在變的那幾格**是該元素的逐格圖片序列。
- **陰影會不見**：被裁切的元素，它上層容器的陰影會消失。

`--check` 會用 AE 的規則把同一份資料在瀏覽器裡疊回去，和原片在指定的秒數比 PSNR，結果寫在 `<out>/check/`。甩鏡那幾格預覽用一般模糊，分數會偏低。`jsx-mock.mjs` 用模擬的 AE 物件模型把 .jsx 跑一遍，可以先抓語法、屬性名和關鍵影格的錯，不必開 AE。

## 改工具

- **只在 toolkit 改**，在 toolkit commit：pre-commit 會跑碰到改動的測試，大改動再跑一次 `npm test`。studio 不放工具，不會有兩份對不上的問題。
- skill 直接從 toolkit 載入，toolkit 裡改了，**新開的 session** 就是新版；已經在跑的 session 要說「重新載入 xxx skill」。
- **新增自家 skill**：放在 `toolkit/.claude/skills/<名稱>/`，在 toolkit commit 就好，不用再連結。
- 要把一支片的做法變成通用工具（例如新的音效、效果），把程式搬進 toolkit；片子資料夾只留這支片自己的設定。

## HyperFrames、GSAP 與 earshot 的 skill

- HyperFrames 與 GSAP 系列只有 toolkit `.claude/skills/` 這一份，由 skills 安裝程式管理（`skills-lock.json` 鎖定），不要手改。更新：在 toolkit 跑 `npx skills add heygen-com/hyperframes -s <名稱…> -a claude-code -y --copy`，再 commit。不要用 `-g` 裝到個人層，會蓋掉這裡的。
- 上游 HyperFrames 公開 9 個 skill，這裡裝 6 個：`hyperframes`、`hyperframes-cli`、`hyperframes-registry`、`media-use`、`figma`、`remotion-to-hyperframes`。不裝 `slideshow`（現場簡報，不是出片）、`reverse-any-video` 與 `style-sampling`（Pro 付費、要 0.9 以上的 CLI，reverse 不問就用 HeyGen 重拍人）；GSAP 裝 5 個，不裝 `gsap-scrolltrigger`、`gsap-react`、`gsap-frameworks`（DECISIONS D25）。舊的 `hyperframes-animation`、`-core`、`-studio`、`-creative`、`-keyframes` 併進 `hyperframes` 的 `references/`（安全區在 SKILL.md「Keep it editable」、frame.md 格式在 `look.md`、GSAP 在 `runtimes.md`、動態在 `motion.md`），`hyperframes-audio` 併進 `media-use` 的 `references/mixing.md`；八個流程 skill（general-video、product-launch-video 等）上游已刪。上游 repo 自己的 `.claude/skills/`（motion-doctrine、cut-the-curve 等，標 internal）是 HeyGen 片子的 house style，不裝（DECISIONS D21）。
- `earshot`（[Leonxlnx/earshot](https://github.com/Leonxlnx/earshot)，聽審音效的 skill）同樣由安裝程式管理、不要手改；版本要和本機 `~/Projects/earshot` 的程式一致。更新：在 earshot 跑 `git pull` 並更新它的 `.venv`，再在 toolkit 跑 `npx skills add Leonxlnx/earshot -s earshot -a claude-code -y --copy`，commit。同一個 repo 的 `real-sound` 不裝；earshot 只當耳朵，選什麼聲音照 video-motion-craft 的 `references/sound.md`（DECISIONS D23）。
- studio 裡不放任何 skill。
- 這些 skill 叫 CLI 時寫 `npx hyperframes`（npm 上的最新版）；工具腳本（brand-qa、預覽、語意文字檢查）用 toolkit 裡固定的版本（`node <tool>/scripts/hf.mjs`）。兩者版本不同時，以 toolkit 的為準。

## 新電腦或重新安裝

```bash
git clone <toolkit> ~/Projects/video-studio-toolkit && cd ~/Projects/video-studio-toolkit
npm install && npm run doctor
python3 -m venv .venv && .venv/bin/pip install edge-tts   # 旁白
node scripts/check-skills.mjs                             # 個人層沒有同名 skill 蓋掉 toolkit 的
node scripts/profile.mjs init --name <名字>               # 個人層（已有就跳過）
git clone <studio> ~/Projects/marketing-video-studio
```

## 出問題時

| 狀況 | 怎麼辦 |
|---|---|
| `/video-direction` 之類的 skill 沒出現 | 確認 session 有加入 toolkit 資料夾（`/add-dir ~/Projects/video-studio-toolkit`）；個人層有同名的會蓋掉，跑 `node <tool>/scripts/check-skills.mjs --check` |
| 指令說找不到 `scripts/…` | 在 studio 要寫 `node <tool>/scripts/…`；`node <tool>/scripts/profile.mjs` 看路徑對不對 |
| 品牌套件找不到 | 確認是在 studio 開的 session（有 `videos/` 的資料夾），套件在 `studio/brand-kits/<kit>` |
| 想退回拆分前 | toolkit、studio、`~/.claude/skills` 三個 repo 都有 `pre-split` 標籤：`git log pre-split` 看那時的狀態 |
