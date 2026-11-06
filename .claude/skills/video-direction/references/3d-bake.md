# 3D 寫實鏡頭：怎麼算圖

用在規劃有寫實 3D 的鏡頭（桌面、裝置、產品）時：決定場景怎麼做、怎麼烘焙、怎麼在合成裡出片。它屬於材質與算圖，不是動態也不是審片，所以留在 video-direction；鏡頭的時間照 video-motion-craft，每版給使用者看之前照樣過 video-draft-review。

## Blender 烘焙＋three.js 出片＋評審迴圈

C 片 的開場（2026-10-24，使用者：「整體可以」）：Blender Cycles 每格 17–22 秒，同一段改成烘焙後在瀏覽器出片，每格約 0.09 秒，並排看接近 Cycles。

**什麼時候用**：只在一定要寫實 3D 的少數鏡頭（主角靜幀、幾秒的插入鏡頭）用；其餘照 SKILL.md「給使用者看之前」的出片媒介，先做 2D 動態設計。Cycles 只用來算**參考影格**（給評審比對）和**單張的關鍵靜幀**（金屬拉絲或玻璃反射的特寫）；動畫不用 Cycles 出片。
- 這條（烘焙後在瀏覽器出片）是 C 片核可過的路，和 E 片被否決的「即時 three.js 材質當寫實主角」不同：E（2026-10-28）用 MeshPhysicalMaterial、CanvasTexture 紙、粒子即時算，使用者：「請你認知一點 hyperframe three.js 做3D 的效果真的不好」。即時 three.js 材質不當寫實主角。
- **開算前先估時間，跟使用者說**：每格秒數 × 格數（60 fps 一秒 60 格），烘焙另計。C 的數字：Cycles 每格 17–22 秒（3 秒插入鏡頭約 1 小時），EEVEE 草稿每格幾秒，烘焙 7 張 views 約 14 分鐘、之後每格約 0.09 秒。總時間超過約 30 分鐘時，先問要不要改成靜幀加 2D 動態。

**做法**：
1. 場景只寫一份：影片自己的 Blender 場景腳本（Cycles 參考也用它算）。材質預設在 `<tool>/scripts/blender/lookdev.py`（環境光、倒角、粗糙度變化、動態模糊）。運鏡先用 EEVEE 草稿確認：`node <tool>/scripts/blender/render.mjs <scene.py> --out <dir> --draft --encode <mp4>`（每格幾秒）；Cycles 是 `render.mjs --final`。
2. 寫 `blender/bake.json`，跑 `nohup blender -b -P <tool>/scripts/blender/bake.py -- --config blender/bake.json > assets/bake/bake.log 2>&1 &`：
   - 一般物件：顏色和光分開烘（光可以小）；鉸鏈部件（上蓋）烘兩個姿勢的光，逐格混合；發光物件（螢幕）另烘一張光，影片自己決定每格多亮。
   - **金屬、玻璃這類主角**（外觀幾乎全是反射）：沿鏡頭路徑每 0.5 秒從鏡頭位置烘一張（`views`），three.js 混最近兩張。這是唯一能把 Cycles 的拉絲、倒角、檯燈漸層原樣帶過來的做法；代價是鏡頭改了就要重烘（C 片的主角 7 張約 14 分鐘）。
3. 把 `<tool>/library/three/baked-scene.js` 複製進片子的 `assets/js`，在合成裡呼叫 `bakedScene({...})`、每格 `render(t, { glow, screens })`。景深與動態模糊用累積算，每格 32 次。
4. **評審迴圈**：`node <tool>/scripts/measure/critic-loop.mjs <片> --ref <Cycles 影格> --at <幾個時間> --regions regions.json`。兩種眼光各看一次總覽圖：
   - **像不像**：對照 Cycles 參考影格，看光、材質、色溫、景深；
   - **有沒有壞**：找沒畫出來的東西、黑掉的面、閃爍、接縫、退步（一個修正弄壞別處）。

   修兩種眼光都同意的前三項，重複到所有區域在亮度 **±10%**、色相 **±15°** 內，最多五輪。主角要另外量局部（`--crop`）。
5. **開始校正前先確認參考影格是用「現在」的場景設定算的**：C 的參考在 look-dev 改版前就開始算，烘焙一直「不像」，查到才發現是參考舊了。

坑與預設的校正值寫在 `library/three/baked-scene.js` 的開頭。
