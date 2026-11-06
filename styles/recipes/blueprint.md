---
id: blueprint
name: 藍圖工程圖
en: Blueprint
group: H
status: radar
tags: [產品介紹, 功能展示, 知識解說]
example:
bans: [photo]
updated: 2026-10-19
---

## 一句話
深藍底白線的工程藍圖：尺寸標註、剖面圖與網格，產品被一層層「拆解」說明。

## 需要提供
- 片長與節拍數；產品結構或系統架構（可簡化）

## 方向
- 深藍底＋白／淺青細線；方格網
- 尺寸線、標註、剖面、爆炸圖
- 線條逐條畫出，零件分離再組合
- 禁用：照片、暖色、圓潤卡片

## 結構
1. 網格展開，Logo 以白線描出外框後填色
2. 產品架構圖畫出，各模組標註名稱
3. 數字以尺寸標註方式出現
4. 零件組合完成，行動呼籲與網址

## 製作
- 線條：SVG stroke 動畫；網格：repeating-linear-gradient
- 爆炸圖：各零件 y 位移分離再回位
- 字：等寬字＋Noto Sans TC 500
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 架構圖要經技術人員確認，不可誤導
- Logo 保持原色，不改成白線

## 參數
- 底 #0f2a4a、字 #e8f1ff、#7fdbff、#725ff7
- 緩動：smooth

## 參考
- Blueprint 的視覺語彙（維基百科，靜態；動態參考待補）：https://en.wikipedia.org/wiki/Blueprint
