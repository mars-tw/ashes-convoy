# R87 手機內容與操作優化

日期：2026-10-15。版本：**R87／0.87.0**；基線 commit：`bcefb9d`（R86）。
本機功能驗證：VERIFIED。僅處理本 repo、全程 headless，未 push、部署、操作商店或向第三方發送訊息。原有未追蹤的 `docs/playtest/` 未修改、未提交。

## 本輪改動與證據

| 項目 | 實際結果 | 證據 |
|---|---|---|
| 拇指操作 | 右下甩尾放大至 64px，補給／彈種與左側暫停為 48px；左下搖桿保留單手移動＋自動射擊。控制列與車體點擊區拉開間距 | `evidence/r87-mobile/control-metrics.json`、before/after 截圖 |
| 甩尾回饋 | 按住亮起，放開執行；拖出／取消不執行、不消耗。顯示冷卻秒數與攀車數；橫向用正確世界方向，多指操作及旋轉後清除輸入 | 新手機 E2E、原 R86 攀附／命中幀／hurt／death 回歸 |
| 路線任務 | 戰鬥入口開啟路線圖，暫停挑選且可返回。救援領一箱、廢車場甩飛兩隻、火線擊殺六隻；接單產生真正補給／敵人，24／24／28 秒內完成領獎，每波最多接一單 | `route-outcomes.json`、三張 `verified-*-completed.png` |
| 補給搭配 | 救援維修額外 6%、廢車場零件額外 1、火線火力延長 8 秒；每單限一箱，數值真的改變、共用既有上限。卡片顯示推薦與加成；「技」不再直接代選第一張 | 新規則與手機 E2E、`after-*-supply.png` |
| 跨局收藏 | 路線圖顯示三路完成次數及圖鑑 0–3；結算寫入 `routeCompletions`，舊存檔可遷移、重載保留。本局分析列出完成路線與逾時次數 | 規則第 9–10 項、手機結算／重載案例 |
| 手機文字與面板 | 手機開局文字和路線入口分開；橫向補給改單排五選，短直向使用緊湊排版，三種手機尺寸五張卡均不需捲動 | 新手機 E2E「直橫與短手機五張補給卡完整可點」 |

實際收益讀回：救援 HP **260→333**、護盾 **+78**、事件零件 **+2**；廢車場甩飛 **2 隻**、補給零件 **4**、事件零件 **5**（含原甩飛連鎖 +1）；火線真實射擊擊殺 **6 隻**、取得 **+15%／20 秒**火力及事件零件 **+3**。完整數值以 `route-outcomes.json` 為準。

## 測試

| 指令 | 結果 | log |
|---|---|---|
| `npm test` | VERIFIED：15 支腳本全綠；新增路線規則 10／10 | `npm-test.log` |
| `npm run test:e2e` | VERIFIED：8 支腳本全綠；含原控制、R83–R86、四種手機／平板自然操作與 SW 離線回歸 | `test-e2e.log` |
| `node scripts/test-r87-mobile.js` | VERIFIED：14／14；五種控制視口、三路真完成、逾時、取消、多指、旋轉、鍵盤焦點與收藏重載 | `test-r87-mobile.log` |
| `npm run test:rwd` | VERIFIED：10 視口 × 3 狀態＝30 案，頁捲／橫溢 0 | `test-rwd.log` |
| `node -c`、`git diff --check` | VERIFIED：46 支 JS 語法與差異檢查 | `syntax-check.log`、`repository-gates.log` |
| 舊版號／秘密掃描 | VERIFIED：執行期舊版號 0、指定秘密 regex 0 命中；R86 歷史測試、註解、文件保留 | `version-scan.log`、`secret-scan.log` |

以上 log 路徑皆位於 `docs/evidence/r87-mobile/`。既有測試只同步版本斷言並新增 fallback 版本驗證，未刪測試或放寬斷言。
完整回歸後的最後一筆補給面板間距調整，另重跑 R83、R85 與 R87 手機測試全綠，見 `test-r83-final.log`、`test-r85-final.log`、`test-r87-mobile.log`。

第一輪完整 E2E 抓到手機轉向後點車體的快速升級失敗，證據保存在 `initial-regression.json`；拉開補給鍵與車體的距離後，原測試及完整 E2E 重跑全綠。截圖檢查也抓到新增說明造成橫向／短直向補給裁切，已修正並以五卡免捲動斷言守住。

## 截圖與重現

- `before-390x844-combat.png`／`after-390x844-combat.png`。
- `before-844x390-combat.png`／`after-844x390-combat.png`。
- `before-1366x600-combat.png`／`after-1366x600-combat.png`。
- 三視口另有 `after-*-routes.png`、`after-*-supply.png`。
- `capture-provenance.json` 記錄基線、版本及截圖 SHA-256；`npm run evidence:r87` 可重拍 after。before 必須用歷史 R86 來源，腳本會阻止用 R87 偽造 baseline。

## 效能、缺件與風險

**並發載量測，僅供參考。** `npm run test:perf` 已 EXECUTED，原 18ms 斷言失敗（exit 1），未改動門檻或重跑挑好數據。三跑中位 p95：auto 桌機 **29.7ms**／手機 **28.9ms**；low 桌機 **2.6ms**／手機 **3.5ms**。每次保有 54 隻 raster 敵人與攻擊圖集、fallback＝0。原始結果 `perf-p95.json`，附情境標記的結果 `performance-reference.json`；出貨效能閘為 **BLOCKED：缺乾淨機況測量**。

- 本輪未新增 2D／3D 原畫或音樂／音效，沒有程序化方塊替代素材；沿用既有受管圖集與聲音。沒有新增生成素材，因此沒有新增模型 slug 或授權宣稱。
- 攀附專用姿勢圖集仍缺件：`oga_runner_latch.png`、`oga_shambler_latch.png`，各 4 幀、40×40；現階段沿用既有 walk／attack／hurt／death 真幀，未宣稱專用攀附美術已補齊。
- 沒有實體 iOS／Android 手感、觸覺、聽感或長局平衡驗收。車隊移至道路邊緣時仍需實機評估拇指遮擋；headless 幾何與觸控模擬不等同真人驗收。
- 三條支線共用既有主題環境，是有目標與收益的戰鬥委託，未新增三張獨立地圖。永久路線收藏於本局正常結算時落盤，關頁前未結算的本局不會保存。

## 文案調整紀錄（mode 2）

| 原句 | 原因 | 改成什麼 |
|---|---|---|
| 補給技能 | 實際是補給定位與卡片選擇，名稱不清楚 | 瞄準補給；出現補給卡時直接點卡片 |
| README 的補給快捷鍵 `1–4` | 與既有五選不一致 | `1–5` |
| 路線卡的長篇搭配說明 | 手機短畫面易換行裁切 | 選擇頁保留完整說明，補給卡改「路線加成：修復 +6%／零件 +1／延長 8 秒」 |

八大面向做／不做及理由見 [本輪計畫](OPTIM_PLAN_R87.md)。未新增人物、地圖模型或角色配色，因此未宣稱重新通過三視圖、明度／飽和度美術驗收。
