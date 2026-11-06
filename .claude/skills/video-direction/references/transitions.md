# 轉場詞彙與接縫表

用在第 5 步分鏡（接縫表，每支片都寫）與第 7 步轉場：每個接縫都指定一種手法並寫出理由，避免整支片都用同一招。轉場的數字（長度、緩動、蓄力與過頭、流暢度）屬於 video-motion-craft 的 [transition-ruler.md](../../video-motion-craft/references/transition-ruler.md)；這支片另有尺時，從尺量來（direction/ruler.md 的「轉場」），沒有尺時先用 /watch 量 3–4 支 Prompt Motion「Product UI」「Shapes」類的變形作品。

## 詞彙

**基本六種**（School of Motion）：
- 硬切：打在拍上、下一格是新構圖，一樣可以驚艷（使用者：「硬切也是能驚艷我啊」）
- 溶接：新舊半透明疊在一起；**只用在時間經過，不用在拍與拍的交棒**
- 動作接動作：在動作進行中切
- 配對剪接
- 無限推進：穿過物件到下一個世界
- 變形

**配對剪接靠什麼接**（StudioBinder、Film Lifestyle）：
- **形狀**：同一個輪廓接續，可以當視覺比喻，例如游標箭頭 → 紙飛機。
- **物件**：同一個東西帶過去，例如附檔從信裡被拖進輸入框。
- **顏色**：同一個色塊接續。
- **動作**：前一個動作在下一景完成，例如視窗闔上 → 筆電闔上。
- **聲音**：聲音先進或後出。

**一鏡到底的接縫**（偽一鏡到底：Morphic 的定義）：
- 接縫藏在鏡頭運動、極短的暗格、動態模糊後面。
- 前後兩段的鏡頭運動方向要一致。

**這個工具常用的交棒**：
- 點擊即轉場：點下去，被點的東西長成下一景。
- 原地變形：主角留在原處，型態改變。
- 光的連續：同一道光跨過接縫。
- 疊層錯位。
- 捲起再攤開。
- 穿過玻璃：鑽進螢幕，像素變成下一個世界的格線。
- 條狀掃過、帶模糊甩鏡、色塊淹沒：新畫面跟在條或色塊後面露出（Prompt Motion showreel，內部研究筆記）。

## 接縫表（寫進 STORYBOARD.md）

| 接縫 | 上一景停在 | 手法（詞彙） | 靠什麼帶過去 | 交棒那一格畫面上是什麼 | 為什麼是這個 | 長度／緩動（從尺） |
|---|---|---|---|---|---|---|

規則：
- 開場與結尾也各占一列；開場、結尾和換章節的大變化在小節線上（`bar: true`），主角拍的接縫在拍上（`major: true`），其他接縫盡量在拍上（離拍只提醒；video-motion-craft 的 [reads-and-beat.md](../../video-motion-craft/references/reads-and-beat.md) §9–10）。表的內容同時寫進 script.json 的 `seams`，script-lint 與 beat-check 才查得到。
- **種類與次數**（Cinetic）：全片 6–8 種手法，每種最多用兩次；另外一個**招牌轉場**，從品牌標誌的形狀或這支片的故事物件長出來（例如 NovaMind 標誌的輪廓當遮罩），用三次：開場、中段、結尾。短片接縫不到 6 個時，不重複就好。
- **下一個狀態從上一個的材質長出來**：底線長成數字、紙撕開露出下一景、程式字元散成風暴再解碼回來（Glif 拼貼解說、prod-by-claude、Fable 藝術史速通）。說得出「新的東西是從舊的哪裡長出來的」，比選哪一種詞彙重要；硬切、掃過不用長，但下一格要是新構圖。
- 主角拍的接縫用最強的手法，其餘用輕的。
- 每個接縫都說得出動詞（見 visual-verbs.md）。說不出怎麼交棒的接縫，就是還沒想好的地方。
- 「交棒那一格畫面上是什麼」：寫配對剪接或變形的接縫，要指得出同一個東西在前後兩格都看得到、而且是同一個（不是新長出來的形狀），指不出來就不是配對剪接；硬切、掃過、淹沒寫下一格的新構圖。film E draft 28 的 S5、S7 自稱配對剪接，獨立審片看到的是模糊溶接。
- 交棒那 0.3 秒內，同一個位置不能同時有半透明的新舊內容。
- 不必每個接縫都是配對剪接或變形，也不必一路同一個型態的主角：主角可以隨情境換狀態與性質（finish-layers.md §2）。

## 選了一鏡到底時的故事設計（實測，2026-10-24）

一鏡到底是一種方法，不是預設，也不是限制（使用者 2026-10-29：「一鏡到底，是個方法，但不應該是限制」）。形式在第 1 步訪談決定（連續、蒙太奇、混合）；下面只在選了連續時用。混合的片子，連續的那條主幹照這裡做，中段的快切爆發照上面的接縫表。

逐格看過 Apple「Hello, MacBook Neo」「The new Mac mini with M6」、Linear「Introducing Linear Agent」「Linear Releases」，以及 Notion「Meet Notion Mail」（對照組）。細節在 內部研究筆記。

1. **接縫由主體或手的動作造成**，不靠鏡頭特技。瞬間換狀態放在動態模糊、或物件轉到側面的那 1 格；變形用 6–12 格（30 fps，0.2–0.4 秒）。
2. **乾淨畫面**（純白、黑、雲、填滿畫面的紙）一支片最多 3 次，每次 1.0–2.2 秒，只用來換章節。
3. **可以硬切**：切在動作中，而且主體在畫面上的位置、運動方向、平均亮度（±10%）三樣都不變。Linear 有 4 刀 1 格硬切，看起來仍像一鏡。
4. **永遠有一個主體記號在畫面上**；背景、光的方向、線寬全片不變；暗場要有畫面內的光源當理由。Notion 只靠一架貫穿全片的紙飛機就撐起連續感。
5. **節奏**：有旁白的片子一個狀態 5–10 秒、變完先停 2–3 秒，旁白在停的時候講。沒有旁白的片子停留照上面的轉場尺（要讀的狀態 0.5–2.2 秒），但仍要有停。
6. **結尾回到開場的形態**：Apple 兩支都從闔上的機身開始，也以闔上的機身結束。
7. **實體和 UI 之間**：讓 UI 被拿出螢幕變成實物，裝置留在畫面裡當錨點；要穿進螢幕，就推進一個小元素直到它填滿畫面，不要整個鏡頭穿進螢幕。
8. **每個接縫那一格配一個實物音效**，音樂不斷（音量、同步與素材照 video-motion-craft 的 [sound.md](../../video-motion-craft/references/sound.md)）。

## 出處

- [School of Motion：Six essential motion design transitions](https://schoolofmotion.com/blog/six-essential-motion-design-transitions-tutorial)
- [StudioBinder：Match cuts](https://www.studiobinder.com/blog/match-cuts-types-of-cuts/)
- [Film Lifestyle：Match cuts & creative transitions](https://filmlifestyle.com/match-cuts-creative-transitions/)
- [Morphic：One-take / oner](https://morphic.com/ai-glossary/one-take-oner)
- [uxdesign.cc：Motion design principles](https://uxdesign.cc/a-guide-to-motion-design-principles-7f05f10ccd79)
