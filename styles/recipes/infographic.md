---
id: infographic
name: 資訊圖表動態
en: Infographic Motion
group: H
status: radar
tags: [數據呈現, 知識解說, 高階主管]
example:
updated: 2026-10-19
---

## 一句話
數據變成會長的長條、會轉的圓環與流動的連線，每個數字都有圖形化的證據。

## 需要提供
- 片長與節拍數；有出處、經核可的數據（必備）

## 方向
- 品牌色系的圖表元素；乾淨網格；圖示
- 數字跳動、長條生長、線條流動
- 每個畫面一個主要圖表
- 禁用：沒有出處的數字、裝飾過多、3D 圖表

## 結構
1. Logo 由圖表元素組成
2. 產品流程以節點圖呈現
3. 數字跳動＋長條／圓環生長
4. 重點整理成三個圖示＋行動呼籲

## 製作
- 數字跳動用 GSAP 計數（snap 整數）；長條 scaleX
- 連線用 SVG path 流動（dashoffset）
- 字：Noto Sans TC 700／900，數字用等寬
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 數據必須有出處與核可，否則標「情境示意」
- 圖表單位與比例要正確，不可誇大

## 參數
- 底 #f7f8fb、字 #14213d、#725ff7、#2ec4b6、#ff9f1c
- 緩動：expo

## 參考
- Hans Rosling：200 Countries, 200 Years, 4 Minutes（BBC）：https://www.youtube.com/watch?v=jbkSRLYSojo
