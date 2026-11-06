# 生成影片的模型：研究筆記

2026-10-26。使用者：「開始研究生成影片的模型」。這份只是研究，沒有安裝任何東西、沒有呼叫任何付費服務。

**標記**：「官方」＝直接讀到廠商自己的文件或條款；「二手」＝經銷商、部落格、評測站（常互相矛盾、常有利益關係）；「未查證」＝只找到一個來源或只是推論。價格和版本變得很快，用之前回官方頁再看一次。

---

## 零、先講結論（2026-10 的局面）

1. **Sora 已經沒了。** OpenAI 2026-03-24 宣布，Sora 2 與 Videos API 在 2026-09-24 移除，沒有後繼模型（官方：<https://developers.openai.com/api/docs/deprecations>）。
2. **Google 的主力換成 Gemini Omni。** Gemini app 現在用 Gemini Omni 做影片（官方：<https://support.google.com/gemini/answer/16126339>）。Gemini API 的 Veo 3.1 preview 已在 **2026-10-22 關閉**，改用 `gemini-omni-1.1-flash`（官方：<https://ai.google.dev/gemini-api/docs/video>）。Veo 3.1 只剩 Google Cloud（Vertex，現在叫 Gemini Enterprise Agent Platform）上的 `veo-3.1-generate-001`。
3. **第一梯隊**：Gemini Omni Flash / Veo 3.1、Kling 3.0／4.0、Seedance 2.0／2.5、MiniMax H3（Hailuo 3）、Runway Gen-4.5。多數評測認為寫實與物理是 Veo/Omni 最好，人物動作是 Kling，長片段加參考素材是 Seedance（二手，見第六節）。
4. **平台都變成「模型超市」。** Runway、Luma、Pika、Higgsfield、Adobe Firefly 都轉賣別家模型（Kling、Seedance、Veo、Omni、H3），差別在價格、授權和自動化入口，不在模型本身。
5. **本機（M4 Pro 24 GB）只適合打草稿。** 能跑的是 LTX-2.3 int4 和 Wan 2.2 5B；畫質和速度都遠不如雲端，拿來做動態參考、接縫試驗，不拿來做品牌片的寫實 b-roll。

---

## 一、雲端模型比較表

| 模型（廠商） | 強項 | 長度／解析度 | 圖生影片／首尾格 | 價格與免費額度 | 自動化入口 |
|---|---|---|---|---|---|
| **Gemini Omni 1.1 Flash**（Google） | 多模態輸入、用對話一步步改片、可改真實影片；原生音訊 | 起始片段約 10 秒（二手：The Verge 報導），可延伸到 40 秒；360p／720p 原生，1080p／4K 是放大；16:9、9:16（官方） | 單張圖＋提示；**首尾兩格**插補；多張主體參考圖；最多 3 段 ≤3 秒的影片參考（官方） | API 約 US$0.10／秒（720p），**沒有免費額度**（官方 pricing）；Workspace 內含額度見第三節 | Gemini API（`gemini-omni-1.1-flash`）、Gemini app、Flow、Vids |
| **Veo 3.1**（Google，Vertex） | 寫實、光影、物理；原生音訊 | 4／6／8 秒；720p、1080p；24 fps（官方 Vertex 頁法文摘錄） | 首格、首尾格、最多 3 張參考圖、延伸（官方目錄頁有這些指南） | 約 US$0.40／秒（含音訊）、Fast 約 $0.15、Lite 約 $0.05（**二手**） | Vertex API；有 `seed` 參數（二手，Runware/Scenario 文件） |
| **Kling 3.0／4.0**（快手） | 人物動作、表情；4K | 3.0：Firefly 內最多 15 秒、720p/1080p（官方 Adobe 說明，經轉述）。4.0：3–30 秒、最高 4K、最多 10 張關鍵格（**二手**，Atlas Cloud；4.0 Flash 9/28 搶先、完整版「10 月」） | 首格、首尾格；4.0 多關鍵格 | 免費每日 66 點、有浮水印、**不可商用**；付費約 US$6.6–10／月起可商用去浮水印（**二手**，多個指南一致） | 官方 API（未查價）、Higgsfield、Runway、Luma |
| **Seedance 2.0／2.5**（字節） | 長片段、大量參考素材、原生音訊 | 2.0 最高 4K；2.5：4–30 秒、**最高只有 720p**、最多 50 個參考檔（**二手**，fal.ai） | 首尾格、多參考 | BytePlus ModelArk 依 token 計費；經銷價約 $0.11–0.19／秒（**二手**） | BytePlus API、Runway、Luma、Pika、Higgsfield |
| **MiniMax H3**（Hailuo 3） | 多模態參考、11 種語言對白 | 4–15 秒、24 fps、768p，2K 要另一個未開源模組（官方 HF 模型卡） | 0／1／2 張圖（首尾格）、最多 9 圖＋3 影片＋3 音訊參考 | API 約 $0.08／秒 720p（**二手**） | MiniMax API、Luma、Pika；也有開源權重（33B，見第二節） |
| **Runway Gen-4.5**（＋Aleph 2.0 改片） | 鏡頭控制、改既有影片（Aleph） | 未查 | 有 | Free：一次性 125 點、模型有限；Standard US$15／月（年繳 $12）625 點、**無浮水印**；Gen-4.5 每 5 秒 60 點（官方 runway.com/pricing） | 官方 API（每點 $0.01，二手）；也轉賣 Kling 3.0、Seedance 2.5 |
| **Luma Ray3.2 / Ray3.14** | HDR／EXR 輸出 | Ray3.2：5、10 秒（官方） | 有 | Plus US$30／月（年繳 $25）10,000 點，標明可商用；頁面沒寫免費方案（官方 lumalabs.ai/pricing） | 也轉賣 Seedance 2.5、Kling 4.0、Veo 3.1、H3、Omni Flash |
| **Pika 2.5**（＋轉賣） | 便宜的多模型入口 | 未寫上限 | Pikaframes（關鍵格） | Free 無點數、**無商用授權**；Starter US$10／月起可商用；所有方案都**沒有浮水印**（官方 pika.art/pricing） | dev.pika.art API（點數不通用） |
| **Wan 3.0**（阿里） | — | 未查 | — | 2026-08 起 API 公測；**多數來源說沒有開源權重**（二手，互相矛盾） | 阿里雲 Model Studio、Pika |
| **Adobe Firefly Video** | **自家模型號稱「商用安全」**、企業版有 IP 賠償 | 1080p、5 秒（2025 年資料，**可能過時**） | 有 | Firefly Standard 約 US$9.99／月（2025 資料） | Firefly 內也有 Kling、Ray、Gen-4.5、Veo 3.1（2026-07 清單，二手）；**夥伴模型不在 Adobe 的安全承諾內**（二手） |
| **Higgsfield**（平台） | 在 Claude 裡用 MCP 叫多家模型 | 看模型 | 看模型 | Starter 約 US$15–19／月、200–270 點（兩個來源數字不同）；Kling 3.0 8 秒 720p 約 14 點；**MCP 一律扣點，網站上的「無限」不適用 MCP**；Free 不能商用、不能用 MCP（**二手**，Creatify、Layer3 Labs） | OAuth MCP（mcp.higgsfield.ai），暴露 Kling 3.0、Seedance 2.5、Omni Flash、Nano Banana Pro 等 |
| ~~Sora 2~~ | — | — | — | 2026-09-24 停止（官方） | — |

---

## 二、本機能跑的開源模型（Apple M4 Pro、24 GB、約 150 GB 空間）

**現況**：這台機器還沒有裝任何本機生成工具（沒有 `~/.venvs`、沒有 `mflux-generate`、沒有 `ltx-2-mlx`，HF 快取裡沒有影片模型）。

**media-use 已經支援的**（讀 `~/.claude/skills/media-use/references/operations.md`、`setup-providers.md`）：
- `resolve --type video` 預設先走 HeyGen 頭像影片，HeyGen 不可用或加 `--local-only` 才退到 **本機 LTX 2.3（`dgrauet/ltx-2-mlx`，HyperFrames CLI 內建的 `videogen` 階梯）**；skill 記錄「24 GB 驗證過：512×320 × 33 格，含音訊」。只有文生影片；圖生影片沒有接進 `resolve`。
- 圖片：本機 FLUX（mflux）。24 GB 用 FLUX.1 schnell int4，**一定要 `--low-ram`**（沒加會 swap 到 90 分鐘，加了約 20 秒／512px）。
- 生成結果會凍結成專案 `assets/` 裡的檔案並記帳，render 不會再去抓，這就是我們要的「可重現」：重現靠留檔，不靠重算。

| 模型 | 授權（可否商用） | 24 GB 跑不跑得動 | 工具 |
|---|---|---|---|
| **LTX-2.3**（Lightricks，22B 級） | LTX-2 Community License：**全集團年營收 < US$1,000 萬可免費商用**，超過要買商用授權；Lightricks 不主張輸出的權利（官方 ltx.io 授權頁經搜尋摘錄＋二手） | **可以**：int4 約 12 GB，16 GB 以上可跑；int8 約 26 GB 要 `--low-ram`。只有一筆時間：M1 Max、LTX-2.5 q8、576×1024×241 格約 12 分鐘（官方 README）。M4 Pro 24 GB 的實際時間**沒有資料，要自己量** | `ltx-2-mlx`（MIT）：文生、圖生（`--image` 指定任一格，含最後一格）、首尾格（`--two-stage` + guide）、音訊、延伸、LoRA、HDR IC-LoRA；Python 範例可設 `seed`。也有 `Blaizzy/mlx-video`、ComfyUI 的 LTX-2 MLX 節點 |
| **LTX-2.5** | LTX-2.x Community License（2026-08-11），同樣 US$1,000 萬門檻（二手） | **不行**：int4 約 47 GB | 同上 |
| **Wan 2.2**（阿里） | **Apache 2.0**，最乾淨 | TI2V-5B（720p、24 fps）可以；A14B 系列用 GGUF 勉強能跑但很慢（M1 Max 64 GB 2 秒片要 82 分鐘，二手 lilting.ch） | `mlx-video`（MIT，支援 T2V-14B、TI2V-5B、I2V-14B、Lightning 4 步 LoRA）；ComfyUI＋ComfyUI-GGUF；Draw Things（二手說 16 GB M4 能跑） |
| **MiniMax H3**（33B） | MiniMax H3 Community License，條款未讀到；模型卡寫美國／歐盟／英國／韓國使用者要另填申請（官方 HF） | **不行**（BF16 33B；社群量化版未查證） | diffusers、SGLang |
| **HunyuanVideo 1.5**（騰訊） | Tencent Hunyuan Community License：排除歐盟、英國、南韓；台灣在範圍內；月活 > 1 億要另談（二手） | 未查證 | ComfyUI、diffusers |
| Mochi 1、CogVideoX | Mochi：Apache 2.0；CogVideoX 2B：Apache 2.0、5B：自有授權（**憑記憶，未查證**） | 能跑但已落後一代 | diffusers MPS |

**本機的判斷**：
- FP8 權重在 Metal 上不能用，要 bf16 或 GGUF／MLX 量化（二手 lilting.ch）。
- 24 GB 的現實上限是 LTX-2.3 int4 和 Wan 2.2 5B。拿來做：動態草稿、鏡頭運動參考、首尾格接縫試驗、可設 seed 重跑。不拿來做客戶看得到的寫實人物。
- 每個模型 12–30 GB，150 GB 放兩三個沒問題。

---

## 三、商用條款

### Google Workspace（使用者手上的方案）
- **輸出歸誰**：Workspace 服務專屬條款 §12.12.1——生成內容屬於客戶資料，Google 不主張其中新的智慧財產（官方，<https://workspace.google.com/terms/service-terms/>，台灣版頁面）。
- **限制**：不得用輸出去訓練競爭模型（§12.4）、不得超過用量上限（§12.5）、未滿 18 歲不得使用（§12.6）、適用可接受使用政策（§12.3）。
- **IP 賠償**：§12.10(a) 賠償「未修改的生成內容侵害第三方 IP」的主張，但只限另一份清單列出的服務；Google Cloud 的「Generative AI Indemnified Services」清單在 Workspace 段落列了 **Gemini in Workspace 與 Google Vids**（二手：搜尋摘錄，頁面本身抓不到）。**Gemini app 和 Flow 沒看到列名。** 而且 §6 規定 preview／實驗功能不在賠償範圍內。→ 在 Vids 裡做的片段最有保障；Gemini app 裡做的要問管理員或法務人員。
- **額度**：Workspace 說明頁（2026-10-22 更新）寫 Omni 在 Vids 與 Flow **每月 500 秒**、頭像影片每月 25 支，可請管理員加購 AI Expanded Access（官方，<https://knowledge.workspace.google.com/ai/usage-limits-gemini>）。Gemini app 本身的每日上限另有說明頁；使用者今天看到「今天還能做 2 支」。
- **浮水印**：所有 Omni 輸出都有隱形 SynthID（官方 API 文件）。Gemini app 有「媒體浮水印」開關可關掉可見浮水印，SynthID 和 C2PA 留著（二手，2026-08 報導）；Workspace 帳號的可見浮水印規則**未查證**。

### 其他服務
- **Gemini API（Omni Flash）／Vertex（Veo 3.1）**：走 Google API／Cloud 條款，付費層用於商用；Cloud 的賠償清單是否含 Veo **未查證**。
- **Kling**：免費版有浮水印、不可商用；付費可商用（二手，多來源一致）。
- **Runway**：Standard 起無浮水印；頁面沒有寫商用段落（官方頁）。
- **Luma**：Plus 起標明可商用（官方頁）。
- **Pika**：免費版沒有商用授權，付費才有；沒有浮水印（官方頁）。
- **Higgsfield**：免費版不可商用、不能用 MCP（二手）。
- **Adobe Firefly 自家影片模型**：標榜用授權素材訓練、企業版有 IP 賠償；**轉賣的夥伴模型沒有**（二手）。
- **開源**：Wan 2.2 Apache 2.0 最乾淨；LTX 看公司全集團年營收是否超過 US$1,000 萬。
- **共通風險**：純 AI 生成、沒有人類創作貢獻的內容，在美國可能不受著作權保護（二手，terms.law 引美國著作權局立場）；台灣的立場未查。意思是：我們可以用，但別人抄也很難告。品牌片的主體（產品畫面、標誌、字）本來就由我們做，所以影響有限。

---

## 四、怎麼用在我們的流程

### 用途對應
| 用途 | 先用 | 備案 |
|---|---|---|
| **參考與探索**（看鏡頭運動、光線、材質感） | Gemini app（Workspace 內含，每天幾支） | 本機 LTX-2.3（不限量、可設 seed，畫質低） |
| **寫實 b-roll**（人、辦公室、環境） | 在 **Vids／Flow** 用 Omni（有賠償保障、每月 500 秒）；要量或要自動化時改 Gemini API Omni（約 $0.10／秒） | Kling 3／4、Seedance 2.0（人物強），透過 Higgsfield 或 Runway；或者直接用實拍素材庫比較 |
| **從我們的畫面做圖生影片**（render 出來的格） | Omni／Veo 的首格或首尾格模式 | 本機 LTX-2.3 `--image`（含最後一格）、Kling 多關鍵格 |
| **接縫**（兩個鏡頭之間的過場） | 首尾格插補：餵 A 鏡頭最後一格與 B 鏡頭第一格 | 本機 LTX 兩段式 guide |

### 可重現
- 雲端模型就算給 seed 也不保證每次一樣（Omni API 連 seed 參數都沒寫；Veo 的 seed 只在二手文件看到）。所以**可重現＝留檔**：生成的片段放進 `sources/` 或 `assets/`，旁邊記下模型版本、日期、完整提示、seed、輸入圖、平台。media-use 的 ledger 已經這樣做。
- 本機 LTX 可以固定 seed 重跑；同一台機器、同一個量化版、同一個版本應該可以重現（**要實測**，見試做第 2 步）。

### 避免品牌污染（硬規則：真實產品與標誌不生成、不變形）
1. **不把標誌、產品介面、字餵進生成模型。** 圖生影片只用「背景盤」：先把產品 UI、標誌、字從格子裡拿掉再送，生成後在 HyperFrames 把真的 UI 合回去。
2. **提示寫明不要字、不要標誌、螢幕是空的**（Omni 不收 negative prompt 參數，要寫進提示本身）。螢幕上需要畫面就留空，事後合成。
3. **生成的片段一律過 `video-brand-qa`**（它會查影格裡的字與其他品牌）和 `video-draft-review`；生成模型最常偷偷長出假字、假標誌、別家筆電的標誌。
4. **首尾格接產品鏡頭時，產品那一側用我們自己的 render**，生成的只負責中間的過場，產品出現的那幾格以我們的 render 為準。

---

## 五、試做計畫（3 步）

試片放在 `videos/_gen-trial/`，量測與結論寫回這份筆記或 `research/`。

1. **免費、今天就能做（Workspace）**：同一組 3 個提示——(a) 台灣辦公室 b-roll，有人，螢幕無字；(b) 用 oner v5 的一格（拿掉標誌與字）做首格圖生影片；(c) 兩格首尾格接縫。在 Gemini app 做 (a)(b)，在 Vids 或 Flow 做 (c)。記錄：每日額度、可見浮水印有沒有、解析度、長度、下載格式、手指／臉／假字的毛病。
2. **本機（免費，約 12 GB 空間）**：裝 `ltx-2-mlx`，跑 LTX-2.3 int4，同樣 3 個提示，512×320 起跳再試 768 寬。量：每支幾分鐘、記憶體峰值、同 seed 跑兩次是否逐格相同。**裝之前先確認公司營收門檻**（見開放問題 1）。
3. **付費對照（要使用者同意，上限約 US$20）**：二選一——Gemini API Omni Flash（3 提示 × 8 秒 ≈ US$2.4，可直接寫成 `<tool>` 腳本），或 Higgsfield Starter 一個月（在 Claude 裡用 MCP 叫 Kling 3.0 與 Seedance 2.5 做同 3 個提示）。三家結果一起過 `video-draft-review`，挑出每種用途的預設模型，寫回 media-use 或 toolkit 的用法說明。

---

## 六、開放問題（要問使用者或公司）

1. **公司全集團年營收有沒有超過 US$1,000 萬？** 超過的話 LTX 本機模型也要付費授權；那本機就只剩 Wan 2.2（Apache 2.0）。
2. **Gemini app 生成的影片算不算「Gemini in Workspace」、有沒有在 Google 的 IP 賠償清單內？Omni 是不是 preview？** 要問 Workspace 管理員或法務人員；在答案出來前，客戶片用的 b-roll 優先在 Vids 做。
3. **客戶的畫面可以上傳到哪些雲？** 例如企業客戶的內部畫面，能不能送去 Google 以外的服務，尤其是中國廠商（Kling、Seedance、MiniMax）？
4. **預算**：要不要開 Gemini API 付費帳單或 Higgsfield 訂閱？每月上限多少？
5. **寫實人物要不要用生成的？** 還是實拍或素材庫？如果用生成的，片尾或說明要不要標示 AI 生成（台灣廣告標示的規定**未查**）？
6. **Kling 4.0 完整版是否已上線**：只看到二手資料（說「10 月」上線、4.0 Flash 9/28 搶先），要實際登入確認。
7. Workspace 帳號下載的 Gemini 影片有沒有可見浮水印：第 1 步試做就能回答。

---

## 來源

官方：
- OpenAI 淘汰表：<https://developers.openai.com/api/docs/deprecations>
- Gemini API 影片：<https://ai.google.dev/gemini-api/docs/video>；Omni：<https://ai.google.dev/gemini-api/docs/omni>；價格：<https://ai.google.dev/gemini-api/docs/pricing>（皆 2026-10-22 更新）
- Gemini app 影片說明：<https://support.google.com/gemini/answer/16126339>
- Workspace 用量上限：<https://knowledge.workspace.google.com/ai/usage-limits-gemini>
- Workspace 服務專屬條款：<https://workspace.google.com/terms/service-terms/>
- Google Cloud 生成式 AI 賠償服務清單：<https://cloud.google.com/terms/generative-ai-indemnified-services>（頁面抓不到，內容來自搜尋摘錄）
- Vertex Veo 3.1：<https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate>
- Runway：<https://runway.com/pricing>；Luma：<https://lumalabs.ai/pricing>；Pika：<https://pika.art/pricing>
- MiniMax H3：<https://huggingface.co/MiniMaxAI/MiniMax-H3>
- ltx-2-mlx：<https://github.com/dgrauet/ltx-2-mlx>；mlx-video：<https://github.com/Blaizzy/mlx-video>；LTX 授權：<https://ltx.io/model/license>

二手（數字要再確認）：
- Kling 4.0 規格：<https://www.atlascloud.ai/blog/tips/kling-4-flash-vs-full>
- Kling 價格：<https://eesel.ai/blog/kling-ai-pricing>、<https://www.atlascloud.ai/blog/guides/kling-ai-pricing>
- Seedance 2.5：<https://fal.ai/learn/devs/seedance-2-5-vs-seedance-2-0>
- Higgsfield MCP：<https://creatify.ai/blog/what-is-higgsfield-mcp-what-it-does-what-it-costs-and-how-to-use-it>、<https://www.layer3labs.io/guides/higgsfield-mcp>
- Veo 3.1 Vertex 價格：<https://www.getmaxim.ai/bifrost/model-library/compare/vertex_ai/veo-3.1-generate-001>；seed：<https://runware.ai/docs/models/google-veo-3-1>
- Gemini Omni 發表：<https://decrypt.co/368393>、<https://letsdatascience.com/news/google-launches-gemini-omni-flash-video-model-2cd9175a>
- Gemini 可見浮水印開關：<https://www.gizchina.com/gemini/google-finally-lets-you-remove-geminis-visible-ai-watermark>
- Wan 3.0 是否開源：<https://www.atlascloud.ai/blog/tips/is-wan-3.0-open-source>、<https://wavespeed.ai/blog/commercial-compliance/is-wan-30-open-source/>
- Mac 上跑 LTX-2／Wan 2.2：<https://lilting.ch/en/articles/ltx2-wan22-mac-local-video-gen>
- LTX-2.5 授權解說：<https://book.st-hakky.com/en/data-science/ltx-2-5-commercial-license-guide>
- HunyuanVideo 授權：<https://deepwiki.com/Tencent/HunyuanVideo/5-license-and-legal>
- Adobe Firefly 夥伴模型：<https://www.feisworld.com/blog/adobe-firefly-video-generation-partner-models>
- 評測總覽：<https://www.atlascloud.ai/blog/tips/best-ai-video-generation-models-2026>、<https://aimlapi.com/blog/best-ai-video-generators-2026-veo-3-1-kling-sora-2-seedance-more-compared>
