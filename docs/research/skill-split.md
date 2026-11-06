# 拆出「動態工藝」與「草稿審片」兩個 skill：研究與提案

2026-10-25。背景：工藝規則（讀點、停留、接縫、節拍、流暢度）都寫在 `video-direction` 裡，但做草稿時沒有被套用，使用者一直用眼睛抓到「太快」「停太久」「接縫不完整」「節奏不對」。使用者已同意在規則寫完後拆出兩個 skill：做草稿時用的**動態工藝**，和每版給使用者看之前必過的**草稿審片**。這份是拆之前的研究。

> 這份只是研究與提案，沒有改任何 skill。另一個 agent 正在加 `references/animation-craft.md`、script-lint 讀點檢查、`library/motion/beat.js`、`scripts/measure/beat-check.mjs`、`scripts/review-pack.mjs`；下面講到要搬或要改的，都等那批 commit 完成後再做。

> 2026-10-30 補記：上游 #5651 已退役 `hyperframes-animation` 等子 skill 與流程 skill。GSAP 與 seek-safe 寫法現在在 `hyperframes` 的 `references/runtimes.md`，動態在 `motion.md`，審片在 `review.md`（取代 `review-loop.md`／`production-loop.md`）。下面第 12 點記的是當時讀到的版本；界線表與觸發測試已改成新位置。上游也不再讀 BRIEF.md，下文「在 BRIEF.md 寫一句」的交接改寫在 `SPEC.md` 開頭（video-direction 的 `references/handoff.md`）。

---

## 一、發現

### A. Anthropic 官方的 skill 寫法

1. **description 決定會不會被叫到，而且是唯一的依據。**
   - 啟動時只把每個 skill 的 `name` 和 `description` 放進 system prompt（每個約 100 token）；觸發後才讀 SKILL.md，再按需要讀其他檔。
   - description 要同時寫「做什麼」和「什麼時候用」，用第三人稱。
   - 硬限制：`name` ≤ 64 字元，只能用小寫、數字、連字號；`description` ≤ 1,024 字元。
   - 來源：https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview 、https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
   - **我們的現況**：`video-direction` 的 description 有 1,270 字元，超過 Agent Skills 規格的 1,024。Claude Code 的上限是 1,536，所以現在還能用，但已經不合規格。
2. **Claude Code 的 description 預算。**
   - `description` 加 `when_to_use` 在清單裡最多 1,536 字元，超過就截掉，所以最重要的用途要寫在最前面。
   - 所有 skill 的清單總共只佔 context 的約 1%。超過時，最少用的 skill 的 description 會先被拿掉。
   - 這個工具包裡有 30 多個 skill（含上游的 hyperframes、gsap），新 skill 的 description 要短、要準。
   - 來源：https://code.claude.com/docs/en/skills （“Skill descriptions are cut short”）
3. **漸進揭露的寫法。**
   - SKILL.md 本文少於 500 行，接近時就拆檔。
   - 參考檔只從 SKILL.md 往下連一層，不要 A 連 B 再連 C：Claude 遇到巢狀連結常常只 `head` 一部分。
   - 超過 100 行的參考檔，開頭放目錄（skill-creator 的標準是 300 行）。
   - 互斥或很少一起用的內容放在不同路徑。
   - 來源：best-practices（同上）、https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills 、https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md
4. **references 和 scripts 的分工。**
   - 腳本是「執行，不讀」：程式碼不進 context，只有輸出進來。比叫 Claude 自己寫驗證可靠、省 token、每次一致。
   - 指示裡要寫清楚是「跑這個」還是「讀這個當參考」。
   - 品質關鍵的流程要有回饋迴圈：跑驗證、修、再跑，**驗證過了才往下**。
   - 要有「可驗證的中間產物」（先寫計畫檔、用腳本驗證、再執行），錯誤訊息要具體到能直接修。
   - 自由度照風險調整：窄橋（容易出錯、要一致）就給固定腳本和固定指令；開闊地（要靠判斷）才給文字原則。
   - 來源：best-practices（Degrees of freedom、Implement feedback loops、Create verifiable intermediate outputs）
5. **什麼時候拆 skill、什麼時候合。**
   - 官方沒有一條「拆或合」的規則，但有三個判準：
     - 內容互斥或很少一起用，就分開放；
     - SKILL.md 變得難以管理就拆；
     - description 要窄到不會誤觸發、寬到不會漏掉。
   - Anthropic 把 skill 分成兩種：「能力提升」（教模型不會的技巧）和「流程偏好」（把模型會做的步驟照團隊流程排好，例如 NDA 審查清單）。後者比較耐用，但只有在符合真實流程時才有用。
     - 動態工藝偏前者（尺的數字、手法）；
     - 草稿審片是後者（關卡、清單）。
     - 性質不同，正好支持拆開。
   - 來源：https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills 、engineering blog（同上）
6. **skill 怎麼互相呼叫、怎麼排順序。**
   - 官方沒有「skill 呼叫 skill」的機制。實際做法有四種：
     - SKILL.md 裡寫「接著用 /xxx」（我們現在的做法）；
     - 使用者在一則訊息裡疊最多六個 `/skill`；
     - 自訂 subagent 用 `skills:` 欄位預先載入 skill；
     - `context: fork` 讓 skill 在獨立的 subagent 裡跑。它看不到對話紀錄，只適合有明確任務的 skill。
   - 來源：https://code.claude.com/docs/en/skills
7. **skill 只在叫到的那一刻進 context，之後不會重讀。**
   - 自動壓縮後，每個 skill 只保留最近一次呼叫的前 5,000 token，全部 skill 共用 25,000 token。
   - 官方對「Claude 一開始照著做、後來就不照做」的建議原話是：**每次都必須成立的規則，搬進 hook**。hook 每次事件都會跑，不管 Claude 有沒有在照 skill 做。
   - 這正是我們的問題：規則在 `video-direction` 裡，做草稿時這個 skill 早就被叫過、甚至被壓縮掉了。
   - 來源：https://code.claude.com/docs/en/skills （“Skill content lifecycle”、“Claude stops following a skill”）
8. **`paths` 欄位：碰到特定檔案就自動載入。**
   - 官方說明：設了 `paths`，Claude 只在處理符合樣式的檔案時才自動載入這個 skill；樣式相對於目前的工作資料夾。
   - 動態工藝可以設成影片合成檔（例如 `videos/**/films/**/index.html`），在做草稿時被帶進來，而不只靠 description 被想起來。
   - 實際行為要用觸發測試確認（見「未決問題」）。
   - 來源：https://code.claude.com/docs/en/skills （frontmatter 的 `paths`）
9. **怎麼避免觸發重疊、怎麼測。**
   - 約 20 個測試句：8–10 個應該觸發、8–10 個不應觸發。
   - 不應觸發的要是「近似但不該用」的句子：用到同樣的詞，其實該用別的 skill。
   - 每句跑 3 次，觸發率門檻 0.5；60% 拿來改寫，40% 留著驗證。
   - 改寫不要塞進失敗句的關鍵字（會過度擬合），而是寫清楚和相鄰 skill 的界線。大約五輪就夠。
   - 偵測方式：`claude -p "<句子>" --output-format json`，看有沒有 `Skill` 工具呼叫。
   - 太簡單的一步任務可能本來就不會觸發，所以測試句要像真的工作。
   - skill-creator 建議 description 寫得「有點強勢」，因為 Claude 傾向少用 skill。
   - 來源：https://agentskills.io/skill-creation/optimizing-descriptions 、skill-creator SKILL.md
10. **評估 skill 的品質。**
    - 每個案例跑兩次，一次有 skill、一次沒有（或用舊版當基準），每次都從乾淨的 context 開始。
    - 每條斷言記 PASS／FAIL **和證據**，「沒有具體證據就不給 PASS」。
    - 兩種斷言要拿掉或修好：兩邊都一定過的（測不出 skill 的價值），和兩邊都一定不過的。
    - 先做 2–3 個案例，看過第一輪再加斷言。
    - Anthropic 用這套流程調 description，6 個公開 skill 裡有 5 個的觸發率變好。
    - 來源：https://agentskills.io/skill-creation/evaluating-skills 、skill-creator 公告（同上）

### B. 實際的多 skill 套件怎麼分「做」與「審」

11. **Remotion**：12 個 `remotion-*` skill，依主題分（markup、captions、maps、render…）。`remotion-best-practices` 是總入口，沒有審查或驗證 skill。
    - 拆法是**依領域**，不是依流程階段。
    - 來源：https://github.com/remotion-dev/skills 、https://remotion.dev/skills
12. **HyperFrames（上游）**：`/hyperframes` 是路由。審片寫在 `hyperframes/references/review-loop.md`，分四關：計畫用文字、版面用靜圖、成品用影片，最後在 Studio 預覽後才 render。
    - 驗證（`production-loop.md` 的 Verify）只有 `lint`、`check` 和一張總覽圖，**沒有節奏、停留、接縫的量測**。
    - `hyperframes-animation` 有 `animation-map.mjs`，可以查死區、錯開不一致，但它是寫完後的稽核工具，不是關卡。
    - 來源：https://github.com/heygen-com/hyperframes ，以及本機 `.claude/skills/hyperframes/references/review-loop.md`、`production-loop.md`、`hyperframes-animation/SKILL.md`
13. **Claude Code 的 code-review 外掛**：4 個 agent 平行審（兩個查 CLAUDE.md 規範、一個找 bug、一個看 git 歷史），每個問題 0–100 打信心分數，**低於 80 不報**。
    - 每個問題都要附出處和程式碼行號，並排除既有問題、挑剔、linter 會抓的問題。
    - 重點：審的人和寫的人分開；每條意見要有證據；有門檻，噪音少。
    - 來源：https://github.com/anthropics/claude-code/tree/main/plugins/code-review
14. **obra/superpowers**：流程依序是 brainstorming → writing-plans → executing → TDD → requesting-code-review → finishing，每個 skill 寫明什麼時候啟動。
    - `verification-before-completion` 的規則是**先證據、後宣稱**：先找出能證明的指令，重跑一次，讀完整輸出和結束代碼，才可以說完成，並且引用輸出。
    - 它列出常見的藉口，逐條反駁，例如「我有信心」→「信心不是證據」、「agent 說成功了」→ 自己驗。
    - `requesting-code-review` 派一個**全新 context** 的 reviewer subagent，只給 diff 和需求，不給對話紀錄。問題分 Critical／Important／Minor，前兩級要修完才能往下。
    - 來源：https://raw.githubusercontent.com/obra/superpowers/main/skills/verification-before-completion/SKILL.md 、https://raw.githubusercontent.com/obra/superpowers/main/skills/requesting-code-review/SKILL.md 、https://github.com/obra/superpowers
15. **本機的 Codex 外掛**（`~/.claude/plugins/marketplaces/openai-codex/plugins/codex/`）就是一個實際運作的 **Stop hook 關卡**。
    - 每次 Claude 要結束回合時，`stop-review-gate-hook.mjs` 把 `last_assistant_message` 交給另一個模型審。
    - 回覆第一行必須是 `ALLOW:` 或 `BLOCK:`；這一回合沒有改程式就直接放行。
    - 逾時設 900 秒，代價是每回合都要等。
16. **我們自己的 video-brand-qa** 已經是「唯讀、fail closed、結束代碼 0／1／2、目視紀錄綁內容指紋」的關卡：`qa-review.json` 綁 digest，內容一改舊紀錄就失效。豁免只限技術項目，而且要使用者核可。
    - 草稿審片可以直接沿用這套。
    - 現在的 `review-pack.mjs --check` 只檢查格子勾了、「答：」不是空的，**沒有綁到哪一版 render**，也不要求證據，所以全部打勾就能過。

### C. 動畫與動態設計工作室怎麼審片

17. **Dailies（每日審片）的結構**。
    - 送審的人要附**具體的問題**（例如「這個接觸姿勢的重心轉移讀得出來嗎？」），不要只問「有意見嗎」。
    - 已知問題先寫在版本備註裡，不浪費審片時間。
    - 主管事先看過，依問題大小與期限排順序，並公布每個鏡頭的時間預算。
    - 只有一個人下判斷；每條意見綁時間碼與截圖，當場記錄、當天進追蹤系統。
    - 意見會改變鏡頭狀態（等核可 → 重做），標成完成前一直算未解決。
    - 技術問題（rig、貼圖、閃爍）不准進導演的審片，導演只看表演與調度。
    - 來源：https://blog.cg-wire.com/manage-dailies
    - **對應到我們**：技術檢查（跳格、頓點、拍點偏差、凍結結尾）要在給使用者看之前由腳本擋掉；使用者只該看到品味層的問題。
18. **先 blocking 核可，才補中間格**。
    - 動畫先用 stepped keys 擺關鍵姿勢（blocking），導演核可才 spline、polish，才補中間格和次要動作。
    - 交件前檢查影格率、最新版、資產已更新、首尾格適合動態模糊。
    - 來源：https://studio.blender.org/tools/artist-guide/shot-production/animation 、https://remote-handbook.voronezh.studio/en/docs/pipeline/stage-work
    - **對應到我們**：animation-craft.md §8「先擺關鍵姿勢，靜圖過了才補中間」，就是 blocking 關卡。可以做成審片包的一層：讀點起訖的靜圖先過，才看動態。
19. **Timing chart 與 spacing**。
    - timing chart 是一條線：起訖是關鍵格，每一短刻線是一張畫。
    - spacing（每格移動多少）和 timing（每張停幾格）一起決定感覺：中間格靠近某一張關鍵格，動作就在那一端緩入或緩出，不會像機器。
    - 來源：https://animost.com/tutorials/animation-timing-chart/
    - **對應到我們**：`motion-profile.py` 量出的每格動態量，就是成片的 timing／spacing chart，可以拿來和 `script.json` 計畫的讀點並排。「停太久」「太快」這兩種意見，都可以在這張圖上量出來。
20. **一種成品，回答一個問題**。
    - 審片的成品各回答一個問題：靜圖看構圖、短片段看動態、總覽表看重複、編碼後的檔案看交件。
    - 先全速看一次整支，再逐格看標了時間的問題，最後用交件設定輸出再看一次。
    - 每個問題記：PASS／FAIL／N/A、時間碼、證據、修法、核可人。
    - 來源：https://hermes-ai.net/cases/video/guides/motion-engineering/ 、https://magichour.ai/blog/ai-video-quality-assurance-checklist
    - **對應到我們**：這就是 review-pack 的三種尺度（總覽表、逐格表、全解析度），方向是對的。
21. **可以拿來檢查的數字**。
    - **Material 3**：
      - 時長 token 從 50 ms 到 1000 ms，每 50 ms 一級：short1–4 是 50–200、medium1–4 是 250–400、long1–4 是 450–600、extralong1–4 是 700–1000；
      - 緩動：standard `cubic-bezier(0.2, 0, 0, 1)`、emphasizedDecelerate `(0.05, 0.7, 0.1, 1)`、emphasizedAccelerate `(0.3, 0, 0.8, 0.15)`；
      - 來源：https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter/lib/src/material/motion.dart （Material 3 token 產生的程式碼，連到 https://m3.material.io/styles/motion/easing-and-duration/tokens-specs ）。
    - **Apple**：
      - HIG：動態要有目的、簡短精準，不要只靠動態傳達重要資訊，持續的擺動避開約 0.2 Hz；
      - WWDC23：彈簧只用 duration 與 bounce 兩個參數。bounce 0 平滑，約 0.15 尾巴俐落，約 0.3 開始看得出彈；UI 不要超過約 0.4。彈簧保留速度，中途改目標不會頓。
      - 來源：https://developer.apple.com/design/human-interface-guidelines/motion 、https://developer.apple.com/videos/play/wwdc2023/10158/
    - **Netflix 繁中字幕**：成人每秒最多 9 字、兒童 7 字，每行 16 字。我們 script-craft §6 的字的預算是每秒 4.5 字，約是它的一半，符合「行銷片要讀得了兩遍」。9 字可以當硬上限。
      - 來源：https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Traditional-Chinese-Timed-Text-Style-Guide
    - **注意**：Material 和 Apple 是 UI 的數字，不是影片的數字。我們 `transitions.md` 實測的尺（介面彈簧 90% 在 0.17–0.23 秒）和 Material 的 short4／medium1 同一個量級，可以互相印證。但影片的停留、片尾、接縫的速度對比，要以我們自己量的尺為準。

### D. 讓關卡真的會跑

22. **Claude Code hooks 的機制**（https://code.claude.com/docs/en/hooks ）：
    - **PreToolUse**：工具執行前跑，可以用 matcher 只看某個工具。`permissionDecision: "deny"` 加理由就擋住；`exit 2` 也會擋，stderr 當理由。
      - 想當政策用，一定要 `exit 2`。`exit 1` 不會擋：官方原話是 “If your hook is meant to enforce a policy, use `exit 2`”。
    - **Stop**：Claude 要結束回合時跑，收到 `last_assistant_message` 和 `stop_hook_active`。`decision: "block"` 或 `exit 2` 讓 Claude 繼續做。
      - `stop_hook_active` 是 true 時表示已經在被 hook 推著繼續，要自己判斷，避免條件永遠達不到而卡住。
      - 連續被擋 8 次後會強制結束（`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`）。
    - **prompt／agent hook**：讓模型判斷 `{ok: true|false, reason}`，預設逾時 30 秒／60 秒。agent hook 還是實驗功能。
    - **skill 的 frontmatter 可以帶 `hooks`**：skill 被叫到時註冊，到 session 結束都有效。`once: true` 只跑一次。
      - **缺點**：skill 沒被叫到，hook 就不存在。
    - **settings 裡的 hook**（使用者層或專案層）每個 session 都在，但這是「持續的設定」，改之前要問使用者。
23. **使用者自己已經有一個 hook**：`~/.claude/tools/skill-audit/skill_hint_hook.py`（UserPromptSubmit）。訊息命中某個 skill 的高信心特徵、而且這個 session 還沒叫過那個 skill 時，就提示 Claude。
    - 它寫明解決的問題是「長對話中途接續工作時不會重新檢視 skill」，和我們的問題同一類。新 skill 可以加進它的特徵表，不必另寫一個。

---

## 二、提案

### 1. 兩個 skill 的名字與範圍

官方建議名字用動名詞，但更重要的是**整套一致**。現有的是 `video-direction`、`video-assets`、`video-brand-qa`、`semantic-type`，所以用：

| skill | 一句話 | 什麼時候用 |
|---|---|---|
| `video-motion-craft` | 做草稿時的動態工藝：讀點與停留、接縫怎麼交棒、轉場尺的數字、節拍、流暢度、文字出現與停留的時間 | 在 marketing-video-studio 做或改 HyperFrames 草稿的動畫、轉場、變形、字的時間時；使用者說「太快」「停太久」「過場不完整」「節奏不對」「不流暢」「在震」時 |
| `video-draft-review` | 每一版草稿給使用者看之前的關卡：產生審片包、量節奏與停留、逐格看接縫、填有證據的清單，過了才能送 | 任何草稿、預覽片段、轉場試片要給使用者看之前；使用者問「可以給我看了嗎」「先自己檢查一輪」時 |

**description 草稿**（短，約 450–550 字元，最重要的放最前面；要再用觸發測試調）：

- `video-motion-craft`：
  > 行銷影片草稿的動態工藝（marketing-video-studio）：做或修改 HyperFrames 合成的動畫、變形、轉場、鏡頭運動與文字出現時，用實測的尺決定時間——每個讀點給多久、變形後停多久、接縫怎麼交棒（慢→爆衝→滑停）、落在拍上與小節線、60 fps 不頓不震、開場與結尾也是接縫。使用者說「太快」「停太久」「過場不完整」「節奏不對」「不夠流暢」「畫面在震」，或要調整某一段的時間與緩動時都用。GSAP／Lottie／Three.js 的寫法用 hyperframes-animation；標題要演出字義用 semantic-type；腳本、分鏡、選轉場手法用 video-direction。Motion timing craft for marketing-film drafts.
- `video-draft-review`：
  > 草稿審片關卡（marketing-video-studio）：每一版草稿、預覽片段或轉場試片給使用者看之前都要先過——跑 review-pack 產生三種尺度的審片包與節奏量測，看總覽表、接縫逐格表與讀點靜圖，填完附證據（影格、秒數）的清單，--check 結束代碼 0 才可以送。只審不改；問題寫成意見清單交回修改。使用者說「做好了給我看」「先自己檢查一輪」「可以送了嗎」，或 render 完 draft 準備傳給使用者時都用。品牌、禁用詞、授權與正式版前的驗證用 video-brand-qa。Mandatory pre-show draft review gate.

### 2. 和相鄰 skill 的界線

| 相鄰 skill | 它管 | 新 skill 管 | 界線寫在哪 |
|---|---|---|---|
| `video-direction` | 規劃：訪談、參考與尺（`ruler.md`）、腳本、分鏡、接縫表、**選**轉場手法、交接 BRIEF | motion-craft：**怎麼做到**尺上的數字。draft-review：每版的審片 | video-direction 第 5、7 步改成連到 motion-craft 的參考檔；「給使用者看之前」那一節整段換成「用 /video-draft-review」 |
| `semantic-type` | 一個標題用一個物理動作演出字義，在測試底座做，有自己的 `semtype check` | motion-craft 管一般的字：出現、停留、讀的預算、和證據不疊 | motion-craft 的 description 點名「演出字義用 semantic-type」。semantic-type 的 4 秒片段送出前，draft-review 只跑輕量版（見未決問題 4） |
| `hyperframes` 的 `references/runtimes.md`（上游；原 `hyperframes-animation`） | 怎麼寫：runtime API、seek 協定、可跳格 | motion-craft 管該是什麼感覺、幾格、怎麼量 | **不改上游**（會被更新覆蓋），界線只寫在我們的 description 和 SKILL.md 開頭：「API 與 seek-safe 寫法查 hyperframes 的 runtimes.md，數字以本 skill 為準」。這和 transitions.md 現在寫的「優先於 hyperframes `motion.md`」一致 |
| `video-brand-qa` | 定版前的品牌與品質驗證：禁用詞、價格、字型、色彩、授權，fail closed，產出 QA.md | draft-review 管每一版草稿的工藝與節奏，不管品牌 | 兩邊都是唯讀關卡，順序是 draft-review（每版）→ 使用者核可 → brand-qa（定版前）。draft-review 沿用 brand-qa 的指紋綁定與豁免規則，但不重複它的檢查 |
| `hyperframes` 的 review-loop | 上游的計畫、草圖、成品三關與 Studio 預覽 | draft-review 插在「成品」那一關之前 | 寫在 draft-review 的 SKILL.md：上游的 Verify（lint、check）通過後才跑 draft-review |

### 3. 參考檔怎麼搬

原則：**一份內容只有一個主人**。別的 skill 用相對路徑直接連到那一份，不複製。每個 skill 的參考檔都只從自己的 SKILL.md 連一層。

| 現在的檔（video-direction/references/） | 搬到 | video-direction 留什麼 |
|---|---|---|
| `animation-craft.md` §1–6、§8–10（讀點、帶眼睛、快動作慢意思、先因後果、伏筆、動畫原則、關鍵姿勢、脈搏、開場結尾） | `video-motion-craft/references/reads-and-beat.md` | 第 5 步連過去（寫 `script.json` 的 reads、setups、seams 時要讀） |
| `animation-craft.md` §7（三種尺度審片）、§11（看起來像生成的） | `video-draft-review/references/review-scales.md`、`failure-list.md` | 不留；`review-pack.mjs` 產生 CHECKLIST 的來源路徑要跟著改 |
| `transitions.md` 的「詞彙」「接縫表」「一鏡到底的故事設計」 | 留在 video-direction（規劃時選手法） | 原樣 |
| `transitions.md` 的「轉場尺：實測數字」「流暢度」「最常用的三招」 | `video-motion-craft/references/transition-ruler.md` | 連過去 |
| `visual-verbs.md` 的「做法」「呈現層」「一鏡到底的主角規則」 | 留（規劃） | 原樣 |
| `visual-verbs.md` 的「材質變形：實物怎麼動、怎麼做」 | `video-motion-craft/references/material-morphs.md` | 連過去 |
| `self-review.md` §1、§1.5、§2、§4、§5（和尺並排、審片包、評分表、一輪一變數、教訓寫回去） | `video-draft-review/SKILL.md` 本文與 references | 不留 |
| `self-review.md` §3（重製練習）、§6（自己能做的研究） | `video-motion-craft/references/practice.md` | 不留 |
| `self-review.md` §3.5（Blender 烘焙＋three.js） | 先留在 video-direction（它屬於材質與算圖，不是動態也不是審片）；以後另開 skill 再搬 | 原樣 |
| `script-craft.md`、`content-and-styles.md` | 不動 | 原樣 |

搬完後：

- `video-motion-craft/SKILL.md` 的**最前面**放一張「必須成立的數字」表（壓縮後只保留前 5,000 token）：
  - 讀點最短時間；
  - 變形後的停留（約 1.5 秒，大字 2.5 秒）；
  - 「停太久」＝最後讀點後超過 1.2 秒；
  - 介面彈簧 0.17–0.23 秒到 90%；
  - 接縫的速度三段（慢 → 爆衝 → 滑停）；
  - 拍點 ±3 格；
  - 60 fps、頓點 0。
- 細節放在 references。
- 程式不搬：`library/motion/*`、`scripts/measure/*`、`script-lint.mjs`、`review-pack.mjs` 都留在 toolkit 的根目錄，兩個 skill 都用 `<tool>/…` 呼叫。只有 skill 內部用的小工具才放 `skills/<名>/scripts/`。
- `video-direction/FEEDBACK.md` 裡關於動態的條目，以後寫進 `video-motion-craft/FEEDBACK.md`；關於審片漏抓的，寫進 `video-draft-review/FEEDBACK.md`。

### 4. 審片關卡怎麼強制執行（分層，每層擋不同的漏洞）

| 層 | 做法 | 擋得住 | 擋不住／代價 |
|---|---|---|---|
| 1. 腳本的結束代碼 | `review-pack.mjs --check` 結束代碼 0 才算過 | 沒跑、沒填 | 現在全部打勾就能過，沒綁 render |
| 2. 綁指紋與證據 | `--check` 通過時寫 `review/PASS.json`：`{render, sha256, script_digest, checklist_digest, at, counts}`。每個「答：」要引用審片包裡**真的存在**的影格標記（例如 `f0732` 或 `seams/S3.jpg`），沒有就不算答。數字類的問題直接判 FAIL，不給勾：拍點偏差超過 3 格、頓點 > 0、結尾凍住、重要讀點時間不夠、最後讀點後停超過 1.2 秒。要豁免，就寫 `review/waivers.json`，附理由與核可人，而且只有使用者能核可（沿用 brand-qa） | 打勾不看、舊的審片用在新的 render、數字問題被當成意見略過 | 要改 `review-pack.mjs`（等另一個 agent 完成後） |
| 3. PreToolUse hook（主要的門） | 掛在送檔給使用者的工具上（PLAYBOOK 寫的是 `SendUserFile`；實際工具名要先確認）。`<tool>/scripts/hooks/draft-gate.mjs` 讀 `tool_input`，送的是 `videos/**/renders/*.mp4`、`direction/transitions/*`、`tests/_*/out/*` 時，找同一支片的 `review/PASS.json`，sha256 要和送的檔一樣，否則 `exit 2`，stderr 寫「這版還沒過審片：node <tool>/scripts/review-pack.mjs …」 | 忘了審就送、審完又改了再送 | 只擋得住「用工具送檔」，擋不住在對話裡貼路徑或給 Studio 網址（第 4 層補）。要放在 settings 才每個 session 都在：改設定，要先問使用者 |
| 4. Stop hook（command，不用模型） | `last_assistant_message` 提到 `renders/draft-` 或 `.mp4`，而且那支片最新的 render 沒有對應的 `PASS.json`，就 `decision: "block"`，理由是「先跑 /video-draft-review」。`stop_hook_active` 是 true 時只提醒、不再擋，避免卡住 | 用文字或路徑給使用者看 | 用關鍵字判斷會誤擋，例如只是討論舊版。所以只做便宜的檔案檢查，不用 prompt／agent hook：那要每回合多等 30–60 秒，還要花 token |
| 5. 回報要引用證據 | draft-review 規定：給使用者的訊息要貼 `PASS.json` 的一行（render 指紋、各項數字、豁免了什麼），沒有就不算過（superpowers 的「先證據、後宣稱」） | 嘴上說「檢查過了」 | 單獨用最弱，要配合第 2、3 層 |
| 6. 換一雙眼睛（選用） | 目視的部分派給全新 context 的 reviewer：自訂 agent `draft-reviewer`，用 `skills: [video-draft-review]` 預先載入。只給審片包、`ruler.md`、`script.json` 和使用者過去的意見，不給對話紀錄。依 code-review 外掛的做法，每條意見要附影格與信心分數，低信心的不報 | 作者幫自己的作品打分數的偏差 | 每版多一次 subagent 的 token 和時間。照使用者的 /delegate 規則，要先確認值得 |

**建議的做法**：

- 第 1、2、5 層一定要做：都是 toolkit 內的修改，不必改設定。
- 第 3 層是真正的門。先用 skill frontmatter 的 `hooks` 掛在 `video-motion-craft` 和 `video-draft-review` 上：叫到就生效，不必改 settings。使用者同意後，再把同一支腳本掛進 `marketing-video-studio/.claude/settings.json`，這樣就算 skill 沒被叫到也擋得住。
- 第 4 層用來補第 3 層的漏洞。
- 第 6 層等前面幾層跑一陣子，看漏抓率再決定。

為什麼不只靠寫規則：官方對「Claude 後來不照做」的處方就是搬進 hook（發現 7）。我們的失敗模式也正是「規則存在，做的時候沒套用」（FEEDBACK.md 2026-10-25：「工藝規則只寫在文件裡，做的時候沒有東西會擋」）。

### 5. 讓動態工藝在做草稿時真的被載入

- `paths`：設成 `videos/**/films/**/index.html, videos/**/films/**/assets/js/**`，Claude 碰到合成檔就帶進來。
- `video-direction` 交接時，在 `BRIEF.md` 的 body 寫一句「製作與修改動態時用 /video-motion-craft，每版給使用者看之前用 /video-draft-review」。上游 `/hyperframes` 一定會讀 BRIEF。
- 把兩個 skill 的高信心特徵加進使用者的 `skill_hint_hook.py`（例如「太快」「停太久」「過場」「草稿」加上 `renders/draft`），在長對話中途提醒 Claude。這是改使用者的工具，要先問。
- 審片包裡新增一張「計畫 vs 成片」的 timing chart：
  - 每一拍畫兩條：
    - `script.json` 計畫的讀點（t0、act、t1）；
    - `motion-profile` 量出來成片哪裡在動、哪裡停。
  - 停留比計畫短，就是「太快」；最後讀點後還有一大段停著，就是「停太久」。
  - 這兩種意見使用者最常說，現在只在計畫層（script-lint）查，沒在成片上查。

### 6. 怎麼測觸發和關卡

**觸發測試**（每個 skill 一份 `evals/trigger-queries.json`，約 20 句，60／40 分組，每句跑 3 次，門檻 0.5）。應觸發和不應觸發的例子：

| skill | 應觸發 | 不應觸發（近似但該用別的 skill） |
|---|---|---|
| video-motion-craft | 「04 那段變形完停太久了，幫我修」 | 「GSAP 的 timeline label 怎麼用」（→ gsap-timeline） |
| | 「接縫 S3 的過場不夠完整，速度要有起伏」 | 「讓『資料不出門』這幾個字演出關門」（→ semantic-type） |
| | 「整支節奏不對，有幾個轉場沒落在拍上」 | 「幫我想這支片的轉場要用哪幾種手法」（→ video-direction 第 7 步） |
| | （中途接續）「好，照剛剛的意見改草稿 11」 | 「檢查有沒有出現價格」（→ video-brand-qa） |
| video-draft-review | 「草稿 12 render 好了，傳給我」 | 「可以出 1080p 正式版了嗎」（→ video-brand-qa） |
| | 「轉場那三種做法做好了先給我看」 | 「幫我審這段 GSAP 程式有沒有 bug」（→ code-review） |
| | 「你先自己檢查一輪再給我」 | 「幫我分析這支參考片的轉場」（→ video-direction 的尺） |

偵測方式：`claude -p "<句子>" --output-format json`，在 marketing-video-studio 裡跑，看有沒有 `Skill` 工具呼叫，且 `input.skill` 是這個名字。也要在**長對話中途**測一次，因為那才是真實的失敗情境。

**關卡測試**（toolkit 的 `tests/`，和現有的 `review-pack.test.mjs` 同一套）：

- 把 hook 的輸入 JSON 餵給 `draft-gate.mjs`，驗四種情況：
  - 沒審就送 → `exit 2`；
  - 審過、指紋一致 → `exit 0`；
  - 審完又重新 render → `exit 2`；
  - 送的不是草稿（例如參考截圖）→ `exit 0`。
- Stop hook：`stop_hook_active: true` 時不擋。
- `--check`：「答：」引用了不存在的影格、數字項有問題但沒有豁免 → 不過。

**品質評估**（`evals/evals.json`，沿用 video-direction 的格式）：

- 用使用者**真的抓到過**的問題當案例：
  - C 草稿 7 的 04「停留的有點久」；
  - 草稿 10「部分過場在掌握一下節奏」；
  - 草稿 5「過場可以再強烈一點」。
- 拿那幾版 render 跑 draft-review，斷言「在那個時間點提出同類意見」。有 skill 和沒有 skill 各跑一次。
- 這組案例的意思是：**使用者抓得到、我們抓不到的，就是關卡的漏洞**。以後每次使用者用眼睛抓到新問題，就加一個案例。

---

## 三、未決問題（要使用者決定）

1. **hook 放哪裡**：只放 skill frontmatter（不改設定，但 skill 沒叫到就不在），還是也放進 `marketing-video-studio/.claude/settings.json`（每次都在，是持續的設定）？要不要把特徵加進 `skill_hint_hook.py`？
2. **什麼算「給使用者看」**：只有用工具送檔，還是也包括在對話裡給路徑、Studio 預覽網址、圖庫頁？hook 只擋得住它看得到的那幾種。
3. **換一雙眼睛**：每版草稿要不要多派一個全新 context 的 reviewer？會多花 token 與時間，但能避免自己幫自己打分數。
4. **試片要不要也過關卡**：semantic-type 的 4 秒片段、轉場的 2–3 種做法也算給使用者看的東西。建議跑輕量版：只看逐格表和數字，不填整張清單。
5. **哪些數字是硬規則**：拍點 ±3 格、頓點 0、停太久 1.2 秒、變形後停 1.5 秒或大字 2.5 秒，都是從使用者的意見和尺推出來的。要直接判 FAIL（只有使用者能豁免），還是先當 WARN 跑幾支片？
6. **`paths` 自動載入**：官方文件說會自動載入，但要在這台機器的 Claude Code 版本上實測一次，才能確定能靠它。
7. **搬檔的順序**：另一個 agent 正在加 animation-craft.md 和 review-pack。建議等那批 commit 完成，再一次搬檔、改路徑（`review-pack.mjs` 的 CHECKLIST 來源、`docs/USAGE.md`、`docs/PLAYBOOK.md`、video-direction 的連結），同一個 commit 跑完 `tests/`。
8. **video-direction 的 description 已經超過 1,024 字元**：拆出兩個 skill 時，順便把它縮到規格內？縮短會改到觸發行為，要跟著跑一次觸發測試。
