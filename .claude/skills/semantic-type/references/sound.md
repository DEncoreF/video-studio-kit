# 語意文字的音效

音效由工具的音效引擎 `pipelines/music/edit.py` 程式合成（不用授權），`semtype.mjs clip` 會把 `sfx.json` 的 cue 經過效果匯流排（低切、柔化高頻、一個小房間殘響）混好、放進片段。搬進正片時，把同樣的 cue 加進那支片配樂 spec 的 `sfx`，時間改成場景起點＋`key`。

搬進正片之後，正片的音效規則照 video-motion-craft 的 `references/sound.md`：音量以「高出音樂底」量、真實的 CC0 錄音優先於合成的音色（材質聲合成出來像純音）、點擊只用一聲柔和的真實點擊。

## 前提：質感
- 質感來自層次（起音、主體、尾音）、材質貼合、動態與節制，不是挑某一種音色（「有玻璃不代表有質感」）。
- 一個動作配一個聲音；需要重量時，主聲音下面墊一個很輕的 impact（`gain` 0.4–0.6），不要疊三四層。
- 不要可愛：往上滑的正弦嗶聲、8-bit 晶片音（chip_*）在產品片裡顯得不專業。
- 寫實不一定較好：專做的門閂（latch）、粉筆（chalk）比之前簡潔的 click＋impact、slide 不受歡迎。拿不準時給兩個選項，簡潔的放前面。

## 依動作與材質挑

| 動作（材質） | 首選 | 其他 | 核可過的用法 |
|---|---|---|---|
| 落地、有重量（字、物件） | dust（柔和顆粒塵）＋ whoosh `dir: "d"` | thunk（實心金屬落定、無餘響）、appear_soft（輕放）、impact（大場面才用） | 在地端：dust＋下沉 whoosh |
| 柔軟、濕的落下 | squelch | plop | 果凍落地 |
| 門甩上、鎖住 | click＋impact | latch（木門＋門閂）、lock（模組卡入） | 資料不出門：click＋impact |
| 按下、蓋章、核准 | stamp（圓鈍的砰＋乾脆的喀） | ＋輕 impact | Agent 治理：stamp＋輕 impact |
| 寫、摩擦（粉筆、紙、筆） | slide（顆粒摩擦） | chalk、tick（打勾） | 教學備課：slide |
| 計數、計量、一格一格 | counter（機械計數輪） | segtick（帶 `f`，每格往上爬） | 7 台：counter；算力管控：segtick |
| 冒出、長出 | pop | appear_soft | 成長計畫：pop |
| 細看、對焦、放大 | lens（短促上升＋玻璃清響） | | 文件審閱：lens |
| 切、劃過 | swish（快而亮的空氣） | tick（刀口）、glitch（只用在負面詞） | |
| 連線、傳輸、通電 | current（乾淨電流，跟著線走左右聲道） | trace（畫線）、node | 一條線串起七個核心：current |
| 掃描、轉成資料 | scan（`dir`）、digitize | blip（介面回應） | |
| 聚合、凝結成形 | condense（顆粒由疏變密，膨脹到 cue） | shimmer、materialize | |
| 收進容器、吸入 | pneumatic（氣送管） | plop、cartridge、coin、collect、boxdrop | |
| 介面點擊、確認 | click → confirm | blip、pane（面板成形） | |
| 進出畫面的空氣 | whoosh（`dir`、`dur`） | swish | |

## cue 的寫法（`sfx.json`）
```json
{
  "key": 1.2,
  "cues": [
    { "t": 1.2, "kind": "stamp", "align": "peak", "why": "橡皮章壓在紙上：圓鈍的砰＋乾脆的喀" },
    { "t": 1.2, "kind": "impact", "dur": 0.5, "gain": 0.5, "why": "蓋下去的重量，很輕" }
  ]
}
```
- `t`：秒。`align: "peak"`：最大聲的那一下對齊 `t`（撞擊、甩上、蓋下都用它）；riser、condense、materialize 會自己在 `t` 結束。
- `gain`：相對音量（預設 1）；`dur`、`f`、`dir`（`u`／`d`／`l`／`r`）只對支援的音色有用（例如 slide、stamp、tick、pop、click 長度固定）。
- `pan`：-1（左）～1（右），依物件在畫面上的位置；`pan_from`／`pan_to`：聲音跟著物件移動。
- `why`：材質＋動作，一句話。沒有理由的 cue 不算過。
- 想換混音空間時加 `"bus": {"room": 0.2, "decay": 0.74, "damp": 0.42, "soften": 11000}`（預設就是這組）。
- 只改音效時重跑 `semtype.mjs clip`，不用改畫面。
