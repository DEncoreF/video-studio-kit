---
id: linocut
name: 木刻／麻膠版畫
en: Linocut Print
group: F
status: radar
tags: [品牌形象, 知識解說, 社群行銷]
example:
updated: 2026-10-19
---

## 一句話
粗獷的刻線與墨色塊，像手刻版畫逐張印出，邊緣有刻刀痕跡和油墨不均。

## 需要提供
- 片長與節拍數；簡單有力的圖像意象（工具、建築、人物）

## 方向
- 一兩色油墨＋紙色；大塊墨色與白色刻線
- 形狀邊緣粗糙，有刻刀紋理
- 動作逐格（6–8fps）像一張張印出
- 禁用：細線、漸層、精緻 UI、光澤

## 結構
1. 刻刀劃過，Logo 從墨塊中「刻」出來
2. 產品以版畫圖像呈現，主張用粗字
3. 數字以白色刻字在黑墨塊上
4. 最後一張版畫：行動呼籲＋網址

## 製作
- SVG feTurbulence＋feDisplacementMap 讓邊緣粗糙；墨紋用 noise 遮罩
- 逐格：steps(6)，每 1/8 秒換一個略不同的版本
- 字：Noto Sans TC 900，必要時加粗糙描邊
- Logo 一律用 H.logo 放在乾淨的位置，不參與風格效果（不變形、不換色、停留時不動）

## 注意
- 介面截圖不適合直接放，改成版畫化的簡化圖示
- 逐格太慢會顯得卡頓，節拍內至少 6 張

## 參數
- 底 #f1ebe0、字 #1a1a1a、#d94b2b
- 緩動：steps

## 參考
- Cartoon Saloon：Wolfwalkers 城鎮場景（仿木刻風格動畫）：https://mande.net/btl/crafts/visual-fx/wolfwalkers-animation?amp=0
