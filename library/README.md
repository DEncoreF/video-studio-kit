# library

工具內建的共用資料。每個人自己的參考紀錄、品味與 inbox 不放這裡，放在個人層（預設 `~/.video-studio/`，見 `scripts/profile.mjs`）：

- 個人層 `references-log.jsonl`：每支影片找到或使用者提供的參考，一行一筆，由 `scripts/refs.mjs add` 寫入；同時寫進該影片的 `references.md`（D10）。下一支片先 `node scripts/refs.mjs search <關鍵字>`。
- 個人層 `inbox/`：使用者丟進來的參考檔（截圖、影片、PDF），不進成片（D7）；`node scripts/refs.mjs inbox` 列出還沒記錄的檔。
- 本資料夾 `motion/ruler-ease.js`：轉場尺量到的緩動與時長（見 video-motion-craft 的 references/transition-ruler.md），複製進片子使用。
- 本資料夾 `motion/camera-presets.json`：67 種運鏡的固定名稱（中／英，取自 Higgsfield 的 Camera Controls）＋看起來怎樣＋在 `.world` 上的 GSAP 作法＋從預覽片量到的方向、量級與時間（`scripts/measure/globalmotion.py`）；來源與限制見 `docs/research/higgsfield-camera-presets.md`。
- 本資料夾 `text-effects.json`：40 種文字效果的固定名稱（中／英）＋ HyperFrames registry 元件或 GSAP 作法＋中文可用性。提示詞與推薦都用這套名稱。
- 本資料夾 `finish-recipes.json`：光暈、陰影、玻璃、顆粒的做法表：固定名稱（中／英）＋量到的數字（1080p px）＋ CSS 或登錄庫元件＋出處與狀態（approved／measured／untested）。量法與怎麼補表見 video-direction 的 `references/look-extraction.md`。

## 資源庫頁面

`node scripts/gallery.mjs`（http://localhost:4320，加 `--video videos/<影片>` 會多「本片候選」）把這些放在同一頁：

| 分頁 | 內容 | 篩選 |
|---|---|---|
| 範例 | **Prompt Motion**：直接讀它首頁的全部作品（標題、作者、類別、預覽、提示詞），不存副本、不用更新；**我的收藏**：你收藏的範例，影片與標籤取自原網站（Raivcoo 的關鍵字與顏色、Prompt Motion 的類別與提示詞），圖片的顏色從圖裡取；**配方**：Claude 照著做的配方 | Prompt Motion 的類別；收藏的網站標籤、顏色 |
| 色票 | 從各配方抽出的配色 | 呈現效果 |
| 文字效果 | 本資料夾 `text-effects.json` 的 40 種，加上個人層 `text-effects.json`（同格式，以 id 合併）；沒有 registry 元件的用個人層 `effect-demos.js` 的示意動畫 | 我的清單／內建、類型、中文可用性 |
| 運鏡 | 本資料夾 `motion/camera-presets.json` 的 67 種運鏡：滑過看 Higgsfield 的預覽、GSAP 作法、量到的方向與速度曲線；選了會寫進 `selection.json`（`camera:<id>`） | 類別、要 3D／分層、量測可信度 |
| HyperFrames 元件 | registry 全部區塊與元件，滑過看動態預覽、複製安裝指令（預覽見下） | 區塊／元件、標籤 |
| 參考網站 | 個人層 `reference-sites.md`，加上從頁面新增的網站 | 分類 |
| 關係圖 | 範例、配方、效果、網站連在一起 | 類型、找節點 |

做片子時在「範例」挑 1–3 支（`selection.json` 的 `ref:<網址>`），Claude 照範例對到配方，沒有對應的就照範例寫新配方。右上角「＋ 加入收藏」只要網址或一張圖片，其他自動帶入；舊的紀錄可以用 `node scripts/refs.mjs enrich` 補上影片與網站標籤。

每個分頁都能搜尋。新增參考（頁面或 `refs.mjs add`）會先打開連結：打不開的（404、網域失效、逾時）不會記錄；網站擋程式讀取的（403 等，例如 Pixabay、Behance）照樣記錄並註明，用瀏覽器開即可。`node scripts/refs.mjs check` 會檢查所有已記錄的參考與 `reference-sites.md` 的網站，加 `--remove-dead` 移除打不開的；離線時可設 `VSO_LINK_CHECK=off` 略過檢查。

右上角「＋ 新增參考」直接寫進 `references-log.jsonl`（和 `refs.mjs add` 同一套檢查，選了影片也會寫該片的 `references.md`）；選「參考網站」則記成 `kind: "site"`，不會改到手寫的 `reference-sites.md`。

關係圖的連線只來自寫下來的欄位，不靠模型推測：參考的 `direction`（風格）、`source_site`（出處）、`effects`（用到的文字效果或 registry 元件）、`tags`，文字效果對應的元件，以及配方內文提到的效果名稱。想讓一筆參考連得更多，就在新增時填「用到的效果」與「出處網站」。

```bash
node scripts/refs.mjs add videos/<影片> --url <網址> --title <標題> --why <為什麼選> --direction <風格 id> --used yes|no|maybe
node scripts/refs.mjs search 拼貼
node scripts/refs.mjs add videos/<影片> --file ~/.video-studio/inbox/<檔> --title <標題> --why <為什麼> --learn <可借用什麼> --by user
node scripts/refs.mjs list --by user   # 使用者提供過的參考
node scripts/refs.mjs inbox            # inbox 裡還沒記錄的檔
npm run hf -- add <registry 元件名>   # 例如 vox-annotate、split-flap-board
```
