---
id: paper-diorama
name: 立體紙雕
en: Paper Diorama
group: F
status: radar
tags: [產品介紹, 品牌形象, 活動宣傳]
example:
updated: 2026-10-19
---

## 一句話
多層剪紙像舞台布景層層疊起，有真實陰影與景深，鏡頭推進時各層視差移動。

## 需要提供
- 片長與節拍數；可做成場景的意象（城市、辦公室、機房）

## 方向
- 4–6 層紙片，每層有投影；柔和色紙
- 鏡頭推近時前景快、背景慢（視差）
- 元素彈起像立體書
- 禁用：扁平無陰影、霓虹、寫實照片

## 結構
1. 立體書翻開，Logo 立起
2. 辦公室場景層疊，產品從中間升起
3. 數字做成立起的紙板
4. 鏡頭後退，整個場景收成一本書＋網址

## 製作
- 每層 div 加 drop-shadow；視差用不同 x/y 速度
- 立起：rotateX 90→0（transform-origin bottom）
- 字：Noto Sans TC 900，放在紙卡上
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 層數太多會讓畫面髒，最多 6 層
- 字不要做成紙雕（難讀）

## 參數
- 底 #f6e9d7、字 #2d2a26、#725ff7、#7fc8a9、#f4a259
- 緩動：smooth

## 參考
- Blinkink × Kyle Bean：Peugeot Paperwork（立體紙雕定格）：https://vimeo.com/35385239
- LACEY：Target／Pinterest 紙藝動畫：https://vimeo.com/97120500
