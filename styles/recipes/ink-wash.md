---
id: ink-wash
name: 東方水墨
en: Ink Wash
group: G
status: radar
tags: [品牌形象, 高階主管, 知識解說]
example:
updated: 2026-10-19
---

## 一句話
墨在宣紙上暈開、飛白筆觸劃過，大量留白，產品與文字安靜地出現在墨色之間。

## 需要提供
- 片長（建議偏長、節拍少）；主張；一兩個意象（山、水、竹）

## 方向
- 黑墨濃淡＋一點品牌色（像印章）
- 墨滴暈開、筆觸飛白當過場
- 大量留白、直書或橫書皆可
- 禁用：鮮豔多色、快切、科技光效

## 結構
1. 墨滴落下暈開，Logo 如印章蓋上
2. 筆觸劃過帶出產品，主張以書法感字體
3. 數字以淡墨大字
4. 墨色收攏，行動呼籲與網址

## 製作
- 暈開：radial 遮罩＋feTurbulence 置換慢慢放大
- 飛白筆觸：遮罩圖片或 SVG path＋noise
- 字：LXGW 文楷或 Noto Serif TC
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 節拍要慢（每拍 3 秒以上）
- 書法字只用於短詞

## 參數
- 底 #f5f2ea、字 #1c1c1c、#b23a2b
- 緩動：slow

## 參考
- 特偉：山水情（1988，水墨動畫）：https://acas.world/2020/08/12/feelings-of-mountains-and-rivers-minimalism-and-monumentalism-in-motion/
