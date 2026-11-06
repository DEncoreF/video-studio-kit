---
name: video-motion-craft
description: 行銷影片草稿的動態工藝（marketing-video-studio）：做或修改 HyperFrames 草稿的動畫、轉場、鏡頭、字的出現與它們的時間，或照「太快」「停太久」「節奏不對」「不夠流暢」「轉場可以再順一些」這類意見改下一版時使用，即使沒說「動畫」。界線：GSAP 的寫法查 hyperframes 的 references/runtimes.md 與 gsap-timeline，標題演出字義用 semantic-type，腳本與挑轉場手法用 video-direction，給使用者看之前的審片用 video-draft-review。
hooks:
  PreToolUse:
    - matcher: "SendUserFile"
      hooks:
        - type: command
          command: 'node "$(cd "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/video-motion-craft}" && pwd -P)/../../../scripts/hooks/draft-gate.mjs" pre'
  Stop:
    - hooks:
        - type: command
          command: 'node "$(cd "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/video-motion-craft}" && pwd -P)/../../../scripts/hooks/draft-gate.mjs" stop'
---

# video-motion-craft

規劃決定「演什麼、用哪一招」（video-direction），這裡決定「幾格、什麼曲線、停多久、落在哪一拍」，並在做的時候就量。對使用者用繁體中文。`<tool>` 是這個 skill 所屬的 repo：`realpath "${CLAUDE_SKILL_DIR}/../../.."`。

這個 skill 靠四樣東西，不靠記住文字：

0. **參考板**：`direction/refboard/BOARD.md` 與每一拍、每個接縫的圖（video-direction 第 5 步用 `refs.mjs board` 產生）。每一拍照它的「借什麼」做、「別抄」的不做；沒有參考板或主角拍沒綁參考，先回 video-direction 補，不要憑規則自己發明。
1. **範例**：使用者核可與退回過的片段，`node <tool>/scripts/exemplar.mjs list`。品味（「俐落」「不死板」「有質感」）看範例學，不從規則推。
2. **量測**：下面這張表裡 ⛔ 的項目，審片關卡在成片上量，不合就不能給使用者看；量得到的就交給程式，不用背。
3. **程式**：`<tool>/library/motion/ruler-ease.js`（`RulerEase`）、`beat.js`（`Beat.make(bpm, offset)`）、`library/morphs/*.js`，以及範例附的 `code.*`。能重用就不重寫。

## 數字

數字只放在 `<tool>/library/rules/motion.json`，這張表由 `node <tool>/scripts/rules.mjs --write` 產生，不要手改；要改數字就改那個檔，腳本和這張表一起變。⛔ 擋下、⚠ 只提醒、沒有記號的是方向（沒有量測，靠讀點表、範例與審片）。和 hyperframes 的「快的動作 0.3–0.6 秒」衝突時，介面元件與主角的變形以這裡為準（那句說的是整個畫面的鏡頭與大字進場）。轉場種類與次數歸 video-direction 的 [transitions.md](../video-direction/references/transitions.md)。

<!-- rules:motion -->
| 項目 | 數字 | 誰量 |
|---|---|---|
| ⛔ 讀點最短時間 | 字：大 max(1.2, 字數 ÷ 6 + 0.6) 秒，小字 max(1.2, 字數 ÷ 4.5 + 0.9) 秒；英文照詞數，大字一行 max(1, 0.8 + 0.08 × 詞數)、小字 max(1.8, 0.9 + 0.15 × 詞數)。畫面：大 0.6、小 1 秒。動作：落定（`act`）後意思停 大 0.5、小 0.8 秒 | script-lint、`read-short` |
| ⛔ 重要讀點不重疊 | 容許 1 格。標題先讀完、動作再開始，或動作先落定、標題再進來 | `read-overlap` |
| ⛔ 停太久 | 一拍最後一個讀點看完，1.2 秒內要有下一個變化（最後一拍 2.2 秒）；沒有讀點的平靜超過 3 秒提醒；同一個構圖（兩次大動作之間：鏡頭、換場、主體移動，動態量 ≥ 2.5）超過 3.2 秒擋（片尾那一段不算） | `hold-long`、`dead-hold`、`static-shot` |
| ⛔ 開場與片尾 | 從暗或白淡入 0.3–0.6 秒，或第一格就在動；第一件事推近到 1080p 讀得清楚（字 ≥ 32 px）標題才進來。最後一個讀點離片尾 ≥ 1 秒，最後 0.5–1.0 秒淡出；結尾靜止不超過 0.5 秒 | `hard-open`、`hard-close`、`last-read-late`、`frozen-tail` |
| ⛔ 節拍 | 打點與接縫在拍點 ±3 格。開場、結尾和 `major: true`／`bar: true` 的接縫，峰值離拍超過 0.1 秒擋下（`bar` 還要在小節線上）；其他接縫只提醒 | beat-check、`seam-beat`、`seam-bar` |
| ⛔ 流暢 | 60 fps；主體停 ≥ 3 格算頓點（1–2 格提醒）；不一格跳到別的狀態再長回來；不閃格；停留時構圖不漂移、不呼吸、鏡頭不晃，有意義的小事件可以繼續長 | `stutter`、`snap`、`flash` |
| ⛔ 交棒 | 拍與拍之間一個快而果斷的動作（硬切、條狀掃過、甩鏡、色塊淹沒、推進）打在拍上；唯一禁用溶接（新舊半透明疊在一起），同一格不出現新舊兩組字 | `seam-dissolve` |
| ⛔ 聲音 | 成片整體 -14 LUFS ±1、真峰值 ≤ -1 dBTP；比前 1.5 秒中位數高 ≥ 5 LU 的躍升提醒（主角重音以外不要有）。沒有音軌的正片提醒；試片只擋真峰值 | `loudness`、`true-peak`、`loud-jump`、`no-audio` |
| ⚠ 接縫的速度 | 接縫前 0.3–0.5 秒慢到幾乎停 → 起步 9–10 格 → 高速段 12–16 格 → 圓肩轉進 0.5–0.7 秒的煞車；峰值是周圍的 2 倍以上，加動態模糊；換亮度分 5–7 格 | `seam-contrast` |
| 動作要快 | 介面彈簧 90% 在 10–14 格、停穩 13–20 格；長距離 90% 在 17 格；變形 8–30 格。動作本身超過 1 秒（材質變形 2.8 秒）就太慢；逐字打只打前 12 字 | `RulerEase`、script-lint（提醒） |
| 變形後停留 | 新狀態至少停約 1.5 秒，帶字更久；大字連副標約 2.5 秒；只是過場的狀態 6–10 格 | 讀點表 |
| 能量 | 3 秒內 hook；一階一階爬；最密在片長 30%–60%；最大高峰在 75%–90%（方向，不是硬規定）；超過 2 小節沒有新事件提醒；段落交界至少改兩樣（景別、速度、緩動、密度、底色） | `energy-sag`、審片包 energy.txt |
| 字 | 一次一個 1–4 字的片段；字和畫面輪流；讀字時畫面不快動；每 10 秒至少 1.5 秒無字；大字只在畫面說不出時才有 | 讀點表 |
| 主次與鏡頭 | 每格一個主角，次要動作走主角距離的 50–75%、晚 100–200 毫秒出發、2 格內一起停。鏡頭是標點：看得清就不動，快推只給重音，推進去要拉出來 | reads-and-beat.md §6、transition-ruler.md §2 |
| 點擊與音效 | 先逐動作排音效（`sound-sheet` 審片頁給使用者勾），一個動作一個聲音、文字與鏡頭不配聲；點擊一聲柔和的真實點擊，峰值高出音樂底 7–10 dB 為起點、不推到限幅器；起音落在那一格到晚 1 格；cue 從 `timeline-events` 匯出，不手打 | sound.md §1、§5 |
| 緩動與參數 | 約 3 種命名的緩動（frame.md 的 `## Motion`），不用對稱的軟緩動 0.6–0.8 秒；每支片的時間、緩動、停留放在一個參數檔，回饋對到一個值 | 第 3 步 |
<!-- /rules:motion -->

## 做一版草稿

1. **先看參考板、範例和這支片的計畫**：做哪一拍就先開 `direction/refboard/` 裡那一拍的圖和 BOARD.md 那一節；`exemplar.mjs list --kind <seam|text|camera|hold|ui|open|close>` 找這一版要做的那幾類，核可的和退回的都打開 `strip.jpg` 看（要動態看 `clip.mp4`）；有 `code.*` 的直接拿來改參數。然後讀 `direction/ruler.md`、`direction/script.json`（讀點、接縫）、`build/sections.json`（BPM 與第一個重拍）。沒有讀點表就先寫（[reads-and-beat.md](references/reads-and-beat.md) §1）；讀點塞不進一拍，就加長這一拍或刪讀點，不壓縮讀點。使用者要驚艷的片子，先照 video-direction 的 [finish-layers.md](../video-direction/references/finish-layers.md) 做 10–12 秒質感試片和尺並排比。
2. **元件的來源依序是**：自己的範例 → HyperFrames 登錄庫（`npx hyperframes catalog --query "<動作，英文>" --json`，約 450 個，裝進來改成 frame.md 的外觀）→ 都不行才自己寫，並 `npx hyperframes feedback --search-miss` 回報。試片的 NOTES 寫出每一拍用了哪一個。使用者：「先進行遴選取用，若無法達成效果在嘗試自己做」。
3. **每拍先渲一格**：關鍵姿勢先做，`node <tool>/scripts/measure/seek.mjs <片> <前綴> <t,t,…>` 截靜圖排成一張；單看靜圖讀得懂才補中間的動作、才跑整支。
4. **時間掛在同一個脈搏、數字放在一個參數檔**：接縫、打點用 `Beat` 算，大變化放在小節線。這支片的時間、緩動、停留都放在一個參數檔（例如 `assets/js/params.js`），程式只讀名字：
   ```js
   export const P = { ease: { out: RulerEase.bez(.16,1,.3,1), exit: RulerEase.bez(.7,0,.84,0) }, beats: { hook: 0, sign: 4 }, hold: { sign: 2.0 }, anticipation: { stamp: 4 } };
   ```
   緩動要是函式或 GSAP 的名稱：GSAP 讀不懂 `"cubic-bezier(…)"` 字串，會悄悄改用預設的 power1.out，等於沒設定（有一支片的第 5 段就這樣，量測 `ease-unknown` 擋）。改停留時後面的事件跟著順延，不壓縮別的拍。
5. **動作快、意思停、交棒乾淨**：動作照 `RulerEase`；一格一個主角；拍與拍之間一個果斷的動作打在拍上，交棒後停留要乾淨；一鏡到底是一種方法，不是預設。細節在 [transition-ruler.md](references/transition-ruler.md)。
6. **render 60 fps，跑審片包**：`node <tool>/scripts/review-pack.mjs videos/<slug> videos/<slug>/renders/draft-N.mp4 --out videos/<slug>/review-draft-N`（它會一併跑 script-lint 與 beat-check）。FAIL 先修。只改一段時，先 render 那一段當試片（`videos/<專案>/tests/_<名稱>`）。
7. **讀點表照成片改**：看審片包的 `timing.txt`，把 `t0`、`t1` 改成成片實際的時間，再交給 **video-draft-review**；過了才給使用者看。
8. **填審片包的 `MOTION.md`（每一版）**：見下一節。

## 每一版的動態檢查

這個 skill 不是載入一次就有效：一支片一個 session 使用者問了 8 次「有跑 motion skill 嗎」，每次跑都查出真問題，因為我後來都憑記憶在做。所以它併進審片關卡，每一版 `review-pack` 都會產生 `MOTION.md`，正片和試片都一樣。不要憑記憶填，**打開裡面列的東西再答**：

- **§1 程式查過的**：緩動、參數檔、`Beat`、`RulerEase`、主角時刻（拍或讀點加 `hero: true`）有沒有比周圍弱。
- **§2 還沒處理的提醒**：一種一條。修得掉就修掉重 render，留著就寫理由。提醒不是可以略過的東西：有一支片的第 5 段跑之前有 16 項，跑完剩 9 項。
- **§3 使用者核可與退回的範例**：04 那一拍就是沒翻這裡，錯過了幾乎同義的 `ui-944a012c`。
- **§4 回答**：`範例`、`元件`（`--check` 核對名稱存在）、`最弱處`（要有秒數）、`另一種表達`（不同的做法，不是微調）。

過了之後，`--check` 印出的「動態檢查」那一行要貼進回報，使用者不該需要問。

**不用填的**：campaign 還在挑的候選（`campaign.mjs render` 會用 `--check --candidate`），和放在 `direction/` 或 `candidates/` 底下的東西。選定之後的下一版起就要填。選定版本做成預覽（接片、半速特寫）要先 `review-pack.mjs --link <預覽> <試片>/review`，不然送不出去。

## 照使用者的意見改

使用者給的是品味，不是規格。先翻成量得到的症狀，在 `timing.txt` 和審片包找到那一段，修完用同一個量法確認數字動了。

| 使用者說 | 先看 | 通常的修法 |
|---|---|---|
| 「太快」「看不清楚」 | `read-short`、讀點靜圖 | 加長這一拍、把下一個動作往後放；不是把動作放慢 |
| 「停太久」 | `hold-long`、`dead-hold` | 把下一個接縫提前或刪掉多的停留；不靠慢推撐，讓有意義的小事件繼續長 |
| 「拆解可以快一點」 | lint 的「動作本身 … 秒」 | 壓到 8–30 格，省下的時間給意思停 |
| 「節奏不對」 | `seam-beat`、`hit-beat`、`loose-spike` | `Beat.snap` 對齊，或提前半拍起動、在拍點落定 |
| 「過場可以再強烈／完整」 | `seam-contrast`、seams/ 逐格表 | 慢 → 爆衝 → 滑停，前一個狀態落地再交棒 |
| 「不流暢」「一頓一頓」 | `stutter`、fps | 子步驟重疊（上一步約 80% 時開始）、60 fps |
| 「畫面在震」 | 逐格表、crops/ | 有圖案的陰影或玻璃複本在字上滑、來回的呼吸 |
| 「轉場可以再順一些」 | seams/ 逐格表 | 起步 9–10 格、高速段 12–16 格、圓肩轉進煞車 |
| 「第一個畫面看不出在講什麼」 | reads/ 第一張 | 推近到第一件事在 1080p 讀得清楚，標題晚到 |
| 「點擊聲太高頻」「聽不到」 | 分軌的「高出音樂底」 | 見 [sound.md](references/sound.md) |
| 「音效太亂」「有些沒有音效、有些不適合」 | `sound-sheet` 審片頁（每個音效、沒聲音的動作、疑點） | 逐動作重排、一個動作一個聲音，給使用者勾（[sound.md](references/sound.md) §1） |
| 「換場音效切得太突然」 | 審片頁的「結尾被剪斷」「漸強壓在別人身上」 | 留完整餘音，不剪漸強（sound.md §3） |

一輪只改一個變數。**同一個問題修兩輪還不行，就停止微調**：開一個 campaign（`<tool>/scripts/campaign.mjs`，見 video-direction 第 5 步）同時做 2–3 種不同的做法讓使用者挑，或回報這一拍該改用素材或外包（video-direction 的 [capabilities.md](../video-direction/references/capabilities.md)）。回報照參數檔的名字寫：「`hold.sign` 1.2 → 2.0 秒，後面順延 0.8 秒」，附量到的前後數字。

## 使用者給了判斷之後

每一則核可或退回，依序問三個問題，**不要直接把原話加成一條新規則**：

1. **能量嗎？** 能就改 `library/rules/motion.json` 的值或在 `review-pack.mjs` 加一個量測與測試，下一次在給使用者看之前就被擋下。
2. **看得到嗎？** 是對某一段動態的判斷（「這個轉場很好」「太死板」），就把那一段記成範例（campaign 的 `pick` 會自動把贏的和輸的都記下來）：
   ```bash
   node <tool>/scripts/exemplar.mjs add videos/<slug>/renders/draft-N.mp4 --at 12.3-14.1 --kind seam \
     --verdict keep --why "甩鏡帶模糊、打在拍上" --quote "使用者原話" --code videos/<slug>/assets/js/whip.js
   ```
   退回的也記（`--verdict reject`），一個好的配一個壞的最好學。
3. **都不是**：寫一行到 `${CLAUDE_SKILL_DIR}/FEEDBACK.md`（`日期｜情境｜原話｜應改成`）。每支片做完整理一次：能量的變成量測、看得到的補成範例、只適用那支片的移到那支片的 BRIEF，然後從 FEEDBACK.md 刪掉。

## references

| 要做的事 | 讀這份 |
|---|---|
| 寫或改 `script.json` 的 `reads`、`seams`；一拍給多久、眼睛怎麼帶、開場與結尾 | [reads-and-beat.md](references/reads-and-beat.md) |
| 變形、轉場、鏡頭、介面元件的長度與緩動；流暢度 | [transition-ruler.md](references/transition-ruler.md) |
| 摺紙飛機、翻牌、燈箱、捲起再攤開 | [material-morphs.md](references/material-morphs.md) |
| 音效：逐動作排音效、一支片一組聲音、長的聲音、音量、同步、素材（都是起點，照片子的尺與聲音計畫調） | [sound.md](references/sound.md) |
| 兩版之間沒有使用者在場：重製尺裡最好的 3 秒 | [practice.md](references/practice.md) |
