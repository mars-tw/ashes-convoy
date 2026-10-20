# PLAYTEST-R1｜灰燼護航 ashes-convoy R83.1

## 0. 執行摘要

- 測試版本：`0.83.1`，commit `f7e65a6c05332cb30bb891723fefd3a27b16b60b`（`R83.1 硬化：全域 hidden 安全網與出擊確認競態`）。
- 測試對象：repo HEAD 工作樹，以本機 `http://127.0.0.1:8000/` 提供；瀏覽器由本 repo `node_modules/playwright` 驅動。
- 測試日期：2026-07-20～2026-07-21（Asia/Taipei）。
- 結論：**PARTIAL**。直向手機、平板與桌機能很快進入有回饋的駕駛／射擊循環；升級、補給、環境事件與車隊廣播已有遊戲感。手機橫向核心戰場仍被壓成約 `178×388` 的直向窄柱，加上跑局中設定抽屜與暫停面板互相覆蓋、補給誤選、結局辨識不足，尚不能裁成全面 YES。
- Bug：**P0 0 / P1 4 / P2 3**。
- A–J：**33 / 50，平均 3.3 / 5**。
- R83/R83.1 針對項目：全域 `[hidden]` 安全網通過、隱藏面板未再攔截戰場、車體真實 click/tap 可開快速升級輪盤、出擊二段確認通過；但橫向戰場窄柱是明確殘留風險。

## 1. 方法、限制與證據規則

### 1.1 真人輸入

先以不讀原始碼的新手視角觀察畫面並決策，再以回鍋玩家視角深玩。所有可交互操作均用 Playwright 的真實 `click`、`tap`、`keyboard`、滑鼠／觸控拖曳完成；未使用 `dispatchEvent`，未直接改 state 冒充遊玩。戰鬥操作包含：

- 滑鼠拖曳／虛擬搖桿移動、滑鼠瞄準、點擊射擊。
- 觸控武器、技能／衝刺按鈕。
- 補給 `Digit1`、`Numpad5` 與手機觸控選項。
- 真實點車體開啟快速升級輪盤，再真實點擊購買與關閉。
- 暫停／恢復、跑局中開設定、旋轉、離線再回、撤離、再來一次、返回基地。

### 1.2 唯一注入橋段

為抵達「陣亡」結算，曾先做一次最小 `damageVehicle(500)` 橋段；車輛由 520 HP 降到 30 HP 後反而在正常遊玩中回復到 123 HP，90 秒內未死，故未把它當成功證據。最終橋段揭露如下：注入 `pushWave(10)` 與 `damageVehicle(currentHp + 9)`，只把仍在運作的真實跑局推到 wave 10、1 HP；之後不注入結算、不注入死亡，等待約 16 秒，由 `shambler` 的正常 active hitbox 命中 1 點造成死亡並進入結算。證據：[1 HP 橋段](shots/09-desktop-death-bridge-1hp.png) → [敵人命中後結算](shots/09-desktop-death-enemy-hit-settlement.png)。

### 1.3 機況處理

多裝置三輪批次曾在主機高負載下整批逾時，已 clean 終止該批次並分裝置重跑。下表保留兩次完整原始值，摘要採較快的 clean 樣本；高延遲樣本沒有頁面錯誤、瀏覽器 console error 或重試後卡死證據，因此不列遊戲 bug。

### 1.4 補充守門測試

- `node scripts/test-r83-p0.js`：PASS。含 390×844、844×390 的全域 hidden、輪盤真實 click、跑局中出擊二段確認、4.9/5.0 秒邊界與鍵盤 1–5。
- `node scripts/test-audio.js`：PASS。
- `node scripts/test-visual-guards.js`：PASS。
- `node scripts/test-animation-assets.js`：PASS（45 files，1,386,517 bytes）。
- `node scripts/test-sprites-contract.js`：PASS（36 sprites，218 frames，Stage 3 sprites 10）。
- 動畫不是用整張平圖位移冒充：現行角色／敵人使用 frame sprite；敵人 attack 有 anticipation／impact／recovery，傷害在 active impact 執行，並有 hurt／death reaction。物理 root 與視覺繪製路徑分離。這項結論來自實玩畫面、動畫資產守門與程式契約交叉確認，不以整體 bobbing 當完成動畫。
- 音效 wiring 守門通過，但 headless 執行無法作主觀聽感評鑑；D 分數以可見打擊回饋為主，不把「程式有呼叫音效」冒充真人聽感 PASS。

## 2. 版本與開機量測

`bootMs`＝navigation 開始到遊戲送出 `ashes-start-interactive`；首互動＝navigation 開始到第一個可見、enabled 的控制項。手機／平板 context 啟用 `isMobile` 與 `hasTouch`。

| 設備 | 尺寸 | 採用 bootMs | 採用首互動 | 兩次原始 bootMs | 兩次原始首互動 | 結果 |
|---|---:|---:|---:|---:|---:|---|
| phone-portrait | 390×844 | 402 ms | 868 ms | 19,291 / 402 | 19,884 / 868 | clean 重跑可快速互動；無頁面錯誤 |
| phone-landscape | 844×390 | 337 ms | 716 ms | 491 / 337 | 1,033 / 716 | 最穩定，但進戰場後版型嚴重受限 |
| laptop-short | 1366×600 | 457 ms | 1,101 ms | 457 / 10,885 | 1,101 / 11,415 | 高樣本屬機況抖動，重跑可玩 |
| desktop | 1366×768 | 5,795 ms | 6,414 ms | 13,110 / 5,795 | 13,771 / 6,414 | 兩次均偏慢但最後正常；無卡死證據 |
| tablet | 768×1024 | 6,523 ms | 7,085 ms | 10,177 / 6,523 | 12,061 / 7,085 | 兩次偏慢，進場後穩定 |

開機畫面有明確基地／出勤介面，不是空白等待。量測截圖：`00-<device>-boot*.png`。

## 3. 每設備實玩敘事

### 3.1 phone-portrait｜390×844

1. **看到**：基地完整落在直向 viewport，出勤與基地功能可辨識（[base ready](shots/07-phone-portrait-base-ready.png)）。**做**：真實 tap 出勤。**發生**：無多餘遮罩，直接進入全高戰場；首批敵人與紫色彈道很快出現。
2. **看到**：畫面下方有 362×112 的觸控區，搖桿與三個動作按鈕均在手指可達處（[battle start](shots/07-phone-portrait-battle-start.png)）。**做**：拖搖桿、tap 武器／技能。**發生**：車體位移、射擊、冷卻與命中視覺都有反應；持續玩到 wave 2、34 kills、9 parts。
3. **看到**：環境廣播「灰喉走廊／沙牆壓低視野」和波次目標（[environment event](shots/07-phone-portrait-environment-event.png)）。**做**：繼續移動、射擊。**發生**：事件結束會回報「沙聲退開」，戰況節奏有一個清楚的小高潮。
4. **看到**：補給五選一完整展開（[supply choice](shots/07-phone-portrait-supply-choice.png)）。**做**：真實 tap 第三項。**發生**：獎勵套用、面板關閉，戰鬥繼續。
5. **看到**：新手提示只教拖曳／瞄準／開火，未教「點車體開輪盤」。**做**：經探索後 tap 車體。**發生**：快速升級輪盤以 190×274 顯示，可真實關閉且觸控控制恢復（[wheel](shots/07-phone-portrait-wheel-open.png)）。
6. **看到**：暫停面板完整可見。**做**：暫停、恢復。**發生**：狀態正確返回 playing（[pause](shots/07-phone-portrait-pause-open.png)）。

判定：**可玩且是手機首選方向**；資訊密度偏高，但核心操控與戰況讀取足以支撐樂趣。

### 3.2 phone-landscape｜844×390

1. **看到**：基地與大型覆疊可使用全寬。**做**：出勤。**發生**：核心 Canvas 不是橫向戰場，而是約 `178×388` 的直向窄柱；左右大面積留給 rail／控制區（[battle start](shots/07-phone-landscape-battle-start.png)）。
2. **看到**：虛擬搖桿與動作列橫跨 816×112，機械上可點。**做**：拖曳、射擊、技能，持續玩到 wave 2。**發生**：可取得約 33 kills、11 parts，證明不是完全不能玩；但敵人、彈道與瞄準面積極小，視線要在窄柱與兩側操作之間跳（[battle mid](shots/07-phone-landscape-battle-mid.png)）。
3. **看到**：環境事件文案與 HUD 疊在狹窄 Canvas 上（[environment event](shots/07-phone-landscape-environment-event.png)）。**做**：持續作戰。**發生**：事件邏輯正常，但重要資訊互相競爭，張力被閱讀負擔抵銷。
4. **看到**：補給與快速輪盤改用 viewport，沒有再被鎖進 180 px 窄柱（[supply](shots/07-phone-landscape-supply-choice.png)、[wheel](shots/07-phone-landscape-wheel-open.png)）。**做**：tap 選項與關閉。**發生**：兩者皆成功，`hiddenWithArea=0`。
5. **看到**：拖車房與無線電日誌可由基地進入。**做**：依序開拖車、開／合日誌、關拖車、收合／展開基地。**發生**：無線電故事可讀、所有面板可返回（[radio log](shots/10-phone-landscape-radio-log-open.png)）；家具卡片文字在 390 px 高度內過密、局部互擠（[trailer](shots/10-phone-landscape-trailer-room-open.png)）。
6. **看到**：跑局中基地捷徑可碰到出擊。**做**：第一次點擊、等待超過 5 秒、再以兩次快速點擊確認。**發生**：第一次只變「再按一次重開本局」且時間／波次／擊殺不變；逾時復原；兩次點擊才重開（[armed](shots/11-phone-landscape-sortie-guard-armed.png)、[restarted](shots/11-phone-landscape-sortie-guard-restarted.png)）。

判定：**PARTIAL／嚴重受限**。R83 修好了「覆疊面板不再卡在窄柱」，沒有修好「戰場本身是窄柱」。可以完成操作，不等於適合真人橫向遊玩。

### 3.3 laptop-short｜1366×600

1. **看到**：戰場約 `275×598`，比桌機更窄但全高可用（[battle start](shots/14-laptop-short-battle-start.png)）。**做**：移動、瞄準、射擊。**發生**：可推進到 18–20 kills，HUD 尚可讀。
2. **看到**：暫停面板未被 600 px 高度裁斷（[pause](shots/14-laptop-short-pause-open.png)）。**做**：恢復並繼續作戰。**發生**：正常回到跑局（[resumed](shots/14-laptop-short-resumed.png)）。
3. **看到**：路線／事件選擇能出現。**做**：真實選擇。**發生**：流程繼續，無軟鎖。

判定：**可玩但偏窄**；比手機橫向可靠，主要問題是戰場相對整個螢幕的利用率低。

### 3.4 desktop｜1366×768

1. **看到**：基地、出勤、升級、載具、任務、成就、設定捷徑清楚。**做**：逐一真實開啟，再用 Escape 關閉。**發生**：每個抽屜均有非零面積（約 317×460）且可見；基地可收合／展開（[base collapsed](shots/10-desktop-base-collapsed.png)）。
2. **看到**：戰場、車隊與敵群。**做**：滑鼠拖曳車輛、WASD、移動瞄準並 click 射擊。**發生**：紫色彈道、命中數字、擊殺與車隊喊話連續出現；自然推到 wave 3、59 kills、17 parts、HP 520（[early combat](shots/03-desktop-combat-early.png)、[late combat](shots/03-desktop-combat-late.png)）。
3. **看到**：補給覆疊在持續戰鬥上。**做**：以 `Digit1` 選第一輪、以 `Numpad5` 選下一輪。**發生**：兩種快捷鍵都正確套用並關閉面板（[Digit1](shots/12-desktop-supply-1-before-Digit1.png)、[Numpad5](shots/12-desktop-supply-2-before-Numpad5.png)）；但在刻意按鍵前已有兩次補給被持續 click-to-fire 誤點。
4. **看到**：輪盤在零件不足時會禁用選項。**做**：六次自然短跑累積 31 parts，真實點車體、點 hull。**發生**：parts 31→1、hull 0→1、下次費用 55，標示下次出勤生效（[before](shots/13-desktop-upgrade-purchase-before.png)、[after](shots/13-desktop-upgrade-purchase-after.png)）。
5. **看到**：無線電日誌的起始章與里程碑。**做**：開／合日誌與拖車房。**發生**：故事可達、返回路徑正常（[radio](shots/10-desktop-radio-log-open.png)）。
6. **看到**：跑局中點設定會先顯示設定抽屜。**做**：嘗試改選項並關閉。**發生**：暫停面板隨下一次 state update 重現並蓋在抽屜前方，穩定攔截 checkbox／關閉鍵（[overlap](shots/04-desktop-pause-settings-after-attempts.png)）。
7. **看到**：暫停可選撤離。**做**：撤離、展開／收合分析、再來一次、再次撤離、返回基地。**發生**：所有真實按鈕都能完成流程（[settlement](shots/08-desktop-evac-settlement.png)、[again](shots/08-desktop-again-started.png)、[garage](shots/08-desktop-garage-returned.png)）。
8. **看到**：1 HP 高波次戰況。**做**：停止干預、等待敵人攻擊。**發生**：敵人 active hit 造成最後 1 點傷害後進結算；但畫面仍只寫「護航結算」，與撤離沒有結果語意差異。

判定：**核心最好玩的設備**；輸入精準、打擊資訊清楚，但跑局中設定與補給誤選是實質 P1。

### 3.5 tablet｜768×1024（抽驗）

1. **看到**：戰場約 `473×1024`，觸控列約 445×112；比手機直向更能讀敵人與路線（[battle start](shots/07-tablet-battle-start.png)）。**做**：搖桿、武器／技能。**發生**：推到 wave 2、26 kills，響應穩定。
2. **看到**：環境事件、補給、輪盤與暫停都有足夠面積。**做**：依序互動。**發生**：皆能開、選、關並返回戰場（[event](shots/07-tablet-environment-event.png)、[supply](shots/07-tablet-supply-choice.png)、[wheel](shots/07-tablet-wheel-open.png)、[pause](shots/07-tablet-pause-open.png)）。

判定：**觸控設備中可讀性最佳**；未見平板專屬阻斷。

## 4. 覆蓋矩陣與 R83 專查

| 項目 | 真實操作與結果 | 判定 | 主要證據 |
|---|---|---|---|
| 隱藏面板不攔截戰場 | 全流程每個 snapshot 檢查 `[hidden]` 元素非零面積，均為 `hiddenWithArea=0`；戰場 click/tap 成功 | PASS | `test-r83-p0.js`、`play-*.json` |
| 全域 `[hidden]` 安全網 | CSS 全域規則生效，大型 panel 不再用後出的 display 覆寫 | PASS | 全裝置 boot/menu/wheel/supply 截圖 |
| 基地展開／收合 | desktop、landscape 都可展開、收合、再展開 | PASS | `10-*-base-*.png` |
| Rail：升級／載具／任務／成就／設定 | 基地狀態全部可見、可開、Escape 可關 | PASS | `01-desktop-*-open/escape.png` |
| 跑局中設定 | 抽屜先開，接著 pause panel 覆蓋並攔截 | **P1 FAIL** | `04-desktop-pause-settings-after-attempts.png` |
| 快速升級輪盤 | desktop mouse click、portrait/landscape tap 車體均真實開啟；關閉後回 playing | PASS；提示 P2 | `06-*-vehicle-wheel-*.png` |
| 升級購買 | 31 parts 真實購買 hull，等級與費用正確改變 | PASS | `13-desktop-upgrade-purchase-*.png` |
| 出勤二段確認 | active run 第一下只 armed，>5 秒失效；兩下才重開 | PASS | `11-*-sortie-guard-*.png` |
| 補給 1–5／Numpad | `Digit1`、`Numpad5`、觸控第三項均成功 | PASS；誤觸 P1 | `12-*`、`07-*-supply-choice.png` |
| 環境事件／路線廣播 | 灰喉走廊、沙牆目標與事件結束均實際出現 | PASS | `07-*-environment-event.png` |
| 無線電日誌可達性 | desktop、844×390 可開／合、回拖車／基地 | PASS | `10-*-radio-log-*.png` |
| 撤離 | 暫停→撤離→分析→再來一次／基地 | PASS | `08-desktop-evac-*.png` |
| 陣亡 | 1 HP 橋段後由敵人 active hit 致死，進結算 | PASS；結果語意 P1 | `09-desktop-death-*.png` |
| 暫停／恢復／重開 | desktop、手機、laptop；settlement 再來一次 | PASS | `03-*`、`07-*pause*`、`08-*again*` |
| 旋轉 | active portrait→landscape→portrait；state 延續，kills 1→3 | PASS；landscape 版型 P1 | `15-phone-*-rotation/restored.png` |
| 離線再回 | active run offline kills 3→9、online 後→15；無 request/page error | PASS | `15-phone-portrait-offline/online-return.png` |

### 橫向戰場可玩性判定

**嚴重受限（PARTIAL）**。實測 Canvas 約 `178×388`，與使用者提出的「180×390 直向窄柱」風險一致。玩家可以靠外部 816×112 控制列完成移動、射擊、技能並推到 wave 2／33 kills，所以不列 P0；但敵人和彈道太小、HUD／事件文案互疊、視線來回距離過大，屬主要玩法與可讀性 P1。大型面板已能使用整個 844×390 viewport，這是 R83 的有效修復，但不能用面板修好來宣稱橫向戰鬥也修好。

## 5. Bug 表

| ID | 分級 | 設備 | 問題 | 重現步驟 | 截圖 | 根因初判 |
|---|---|---|---|---|---|---|
| R1-LAND-01 | P1 | phone-landscape 844×390；旋轉後 landscape | 戰場仍是約 178×388 直向窄柱，敵人／彈道過小，HUD 與環境事件重疊 | 844×390 開機→出勤→移動射擊→等待環境事件；或 active portrait 旋轉 landscape | [start](shots/07-phone-landscape-battle-start.png)、[event](shots/07-phone-landscape-environment-event.png)、[rotate](shots/15-phone-landscape-after-rotation.png) | `index.html` landscape CSS 明確保留 `390:844` 戰場比例，只把大型 panel／overlay 逃出窄柱；核心 stage 沒有 landscape-native camera/HUD 佈局 |
| R1-META-02 | P1 | desktop；推測所有有 rail 的 active run | 跑局中開設定後，pause panel 在 meta drawer 前方重現，攔截 checkbox 與關閉鍵 | 出勤→點 rail 設定→等待 state update→點任一設定或關閉 | [overlap](shots/04-desktop-pause-settings-after-attempts.png) | `openShortcutPanel()` 設了 `drawerReturnContext` 並 pause；`onState()` 只對 `quickWheelPausedRun` 抑制 `showPause()`，未把開啟中的 drawer 視為合法 paused UI |
| R1-SUPPLY-03 | P1 | desktop fine pointer | 補給出現瞬間，持續 click-to-fire 可在玩家閱讀前直接誤選選項 | 持續以滑鼠點敵人射擊→等待補給覆疊剛出現；觀察既有 click 落到 choice button | [choice](shots/12-desktop-supply-1-before-Digit1.png) | supply overlay 本身不暫停；choice button 接受 pointer，缺少「面板出現後先等 pointer release／短 debounce」的輸入隔離，且選項位於既有瞄準點路徑 |
| R1-OUTCOME-04 | P1 | desktop；全裝置邏輯 | 撤離與陣亡都只顯示相同「護航結算」，沒有結果／死因／成功失敗語意，高潮失焦 | 跑局→暫停撤離→看結算；另以 1 HP 橋段讓敵人致死→比較結算 | [evac](shots/08-desktop-evac-settlement.png)、[death](shots/09-desktop-death-enemy-hit-settlement.png) | `showSettlement(result)` 使用共用畫面，未依 manual evacuation / enemy death context 渲染不同標題、色彩、原因與音視覺結果 |
| R1-SETTLE-05 | P2 | desktop；推測所有可捲動結算 | 結算一出現便把視窗捲到靠下方，再來一次獲焦；標題與摘要可能先離開可視區 | 進入長結算→不碰滾輪→觀察初始 viewport | [settlement](shots/08-desktop-evac-settlement.png) | `showSettlement()` render 後直接 `againBtn.focus()`；焦點捲動優先於把 panel scrollTop 重設為 0 |
| R1-TRAILER-06 | P2 | phone-landscape 844×390 | 拖車家具卡片說明在低高度中過密／互擠；無線電仍可達 | 基地→拖車房→看家具目錄→開無線電日誌 | [trailer](shots/10-phone-landscape-trailer-room-open.png)、[radio](shots/10-phone-landscape-radio-log-open.png) | overlay 已全寬，但卡片垂直排版與文字密度未針對 390 px 高度壓縮／分頁 |
| R1-WHEEL-07 | P2 | 全裝置，首玩最明顯 | 快速升級輪盤入口缺乏可發現性；新手會把 rail「升級」理解為它，但 rail 實際開基地抽屜 | 首玩只看畫面與提示→尋找快速輪盤；最後點車體才開啟 | [wheel](shots/06-phone-portrait-vehicle-wheel-open.png)、[rail upgrade](shots/01-desktop-railUpgradeBtn-open.png) | 新手提示只有移動／瞄準／開火；車體沒有持續 affordance 或首次提示，且兩個「升級」入口語意相近 |

統計：**P0 0、P1 4、P2 3，共 7 項**。

## 6. 可玩性 A–J

| 面向 | 分數 | 一句佐證 |
|---|---:|---|
| A. 首玩上手清晰度 | 3/5 | 出勤、移動、射擊很快看懂，但點車體開輪盤沒有被教，rail「升級」又造成錯誤預期。 |
| B. time-to-first-fun | 4/5 | 點出勤後約 1.5–3 秒就有首波擊殺、彈道與喊話；boot 機況是另一件事。 |
| C. 核心循環吸引力 | 3/5 | 駕駛、射擊、補給、事件與成長能串成一輪，但早期變化與壓力不足，重跑容易同質。 |
| D. 回饋與爽度 | 4/5 | 紫色彈道、命中數字、擊殺特效、shake、hurt/death frame 與車隊喊話清楚；音效只做 wiring 驗證，未作主觀聽感加分。 |
| E. 操控手感與響應 | 3/5 | 直向／平板／桌機即時，觸控區夠大；橫向瞄準面積與桌機補給誤觸拉低。 |
| F. 難度曲線與公平性 | 3/5 | wave 1–3 順暢卻偏安全；520 HP 長時間不掉，30 HP 甚至回復到 123，壓力直到人工推至高波才明顯。 |
| G. 獎勵與成長意義 | 3/5 | hull 購買確實改變等級、費用與下次出勤，但首個 30 parts 要六次約 10.6–10.8 秒短跑且收入不均。 |
| H. 節奏 | 4/5 | 波次、補給與事件幾乎連續，少有空等；但不暫停補給造成「快」變成誤選。 |
| I. 視覺可讀性 | 3/5 | desktop／portrait／tablet 清楚，844×390 的 178 px 戰場與文案重疊是顯著扣分。 |
| J. 續玩拉力 | 3/5 | 廣播里程碑、升級與下一次出勤有拉力；成長偏磨、撤離／死亡結算雷同，削弱再開動機。 |
| **平均** | **3.3/5** | **核心有樂趣，但跨設備與關鍵回饋尚未完整兌現。** |

## 7. 合理性：經濟、難度與進度

- **經濟**：自然短跑六次的累積零件依序為 11、14、16、18、21、31；首個 30-part hull 升級在第六跑才買到，之後餘額 1、下一級 55。升級有可驗證效果與清楚費用，但前段獲得量有長時間只加 2–3 的落差，首個「我變強了」偏晚。建議讓認真完成 2–3 次完整新手跑便能買到第一個有感節點，或給首次里程碑定額零件。
- **難度**：桌機自然跑到 wave 3、59 kills 仍為 520 HP；第一次死亡橋段從 30 HP 還回復至 wave 4 的 123 HP。這讓新手感到爽快，但環境事件說「沙牆壓低視野」時，生存壓力並未同步上來。高波敵人能以 active hit 公平致死，問題是前中段曲線太平，不是無法死亡。
- **節奏**：波次、廣播、事件、補給銜接緊湊。補給不暫停本來可維持張力，但現在缺輸入隔離，會把節奏優點轉成誤觸 P1。
- **羈絆敘事**：車隊戰鬥喊話、起始章與里程碑無線電讓「護航」不只是抽象分數；可惜結局沒有把隊伍撤離或戰死的情緒落地。
- **數值突兀**：補給收益與零件掉落對玩家不夠可預測；同樣約 10.7 秒的短跑，累積增量可從 +2 到 +10。若有掉落條件，畫面上需要更明確解釋。

## 8. 人類樂趣裁決

### 裁決：PARTIAL

**人類玩家能體驗到好玩之處，但不是所有目標設備都能穩定得到同等樂趣。** 在 desktop、phone-portrait 與 tablet 上，出勤後數秒內就能感到移動、射擊、命中、擊殺與車隊廣播的連續回饋；補給、環境事件和永久升級也形成「再撐一波／再跑一趟」的理由。它已經不是單純能動的技術展示。

未判 YES 的主因是：phone-landscape 的核心戰場明顯不適合人眼與手指；跑局中設定會把玩家困在互相覆蓋的 UI；補給可能在閱讀前被射擊 click 誤選；撤離與陣亡缺少不同的情緒回報；早期升級節奏又把下一次有感成長推得偏後。

### 阻擋樂趣前 5 名（依玩家感受排序）

1. **做真正的 landscape 戰場，而不只是讓 overlay 全寬**：重排 camera、HUD、事件廣播與觸控區；若短期無法完成，至少在橫向清楚提示旋回直向，不要把 178 px 窄柱當合格橫向體驗。
2. **修正跑局中設定的暫停狀態競態**：任何 `drawerReturnContext` 存在時都不能重畫 pause panel 到抽屜前方；關閉後再依原始狀態精確恢復。
3. **替補給建立明確輸入意圖**：面板出現後等待既有 pointer release／短 debounce，避免同一發射 click 穿透成選擇；選項也應避開主要瞄準走廊。
4. **讓撤離與陣亡有截然不同的結算高潮**：標題、色彩、死因／撤離原因、存活時間、車隊反應都要不同；同時先把結算 scrollTop 放頂端，再設定不捲動的焦點。
5. **教會玩家點車體開輪盤，並提早第一個有感成長**：首次可升級時加一次性車體提示；把第一個永久升級調到約 2–3 次有品質的跑局可達，並解釋零件收益來源。

## 9. 截圖與原始紀錄索引

- 開機：`shots/00-*.png`。
- 基地與 rail：`shots/01-*.png`、`shots/10-*.png`。
- 桌機完整實玩：`shots/03-*.png`。
- 設定覆蓋：`shots/04-*.png`。
- 車體輪盤：`shots/06-*.png`。
- 手機／平板循環：`shots/07-*.png`。
- 撤離與結算按鈕：`shots/08-*.png`。
- 陣亡：`shots/09-*.png`。
- 出擊二段確認：`shots/11-*.png`。
- 補給快捷鍵：`shots/12-*.png`。
- 真實升級購買：`shots/13-*.png`。
- laptop-short：`shots/14-*.png`。
- 旋轉與離線：`shots/15-*.png`。
- 機讀紀錄：本資料夾各 `*.json`；Playwright 臨時腳本位於 `docs/playtest/tmp/`。

本次只新增 `docs/playtest/` 產物與臨時腳本；未修改遊戲程式、未 commit、未 push。
