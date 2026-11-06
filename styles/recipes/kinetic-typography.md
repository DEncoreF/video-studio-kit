---
id: kinetic-typography
name: 動態字體
en: Kinetic Typography
group: E
status: radar
tags: [社群行銷, 活動宣傳, 品牌形象]
example:
updated: 2026-10-19
---

## 一句話
畫面幾乎只有字：字隨節拍放大、拆開、旋轉、堆疊，文字本身就是動畫主角。

## 需要提供
- 片長與配樂節拍（BPM）；短促有力的文案，每拍 2–6 字

## 方向
- 字級對比極大，一個畫面一個詞為主
- 動作對拍：每拍一次縮放、切換或拆字
- 最多兩色＋品牌色當重點
- 禁用：長段落、照片背景、慢速淡入

## 結構
1. Logo 由字母拼出或在大字之間出現
2. 產品主張逐詞砸進畫面、互相推擠
3. 數字以逐位翻轉或放大鏡頭呈現
4. 行動呼籲字詞依序對拍出現，最後收成網址

## 製作
- SplitText 或 H.chars 拆字；stagger 對拍（120 BPM 每 0.5 秒）
- 大字用 scale 從 3→1，搭配 clip-path 切字
- 字：Noto Sans TC 900；中文每字當一個單位
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 每個畫面停留至少 0.6 秒，否則讀不完
- 中文不要逐筆畫拆解，拆到字為止

## 參數
- 底 #111111、字 #f5f5f5、#ffd23f、#725ff7
- 緩動：snap

## 參考
- Saul Bass：North by Northwest 片頭（1959）：https://www.artofthetitle.com/title/north-by-northwest/
- Tom Kan：Enter the Void 片頭（字型連發、對拍快切）：https://www.artofthetitle.com/title/enter-the-void
