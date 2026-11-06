---
name: video-draft-review
description: 草稿審片關卡（marketing-video-studio）：任何正片草稿、轉場或語意文字試片、campaign 的版本要給使用者看之前都要先過——跑 review-pack 量測、和尺與綁的參考並排、獨立審片，--check 寫出 PASS.json 才能送。render 完、準備傳檔，或使用者說「做好了給我看」「先自己檢查一輪」「可以送了嗎」時使用；只審不改，動態怎麼修用 video-motion-craft，定版前的品牌驗證用 video-brand-qa。
hooks:
  PreToolUse:
    - matcher: "SendUserFile"
      hooks:
        - type: command
          command: 'node "$(cd "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/video-draft-review}" && pwd -P)/../../../scripts/hooks/draft-gate.mjs" pre'
  Stop:
    - hooks:
        - type: command
          command: 'node "$(cd "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/video-draft-review}" && pwd -P)/../../../scripts/hooks/draft-gate.mjs" stop'
---

# video-draft-review

**規則：每一個要讓使用者看的動態成品，先過這一關**（還在挑的候選例外，見下）。 用工具傳檔、在回覆裡貼路徑、給 Studio 預覽網址或圖庫頁，都算「給使用者看」。過了的證據是審片包裡的 `PASS.json`，它綁定那一版 render 的內容指紋；render 一改就失效。沒有 PASS，就不給、不說「做好了」。

為什麼：工藝規則寫在文件裡，做的時候沒有東西會擋，使用者一直用眼睛抓到「太快」「停太久」「接縫不完整」「節奏不對」（FEEDBACK.md 2026-10-25）。動畫工作室的 dailies 也是這樣分工：技術問題（跳格、頓點、拍點偏差、凍住）要在進審片前由檢查擋掉，導演只看表演與調度。使用者是導演，只該看到品味層的問題。

這一關只審不改。修正交給 video-motion-craft（動態與時間）或 video-direction（腳本與分鏡），修完重新 render、重新審。品牌、禁用詞、價格與授權是 video-brand-qa 的事，在使用者核可之後、出正式版之前另外驗；這裡不重複它的檢查。

指令在任何資料夾都能執行，影片路徑相對於目前的資料夾（放影片的工作資料夾）。`<tool>` 是工具根目錄（這個 skill 所屬的 repo），用 `realpath "${CLAUDE_SKILL_DIR}/../../.."` 取得；對使用者用繁體中文。

| 要做的事 | 讀這份 |
|---|---|
| 關卡判什麼：FAIL 的代碼、清單的規則、獨立審片、PASS.json、豁免、試片、hook | [references/gate.md](references/gate.md) |
| 三種尺度怎麼看、和尺並排、用評分表與接縫表看、一輪一變數、教訓寫回哪裡 | [references/review-scales.md](references/review-scales.md) |
| 「看起來像生成的」清單（CHECKLIST §1 的來源，只有這一份） | [references/failure-list.md](references/failure-list.md) |

## 流程（正片草稿）

0. **前提**：上游的驗證過了（`node <tool>/scripts/hf.mjs check videos/<slug>` 沒有錯誤），render 是 60 fps；`direction/script.json` 有讀點表與接縫表，`build/sections.json` 有 BPM。缺的先補（video-motion-craft），不要為了過關跳過。
1. **產生審片包**，一版 render 一包：
   ```bash
   node <tool>/scripts/review-pack.mjs videos/<slug> videos/<slug>/renders/draft-N.mp4 --out videos/<slug>/review-draft-N
   ```
   資料夾裡已有仍然有效的 PASS.json 或填過的清單，它不會覆寫（結束代碼 3）：換一個 `--out`，真的不要那份審片了才加 `--force`（film C 被後來的審片包蓋掉過兩次填好的清單與 PASS）。印出的 FAIL 是量出來的：頓點、主體一格跳掉（量邊緣，白底白物也抓得到）、同一小塊一再閃格（`flicker`）、凍住的結尾、主要接縫（開場、結尾、`major: true`、`bar: true`）離拍或大變化離小節線超過 0.1 秒（一般接縫只提醒）、重要讀點時間不夠或重疊、停太久、硬開硬停、連續 3 拍以上同一個版型（`layout-repeat`）、接縫是溶接（`seam-dissolve`：舊新兩張畫面同時半透明；硬切、甩鏡、條狀掃過都可以）、重要讀點上主體太小而畫面大半是空的（`subject-small`）、字進到畫面外圈 5% 或 Logo 進場後移動（`safe-zone`、`logo-moved`；字在 title-safe 外只提醒）、並排的主體沒有以中線對稱或標籤沒對準它的主體（`asymmetric`、`label-off`）、帶字的東西互相重疊、一排同類不等距不等大、字掉到系統字型、補字用可變字型（`text-overlap`、`uneven-row`、`glyph-fallback`、`fill-variable`）、成片在關鍵姿勢畫的和合成 seek 不一樣（`render-mismatch`：少了元素、翻成背面；看 `render-match/` 的並排圖）、整體響度不在 −14 LUFS ±1 或真峰值高於 −1 dBTP（`loudness`、`true-peak`）、中段塌掉（`energy-sag`：中間三分之一在動的秒數不到 30%）、投影片風險 ≥ 60（`slide-risk`；這兩項只量 12 秒以上的正片）。能量曲線（`energy.txt`）的 hook、最密的一段、最大高峰、兩小節沒有新事件，和藍紫畫面的比例只提醒。標題還在、內容就穿過標題區（`head-cross`）只提醒，要逐一看那幾格，不是刻意的就交回修改。有 FAIL 就先回 video-motion-craft 修，修完重新 render、重跑這一步；FAIL 不會因為勾了清單就消失。
2. **先看時間圖**：審片包的 `timing.txt`（或 `timing.png`）。每一拍的讀點（計畫）和成片的動態（量到的）並排：「停留」列太長就是停太久，讀點裡有 ▲ 就是計畫說在讀、成片已經在做下一件事。讀點表和成片對不上時，先改表讓它說實話（`plan-mismatch`），再重跑第 1 步。
3. **看三種尺度**（[references/review-scales.md](references/review-scales.md) §1）：`sheet.jpg` → `beats/` → `seams/` 逐格 → `reads/` 起訖靜圖與 `crops/`。每一張都問「觀眾現在看哪裡？看懂了沒？」，數一下每個讀點拿到幾格。
4. **和尺並排（必過）**：正片要有 `direction/rulers.json`（ruler.md 選的尺：本機影片 `file`，放 `~/.video-studio/rulers/`，和要對照的 `moments`），沒有或影片不在就是量測 FAIL（`no-ruler`、`ruler-file`）。審片包會產生 `ruler/side-by-side.jpg`（上面每一拍一格，下面每列一把尺）與 `ruler/metrics.txt`（這一版和每把尺的 film-metrics）；清單 §3 用一題總結構圖、主體、材質、數字哪一項差最多，引用影格作答，差距大的寫「沒過：」並回到製作改（review-scales.md §2）。
   **和綁的參考並排**：`script.json` 綁了參考（`refs`）的拍與接縫，審片包會在 `refs/` 放這一版和參考影格的並排圖與 `refs.txt`（每張卡的「借什麼／別抄」）。逐處照「借什麼」比，差的寫進回報；主角拍或主要接縫沒綁參考是量測 FAIL（`no-ref`，綁了不存在的卡是 `ref-unknown`），回 video-direction 第 5 步補。
5. **填審片包的 `MOTION.md`**（每一版的動態檢查，見 video-motion-craft；`--check` 核對答案）和 **`CHECKLIST.md`**：只有三節（gate.md §2）：§1 常見失敗（有就標 `[!]` 並寫影格）、§2 第一個畫面讀不讀得出來、§3 和尺並排的總結。每一格都勾；每個「答：」寫一句話並引用那一項自己的影格（每格左上角的 `f0732`）；沒過的寫「沒過：…」。每一拍、每個接縫、每個讀點不再逐題答（量測與獨立審片看），但第 3 步照樣逐格看，看到的寫進 §1。不要先勾再看：沒看過的格子引用不出影格。
6. **獨立審片**：新開一個沒參與製作的 subagent（不要 fork），不給清單答案與製作對話。**先只給審片包**，請它看完 `sheet.jpg` 和 `beats/` 寫下這支片在說什麼、最記得的一刻、哪裡無聊；之後才給 `direction/script.json`、failure-list.md 和這支片要讓觀眾懂的一句話，請它寫對不對得上，再找問題。對不上、或說不出最記得的一刻，就是一行 `[!]`（使用者：「不確定你想要表達什麼」「我覺得我沒有被驚艷到」）。它的發現照貼進審片包的 `INDEPENDENT.md`，每個 `[!]` 回「處理：」：明顯的錯就修、重 render、重審；品味層的交給使用者判斷。它說沒問題不代表使用者會滿意，它的話也不能拿來豁免（gate.md §2b）。
7. **跑關卡**：
   ```bash
   node <tool>/scripts/review-pack.mjs --check videos/<slug>/review-draft-N
   ```
   它會重新量 render，結束代碼 0 才寫出 `PASS.json`。沒過就照它列的項目修或補答，再跑。
8. **小檔**：要傳壓縮過的 `draft-N-small.mp4`，先 `node <tool>/scripts/review-pack.mjs --attach videos/<slug>/review-draft-N <小檔>`，它比對過才算同一版。
9. **給使用者看**，回報裡一定要有：
   - `--check` 印出的那一行：`PASS draft-N.mp4 <指紋> · FAIL 0 · 豁免 … · 提醒 … · 品味 … · 獨立 …`；
   - `--check` 印出的「動態檢查」那一行（範例、元件、最弱處、另一種表達、留著的提醒）；
   - 這一版改了哪一個變數、量到的數字前後各是多少（例如「04 的停留 2.57 → 0.9 秒」）；
   - 提醒（WARN）與「沒過：」的品味意見裡，使用者該知道的；豁免了什麼、根據使用者哪一句話；
   - 獨立審片者抓到什麼、怎麼處理的（交給使用者判斷的那幾項直接問）；
   - 想請使用者判斷的具體問題（「S7 的捲軸落定再攤開，讀得出來嗎？」），不要只問「有意見嗎」。

## 試片（`videos/<專案>/tests/_*`）

語意文字的 4 秒片段、轉場的 2–3 種做法、材質變形的試驗，一樣要過，但只跑量測與 `MOTION.md`，不填清單：

```bash
node <tool>/scripts/review-pack.mjs videos/<專案>/tests/_<名稱> videos/<專案>/tests/_<名稱>/out/clip.mp4
node <tool>/scripts/review-pack.mjs --check videos/<專案>/tests/_<名稱>/review
```

會擋的是頓點、一格跳掉、接縫離拍、溶接、讀點不夠與停太久（有讀點表時）；硬開、結尾停住在摘錄裡是正常的，只提醒。semantic-type 自己的 `semtype check` 照跑，這一關不取代它。片子 `direction/transitions/` 裡的轉場試片見 gate.md §5。

## 候選與預覽

**還在挑的候選不用過這一關**（2026-10-29 使用者同意放寬：「一鏡到底，是個方法，但不應該是限制」）：

- 放在 `direction/` 或 `candidates/` 資料夾底下的影片（方向候選、轉場與材質的試做、look 測試、同時給的 A／B／C），hook 不擋。給的時候說清楚只是拿來挑，不要說「做好了」。
- campaign 的比較（`previews/campaign-<名稱>/compare.*`，`scripts/campaign.mjs compare`）。它只放量測通過的版本；`campaign.mjs render` 用 `--check --candidate` 量，不用填 `MOTION.md`。

**選定之後就要過**（2026-11-05 使用者同意收緊：一支片多半用預覽送，關卡根本沒看到）：

- `previews/` 底下其他的影片、檔名有 `preview` 的影片，是選定版本的預覽（接片、半速特寫）。先讓它的試片過 `--check`（含 `MOTION.md`），再 `node <tool>/scripts/review-pack.mjs --link <預覽> <試片>/review [<另一段>/review …]`，它記在 `<預覽>.pass.json`；來源重新 render 就失效。接片裡舊的段落可以沒有 `MOTION.md`，但至少新做的那一段要有。
- `renders/` 底下的檔一律不算預覽，叫什麼名字都一樣：草稿要過審片才給。

## 音效從畫面來：timeline-events

音效、打點的時間不要手打（外部實測：手打的同步點差 8–11 格，research/ai-animation-cases-B.md）。從片子自己的 GSAP 時間軸匯出：

```bash
node <tool>/scripts/timeline-events.mjs videos/<專案>/films/<片>      # 寫 build/events.json
```

它在無頭瀏覽器載入片子，走過 `window.__timelines` 註冊的每一條時間軸（巢狀時間軸的位置與速度都換算成片子的時間），每個 tween 與 set 記下開始、長度、結束、動了哪些屬性、目標的 id 與 class，以及目標上的 `data-sfx`（或 tween 的 `data: { sfx }`）。要出聲的元素在 HTML 上寫 `data-sfx="whoosh"`，音效表就是 `events.filter((e) => e.sfx.length)`；審片時聽到音效和畫面差幾格，先重跑這一步，不要手調秒數。

## 豁免

量出來的 FAIL 只有使用者能放行。只有在使用者明白說「這個可以不用修」之後，才把那一項寫進片子資料夾的 `review-waivers.json`，附上使用者的原話（`quote`）與核可人（gate.md §4）。不要自己寫、不要為了趕時間建議豁免：先修；修不掉，就把數字和影格交給使用者決定。

## 漏抓的時候

使用者用眼睛抓到、這一關沒擋下來的，就是這一關的漏洞：

- 原話與情境寫進 `${CLAUDE_SKILL_DIR}/FEEDBACK.md`；
- 在 `${CLAUDE_SKILL_DIR}/evals/evals.json` 加一個案例（用那一版 render 與讀點表），以後改關卡時跑一次；
- 量得出來的，補進 `<tool>/scripts/review-pack.mjs` 的量測與 `tests/review-pack.test.mjs`；量不出來的，補進 [references/failure-list.md](references/failure-list.md)。
