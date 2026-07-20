實作：Claude subagent 起手、Codex gpt-5.6-sol 收尾

# CODEX_RESPONSE R83

2026-07-19。範圍：menuscan ashes 掃描 P0 修正＋美術程序化打磨＋R81 裁決項延伸。計畫：docs/OPTIM_PLAN_R83.md。

## 一、P0 修正

### P0-A：戰局中隱藏車庫面板攔截戰場點擊（重磅，R79 起潛伏）
根因一（CSS）：`.meta-panel.is-illustration/.is-shelter { display:grid }`（index.html）與 `.panel[hidden] { display:none }` 同權重（0,2,0）且後出——`hidden` 被蓋掉，跑局中「已隱藏」的車庫面板持續鋪滿戰場：
- 戰場中央點擊全被 `#shelterImage` 吃掉；
- 快速升級輪盤真實點擊 0/3 視口可開（390×844、844×390、1366×768 全滅，before 實測見 docs/evidence/r83/before-*-wheel-click.png 與本輪 capture log）；
- 跑局中 `#sortieBtn` 仍可命中 → 誤觸直接重開一局。

修法：顯式補 `.meta-panel.is-illustration[hidden], .meta-panel.is-shelter[hidden] { display:none }`。

根因二（JS，修 CSS 後才浮現）：R81 C-03 讓輪盤「開啟即暫停」，但 `renderTouchControls` 以 `!playing` 立刻 `hideQuickUpgradeWheel()`——輪盤一開→暫停→下一幀被自己收掉，真實點擊永遠開不了（dispatchEvent 型測試繞過了這條鏈，所以 R81 e2e 全綠仍漏）。修法：改為「戰局不再進行（over／回車庫）」才收輪盤；暫停中保留。

附帶修正：輪盤觸發的暫停不再彈出「暫停面板」（輪盤本身就是前景 UI；`onState` 加 `quickWheelPausedRun` guard）。

### P0-A′：跑局中誤觸「出擊」兩段式確認
比照本 repo R81 `guardedClear` 模式新增 `guardedSortie`：戰局進行中（playing/paused 且未 over）首按「出擊」變紅字「再按一次重開本局」（`.danger-armed` 新樣式），5 秒未再按自動還原；再按才重開。非跑局單擊直發不變；`__test.startRun` 不經守門（e2e 相容）。

### P0-B：844×390 橫向可玩佈局
根因：`.app` 直欄鎖 390:844 比例；雙欄 rail 佈局需 `min-width:860 + pointer:fine` → 手機橫向被擠成 180×390 直柱、左右 332px 黑邊，所有面板困在直柱內（無線電日誌塌成 150×14、96% 不可達；拖車房間一字一行；補給 overlay 溢出）。

修法（index.html 兩處）：
1. 雙欄 rail 佈局條件放寬為 `@media (min-width:860px) and (pointer:fine), (min-width:640px) and (orientation:landscape) and (pointer:coarse)`——手機橫向啟用左右捷徑 rail，戰場維持 390:844 等比。
2. 樣式表末端新增 coarse 橫向覆寫塊：`battle-stage` 解除 `container-type`（layout containment 會把 fixed 後代圈在直柱內），起始畫面／拖車房間（左圖右欄雙欄）／基地抽屜／暫停／結算／補給箱／觸控盤改 `position:fixed` 用滿 844 寬。桌機（pointer:fine）樣式零變動。

橫向實測（after）：無線電日誌 720×150（before 150×14），清單可實捲；補給 5 鈕全 ≥44px 且完整在視口內。

### P0-C：44px 批次
- 補給鈕橫向隨 P0-B 撐寬達標（before 寬 41px）。
- `.story-summary`（日誌展開列）命中高補到 ≥44px（padding-block，保留 details 三角標記）。

### P0-D（掃描 P2 附帶）：`setPointerCapture` 防呼
`gameCanvas` 與 `virtualJoystick` 兩處 `setPointerCapture` 包 try/catch——合成事件／失效 pointerId 不再觸發全域異常橫幅。

## 二、美術（程序化，未產任何新 AI 圖）

- ART-1 HUD/面板邊框語言統一：`.stat/.pill/.mods/.boss` 補與 hotspot/rail 按鈕同語言的 1px 頂部內光＋沉影 bevel；戰內 overlay 標題字級統一 14px（supply head 16→14 對齊 event-banner）；`.danger-armed` 武裝態紅框視覺回饋。
- ART-2／CNT-1（A-01 Phase 2）：敵彈形狀語言——acid＝液滴拖尾（Phase 1 既有形），scream＝同心「音環」雙環脈動（無拖尾）；顏色＋形狀雙通道，色弱可辨；沿用 `ENEMY_SHOT_TINTS` 資料鉤子，資料層零變動。
- 缺件（Blender MCP／gpt-image-2 未連線，留待復線）：橫向專用寬幅基地 key art、scream 敵彈專屬 sprite、Boss 擊殺大爆單張（A-02，另受 p95 淨機條件）。

## 三、遊戲內容（R81 裁決延伸；C-04/D-02/D-03 未觸碰）

- CNT-1：同 ART-2（A-01 Phase 2 renderer 消費）。
- CNT-2（C-01 延伸文案）：補給箱提示依輸入模式顯示——fine pointer「按 1-5 快選或點擊領取；戰鬥不中斷」／coarse「點一下領取；戰鬥不中斷」，讓 R81 快捷鍵被看見。

## 四、驗證與閘門

| 閘門 | 結果 |
|---|---|
| `npm test`（13 支單元/守門） | 全綠 |
| RWD | 交接紀錄為 10 視口×3 狀態全綠；Codex current-tree 重驗 844×390 三狀態皆 0 頁捲／0 橫溢 |
| E2E 全鏈 | 主套件四視口＋fallback/audio/offline、R76 五視口 controls、R83 P0 均在 current tree 全綠 |
| `node scripts/test-r83-p0.js` | 最終 current-tree 1/1 全綠；390×844、844×390、fine-pointer 三情境全過 |
| 版本 bump | R80→R83；package/lock `0.83.0`；runtime 舊版號零命中；SW `CACHE_VERSION=ashes-convoy-r83-v1` 由 `DSVersion` 連動 |
| 秘密掃描 | `grep -rniE "sk-proj-…|sk-…|xai-…"`（排除 .git/node_modules）零命中 |
| 證據 | docs/evidence/r83/before-*.png／after-*.png（390×844、844×390、1366×768：base/run/wheel-click/trailer-log）；歷史 evidence 未觸碰 |

新守門（接入 `npm run test:e2e` 常駐）：`scripts/test-r83-p0.js`——
- 390×844 與 844×390 真實 `page.mouse` click 開/關快速升級輪盤；輪盤開啟時戰局應暫停且不彈暫停面板；
- 跑局中戰場中央 `elementFromPoint` 不得是 `#shelterImage`；`#sortieBtn` 跑局中 0 rect；
- 出擊兩段式：首按 armed（time 不倒退）、二按重開、非跑局單擊直發；
- 橫向無線電日誌高度 ≥96px＋可實捲；補給 5 鈕 ≥44px 全在視口內；
- fine-pointer 補給提示含「1-5」。

## 五、殘留風險／缺件

1. 橫向戰場本身仍為 180×390 等比直柱（canvas 邏輯座標 195×422 直向設計所限）——本輪把「選單/覆疊全滅」修到「戰場等比＋面板全寬可用」；戰場橫向原生版面需要另立空間規劃輪（涉及 gameplay 座標系，超出選單修正範疇）。
2. 橫向 HUD 仍困在 180px 柱內（掃描 P1「基地鈕截斷 6 節點」同群）——待橫向 HUD 專輪。
3. 本機效能數字僅供參考（機況有 audiodg 污染）；A-02 大爆單張維持 p95 淨機條件緩議。
4. 本機同時有多組 Chrome/Playwright 工作時，完整 30-case RWD 會超過 5 分鐘執行器上限；本輪已以 current-tree 844×390 三狀態與 R83 真實互動守門覆蓋本次風險。主 E2E 已將開場步進原子化、背景載入等待延長，並修正 drawer onload 競態。
5. 美術生圖產線（Blender MCP／gpt-image-2）未連線，缺件清單見上；本輪未產任何新 AI 圖、manifest 未動。

## 六、Codex 收尾補修（2026-07-20）

- Banner 仲裁加入優先序：Boss／boss radio／危急船體不再被延遲的低優先出擊 bark 蓋掉。
- 車庫背景圖片 onload 不再收掉使用者剛由 rail 開啟的 drawer；`showGarage()` 先建立乾淨基線，較新的明確 drawer 操作會被保留。
- E2E 去除高負載 live RAF 與背景初始化競態；沒有降低敵群、FPS、44px 或真實 click 功能門檻。
