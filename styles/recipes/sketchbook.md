---
id: sketchbook
name: 手繪筆記
en: Sketchbook
group: F
status: radar
tags: [知識解說, 功能展示, 產品介紹]
example:
updated: 2026-10-19
---

## 一句話
像筆記本上邊講邊畫：鉛筆線條畫出流程、箭頭和圈選，重點被螢光筆標出。

## 需要提供
- 片長與節拍數；要解說的流程或功能（3–5 步）

## 方向
- 方格或橫線筆記紙；鉛筆／原子筆線條；螢光筆重點
- 線條逐筆畫出（stroke 動畫），偶爾手寫字
- 箭頭、圈選、便利貼連接各元素
- 禁用：完美幾何、漸層、3D、科技光效

## 結構
1. 筆記紙翻開，Logo 被圈起來
2. 流程圖一筆一筆畫出，產品截圖貼上去
3. 數字用手寫大字，下面畫兩條線強調
4. 行動呼籲寫在便利貼上，網址被螢光筆劃過

## 製作
- SVG path stroke-dashoffset 畫線；路徑加輕微抖動顯得手繪
- 螢光筆：半透明色塊 scaleX 由 0 到 1
- 字：LXGW 文楷（手寫感）＋Noto Sans TC
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 手寫字只用於短詞，長句用正常字型
- 線條粗細要有變化，太均勻會像電腦畫的

## 參數
- 底 #fbf8f1、字 #2b2b2b、#ffe066、#725ff7
- 緩動：slow

## 參考
- Cognitive Media：RSA ANIMATE Drive（邊講邊畫）：https://www.youtube.com/watch?v=u6XAPnuFjJc
