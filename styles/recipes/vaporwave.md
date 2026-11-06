---
id: vaporwave
name: 蒸氣波
en: Vaporwave
group: C
status: radar
tags: [社群行銷, 活動宣傳]
example:
updated: 2026-10-19
---

## 一句話
紫粉漸層的夕陽、透視網格地板、希臘石膏像與舊電腦視窗，慢速、懷舊、略帶反諷。

## 需要提供
- 片長；主張（可中英混排、全形英文）；適合社群、活動、潮流品牌

## 方向
- 漸層夕陽＋地平線網格；舊作業系統視窗框住文字
- 慢速漂浮，偶爾 VHS 掃描線
- 禁用：嚴肅企業語氣、快切、扁平單色

## 結構
1. 網格地板往前流動、夕陽升起 → Logo 在夕陽前
2. 舊視窗彈出寫主張，石膏像或產品圖慢慢旋轉
3. 數字用全形或描邊大字橫跨畫面
4. 畫面像錄影帶倒帶一下 → Logo＋網址

## 製作
- 網格：CSS perspective＋repeating-linear-gradient，backgroundPosition 位移
- 夕陽：linear-gradient＋水平條紋遮罩
- VHS：短暫 RGB 位移（text-shadow 紅藍錯位）

## 注意
- 反諷語氣只適合輕鬆題材，企業正式場合不要用
- 石膏像等素材要確認授權

## 參數
- 底 #1d0f3b、字 #ffffff、粉 #ff71ce、青 #01cdfe、紫 #b967ff
- 緩動：slow

## 參考
- 使用者提供的 20 種風格清單 #14
