---
name: semantic-type
description: 語意文字動畫（marketing-video-studio）：讓一個標題用一個真實世界的物理動作演出自己的意思一次、演完回到原本的排版（例如「在地端」落到機房地板揚起灰塵、「資料不出門」的門板甩上鎖住）。使用者說「讓字演出意思」「標題要有語意的動畫」「字的動作要跟意思有關」，或要做產品名、章節標題的文字效果時使用；一般進場、字幕、跑馬燈不用。
---

# semantic-type

一個標題，用**一個**真實世界的物理動作，把自己的意思演**一次**，演完回到原本的排版、靜止、完全可讀。動作是字義的一部分，不是裝飾；看不出在演什麼的動態，就不要做。

## 必須成立的數字

| 項目 | 數字 | 誰量 |
|---|---|---|
| 一個動作、演一次 | 約 0.8–2 秒演完，之後靜止至少 0.8 秒 | `semtype check` 的 `settles_and_holds` |
| 結尾 | 最後一格等於原版面（結尾就是語意時，先問使用者；全權交辦時自己決定） | `end_matches_layout` |
| 英文標題 | 先停 1.0–1.2 秒讓人讀完再開始演（使用者：「停個1.0-1.2就好」） | 讀點表、review-pack `read-short` |
| 排版 | 只在標題的框內（版面框＋墨跡＋約 0.15em），任何一格不碰鄰近元素、不多加字 | `stays_in_box`、`no_neighbour_touch`、`no_added_text` |
| 音效 | 至少一個 cue 落在關鍵瞬間 ±0.07 秒，寫出材質＋動作的理由 | `sound_cue` |
| 給使用者看之前 | 片段過 video-draft-review 的試片量測（會擋什麼寫在那個 skill 的「試片」，這裡不重述） | video-draft-review |

指令在任何資料夾都能執行，影片路徑相對於目前的資料夾。`${CLAUDE_SKILL_DIR}` 是這個 SKILL.md 所在的資料夾；`<tool>` 是工具根目錄（這個 skill 所屬的 repo，有 `scripts/hf.mjs`），用 `node ${CLAUDE_SKILL_DIR}/scripts/semtype.mjs root` 印出來。對使用者用繁體中文。規則與理由在 [references/rules.md](references/rules.md)，核可案例、反例與手法家族在 [references/patterns.md](references/patterns.md)，音效在 [references/sound.md](references/sound.md)。程式庫 `${CLAUDE_SKILL_DIR}/lib/semantic-type.js`（`window.SemType`）放量字形、拆字和可重用的動作。

## 開始前先讀

- **品味檔** `<個人層>/taste.md`（`node <tool>/scripts/profile.mjs` 列出路徑）：使用者對動態、音效、排版的偏好以它為準。這個 skill 不寫死任何個人偏好；要改品味檔，先把要加的句子給使用者看，同意才寫。
- **過去的範例與使用者的評價**：`node <tool>/scripts/refs.mjs verdicts --tag semantic-type`（喜歡／不喜歡＋原因），`node <tool>/scripts/refs.mjs search semantic-type <關鍵字>`。在圖庫（`node <tool>/scripts/gallery.mjs`）「範例 → 我的收藏」選標籤 `semantic-type` 可以只播那一段。使用者喜歡的是品質標準；外部範例只是手法來源。
- **參考卡**：`node <tool>/scripts/refs.mjs cards --facet type` 與 `--facet motion` 列出標過「借字」「借動態」的卡（影格在卡裡）；選定的動作照哪張卡做，卡 id 寫進 NOTES.md，正片裡這一拍的 `refs` 也綁它。找不到就照 video-direction 的「參考不足」問使用者，不要沒有參考硬演。
- **使用者給的參考**：先跑 `node <tool>/scripts/refs.mjs inbox`（使用者丟在 `<個人層>/inbox/`、還沒記錄的檔案）。這些和使用者貼的網址逐一看過（影片一律用 /watch 的本機模式看那一段的連續格，見 `<tool>/docs/PLAYBOOK.md`「看影片參考的方法」；只看縮圖或說明不算看過），說出可借用的手法和不借用的地方，再記錄：`node <tool>/scripts/refs.mjs add <片|-> (--url U | --file <個人層>/inbox/<檔>) --title "…" --why "…" --by user --tags semantic-type --learn "…"`；影片只看其中一段加 `--at 4.5-6.5`，手法用 `--note 手法=…` 標註。要加 `semantic-type` 標籤，使用者才能在圖庫的這個標籤下評價，下次 `verdicts --tag semantic-type` 也才讀得到。只貼在對話裡的圖沒有檔案可記：請使用者放進 inbox，或在圖庫「新增參考」上傳。
- **這個標題要不要存在**：大字只在畫面說不出來時才出現（video-direction 的 `references/script-craft.md` §6）。畫面已經演出這件事、標題刪得掉，就不做語意動畫，先把這點回報。
- [references/rules.md](references/rules.md) 全部，和 [references/patterns.md](references/patterns.md) 裡跟這個詞最接近的案例與反例。

## 流程（⏸ = 等使用者回覆）

使用者全權交辦時（video-direction「流程」開頭的「全權交辦」），下面的「不確定就問」和 ⏸ 都改成自己依 [references/rules.md](references/rules.md) 決定，選項、選了哪個、為什麼寫進 `NOTES.md`，片段給使用者時一起附上。

### 1. 讀懂這個詞（寫進 NOTES.md）
1. **它在這支片裡是什麼意思**。技術名詞演技術上的意思（「在地端」是從雲端部署到自己的機房，不是字掉到地上）；不確定就問。
2. **抓重點字**：哪個字是動作的原因？（「Agent 治理」的重點是「治理」——治理落下，Agent 才被拉齊；「資料不出門」的重點是「門」。）動作從重點字發生，其他字是被影響的一方。
3. **列三個真實動作**：人或東西在現實裡真的會做、看得到的動作，每個一句寫「誰、怎麼動、結果」。從職業、材質、工具、物理（重力、壓力、液體、光）去想。
4. **挑最直接的一個**：一般人一秒內認得出來、不用解釋、不用多加任何東西就成立。寫出另外兩個為什麼輸（太慢、要加道具或文字、會跑出標題的框、太抽象）。
5. **結尾**：預設回到原本的排版。如果結尾狀態本身就是意思（停在上限、被切開、被拉長），⏸ **先問使用者**，說明兩種結尾各是什麼樣子，等回覆才做；同意後寫進 `semtype.json`。
6. **音效**：這個動作的材質（紙、金屬、粉筆、橡皮章、玻璃、空氣、液體…）＋動作（落下、甩上、摩擦、按下、填滿…）→ 從 [references/sound.md](references/sound.md) 挑音色。

### 2. 建測試底座
正片不動。新標題在測試底座做：
```bash
node ${CLAUDE_SKILL_DIR}/scripts/semtype.mjs init videos/_semantic-<slug> --title "<標題>" [--dept …] [--sw …] [--line …] [--theme dark|light] [--cue 1.2]
```
片子屬於專案時（`videos/<專案>/PROJECT.md`），測試底座與測試複本放 `videos/<專案>/tests/_semantic-<slug>`，下面的 `videos/_semantic-<slug>` 都換成這個路徑。

底座是一頁產品介紹的版面：標題 `#title` 是唯一會動的東西，上方部門、下方說明、印章、右邊面板都是鄰近元素（class `nb`），任何一格都不能碰到它們。`--cue` 是關鍵瞬間（落地、甩上、蓋下）的秒數；`--line` 用 `|` 換行。

要放進已經在做的影片時：在那支片的測試複本裡做，版面、鄰近元素就是那支片的真實版面。
- 分場景的片：把那一場複製成 `videos/_semantic-<片名>`。
- **鏡頭一直在動的片**（一鏡到底：整支片是一頁，由 `render(t)` 依時間畫出，沒有靜止的版面）：用 `copy` 做凍結世界的測試複本。
  ```bash
  node ${CLAUDE_SKILL_DIR}/scripts/semtype.mjs copy videos/<片> --to videos/_semantic-<片>-<slug> --target <標題 id> --freeze <秒> --key <秒> [--off <秒>] [--dur 3] [--sub <說明字 id>] --nb <鄰近元素 id,…> [--fx <命名空間.函式>] [--script <共用效果檔>]
  ```
  片子的時間軸跳到 `--freeze` 一次就停住（選標題完整出現時的那一刻），拿掉其他標題，標題換成片子原始標記的新元素，只剩它在跑。片內時間＝測試時間＋`--off`；`--key` 是片內的關鍵瞬間，對到片中同一拍發生的事件。`--sub` 是標題下的說明字（強制顯示、算鄰近元素），`--nb` 列出其他鄰近元素。
  效果寫成 `make(title, key, lib)`，回傳 `draw(t)`：`t` 是片內時間，每個樣式只由 `t` 決定，演完清掉自己設的 inline 樣式。測試複本和正片的 `render(t)` 呼叫的是同一個函式，搬進正片時不用改。同一支片的幾個標題共用一個效果檔時，用 `--script` 帶進來、`--fx` 指定函式；沒給 `--fx` 時，`effect.js` 裡有 `make` 的空殼。片子改了就對同一個複本再跑一次 `copy`：片子的檔案會更新，`effect.js`、`sfx.json`、`NOTES.md` 保留。範例見 [references/patterns.md](references/patterns.md) 的一鏡到底案例。

### 3. 做效果（`effect.js`）
`window.SEMANTIC_EFFECT = ({ tl, title, root, cue, lib }) => { … }`，只在 `tl` 上加動作。
- **一個動作，一次**。關鍵瞬間落在 `cue`；時間照上面的表。
- **生動**：重量來自同時發生的幾個物理線索（落地壓縮回彈＋接觸陰影＋塵＋輕微震動）；職業動作要像真的（老師寫黑板：擦過的黑板帶、粉筆顆粒、粉筆灰、最後一條底線）。用字本身當道具（「門」字切兩半就是門板）。
- **不加資訊**：不加數字、讀數、標籤、圖示、別的字。輔助線條（刻度、上限線、導線）只能是動作本身的一部分，演完就退場。
- **排版優先**：只在標題自己的框（版面框＋墨跡＋約 0.15em）內畫；不碰鄰近元素。框線、導線、地板、上限線用 `lib.metrics()` 量到的真實墨跡、基線、大寫高、x 高對齊，不用 em 方框估。
- **結尾等於原版面**：每個字回到原來的位置、大小、顏色、不透明度；拆出來的複本（門板、半邊）最後要和原字完全重疊。
- **可任意跳格**：不用 `Math.random`、計時器、`requestAnimationFrame`；隨機用 `lib.rng(seed)`；畫面只由時間軸的時間決定。初始狀態用 `fromTo` 或建立時直接寫在元素上。
- `lib` 的動作（`land`、`stamp`、`halves`、`outlineFill`、`writeOn`、`roll`、`particles`、`thud`）是核可案例留下的零件：**只有選出來的真實動作剛好是那一個時才用**，不要因為有現成函式就選那個動作。

### 4. 音效（`sfx.json`）
```json
{ "key": 1.2, "cues": [{ "t": 1.2, "kind": "stamp", "align": "peak", "why": "橡皮章壓在紙上：短促、乾、帶一點紙的摩擦" }] }
```
`key` 是關鍵瞬間；至少一個 cue 落在 `key`（上面的表），每個 cue 寫 `why`（材質＋動作）。音色、參數與選法見 [references/sound.md](references/sound.md)。前提：每個聲音都要有質感（起音、主體、尾音有層次，材質貼合，節制），一個動作配一個聲音。

### 5. 檢查（每次改完都跑）
```bash
node ${CLAUDE_SKILL_DIR}/scripts/semtype.mjs check videos/_semantic-<slug>
```
和「同一頁、沒有效果」的原版面逐格比對，寫出 `check/check.json` 與 `check/sheet.jpg`（紅＝畫到框外或碰到鄰近元素，青框＝標題的框）：

| 項目 | 通過條件 |
|---|---|
| `end_matches_layout` | 最後一格等於原版面（結尾狀態就是語意且使用者已同意時，`semtype.json` 寫 `{"end": "meaning", "approved": true}`） |
| `no_neighbour_touch` | 任何一格都沒改到鄰近元素 |
| `stays_in_box` | 動作都在標題的框內 |
| `no_added_text` | 畫面上的字都是原版面已有的字（計數器經過的數字這類動作本身的字，在 `semtype.json` 寫 `transient_text` 和理由） |
| `settles_and_holds` | 有動作，且最後靜止至少 0.8 秒 |
| `sound_cue` | 有音效、音色存在、落在 key、寫了材質理由 |

檢查不過就修，不要改檢查。檢查只知道「有沒有動、有沒有出框」，不知道你畫的東西有沒有真的出現：**自己看** `check/sheet.jpg`，確認每個加上去的元素（線、門板、塵）真的畫出來、中途字沒有被裁、不像壞掉、動作讀得出來。用 canvas 畫的字檢查不到，要自己確認沒有多畫字。

### 6. 只出片段 ⏸
```bash
node ${CLAUDE_SKILL_DIR}/scripts/semtype.mjs clip videos/_semantic-<slug>
```
產出 `out/clip.mp4`（草稿畫質、含音效、約 4 秒）和 `out/stills.jpg`（動作中、關鍵瞬間、結尾），並比對實際渲染：靜止段要和檢查看到的最後一格一樣（`render_matches_check`）。渲染器會跳格、平行算，不一樣就表示效果靠「逐格依序播放」才對（在 onUpdate 之間保留狀態、依賴 callback）——改成每一格只由時間決定。傳之前先過 **video-draft-review** 的試片量測（`node <tool>/scripts/review-pack.mjs <測試底座> <測試底座>/out/clip.mp4`，再 `--check`：擋的項目見 video-draft-review 的「試片」，硬開與停住的結尾在片段裡是正常的）。用 SendUserFile 傳這兩個，附上：重點字、三個動作與選擇理由、音效材質、檢查結果、審片的 PASS 那一行。**不要渲染整支片**；只改音效時重跑 `clip` 就好。等使用者回饋。

### 7. 搬進正片（使用者同意後）
1. 把 `${CLAUDE_SKILL_DIR}/lib/semantic-type.js` 複製進那支片、在 `index.html` 載入；效果函式改成接收該場景的標題元素與時間（`at(k)`／場景起點），其餘照抄。一鏡到底的片：`make(title, key, lib)` 原封不動放進片子，初始化時對標題呼叫一次，`render(t)` 每一格呼叫 `draw(t)`；退場由片子處理。
2. 音效 cue 加進那支片的配樂 spec（`sfx`）。`key` 寫進片子的參數檔（video-motion-craft 第 3 步），cue 的時間由片子的時間軸匯出（`<tool>/scripts/timeline-events.mjs`，video-motion-craft 的 `references/sound.md` §5），不手打秒數；換算是場景起點＋`key`（一鏡到底的片：測試時間＋`--off`，就是片內時間）。
3. `node <tool>/scripts/hf.mjs check` 後，用 `node <tool>/scripts/hf.mjs snapshot videos/<片> --at <動作中>,<關鍵瞬間>,<結尾>` 看那一段，結尾要和改之前的同一格一樣；只渲染那一段給使用者看。
4. 照該片的流程跑品牌 QA、commit。

## 原則
- 正片不動：新的效果一律先在測試底座或測試複本做。
- 回饋就是規則：使用者否決某個做法時，把原話和學到的規則補進 references（rules 或 patterns 的反例），個人偏好則提議寫進品味檔。
- 參考作品只用來分析手法，不放進成片。
