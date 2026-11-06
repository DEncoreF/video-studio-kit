# 質感：外面有什麼能取代或補強 toolkit（2026-10-31）

使用者：「幫我確認網路上的資源，是否有能取代toolkit 中的東西，我感覺質感面還需加強」。
背景：之前一支片這一輪，使用者連續說「好像不夠好」「會不會是顏色的問題？」「大標小標的質感要提升」。

## 結論

**引擎不用換**。HyperFrames＋GSAP 這套做 2D 動態設計沒有被外面更好的東西取代；質感差在三個地方，其中兩個是「工具已經有、片子沒用」：

1. **已經有、沒用到**（最快見效）：HyperFrames 的算圖動態模糊、顆粒與調色、shader 背景與轉場、GSAP 已免費的 SplitText／MorphSVG／CustomEase。
2. **素材層要換**：中文字型（目前只有 Noto Sans／Serif TC 一套）、圖示（目前手畫）、紙張與表面材質。
3. **外部工具**：沒有一個能整個取代 toolkit；Jitter、LottieFiles 只適合當參考來源或個別素材。

## 1. 已經在 toolkit 裡、片子沒用到的

| 能力 | 在哪 | 為什麼和質感有關 | 這輪 01 有沒有用 |
|---|---|---|---|
| 算圖動態模糊 `data-motion-blur="on"`（`-shutter` 調長度） | `hyperframes/references/motion.md` | 快速移動的東西有拖影，才像攝影機拍的而不是網頁在動；之前翻板用 CSS blur 會壓平 3D、出倒字，這個是算圖時取樣，不碰 3D | 沒有 |
| 顆粒、暈影、調色、LUT（`media-treatment`、`--hf-color-grading-*`、`grade-compare`） | `media-use/references/local.md`、`grading.md` | 平面色塊加一層細顆粒和統一調色，就從「網頁」變成「影片」；之前用 SVG 雜訊手做 | 手做，沒用內建 |
| 登錄庫 `grain-overlay`、`light-leak`、14 個 shader 轉場、`shimmer-sweep` | `npx hyperframes catalog --query …` | 現成、已調過參數 | 沒有 |
| 登錄庫 Liquid Glass 7 個（`liquid-glass-widgets` 等） | 同上，要 WebGPU 的 Chrome | Apple 2025 的玻璃材質，產品介面片很適合 | 沒有 |
| GSAP SplitText、MorphSVG、DrawSVG、CustomEase、Physics2D | `node_modules/gsap/dist`（3.13 起全部免費商用） | 逐字／逐行拆字有遮罩與行對齊（手寫的拆字沒有）；CustomEase 可以照尺的曲線做 ease | 拆字用手寫 regex |

## 2. 素材層：值得換或加的

### 中文字型（目前只有 Noto Sans TC／Noto Serif TC）

Noto Sans TC 是「預設黑體」，大標放到 164 px 時字形沒有個性，這是使用者說「質感」的一大來源。可商用的候選：

| 字型 | 風格 | 授權 | 狀態 | 適合 |
|---|---|---|---|---|
| [昭源黑體 Chiron Hei HK](https://github.com/chiron-fonts/chiron-hei-hk) | 思源黑體改，筆形較現代、正體字形 | OFL 1.1，有可變字型 | 持續維護（2026-05 有更新） | 取代 Noto Sans TC 當內文與介面字 |
| [未來熒黑 Glow Sans TC](https://github.com/welai/glow-sans) | 思源黑體改，有字重**與字寬**系列（窄到寬） | 字型 OFL（repo 程式 MIT） | 2022 已封存，不會再更新 | 大標：寬體粗字最接近 Apple 標題的份量 |
| [饅頭黑體](https://mrmad.com.tw/mantousans-fonts) | 超粗、哥德味，改自 Dela Gothic One | 免費商用（授權檔待確認） | 常用 4808 字 | 只適合很短的海報式大字 |
| [源流明體](https://blog.justfont.com/2024/12/openfont/) | 印刷感明體 | 免費商用（授權檔待確認） | — | 如果要回到襯線方向 |

英文：Figtree 可以留；要更接近 SF Pro 的是 [Inter（Display 光學尺寸）](https://fontalternatives.com/compare/sf-pro-display-vs-inter/)與 Geist（皆 OFL）。SF Pro 本身授權只限 Apple 平台的介面，不能用在行銷影片。

### 圖示（目前手畫線條）

[Phosphor](https://allsvgicons.com/compare/phosphor-vs-lucide/)：MIT，每個圖示 6 種粗細**分別手繪**（含 Duotone），比自己畫的線條一致、細節好；Lucide 是 ISC，同樣可商用，但只有一種線寬。建議以 Phosphor 取代手畫。

### 表面與材質

- [Paper Shaders](https://github.com/paper-design/shaders)：Apache-2.0（以 repo 的 LICENSE 為準；第三方說 PolyForm Shield 是舊資訊），零依賴 WebGL2，有 MeshGradient、顆粒、紙紋等約 28 個 shader，明文允許用在影片。可以給背景與色塊加「會呼吸的表面」，比純色或 CSS 漸層有質感。要先確認在 HyperFrames 算圖時可逐格定格（seek-safe）。
- [ambientCG](https://ambientcg.com)、[Poly Haven](https://polyhaven.com)：CC0 材質（紙、布、金屬），靜態圖，拿來當紙張表面的貼圖。

## 3. 外部工具（不取代 toolkit）

| 工具 | 是什麼 | 結論 |
|---|---|---|
| [Jitter](https://help.jitter.video/en/articles/12089209-what-is-jitter) | 網頁版動態設計工具，匯出 MP4／Lottie，300+ 模板，免費版有浮水印 | 封閉格式、無法程式化與量測；只拿它的模板當參考 |
| [LottieFiles](https://help.lottiefiles.com/hc/en-us/articles/900002438343-Can-I-use-a-free-animation-on-Lottiefiles-for-commercial-business-use) | Lottie 動畫市集 | 每個動畫授權不同，要逐一看；HyperFrames 有 Lottie adapter，可用在小圖示動畫 |
| GSAP（[現在全部免費商用](https://webflow.com/blog/gsap-becomes-free)） | 已經在用 | 外掛已在 `node_modules`，直接用 |
| Remotion | — | 仍不用（D1：授權） |

## 實測（2026-10-31）

- **算圖動態模糊不能用在這一拍**：HyperFrames 0.8.185 開了 `data-motion-blur="on"`，3D 翻板（preserve-3d＋backface-visibility）整段畫成背面；對子樹加 `off` 無效。量測照樣 PASS，是抽格才看到（FEEDBACK 已記）。沒有 3D 的拍（甩鏡、平移）仍可用；2026-11-01 升到 0.8.223 重測：同一支片畫對了（render-match 0%、審片包 0 FAIL、grain 不再閃格），因為它偵測到 3D 背面隱藏就改用濾鏡畫法（`hyperframes check` 報 `motion_blur_filter_fallback`），翻板本身幾乎沒有拖影；要拖影的是平移、甩鏡這類 2D 動作。
- **登錄庫 `grain-overlay` 要排除在動態模糊外**：它每 0.05 秒跳一次位置，和模糊取樣一起會每 3 格閃一次（`flash` 抓到）。透明度 0.15 太髒，紙與平面色用 0.07＋overlay。
- **調色（`media-treatment`、LUT）只套在 `<img>`／`<video>`**：純 HTML 的字卡拍用不到。
- 結論：這一拍能加的內建效果只有顆粒，差別很小；質感要靠第 2 節的字型、圖示、表面。

## 建議的下一步（依見效速度）

1. 01 定案版加 `data-motion-blur`、登錄庫 `grain-overlay` 與一個統一的調色，做「前／後」並排（不用下載任何東西）。
2. 下載昭源黑體、未來熒黑、Phosphor，用之前一支片的標題排四種字並排，讓使用者挑（要下載，先問）。
3. 試 Paper Shaders 的 MeshGradient 當色塊表面，確認算圖逐格穩定。
4. 選定的寫回 `frame.md`、brand kit 的 `_fonts`、`video-motion-craft`。
