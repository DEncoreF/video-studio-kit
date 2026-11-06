---
id: saul-bass
name: Saul Bass 片頭
en: Saul Bass Titles
group: G
status: radar
tags: [品牌形象, 活動宣傳, 產品介紹]
example:
bans: [photo]
updated: 2026-10-19
---

## 一句話
1950–60 年代電影片頭的剪紙色塊：粗糙邊緣的長條與圖形俐落切換，手寫感字體穿插其中。

## 需要提供
- 片長與節拍數；主張與幾個可簡化成剪影的意象

## 方向
- 2–3 個平塗色（品牌色＋黑＋紙白）
- 剪紙邊緣略粗糙的長條、剪影、箭頭
- 色條劃過畫面切換場景
- 禁用：漸層、寫實照片、細緻介面

## 結構
1. 色條交錯劃過，留下 Logo
2. 剪影化的人物與產品，主張在色條上
3. 數字被長條框住
4. 色條收攏，行動呼籲與網址

## 製作
- 長條用 clip-path 劃入；邊緣用 feTurbulence 微粗糙
- 切換用 steps(3) 或硬切
- 字：Noto Sans TC 900；英文可用手繪感字型
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 色條數量節制，每個畫面一個主要動作
- 剪影要能看出是什麼

## 參數
- 底 #f1e6cf、字 #141414、#e04e2a、#725ff7
- 緩動：snap

## 參考
- Saul Bass：Anatomy of a Murder 片頭（1959）：https://www.artofthetitle.com/title/anatomy-of-a-murder
