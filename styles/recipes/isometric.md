---
id: isometric
name: 等角插畫
en: Isometric Illustration
group: H
status: radar
tags: [產品介紹, 知識解說, 功能展示]
example:
bans: [photo]
updated: 2026-10-19
---

## 一句話
30 度等角視角的小世界：辦公室、機房、部門被做成積木般的場景，資料在其間流動。

## 需要提供
- 片長與節拍數；要呈現的場景或流程

## 方向
- 等角網格；柔和色塊與簡單陰影面
- 積木、小人物、伺服器、連線
- 物件從地面升起、資料光點沿路徑流動
- 禁用：透視混亂、寫實照片、霓虹

## 結構
1. 等角平台升起，Logo 立在上面
2. 各部門積木排開，產品居中連線
3. 數字變成高低不同的積木塔
4. 鏡頭拉遠成全景，行動呼籲與網址

## 製作
- 等角：CSS transform rotateX(60deg) rotateZ(45deg) 的平面＋側面
- 物件升起：y 位移＋scaleY
- 字：Noto Sans TC 700，放在正面不做等角變形
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 文字不要做等角變形（難讀）
- 容易變成制式企業風，配色要有個性

## 參數
- 底 #eef1f7、字 #1f2a44、#725ff7、#7fd1b9、#f2c14e
- 緩動：smooth

## 參考
- ustwo games：Monument Valley（等角視角）：https://www.monumentvalleygame.com/
