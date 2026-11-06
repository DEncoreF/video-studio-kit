# frame.md 的外觀規格：寫成數字，加一張禁用清單

**用在**：第 4 步出三個方向（每個方向的小卡）、第 8 步寫 `frame.md`。`frame.md` 的檔案格式（YAML frontmatter＋本文）照 hyperframes 的 `references/look.md`「The project's design spec」（完整範例見 `assets/frame-presets/*/FRAME.md`）；這份規定**寫什麼**：外觀全部寫成數字，再加一張禁用清單。值放 frontmatter，`## Accent`、`## Motion`、`## Layout`、`## Banned` 放本文（§3）。

背景：2026-10-29 研究外部 AI 動畫案例（內部研究筆記）。Florence 的對照實驗：27 字的模糊 prompt 自己長出深藍太空、光環、粒子、編造的標語；448 字、全部寫成數字的導演 prompt 才得到攝影棚產品片——形容詞就是預設長相藏身的地方。Cinetic、motionmaxxing、huashu-motion 都把模型的預設長相寫成禁用清單。我們的 E 片自己發明外觀、35 版量測都過，使用者仍說「有點怪 沒有讓我很驚艷」。

## 1. 外觀寫成數字

| 項目 | 寫什麼 | 例 |
|---|---|---|
| 色票 | 全部用 hex：底、主體、文字三階、**一個強調色**。強調色寫明它代表的**一件事**（「AI 碰過的地方」「剛發生」），面積約 ≤ 8% 畫素，滿版最多一次（Cinetic；Shanshui 的紅不到 2%） | 底 `#0E0E10`、紙 `#F2F0EC`、強調 `#7C5CFF` = AI 的改動 |
| 字 | 字族（從這支片的尺選，寫出借自哪件參考）、2 個字重（可另加等寬數字）、字級階梯（1080p 的 px）、行高、字距 | 陳述句 88–128 px、行高 0.95–1.05；句內強調 1.5–1.7 倍；單一英雄字 2–5 倍（Cinetic） |
| 緩動性格 | 約 3 種，各取一個名字，用 cubic-bezier 或彈簧阻尼比寫（程式裡要用 `RulerEase.bez(…)`，GSAP 讀不懂字串），寫明用在哪 | `out` `(.16,1,.3,1)` 進場與揭示；`exit` 加速離場，比進場短 40–50%；`cam` `(.48,.1,0,.9)` 鏡頭慢起長收；彈簧阻尼比 0.7–0.85（1 不彈、0.4–0.6 俏皮）。位置與大小可以彈，透明度與顏色不彈（Florence、Cinetic） |
| 時長 | 用格數（60 fps）：介面彈簧、變形、接縫、停留；數字從 video-motion-craft 的尺來，不在這裡另訂 | 介面彈簧 90% 在 10–14 格（[transition-ruler.md](../../video-motion-craft/references/transition-ruler.md) §1） |
| 版面 | 版面規矩（§1.5）＋主體佔畫面的比例 | 主體 40–70%；產品視窗 70–92% 畫寬、可以出血；除了刻意的留白，不留超過四分之一畫面的空區（Cinetic） |

## 1.5 版面規矩：每支片一張，寫成數字、畫成圖

使用者 2026-10-29（之前一支片）：「我覺得你要有一個規矩，logo 在哪？主畫面要在哪？」——當時每張畫面各自排，字卡貼在 x 96、框線跑到 Logo 後面。方向的關鍵影格（第 4 步）就要帶著這張規矩，frame.md 的 `## Layout` 寫數字，`direction/layout/` 放一張示意圖和套到全景、特寫各一張的畫面。

| 項目 | 數字（1920×1080） | 出處 |
|---|---|---|
| 安全區 | action-safe 四邊 5%（左右 96、上下 54 px）：所有看得到的東西；title-safe 四邊 10%（左右 192、上下 108 px）：字卡與重要的字。左右分割時每一半也守 title-safe | hyperframes SKILL.md「Keep it editable」（90% action-safe、80% title-safe，Premiere 預設） |
| Logo | 固定一個角落，在 action-safe 內；進場後不動、不縮放；四周留 Logo 高度一半的空白（`brand.json` `logo.clear_space`） | brand.json |
| 字卡 | 一個固定的列（例如頂端 title-safe 內），一次一行、左緣對齊 title-safe | 本片的尺（字） |
| 主畫面 | 寫出範圍與中心；主角一律在這裡 | Cinetic、本片的尺（構圖） |
| 出血 | 只有沒有字的那幾邊可以出血；推近時元件不越過字卡列與 Logo 列（鏡頭層在那條線裁切，元件上緣也要留在線內，不靠裁切藏） | Google Vids 特寫＋本規矩 |

量測：review-pack 的 `safe-zone`（字進到外圈 5%、Logo 出 action-safe → FAIL）、`logo-moved`（Logo 進場後移動 → FAIL）、`safe-title`（字在 title-safe 外 → 提醒），從合成本身讀字與 Logo 的位置（`scripts/measure/safe-zone.mjs`）。

- 用形容詞（高級、流暢、科技感）寫的地方，都換成上表的一個數字；換不出來，就是還沒決定。
- 同一組數字寫進片子的參數檔（video-motion-craft 第 3 步）：frame.md 是規格，參數檔是實作，兩邊不一致時改到一致。
- **品牌色是那個強調色**：NovaMind 紫是唯一的強調色，有一個意義，不是預設的滿版漸層底。品牌套件裡的舞台漸層只在使用者為這支片選了它時才用，寫進下面的例外。
- **字體每支片從尺選**：不預設 EB Garamond（D 片核可元件組的大字字型）；寫出這支片的字從哪件參考來、為什麼。品牌套件規定的字型照規定。

## 2. 禁用清單：模型的預設長相

**出方向之前就要對這張表自查**（第 4 步），不是寫 frame.md 時才看；品味檔（taste.md）和這張表衝突時（例如品味檔喜歡 HUD 小字、時間碼），把衝突寫出來問使用者，不要自己挑一邊（之前一支片 2026-10-29：E 藍圖帶著流程條、小眉標、整支藍紫漸層底送出，使用者後來選拿掉）。frame.md 的 `## Banned` 至少抄這張，再加這支片自己的（使用者否決過的、品牌禁的）。要例外（使用者為這支片核可，或品牌自帶），寫在那一項旁邊，附使用者原話，程式裡也註明。出三個方向的關鍵影格、每拍一格的靜圖時，先對這張表自查。

| 禁用 | 出處 |
|---|---|
| 角落 HUD：時間碼、幀數、進度條、取景框角標、「02 / 05」這類計數器 | motionmaxxing、Cinetic；Stephan Livera 的 15 秒 showreel 就是沒被導演過的預設 |
| 標題上方的小眉標（kicker、加寬字距的大寫小標籤） | motionmaxxing、Cinetic |
| 左字右卡（左邊標題、右邊介面或裝置） | motionmaxxing、Cinetic；Moritz Kremb 的 Notion 片 |
| 空底上浮著一張小卡（小於約 40% 畫寬的置中小卡） | Cinetic、motionmaxxing（小字放在大色塊上就是投影片） |
| 光暈、粒子、bloom、AI 星芒、光斑 | Cinetic、Florence、@twoclipping 的禁用清單 |
| 藍紫漸層蓋住大半支片 | huashu-art-motion 的交付門禁：藍紫底占全片 > 30% 就是紅燈 |
| 到處淡入淡出 | motionmaxxing（幾乎什麼都不淡入）；溶接只用在時間經過（[transitions.md](transitions.md)） |
| 對稱的軟緩動 0.6–0.8 秒 | huashu-motion：這是讓片子想睡的預設；F 片 草稿 4 就是這樣（transition-ruler.md §1） |
| 很長的靜止結尾卡 | motionmaxxing（結尾卡 ≤ 1.4 秒）、Cinetic（1.5–2.5 秒，組裝完仍在慢推）；片尾的停留照 video-motion-craft 的「⛔ 片尾」 |
| 現成轉場特效：glitch、漏光、燒片、閃白、漩渦 | Cinetic |

## 3. 寫進 frame.md 的樣子

```markdown
---
colors: { ground: "#0E0E10", ink: "#F2F0EC", text-2: "#B9B6B0", text-3: "#7A7772", accent: "#7C5CFF" }
typography:
  display: { family: "<從尺選的字族>", weight: 600, size_1080: 112, leading: 1.0, tracking: "-0.01em" }
  body:    { family: "<字族>", weight: 400, size_1080: 32, leading: 1.3 }
---
## Accent
accent = <它代表的一件事>；面積 ≤ 8%，滿版最多一次（第 N 拍）。

## Motion
| 名稱 | 曲線 | 用在 | 格數（60 fps） |
|---|---|---|---|
| out | cubic-bezier(.16,1,.3,1) | 進場、揭示 | 10–14 |
| exit | cubic-bezier(.7,0,.84,0) | 離場 | 6–8 |
| cam | cubic-bezier(.48,.1,0,.9) | 鏡頭 | 54–180 |

## Layout
（§1.5 的表，寫本片的數字；示意圖在 direction/layout/）

## Banned
（§2 的表，加本片的；例外寫在該項旁邊）
```
