---
id: y2k
name: Y2K 數位美學
en: Y2K Aesthetic
group: C
status: trial
tags: [社群行銷, 產品介紹]
example: examples/y2k
updated: 2026-10-19
---

## 一句話
千禧年的鉻銀與果凍質感：液態金屬字、泡泡按鈕、閃光星點，元素有彈性地膨脹與晃動。

## 需要提供
- 片長與節拍數；主張、產品圖、數據、行動呼籲

## 方向
- 淡藍、淡粉、淡紫的漸層底；鉻銀字與果凍膠囊
- 閃光星點（四角星）點綴，彈性緩動
- 禁用：扁平單色、粗黑框、嚴肅襯線

## 結構
1. 鉻銀圓球彈進 → 炸開成 Logo，星點閃一下
2. 果凍膠囊寫主張、產品圖在泡泡裡浮動
3. 數字用鉻銀大字，彈性放大
4. 所有元素縮回一個泡泡 → Logo＋網址

## 製作
- 鉻銀：多段 linear-gradient＋background-clip:text；淺底上用較深的 .chrome-ink 版本
- 果凍：radial-gradient 高光＋inset box-shadow
- 緩動：elastic.out(1, 0.5)

## 注意
- 鉻銀字在淺底上對比會不足，一定要加深版漸層或描邊
- 星點不超過 5 個，避免變成廉價特效

## 參數
- 底 #eef0ff、字 #1b1d3a、藍 #b8e6ff、粉 #ffc6e8、紫 #c9b8ff
- 緩動：elastic

## 參考
- 使用者提供的 20 種風格清單 #16
