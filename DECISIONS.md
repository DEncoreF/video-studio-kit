# 決策紀錄


| # | 決策 | 內容 | 日期 |
|---|---|---|---|
| D1 | 影片引擎 | HyperFrames（Apache-2.0）。Remotion 要求 3 人以上公司購買授權，不採用 | 2026-10-19 |
| D2 | Repo 位置 | `~/Projects/marketing-video-studio/` | 2026-10-19 |
| D3 | 第一批品牌套件 | Kestrel、NovaMind | 2026-10-19 |
| D4 | 旁白 | 預設 edge-tts `zh-TW-YunJheNeural`，送合成前把 NovaMind 改拼成「Nova Mind」；Higgsfield 的 Eleven v3／MiniMax 列為試用 | 2026-10-19 |
| D5 | 配樂 | 預設程式作曲＋Openverse 音效；HeyGen 音樂庫為選配 | 2026-10-19 |
| D6 | 素材庫 | 使用者依專案自建（原 `video-assets` skill，2026-10-30 併入 `video-direction` 的 references/assets.md），可自行連結他人的庫；品牌素材只取當前專案 | 2026-10-19 |
| D7 | 版權 | 外部參考只存連結與說明，不放進成片；進成片的素材一律記錄授權 | 2026-10-19 |
| D8 | 基礎專案 | 借用 make-awesome-video（MIT）的參考搜尋與靜態畫面關卡概念 | 2026-10-19 |
| D9 | Higgsfield MCP | 選配供應商，先試一個月入門方案（由使用者自行訂閱、登入） | 2026-10-19 |
| D10 | Reference | **不預建資料庫**。每次創意方向階段把上網找到的資源記在該影片的 `references.md`，並附加一行到共用的 `references-log.jsonl`，下次可先搜過去找過的 | 2026-10-19 |
| D11 | Skill | 不設總入口；3 個 skill：`video-direction`、`video-assets`、`video-brand-qa`，流程交給 `/hyperframes`（已由 D18 拆分、video-assets 併入 video-direction 取代：現在 5 個，見 README） | 2026-10-19 |
| D12 | 工具安裝 | 全部裝在專案內：HyperFrames CLI、ffmpeg-static、@ffprobe-installer（arm64）、skills 放 `.claude/skills/`；用 `npm run hf -- <指令>` 執行，預設關閉遙測 | 2026-10-19 |
| D13 | 風格庫 | 只存文字配方（`styles/recipes/*.md`，五段式：需要提供／方向含禁用／結構／製作／注意），不存預覽影片。定風格時才用該片內容產生 4–6 個靜態分鏡、前 2 名再出動態預覽，放在該片的 `direction/`。已實作的 6 種保留為範例程式（`styles/examples/`） | 2026-10-19 |
| D14 | 品牌規範 | `brand.json` 是唯一來源（產品名稱與別名、禁用詞、價格、允許的合作品牌、Logo 規則），腳本經 `scripts/lib/brand.mjs` 讀取；skills 不另定義規則 | 2026-10-19 |
| D15 | 品牌檢查 | 唯讀、fail closed：違反品牌硬性規範（不論出現在字幕、旁白、截圖或影格）一律 FAIL；無法確認的是 NEEDS_REVIEW；只有 lint 可由使用者簽核豁免；已核可影片重新驗證不重跑 apply／TTS，出現新違規就撤回核可 | 2026-10-19 |
| D16 | 風格範例 | 範例只負責構圖與動態，品牌從 BRAND、文字從 CONTENT；Logo 經 `H.logo` 鎖定；配方禁用項與品牌規範或必備內容衝突時停止並回報 | 2026-10-19 |
| D17 | 個人層 | 工具與資料分開：每個人的品味（`taste.md`）、選擇紀錄、參考紀錄、inbox、個人素材與風格放在個人層（預設 `~/.video-studio/`，自己的 git repo），skill 讀品味檔而不寫死偏好；工作資料夾與品牌套件可另外指定（`scripts/lib/paths.mjs`）。為之後打包成 plugin 做準備 | 2026-10-20 |
| D18 | Skill 拆分 | 從 `video-direction` 拆出 `video-motion-craft`（做草稿時的動態工藝）與 `video-draft-review`（每版給使用者看之前必過的關卡）；一份參考檔只有一個主人，video-direction 只留規劃。關卡只放在 skill 裡：`review-pack.mjs --check` 的 `PASS.json` 綁 render 指紋、答案要引用影格、量得出來的問題直接 FAIL（只有使用者能豁免），hook 掛在兩個 skill 的 frontmatter，不改任何 settings（使用者決定） | 2026-10-25 |
| D19 | Remotion 寫法的片子 | 不裝、不打包 Remotion。React 場景要用 Remotion 的 API，就在 build 用 alias 指到自家 shim（`useCurrentFrame` 等，例：`videos/<專案>/films/<片>/src/shim/`），由 HyperFrames 出片；要長期維護的改用 `remotion-to-hyperframes` 移植成 HTML。brand-qa 的「Remotion 授權」檢查擋真套件（D1） | 2026-10-27 |
| D20 | 獨立審片 | 正片草稿給使用者看之前，固定請一個沒參與製作的 subagent 看審片包（不給清單答案與製作對話），發現寫進 `INDEPENDENT.md`、每個 [!] 都要回「處理：」，`review-pack.mjs --check` 沒有它就不寫 PASS。它是多一道檢查，不是使用者：它的 [ok] 不代表核可，也不能拿來豁免（使用者 2026-10-27「兩個都好，做吧」） | 2026-10-27 |
| D21 | 上游 HyperFrames skill | 裝上游公開的 7 個（`hyperframes`、`hyperframes-cli`、`hyperframes-registry`、`media-use`、`figma`、`slideshow`、`remotion-to-hyperframes`），跟上游 #5651 移除退役的 6 個子 skill 與 8 個流程 skill，引用改到 `hyperframes`／`media-use` 的 references。上游 repo 自己 `.claude/skills/` 的 6 個（captions-overlay、changelog-video、cut-the-curve、motion-doctrine、oversized-cursor、seam-craft）標 `internal`、CLI 不列出，是 HeyGen 片子的 house style（changelog-video 綁 HeyGen 品牌與配音；motion-doctrine 自稱「先讀、凌駕其他動態規則」，會和 video-motion-craft 搶主導），不裝；要借的手法寫進 video-motion-craft 的尺 | 2026-10-30 |
| D22 | HyperFrames 0.8.223 | 升級套件與上游 7 個 skill（2026-11-01）。算圖動態模糊遇到 preserve-3d＋backface-visibility 的翻板會自動改用濾鏡畫法（`hyperframes check` 報 `motion_blur_filter_fallback`）：畫面正確，但翻板上幾乎沒有拖影；0.8.185 是整段畫成背面。上游 `media-use` 新的「不談價格、不改用免費、本機工具只在要求時用」不採用，以 D4、D5 與 video-direction 的 assets.md「花點數前先說多少並等同意」為準。lint 新增 `non_deterministic_code`（error）：打包進 app.js 的 React（fiber 鍵的 `Math.random()`）與 GSAP matchMedia（`Date.now()`）也會被判錯、沒有排除方式，所以 React 寫法的片子（D19）要在 esbuild 把兩者換成確定性的版本：`define` 把 `Math.random` 指到種子固定的 mulberry32、`Date.now` 指到每次加 16 ms 的時鐘（`banner` 定義），例：<專案>/films/<片> 的 build.mjs（使用者 2026-11-01 選「Seed it in the build」）；換完 lint 0 錯，成片和換之前逐格相同 | 2026-11-01 |
| D23 | earshot skill | 從 earshot repo 裝 `earshot`（v0.4.0，`npx skills add --copy`，`skills-lock.json` 鎖定），和 HyperFrames／GSAP 一樣只在 toolkit、不手改；不用連結（絕對路徑換機器就斷）也不放個人層（影片以外的 session 不需要）。earshot 只當耳朵（Loop 1–3 挑選、聽審、A/B 與 measure），用什麼聲音、多大聲照 video-motion-craft 的 `references/sound.md` 與各片聲音計畫；它的 `forge` 與 `kit`／`sfx` 程式音效庫（預設推 `ui_pop`、鐘琴）只在聲音計畫選了程式合成時用，預設真實錄音優先（之前一支片第二套：「有點太可愛了」）。同 repo 的 `real-sound` 不裝：它從找素材到母帶整套流程，和 sound.md 搶主導（同 D21 不裝 motion-doctrine）；要借的做法已寫進 sound.md §4。earshot MCP 暫不註冊，CLI 寫完整路徑（使用者 2026-11-02「照建議做」） | 2026-11-02 |
| D24 | 關卡掛進 settings、聲音另有關卡、commit 前跑測試 | draft-gate hook 寫進 studio 的 `.claude/settings.json`（推翻 2026-10-25「不改 settings」：只掛 skill 時沒叫到就不在）；`scripts/sound-gate.mjs` 用 earshot 把關新混音，綁解碼後的音訊；toolkit 的 `.githooks/pre-commit` 跑 `scripts/test-related.mjs --staged`。使用者：「三個都補」 | 2026-11-03 |
| D25 | 精簡外部 skill | 移除 `gsap-scrolltrigger`、`gsap-react`、`gsap-frameworks`、`slideshow`（`npx skills remove`，`skills-lock.json` 同步）：2026-08-18 到 11-04 的影片 session 一次都沒叫用、自建 skill 也沒引用，而且是網頁捲動、React／Vue app 與現場簡報用的，出片用不到；少掉常駐說明約 450 token 與誤觸發。上游新的 `reverse-any-video`、`style-sampling` 不裝：Pro 付費、要 0.9 以上的 CLI（toolkit 固定 0.8.223），reverse 規定不問就用 HeyGen 重拍人、和「花點數前先問」衝突，style-sampling 的「in the style of」會和 video-direction 搶觸發；升級 HyperFrames 時再評估。使用者：「好，移除 6 個」 | 2026-11-04 |
| D26 | 從參考抽光、陰影與材質 | 併進 video-direction（不另開 skill，免得和它搶觸發）：`references/look-extraction.md` 寫量法，`scripts/measure/finish.py`（影片／截圖：沿線擬合模糊邊得 CSS blur、偏移、透明度、色相；整格顆粒、暈影）與 `css-effects.mjs`（網頁的精確值），Figma 參考用 Figma MCP；做法表 `library/finish-recipes.json`（approved／measured／untested），先收光暈、陰影、玻璃、顆粒，用三支尺片與 film D 核可的 v2 元件校準。外面沒有從影片反推這些參數的工具（`docs/research/reference-look-extraction-2026-11-04.md`）。使用者：「併進 video-direction」 | 2026-11-04 |
| D27 | 動態檢查併進審片關卡 | 每一版 `review-pack` 產生 `MOTION.md`（程式查的緩動、參數檔、Beat、RulerEase、主角時刻；提醒一種一條要處理；使用者的範例重新列出；範例、元件、最弱處、另一種表達四個回答），`--check` 核對；GSAP 讀不懂的緩動 `ease-unknown` 擋下。候選用 `--check --candidate` 免填；`previews/` 底下選定版本的預覽要 `--link` 連到通過的審片（收緊 2026-10-29 的預覽放寬，使用者同意）。不選：再寫一條記憶（10-31 寫過，11-04 照樣沒做）；hook 查有沒有載入 skill（證明載入，不證明照做）；另開指令與關卡（多一件要維護的）；每版派獨立審片（成本）。為什麼：一支片一個 session 約 35 個試片，使用者問了 8 次「有跑 motion skill 嗎」，每次跑都查出真問題，而且 SKILL.md 自己的範例教了 GSAP 讀不懂的緩動。全域規則第 4 條與 JUDGMENT §5 同一天加。 |
