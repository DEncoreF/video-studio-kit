# 交接：BRIEF.md 與 SPEC.md

**用在**：第 8 步定版。`frame.md`（外觀）與 `STORYBOARD.md`（分鏡）在前面已經寫好；這一步再寫兩份放在片子資料夾根目錄：`BRIEF.md` 記使用者確認過的事實，`SPEC.md` 是給 `/hyperframes` 的導演規格。

背景：上游 #5651（2026-10-21）刪掉了 `brief-format.md`，`/hyperframes` 不再讀 BRIEF.md。它現在的流程是：超過約 15 秒的新片先寫三條故事線（`references/story.md`），再寫 `SPEC.md`（`references/spec.md`）才開工；使用者已經給了腳本與分鏡時，story.md 說照他們的。所以交接要交 SPEC.md，並寫明故事線與分鏡已核可，製作的 session 才不會重跑故事線，也才讀得到要用哪兩個 skill。

## 1. BRIEF.md：使用者確認過的事實

YAML frontmatter＋本文。讀它的是 `scripts/brand-qa.mjs`（`fps`、`allow_terms`）和下一個接手的 session。

| 欄位 | 意思 | 例 |
|---|---|---|
| `message` | 這支片唯一要讓人記住的一句 | `"資料不出門，AI 照樣用"` |
| `audience` | 給誰看 | `醫院資訊主管` |
| `destination` | 在哪裡播 | `展會大螢幕` |
| `aspect` | 畫面比例 | `1920x1080` |
| `fps` | 交件幀率，不寫就是 60（brand-qa 驗交件檔） | `60` |
| `length` | 片長 | `45s` |
| `language` | 語言 | `zh-TW` |
| `brand` | 品牌套件 | `novamind` |
| `narration` | 旁白（聲音或 `none`） | `zh-TW-YunJheNeural` |
| `allow_terms` | 使用者核可的本片禁用詞例外（brand-qa 讀） | `[醫療]` |

上游已退役的 `workflow`、`flow`、`storyboard` 不寫。

本文：素材（`路徑 — 是什麼、用在哪`）、調整需求、不能出現的內容、定版風格與 `direction/<id>/style/` 路徑、腳本與分鏡的位置、`direction/ruler.md`。改片長或結構時同步更新。

## 2. SPEC.md：給 /hyperframes 的導演規格

格式照 `<tool>/.claude/skills/hyperframes/references/spec.md` 的範本（GOAL … QA 九行）。SPEC.md 只是摘要，數字從已核可的檔案抄過去，不在這裡另訂。兩邊對不上時以來源檔為準，改來源檔時要同步改 SPEC.md。

開頭固定寫這三行：

```text
故事線與分鏡已核可（video-direction）：不寫 STORYLINES.md，照 STORYBOARD.md 做；外觀以 frame.md 為準，分鏡以 STORYBOARD.md 為準。
製作與修改動態（讀點、停留、轉場、節拍、流暢度）時用 /video-motion-craft；每一版草稿與試片給使用者看之前都要過 /video-draft-review（review-pack --check 寫出 PASS.json 才可以送）。
關鍵時刻與轉場用 hf.mjs snapshot --at … --against <參考.mp4> 和 direction/ruler.md 的尺並排比，差距寫進 REVIEW.md。
```

| 行 | 從哪裡來 |
|---|---|
| GOAL | BRIEF `message`：看完要記得或去做的事 |
| OUTPUT | HyperFrames、BRIEF `aspect`、`fps` |
| TIME | BRIEF `length` × `fps` 換成格數；對拍的片子加 BPM 與每拍格數（`direction/treatment.md`） |
| LOOK | `frame.md` frontmatter：底、字、唯一強調色與它代表的事、材質；照抄 hex、字族、字重、px |
| OBJECTS | `direction/script.json` 每一拍要讓人認得的東西，和讓它不用標籤也認得的材質與細節 |
| MOTION | `frame.md` 的 `## Motion`：命名緩動、彈簧阻尼比、格數（數字出自 video-motion-craft 的尺） |
| SHOTS | 每景一行，照 `STORYBOARD.md`：格數範圍、唯一的主動作、要讀的字與它的讀點時間、音效、接縫表的交棒（`transition_in`） |
| BANNED | `frame.md` 的 `## Banned`；上游 spec.md「BANNED by default」裡本片沒列又沒例外的也加進來 |
| QA | 要檢查的格：treatment.md 的四張關鍵靜幀（hook、主角、最密、結尾）與每個主角拍，各寫應該看到什麼 |
