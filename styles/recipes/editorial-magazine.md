---
id: editorial-magazine
name: 編輯雜誌排版
en: Editorial Magazine
group: E
status: radar
tags: [品牌形象, 產品介紹, 高階主管]
example:
updated: 2026-10-19
---

## 一句話
雜誌跨頁般的版面：大標、引言、圖說與照片框交錯，翻頁或欄位滑動帶出下一頁。

## 需要提供
- 片長與節拍數；每拍一句大標＋一段引言；有質感的產品照或介面圖

## 方向
- 襯線大標＋無襯線內文，留白充足，像紙本雜誌的欄位系統
- 頁碼、欄線、圖說、引號等編輯元素當作裝飾
- 每拍是一個新的跨頁；圖片以遮罩展開
- 禁用：密集資訊圖表、霓虹、彈跳緩動

## 結構
1. 封面：刊名式大字＋期數＋Logo
2. 內頁：照片框＋大標＋引言
3. 數據頁：大數字當跨頁主視覺＋圖說
4. 封底：行動呼籲與網址，像雜誌版權頁

## 製作
- 欄位網格用 CSS grid；翻頁用 rotateY 或整頁 x 位移
- 照片遮罩 clip-path inset 展開；引號字放大當裝飾
- 字：Noto Serif TC 900 標題＋Noto Sans TC 內文；緩動 expo
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 引言要短（12 字內），長段落在影片上讀不完
- 每頁一個視覺焦點，不要真的排滿雜誌內容

## 參數
- 底 #f5f1e8、字 #1b1b1b、#c2410c、#1e3a8a
- 緩動：expo

## 參考
- Gretel：The New York Times Magazine 片頭 Logo 動畫（網點聚合成刊頭；雜誌版面網格的動態參考待補）：https://gretelny.com/new-york-times-magazine
