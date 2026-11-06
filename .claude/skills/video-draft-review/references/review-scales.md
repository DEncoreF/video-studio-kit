# 審片：三種尺度、和尺並排、一輪一變數

用在 video-draft-review 的流程（SKILL.md 第 3–6 步）。關卡本身（量測、PASS.json、豁免）寫在 [gate.md](gate.md)，「看起來像生成的」清單在 [failure-list.md](failure-list.md)。

使用者 2026-10-24：「如果今天沒有我跟你溝通，你會怎麼精進自己？」原則：不靠感覺說「應該可以」。每一版給人看之前，先用尺和數字自己挑一輪毛病，修掉，再寫下沒修掉的。

## 1. 三種尺度審片，有預算

讀程式看不到動作。每一版給使用者看之前，用 `review-pack.mjs` 產生審片包，三種尺度都看（每一格左上角有影格編號，清單的答案要引用它）：

| 尺度 | 看什麼 | 預算 |
|---|---|---|
| 總覽表 | 整支一秒一格（`sheet.jpg`）；每一拍每 0.2 秒一格（`beats/`）：只看這張表，這一拍的事件讀得出來嗎？ | 每一拍至少一張 |
| 逐格表 | 每個接縫（含開場、結尾）前後 0.4 秒逐格，60 fps 每 2 格一張（`seams/`）：有沒有跳格、凍住、硬開硬停、所有部件同時動 | 每個關鍵動作、每個接縫一張 |
| 全解析度 | 重要讀點起訖的靜圖（`reads/`），和讀點寫了 `crop` 的地方（`crops/`）：字、數字、游標碰到按鈕沒有 | 每個帶故事的細節一張 |

每一格都問：**觀眾現在看哪裡？看懂了沒？**（清單不再逐拍、逐接縫、逐讀點問這一題，但審片的人照樣這樣看；看到的寫進清單 §1 的 `[!]`） 數一下每個讀點拿到幾格（60 格＝1 秒）；只閃過幾格、或和別的讀點共用同一段時間的，觀眾會漏掉。

```bash
node <tool>/scripts/review-pack.mjs videos/<slug> videos/<slug>/renders/draft-N.mp4 --out videos/<slug>/review-draft-N   # 審片包、量測、時間圖、清單
node <tool>/scripts/review-pack.mjs --check videos/<slug>/review-draft-N               # 量測沒有 FAIL、清單答完且引用了影格才是 0
```

審片包會一起跑 script-lint、beat-check、動態量測（和 motion-profile.py 同一個量法）、film-metrics，結果放在同一個資料夾，另有計畫 vs 成片的時間圖（`timing.txt`、`timing.png`）。審片包（`review/`、`review-*/`）和 `renders/` 一樣不進版控。

## 2. 和尺並排（每一版都做；關卡必過）

審片包自動做：`direction/rulers.json` 列出尺的本機影片與 moments，`review-pack.mjs` 產生 `ruler/side-by-side.jpg` 與 `ruler/metrics.txt`，清單 §3 要引用影格總結構圖、主體、材質、數字哪一項差最多、差在哪。沒有 rulers.json 就過不了關（D 片草稿 1–4 跳過這一步，使用者：「感覺整體不夠專業」）。手動的量法：

```bash
bash <tool>/scripts/film-metrics.sh renders/draft-N.mp4 <尺1.mp4> <尺2.mp4>   # 尺的影片放暫存資料夾
```

- 比較這些數字：切點數、平均動態量、跳動起伏、大跳動格、最長靜止、「停」的長度、響度與突然變大聲的點。
- 數字不是目標，只是差距的提示；差距大的地方，回到那一段看格子。
- 再取同一類的時刻並排看：自己的主角拍對尺的主角拍，自己的轉場對尺的轉場。
- 寫下差在哪：光、材質、字、速度、緩動。

## 3. 用評分表看腳本，用接縫表看轉場

- 照 video-direction 的 script-craft.md 第 8 節逐條打勾，每條指出是哪一行。
- 照 video-direction 的 transitions.md 看接縫：同一手法有沒有連用三次、主角拍的接縫是不是最強。
- 照 video-direction 的 visual-verbs.md 看變形：每個變形有沒有動詞、主角記號有沒有斷掉。

## 4. 一輪只改一個變數

- 腳本、字句、節奏、風格、材質擇一。同一輪改兩個以上，使用者就無法判斷問題在哪。
- 回報時寫：這一輪改了什麼、為什麼、哪裡還沒改。

## 5. 把每次的教訓寫回去

- 使用者否決或糾正：原話＋學到的規則，寫進該 skill 的 FEEDBACK.md（`日期｜情境｜原本｜應改成`），累積後折進 SKILL.md 或 references：
  - 動態、時間、轉場怎麼做 → `video-motion-craft/FEEDBACK.md`；
  - 審片漏抓（使用者用眼睛抓到、這一關沒擋下來的）→ 照 SKILL.md「漏抓的時候」；
  - 腳本、分鏡、風格 → `video-direction/FEEDBACK.md`。
- 和品味有關的：提議寫進品味檔（使用者同意才寫）。
- 新找到、看過的參考：一律用 `refs.mjs add` 記錄，量過的寫進 ruler。
