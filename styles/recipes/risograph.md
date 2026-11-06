---
id: risograph
name: Risograph 印刷
en: Risograph Print
group: D
status: radar
tags: [產品介紹, 品牌形象, 社群行銷, 知識解說]
example:
updated: 2026-10-19
---

## 一句話
兩三種油墨在米白紙上疊印：網點、顆粒、略微錯位的套色，畫面像一張張印出來的小誌，換頁時新的一張蓋上來。

## 需要提供
- 片長與節拍數；主張、產品畫面（會被印成單色網點）、行動呼籲
- 品牌主色（當作其中一種油墨）

## 方向
- 油墨只用 2–3 色：品牌主色＋一個螢光色（粉或黃）＋深色字；疊印處用 multiply 產生第三色
- 文字與色塊進場時先錯位、再「對準」，像印刷套版；全程 12fps 頓挫
- 產品畫面印成單色網點（duotone），旁邊保留乾淨的白紙標籤放 Logo
- 禁用：漸層、陰影、玻璃擬態、Logo 套色錯位或換色

## 結構
1. 白紙送進來 → 大字以兩色錯位印上、對準 → Logo 貼在乾淨標籤上
2. 產品畫面印成網點、標題用深色疊印、標籤像蓋章
3. 數字以兩種油墨疊成第三色，下方一行說明
4. 新的一張紙蓋上：行動呼籲、網址、Logo

## 製作
- 紙：米白底＋`H.noise` 顆粒；油墨層 `mix-blend-mode: multiply`
- 套色錯位：同一段字做兩層（品牌色、螢光色），offset 從 18px 以 steps(4) 收到 3px
- 網點：`radial-gradient` 小圓點遮罩＋grayscale 圖片 multiply 在品牌色上
- 換頁：整張紙由下往上滑入，steps(6)
- 字：Noto Sans TC 900；英數可用 Instrument Serif 斜體點綴

## 注意
- 錯位幅度最後要留 2–4px，太大會像故障、太小就看不出印刷感
- 網點化會讓介面截圖變糊，畫面上的小字不要指望看得清，重點用大字另外寫
- Logo 放在乾淨標籤上，不參與錯位與疊印

## 參數
- 底 #f3efe6、字 var(--brand)、油墨 var(--accent)、螢光粉 #ff5b8a
- 緩動：steps

## 參考
- Magdalene Kennedy：Risograph animation（套色、顆粒、錯位）
- Motion graphicsTV：Riso 逐格印刷動畫
