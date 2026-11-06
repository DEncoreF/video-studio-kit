# Claude 做影片的極限與擅長：研究筆記

2026-10-29。使用者：「先去了解 claude 本身製作影片的工具，先摸清楚極限跟提升擅長做的東西的品質」。只做研究，沒有安裝或呼叫付費服務。標記：「官方」＝廠商自己的文件；「二手」＝部落格、教學、評測；「未查證」＝只看到搜尋摘要或單一來源。rescroll.ai、eesel.ai、remotion.dev 在雲端環境的網路白名單外，只看到搜尋摘要。

## 結論

品質卡住的原因不是規則不夠細，是三個天生的限制。skill 要繞開它們，集中在擅長的事：

1. **看得懂靜圖，看不懂動態。** 構圖、字、版面從截圖判斷得不錯；速度、節奏、順不順從抽格判斷不出來。→ 動態交給量測（review-pack）抓錯，交給使用者挑（campaign），不要讓 Claude 自評「有沒有質感」。
2. **用程式做動態有擅長和不擅長的。** 擅長文字、介面、數據、版面、精準對拍、做很多版本；不擅長插畫、手繪、有機變形、角色、寫實、元素很多的複雜畫面。→ 規劃時每一拍先決定程式、素材還是外包（video-direction `references/capabilities.md`）。
3. **品味來自餵進去的素材。** 沒有參考、品牌規範、真實產品畫面與設計好的元件，就是通用的預設長相。→ 範例庫（`scripts/exemplar.mjs`）、HyperFrames 登錄庫、設計素材當起點。

另外一個實務觀察：AI 會把已經可以的版本越修越糟，有人用「最多修兩輪」停損（未查證）。→ 一個問題修兩輪還不行就開 campaign 或換做法。

## 發現

### 工具

- **HyperFrames**（HeyGen，2026-04 開源）：HTML＋CSS＋GSAP（也支援 Lottie、Three.js、Anime.js、WAAPI），headless Chrome 逐格 seek、FFmpeg 編碼，同樣的輸入出同樣的影片；約 450 個登錄庫區塊（轉場、字幕、圖表、地圖、3D、鏡頭）。頁面沒有列出已知限制（官方：<https://github.com/heygen-com/hyperframes>；二手：<https://themenonlab.blog/blog/hyperframes-claude-code-writes-renders-videos>）。
- **Remotion＋Claude Code**：實作者共同的經驗——簡單的圖表、文字動畫、成長曲線做得好；很多箭頭、手繪元素、元素很多的版面會亂；含糊的需求得到預設長相；先渲靜圖再渲整支；一次改一小處比整段重寫好（二手：<https://github.com/ThamJiaHe/claude-code-handbook/blob/main/docs/motion-graphics-claude-remotion-guide.md>、<https://www.mindstudio.ai/blog/remotion-claude-code-animated-logo-reveals-motion-graphics>、<https://www.wireflow.ai/blog/claude-motion-graphics>）。
- **為什麼看起來平**：要檢查靜圖的重疊與「什麼都沒在動」的空檔；開場、Logo 揭示、發表鏡頭這種時刻，動態設計師通常贏過幾輪提示（二手：<https://autoae.online/blog/claude-remotion-videos-look-flat>）。
- **Claude Motion**（Anthropic，2026-10-08，Team／Enterprise beta）：同樣是程式做的動畫，不用影片生成模型、不產生寫實人物，從使用者自己的素材做說明動畫，可匯出 MP4；長度與解析度上限沒有公開（二手：<https://www.unite.ai/anthropic-launches-claude-dashboards-and-motion-takes-docs-out-of-beta/>）。

### 看片能力

- **Moment-Video**（2026-06）：短暫、關鍵的畫面事件，最好的模型約 39.6%，多數開源模型低於 25%；抽更密的格只改善一部分（<https://www.alphaxiv.org/abs/2606.02522>）。
- **TimeBlind**（2025）：逐格的視覺編碼偏重空間，抽格會丟掉時間資訊；拿掉空間線索的測試裡最強的模型也大幅失敗（<https://arxiv.org/html/2505.24867v1>）。
- **MotionBlind**（2026-09，未查證）：方向與速度，開源模型接近亂猜，更多格或更聰明的選格都補不起來。
- 有效的「渲染 → 看 → 修」回圈都在靜圖層面：Kubrick（Blender，審查者看中間截圖回饋）、Manim 解說片（視覺模型抓重疊、字讀不清、被裁切）（<https://arxiv.org/html/2408.10453v2>、<https://arxiv.org/pdf/2601.13453>）。

### 品味與素材

- LLM 產生的介面有設計品質問題，用設計規範當知識庫去修（DesignRepair，<https://web3.arxiv.org/abs/2411.01606>）；給一個範例就能明顯改善版面（<https://ar5iv.labs.arxiv.org/html/2310.15455>）。
- 「每個 AI 工具都給你同樣通用的彈跳動畫」是常見抱怨（廠商說法：<https://www.producthunt.com/products/automotion-dev>）。
- 量產用 After Effects 範本＋自動化（nexrender）是業界的另一條路：設計師做範本，程式換內容、批量出片（<https://github.com/inmagik/nexrender>）。這個工具已經有 `scripts/ae-export.mjs` 可以往 AE 走。

## 對這個工具做的改變

| 限制 | 改了什麼 |
|---|---|
| 看不懂動態的感覺 | `scripts/campaign.mjs`：主角時刻與代表性接縫同時做 2–3 種，並排給使用者挑，選擇記成範例 |
| 程式有擅長與不擅長 | video-direction `references/capabilities.md`；每一景標 `made_by: code / asset / outsource` |
| 品味來自素材 | `scripts/exemplar.mjs` 範例庫；元件來源依序是範例 → 登錄庫 → 自己寫 |
| 越修越糟 | 一個問題修兩輪還不行就開 campaign 或換做法（video-motion-craft） |
| 規則太多、互相矛盾 | 數字只在 `library/rules/motion.json`，skill 的表自動產生 |
