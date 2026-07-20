# OPTIM_PLAN R83（美術＋內容＋選單/裝置 P0 修正）

2026-07-19。實作：Claude subagent（Codex 額度封鎖至 7/24）。
輸入：menuscan/PLAN_DRAFT.md ashes 章節（11 畫面×2 視口掃描）＋ OPTIM_PLAN_R81 裁決＋ AGENTS.md 動畫契約。
本輪美術約束：Blender MCP / gpt-image-2 未連線——僅允許既有素材程序化精緻化與 CSS/Canvas 渲染打磨，不產新 AI 圖。

## 一、掃描 P0（必修）

| id | 項目 | 修法 | 驗收（指令／斷言） |
|---|---|---|---|
| P0-A | `.meta-panel.is-illustration{display:grid}`（index.html:1624）與 `.panel[hidden]`（:1156）同權重且後出，蓋掉 hidden → 戰局中隱藏車庫面板攔截戰場點擊、快速升級輪盤真實點擊 0/2 視口可開 | 新增 `.meta-panel.is-illustration[hidden], .meta-panel.is-shelter[hidden] { display: none; }`（緊接 :1638 之後） | `node scripts/test-r83-p0.js`：390×844 與 844×390 各以 Playwright **真實 `page.mouse` click**（非 dispatchEvent）點車輛開輪盤，斷言 `#quickUpgradeWheel:not([hidden])` 且 `elementFromPoint(戰場中央)` 不是 `#shelterImage`；`#sortieBtn` 在跑局中 `getClientRects().length === 0` |
| P0-A′ | 跑局中誤觸「出擊」直接重開一局（rail 捷徑開抽屜時 `#startBtn`/`#sortieBtn` 可及） | 比照本 repo R81 `guardedClear` 兩段式：`guardedSortie(btn)`——跑局中（mode playing/paused 且未 over）首按變「再按一次重開本局」5 秒自動還原；非跑局單擊直發。`__test.startRun` 不經守門（e2e 相容） | `node scripts/test-r83-p0.js`：跑局中經 rail 開抽屜後真實 click `#startBtn` 一次 → 斷言 state 仍為原局（wave/kills 不歸零）且按鈕進入 armed 文案；再點一次 → 新局。非跑局單擊 → 直接開局 |
| P0-B | 844×390 橫向：`.app` 直欄鎖比例把遊戲擠成 180×390、雙欄需 `min-width:860 + pointer:fine`；無線電日誌 96% 不可達、補給 overlay 溢出、拖車一字一行 | ① 雙欄 rail 佈局條件放寬：`@media (min-width:860px) and (pointer:fine), (min-width:640px) and (orientation:landscape) and (pointer:coarse)`。② 新增 coarse 橫向覆寫塊（stylesheet 末端）：`battle-stage` 解除 `container-type` 圍欄；`garagePanel(is-illustration/is-shelter)`、`trailer-overlay`（左圖右欄雙欄）、`meta-drawer`、`.panel`、補給 overlay、touch-controls 改 `position:fixed` 逃出 180px 柱、用滿 844 寬 | `npm run test:rwd`（矩陣含 844×390 landscape 且 hasTouch）全綠：互動元素 0 違規、stage 維持 390:844、页捲/橫溢在容差內。`node scripts/test-r83-p0.js`：844×390 開拖車房間後 `#storyLogBtn` 真實 click 展開日誌，斷言 `#storyLogSection` 高度 ≥ 96px 且 `#storyLogList` 可實捲（scrollHeight>clientHeight 時 scrollTop 可增）；補給 overlay 5 鈕 rect 全在視口內且寬高 ≥44 |
| P0-C | 44px 批次（掃描表列前幾大命中目標，多為橫向連鎖） | 橫向補給鈕隨 P0-B 撐寬至 ≥44；`.story-summary` 命中高 ≥44（min-height）；橫向 `.hotspot-btn` 不因擠壓 <44（fixed 全寬後自然達標） | `node scripts/test-r83-p0.js` 內含 rect 斷言；`npm run test:rwd` 0 違規 |
| P0-D | 掃描 P2 附帶：`setPointerCapture` 無 try/catch，合成事件觸發全域異常橫幅 | `els.virtualJoystick.setPointerCapture` 包 try/catch | `npm test` 綠＋e2e 無 console/page error |

## 二、美術（程序化打磨，不產新圖）

| id | 項目 | 驗收 |
|---|---|---|
| ART-1 | HUD/面板邊框語言統一：`.stat/.pill/.mods/.boss` 補一致的 1px 頂部內光（與 hotspot/rail 按鈕同一 bevel 語言）；戰內 overlay（event banner／gate pill／supply panel／quick wheel）圓角統一 8px、標題字級對齊 14px 語言 | 目視 before/after 對照圖（docs/evidence/r83/）＋`npm run test:rwd` 不回歸 |
| ART-2 | 敵彈可辨識度（沿用 ENEMY_SHOT_TINTS 語言、A-01 Phase 2）：acid＝液滴＋拖尾（既有形）；scream＝同心「音環」脈動形——顏色＋形狀雙通道，色弱可辨 | `npm test`（test-fx/test-rules 不回歸）；e2e 全綠；draw 函式依 `shot.kind` 分形（code review 斷言：`drawEnemyProjectile` 有 scream 專屬分支） |

## 三、遊戲內容（R81 裁決通過、未列 Codex 佇列；C-04/D-02/D-03 不碰）

R81 裁決通過各項中，C-01/B-03a/C-02/C-03/A-01 Phase1 已於 R81 出貨、B-01/B-02 已於 R82 出貨。本輪選擇兩件「裁決項的可完成延伸」：

| id | 項目 | 驗收 |
|---|---|---|
| CNT-1 | A-01 Phase 2（延續裁決「Phase 1」拆階）：敵彈 kind 形狀語言（同 ART-2，renderer 消費既有 `shot.kind` 資料鉤子，不動資料層） | 同 ART-2 |
| CNT-2 | C-01 延伸文案回饋：補給箱提示依輸入模式顯示——fine pointer「按 1-5 快選或點擊領取；戰鬥不中斷」/ coarse「點一下領取；戰鬥不中斷」，讓 R81 快捷鍵被看見 | e2e 既有補給流程綠；`node scripts/test-r83-p0.js` 斷言 fine-pointer context 下 `#supplyChoiceHint` 含「1-5」 |

## 四、固定閘門

1. `npm test` 全綠；`npm run test:e2e`（含新接線 `scripts/test-r83-p0.js`）全綠；`npm run test:rwd` 全綠。
2. 版本 bump R80→R83：`grep -rn "R80" index.html sw.js src/version.js src/config.js` 僅允許歷史文件命中（runtime 檔歸零）；SW `CACHE_VERSION` 隨 `APP_VERSION` 連動一致。
3. 秘密掃描：`grep -rniE "sk-proj-[A-Za-z0-9_-]{20}|sk-[a-z0-9]{40}|xai-[A-Za-z0-9]{20}" . --exclude-dir=.git --exclude-dir=node_modules` 零命中。
4. 證據：before/after 截圖（390×844、844×390、1366×768）入 docs/evidence/r83/；不覆寫歷史 evidence。
5. 報告 docs/CODEX_RESPONSE_R83.md；main 分支繁中 commit，不 push。

## 五、R83.1 Grok 對抗複審殘留（backlog，本輪不處理）

R83.1 僅收斂兩項有效 P1：全域 `[hidden]` 點擊安全網，以及出擊二段確認的 5 秒 deadline／timer／關面板清理。其餘發現保留如下，待獨立批次補量測與跨視口守門，避免與本輪狀態機硬化混改：

| id | Grok 發現 | 殘留處置／後續驗收方向 |
|---|---|---|
| R83.1-B01 | 無線電日誌捲高在部分內容量／視口組合仍可能過矮 | backlog；先補內容量 × 直橫視口的 clientHeight/scrollHeight 可達性矩陣，再調整高度與內層捲動責任。 |
| R83.1-B02 | `.touch-controls` 與戰內疊層的 z-index 層級仍可能互相遮擋 | backlog；建立 gate／補給／輪盤／暫停面板 × coarse-pointer 的命中層級測試後再統一 layer tokens。 |
| R83.1-B03 | `resumeOnClose` 在 drawer 快速切換／資產 onload 並行時仍有競態疑慮 | backlog；以 playing/paused 來源、drawer A→B、關閉／Escape、延遲背景完成建立狀態矩陣；本輪僅保證出擊 confirm 不殘留。 |
| R83.1-B04 | 44px 命中尺寸守門尚未涵蓋所有動態顯示控制項與極端視口 | backlog；擴充 RWD 掃描器，對所有當下可見且可互動節點做寬高、裁切、重疊與 safe-area 完整性檢查。 |

缺件（留待 MCP 復線）：Blender MCP／gpt-image-2 生圖項全數凍結——橫向專用寬幅基地 key art、scream 敵彈專屬 sprite、Boss 大爆單張（A-02，另受 p95 淨機條件）。
