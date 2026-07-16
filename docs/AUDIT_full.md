# 灰燼護航 Ashes Convoy 全面稽核報告

- 稽核日期：2026-07-16
- 稽核角色：資深遊戲 QA／製作人
- 稽核版本：README 標示 R76；本地工作樹稽核前為 clean
- 範圍：`src/` 主要程式、`index.html`、`README.md`、`AGENTS.md`、`docs/`、`references/data-model.md`、runtime raster 資產、單元／E2E 測試
- 異動範圍：只新增本報告，未修改遊戲程式、素材或測試檔

## 結論摘要

目前版本具備可運作的「護送、波次、自動射擊、局外升級、四載具」骨架，R73 的敵人走路／受擊／死亡 raster 管線也確實存在；但**不建議把 R76 視為完整驗收通過**。廣告與 GDD 的核心抉擇「射爆想要的增益門核心」在實作中沒有投射物碰撞，錯過一組門後還會留下永不清除的選擇狀態，連帶封鎖補給與後續門提示。另有效能檔位改變敵人數量與移動軌跡、桌機側欄把進行中的局帶回基地卻無返回路徑、攻擊動畫不符合 `AGENTS.md` 的 anticipation／impact／recovery 規範等重大問題。

缺陷總數：

| 分級 | 數量 | 定義 |
|---|---:|---|
| P0 | **0** | 全體玩家無法啟動、必然毀檔或主流程完全中斷 |
| P1 | **9** | 核心機制失效、可造成局進度／資料損失、跨硬體不公平，或明確違反強制品質規範 |
| P2 | **9** | 可完成遊玩，但有明顯體驗、內容、可讀性、文件或效能債 |

> P0 為 0 不等於 live build 已證明無 P0。E2E 在啟動瀏覽器前失敗，線上站也受本機 Chrome 安全原則阻擋；因此本次不能宣稱 production console clean 或所有視口實機通過。

## Top 5 修正優先序

1. **F-01／P1：補上增益門核心的投射物碰撞與 HP 流程。** 這是 README、GDD 與核心循環共同承諾的主決策，現在完全不可操作。
2. **F-02／P1：建立 gate pair 的明確過期與清除狀態。** 否則一次漏門會封鎖補給與後續門提示。
3. **F-15／P1：讓戰鬥中開啟桌機 rail 後能回到原局。** 現況關閉抽屜只會留在基地，再出勤會覆蓋原局。
4. **F-11／P1：效能品質只能降畫面成本，不得改敵人上限與邏輯軌跡。** 目前裝置效能直接改變難度與公平性。
5. **F-05／P1：補齊敵人、Boss、席安的攻擊動畫狀態機與素材。** 投射物／傷害只能在 active impact frame 發生，並保留 anticipation 與 recovery。

## 實際執行與覆蓋限制

### 測試命令

| 命令 | 實際結果 | 判讀 |
|---|---|---|
| `npm test` | **EXIT 0，約 1.29 秒** | Config、Automation guard、Visual guard、Animation asset guards、Rules、Supply choice、Economy、Storage、Sprite contract、FX、Audio 全部 PASS。動畫資產檢查輸出為 35 files／722,518 bytes；sprite contract 為 36 sprites／218 frames。 |
| `npm run test:e2e` | **EXIT 1，約 0.77 秒；0 個案例執行** | Playwright 找不到 `chromium_headless_shell-1228/.../chrome-headless-shell.exe`，於 `scripts/test-e2e.js:3397` 的 `chromium.launch()` 前置階段終止。CI 工作流有安裝 Chromium，但本機這次沒有可執行檔。此結果不能拿來證明任何 E2E 行為通過或失敗。 |

### Live／視口限制

- 實際嘗試開啟 `https://mars-tw.github.io/ashes-convoy/`、`file://` 與 localhost；皆被目前 Chrome 的使用者安全原則阻擋。依工具規範停止重試，未繞過安全設定。
- 所以本次**沒有取得 production console、network、真實 FPS、觸控手感或 live DOM 截圖**。相關結論只採用可執行的程式路徑、確定性 harness、CSS 幾何、既有 R74／R76 證據圖與實際 raster 檔案；不能直接觀察的部分均未寫成通過。
- 另以載入實際 `src/config.js`、`src/rules.js`、`src/fx.js`、`src/game.js` 的無 DOM harness 重現三條關鍵路徑：
  - 增益門 HP 45；自動射擊 1 秒後 HP 仍為 45，場上投射物由 1 增至 4。
  - 車輛置中漏過 `gatepair_2`；25 秒後該 pair 的 gate 已為 0，但 `state.gateChoice.pairId` 仍是 `gatepair_2`。再生 `gatepair_161`，畫面物件是新 pair，選擇狀態仍指向舊 pair。
  - 同 seed／同敵人：high profile 可留下 72 隻、low 為 54 隻；相同 runner 更新 1 秒後 X 座標相差 3.816986。

---

## 1. 可玩性

### 整體判定

護送、清怪、波次、補給、載具差異與局外升級的框架完整；拖曳時提高射速、放開後保留自動射擊也有清楚的節奏差。但現在「打哪一扇增益門」並非射擊決策，而只是車道交會判定，核心循環因此退化為移位與生存。難度模型在中後期大量堆敵，Boss 又只重複同一種，長局節奏缺少內容變化。

### F-01｜P1｜增益門核心不會被子彈擊中，核心決策未實作

**證據／重現**

- 六種 gate 都有 `coreHp`：`src/config.js:1487-1541`；波次會成長 gate HP：`src/config.js:1544-1565`。
- spawn 時也正確建立 `hp/maxHp`：`src/game.js:1608-1627`。
- 但投射物更新只碰撞 hazard 與 enemy：`src/game.js:2579-2705`，沒有任何 gate 碰撞分支。
- gate 的實際選擇只看載具與 gate 的車道交會：`src/game.js:2715-2734`；畫面文案則寫「選擇後套用」：`src/game.js:3168-3199`。
- 確定性 harness：gate 初始 HP 45，自動射擊 1 秒且投射物通過後仍為 45。
- 對外說明明確承諾「優先打破想要的增益門核心」：`README.md:35`；GDD 也說核心有 HP、必須分配火力：`docs/gdd.md:10,39`。

**影響**

玩家無法執行遊戲最具辨識度的風險／獎勵操作；畫面 HP、數值成長與說明都成為假機制。這不是平衡微調，而是核心循環缺件。

**建議修法**

在 projectile update 的明確優先序中加入 gate core hitbox，命中時扣 HP、播放 hit flash／音效／數字，並定義「打爆即鎖定該門」或「只解鎖、仍需穿越」其中一套一致規則。新增測試至少涵蓋：子彈命中會扣 HP、非核心區不扣、爆掉後只能套用一門、gate 成長 HP 仍可在合理 TTK 內擊破，並同步 README／GDD。

### F-02｜P1｜漏過 gate pair 後 `gateChoice` 永不清除，補給與後續門提示被鎖死

**證據／重現**

- 開補給時，只要 `state.gateChoice` 存在便直接 return：`src/game.js:1268-1277`。
- 開新 gate choice 時也因既有 `gateChoice` 直接 return：`src/game.js:1645-1663`。
- 選中 gate 才會清狀態：`src/game.js:1709`；gate 越界移除路徑只 filter 物件，沒有 pair 過期清理：`src/game.js:2715-2734`。
- 重現：開始一組雙門後將載具置於兩門中間不碰撞；等待兩門離場。場上 gate 變 0，但 `gateChoice` 仍保留。再生下一組門，場上是新 pair，HUD／選擇狀態仍指向舊 pair；期間補給也無法開啟。

**影響**

一次操作失誤便永久破壞該局兩個重要獎勵系統，直到重開局為止；玩家會誤認補給或增益門隨機失效。

**建議修法**

為 gate pair 加入 `active/resolved/expired` 狀態；當該 pair 已無任何存活 gate 時清除 choice、HUD 與 focus。補給只應被「畫面上仍可選的 gate」阻擋。加入「漏過 pair → 撿補給 → 下一 pair 正常出現」回歸測試。

### F-03｜P2｜中後期以數量／總 HP 堆疊，Boss 波反而形成重複的固定節點

**證據／重現**

- 波長為 30 秒起、每波 +1、上限 45；Boss 每 5 波：`src/config.js:1544-1565`、`src/rules.js:1404-1459`。
- 敵人配置只有一個 Boss：`boss_hive_titan`，`src/config.js:744-767`；每個 Boss 波都使用它。
- 用實際 `rules.createWavePlan`、相同 seed 產生的資料：

| 波次 | 出生數 | 總 HP | Boss HP |
|---:|---:|---:|---:|
| 1 | 24 | 432 | — |
| 5 | 21 | 1,739 | 850 |
| 10 | 31 | 5,633 | 1,088 |
| 14 | 115 | 25,514 | — |
| 15 | 41 | 11,264 | 1,393 |
| 20 | 51 | 20,668 | 1,783 |

**影響**

數學上可見普通波後期主要靠物量與血量拉長，而每五波仍是同一 Boss／同一 66% 與 33% 事件；Boss 波的總 HP 甚至可能低於前一普通波。這會削弱 Boss 的驚喜與里程碑感。

**建議修法**

改用 threat budget 控制同屏與總血量，加入不同 Boss 或至少不同環境 phase／招式組；在第 10 波後增加質變而非只加數量。建立未升級、中度升級、滿級三套 TTK／存活時間基準，逐波驗證峰值和休息波。

### F-04｜P2｜Hard／Endless 為不可達半成品，結算卻保留難度語意

**證據／重現**

- `hard`、`endless` 均宣告為 locked：`src/config.js:2314-2317`。
- 開局直接把 difficulty 寫死為 normal：`src/game.js:1356`。
- 敵人縮放也固定讀 `DIFFICULTIES.normal`：`src/rules.js:684-695`。
- UI 沒有難度選擇入口，但結算仍顯示難度加成路徑：`src/ui.js:1644`。

**影響**

玩家看到長期成長與重玩結構，卻沒有可用的挑戰檔位；程式與 UI 留有半成品訊號，也增加測試矩陣的假覆蓋。

**建議修法**

短期就移除不可達文案／結算欄；若要完成，需加入解鎖、選擇、存檔、spawn/Boss/economy 全鏈路傳遞與獨立 E2E，不可只改倍率常數。

---

## 2. 畫質

### 整體判定

R73 的重點修正**有實證通過**：runtime 宣告的 walk／hurt／death atlas 都存在，測試檢查 35 個動畫檔，實際圖集中可看出肢體姿勢變化；低效能檔仍用 walk frame 0／2，不是整張平移或 bob。Boss、載具、首屏／封面與沙塵環境的主體都是一致的末世像素繪風，也未找到 runtime 指向缺檔或啟用中的 placeholder。主要缺口已從「走／受擊／死亡」轉移到「攻擊動畫完全沒有符合規範的三階段」與部分畫風、低檔辨識度。

### F-05｜P1｜攻擊只有邏輯標記或換 walk frame，沒有 anticipation／active impact／recovery

**證據／重現**

- enemy raster contract 只有 walk／hurt／death：`src/config.js:395-430`；各敵人設定亦未宣告 attack atlas：`src/config.js:434-768`。
- ranged enemy 雖有 `windup` 欄位，例如 `src/config.js:510-519`，但 `resolveEnemyRangedAttack` 在 cooldown 歸零便立即產生攻擊：`src/rules.js:705-742`。
- projectile 已生成後才設 `enemy.anim = "attack"`：`src/game.js:2227-2233`；raster renderer 只分 hurt 或一般 walk，未讀 attack：`src/game.js:4126-4162`。
- Boss 有 0.95 秒 telegraph：`src/game.js:2236-2259`，但 attack／rage 仍沒有對應 raster attack phase。
- 席安只宣告 idle／fire 兩 frame：`src/config.js:56-75`；子彈已生成後才用 `firingUntil` 換圖：`src/game.js:2888-2911,4864-4899`。
- 接觸型敵人在撞擊幀直接傷害並從陣列移除，沒有走 hurt/death reaction：`src/game.js:2263-2287`。
- 這直接違反 `AGENTS.md`：「攻擊必須有 anticipation、active impact、recovery；傷害在 impact frame／active hitbox；敵人需有 hurt/death reaction」。

**影響**

玩家難以從畫面預判攻擊時機；Boss telegraph 與真正出招在視覺上脫節。R73 雖修好三類反應，尚不能稱完整角色動畫驗收。

**建議修法**

目前缺少的資產應明列為：一般／遠程敵人 attack atlas、Boss summon／charge atlas、席安 anticipation／fire／recovery atlas、接觸攻擊 reaction。先把 `attack: {frames, fps, anticipationFrame, impactFrame, recoveryFrames}` 做成可替換資料管線；邏輯 projectile／hitbox 只在 impactFrame 啟用，renderer 依 state 顯示，不得用整張縮放／旋轉／bob 假裝完成。

### F-06｜P2｜席安與拖車房間的可愛動畫風，和戰場末世像素繪有明顯斷層

**證據／重現**

- 實際檢視 `assets/vehicles/xi_gunner.png`：大頭、明亮膚色、乾淨 anime/chibi 線條。
- 實際檢視 `assets/shelter/trailer/base_escape_pod.png`：暖色、整潔、偏 cozy room。
- 對照 `assets/cover.png`、`assets/ui/start.png`、`assets/vehicles/land.png`、`assets/enemies/titan_walk.png`：低彩、厚重、灰燼與鏽蝕像素筆觸。

**影響**

基地房間可有較暖的敘事調性，但席安會直接出現在戰鬥載具上；角色比例、邊緣密度與色彩跳脫世界材質，使合成感明顯。

**建議修法**

建立角色／戰場共用的 palette、輪廓厚度、像素密度與污損規範。房間可保留暖色，但戰鬥版席安應另輸出符合載具／敵人比例與灰燼光源的 atlas，不要直接縮用敘事立繪。

### F-07｜P2｜Low profile 關閉 filter 後，部分共用 atlas 的敵人變體辨識度下降

**證據／重現**

- 多個敵人變體共用底圖並靠 `filter`／tint 區分：`src/config.js:628-742`。
- Low quality 不套 per-enemy filter：`src/game.js:4173`。
- Low quality 確實保留 walk frame 0／2：`src/game.js:4102-4118`，所以不是動畫缺失；問題在身份辨識，而非幀數。

**影響**

低階手機正是最需要快速讀懂威脅的環境，卻會失去 chain／mirror／ember 等變體的一部分視覺特徵；只剩 tint 時，縮小畫面上的差異不夠穩定。

**建議修法**

離線預烘 low-cost 變體 atlas，或至少保留固定輪廓符號、甲片／光點與 HUD threat marker；不要把 runtime filter 當成唯一識別來源。以 390×844 與 320px 寬截圖做色弱／灰階辨識測試。

---

## 3. 玩家適應性

### 整體判定

程式有對觸控做 28px 上移準星：`src/game.js:3044-3045`，pointer drag 與虛擬搖桿共用輸入狀態：`src/game.js:3060-3131`，並依拖曳與否調整 aim assist：`src/game.js:2806-2837`。方向鍵、按鈕 focus、ARIA 與 drawer focus return 也比一般 Canvas 小品完整。不過首玩教學仍是每局固定疊字，無法分段教會門／補給；「減少閃光」還意外關閉字幕型敘事。

### F-08｜P1｜「減少閃光」同時關閉文字 bark，錯誤懲罰無障礙使用者

**證據／重現**

- 設定名稱只寫「減少閃光」：`index.html:2002-2003`。
- `runBarksEnabled()` 在 `reducedFlash` 開啟時直接回 false：`src/game.js:804-808`。
- bark 本身是文字／事件 banner：`src/game.js:811-824`，不是閃光特效。

**影響**

對閃光敏感的玩家為了安全關閉視覺刺激，反而失去席安台詞與事件提示；這是無障礙設定語意錯誤，也可能漏掉戰況資訊。

**建議修法**

把 `reducedFlash` 僅套用 flash、shake、白屏與高頻粒子；另設「敘事字幕／戰鬥提示」開關，預設開啟。若 bark 有閃背景，只降背景效果，不移除文字。

### F-09｜P2｜教學旗標沒有被消費，首玩提示每局重播且與波次文字／戰鬥重疊

**證據／重現**

- 存檔有 `tutorial.movementSeen/gatesSeen`：`src/config.js:2751-2754`，migration 也補欄位：`src/rules.js:2355-2359`；runtime 搜尋不到讀取／寫入這些旗標的教學流程。
- 每次新局都固定顯示約 2 秒教學：`src/game.js:3219-3252`。
- opening 1.1 秒已開始敵人／wave banner：`src/rules.js:1449-1459`，所以教學、波次標題、戰況會同時發生。
- 既有證據圖 `docs/evidence/R74_ux/phone-run-controls.png`、`docs/evidence/R76_controls/phone-390-touch-controls.png` 可見多層「拖曳移動＋瞄準」文字與 HUD 堆疊。

**影響**

新手一次接收太多訊息，老手每局又被重複提示；最關鍵的 gate core、補給五選與快速升級反而沒有 just-in-time 教學。

**建議修法**

真正使用 tutorial flags：首局先暫緩敵人，完成一次拖曳才開始；第一次 gate／補給到場時再分段提示，完成後保存。基地提供「重播教學」，並讓 banner 進入單一排程佇列避免互蓋。

### F-10｜P2｜補給有五個選項，數字鍵只支援 1–4

**證據／重現**

- 補給池有五種 reward：`src/config.js:1158-1207`。
- 每個選項都會依 index 顯示 1、2、3、4、5：`src/ui.js:1416-1452`。
- 鍵盤 handler 只接受 1–4，方向鍵才可到第五項：`src/ui.js:1463-1487`。
- README 也只宣告 1–4：`README.md:52`。

**影響**

純鍵盤玩家看到「5.」卻不能按 5；控制映射不完整，也讓輔助技術較難直接選擇最後一項。

**建議修法**

接受 1–5／Numpad1–5，README 同步；切換 focus 時用可讀狀態提示目前項目，保留方向鍵＋Enter 作替代操作。

---

## 4. BUG

### 整體判定

`npm test` 的規則、經濟、storage schema、sprite contract 與資產 guard 均通過，表示既有受測契約穩定；但未覆蓋的 runtime 狀態整合仍有重大錯誤。由於 live browser／E2E 未能啟動，本報告不宣稱「無 console error」，也不把瀏覽器環境的 Playwright 缺檔算成產品 P 級缺陷。

### F-11｜P1｜效能品質檔位改變敵人數量與 AI 軌跡，造成跨裝置難度不一致

**證據／重現**

- high：`maxEnemies: 72, enemyAnimScale: 1`；low：`maxEnemies: 54, enemyAnimScale: 0.45`：`src/config.js:2287-2311`。
- spawn 會依 effective cap 直接拒絕建立邏輯敵人：`src/game.js:884-899,1502-1567`。
- `enemyAnimScale` 不只影響畫面，而被乘進敵人 sway/event drift 的 velocity：`src/game.js:2172-2212`。
- 同 seed harness：請求 80 隻後 high 實存 72、low 54；同一 runner 更新 1 秒，X 座標分別為 89.694643 與 85.877657，相差 3.816986。

**影響**

低階裝置會少打 25% 敵人且敵人移動不同；硬體快慢直接改變難度、擊殺、零件、成就與 leaderboard 意義，也破壞 replay／E2E 的確定性。

**建議修法**

所有品質檔共用固定 logical entity、spawn 與 AI；只能降粒子、陰影、filter、動畫取樣與 render culling。若同屏邏輯量真的要限流，改成固定 threat budget 或不可見敵人的低成本模擬，且所有裝置結果一致。

### F-12｜P1｜localStorage 讀寫沒有安全層，受限瀏覽器可在 boot 階段中斷

**證據／重現**

- `loadMeta` 直接 `localStorage.getItem`，`saveMeta` 直接 `setItem`，均無 try/catch：`src/ui.js:63-70`。
- init 雖先裝 global error handler，之後立刻呼叫 `loadMeta`：`src/ui.js:2256-2260`；若 getItem 丟 `SecurityError`，後續 bind／game init 不會繼續。
- import 與清除也直接使用 storage：`src/ui.js:1793-1803,1870-1878`。
- 全域 recovery 再嘗試保存時只 catch 並吞掉，沒有切到記憶體模式：`src/ui.js:83-103`。

**影響**

隱私模式、嵌入式 WebView、企業策略、quota 或 storage 被封鎖時，可能白屏／無法啟動；存檔失敗也沒有可靠的玩家通知。

**建議修法**

建立單一 storage adapter，捕捉 `SecurityError`／`QuotaExceededError`，降級為 in-memory session 並顯示非阻塞警告與匯出按鈕。import 使用 parse→validate→atomic replace，boot 不得因持久化不可用而中止。

### F-13｜P1｜戰鬥快速升級同時存在「立即生效」與「下局生效」，且開輪盤不停戰

**證據／重現**

- 快速輪盤列出所有升級 track：`src/ui.js:290-323`，開啟只顯示 overlay，未 pause／slow：`src/ui.js:330-347`。
- 購買後呼叫 `game.setMeta(meta)`：`src/ui.js:1838-1860`；`setMeta` 只更新 meta／performance／draw，沒有重算目前 vehicle：`src/game.js:1463-1470`。
- 目前 hull、armor、damageTaken 在開局時固定：`src/game.js:1336-1376`；但每發子彈又即時從新 meta 重算武器：`src/game.js:2041-2051`。
- `docs/evidence/R76_controls/desktop-1366x600-quick-wheel.png` 顯示輪盤覆蓋窄戰場中央的大部分可視區，敵人仍在其後方。

**影響**

weapon／energy 可能本局立即變強，hull／armor／resist 卻等下局；玩家沒有任何文案能預測結果，且操作輪盤時仍可能受傷。

**建議修法**

二選一並全 track 一致：A. 明示「下次出勤生效」，本局全部延後；B. 即時重算所有 stats，HP 以比例或明文規則 rebase。輪盤開啟時至少 slow／pause，桌機改放側 rail，關閉後恢復原狀態。

---

## 5. 說明

### 整體判定

README 對拖曳、搖桿、放開後自動射擊、快捷鍵與四載具的說明清楚，也和主要輸入程式大致一致；但最重要的 gate 說明與實作相反，且資料模型／stage 文件落後目前 config。這會讓玩家、QA 與後續製作使用不同的「真相來源」。

### F-14｜P2｜README／GDD／data model／stage plan 與現況互相矛盾

**證據／重現**

- README 說「四類增益門」：`README.md:20`；目前 config 有六種：`src/config.js:1487-1541`。
- README／GDD 說要射爆 gate core：`README.md:35`、`docs/gdd.md:10,39`；實作缺失見 F-01。
- `references/data-model.md:8` 說 `META_VERSION = 3`，同文件範例卻仍是 `version: 2`：`references/data-model.md:15`，settings 與內容表也未跟上 R76。
- `docs/stage-plan.md:18-19` 仍把 current content 寫成三種小怪＋單 Boss；`docs/stage-plan.md:61` 要求 README 有「📋 更新日誌」，目前 README 沒有該節。

**影響**

玩家會照錯誤機制操作；製作、測試與新貢獻者也可能依舊 schema／舊敵人表新增錯誤資料。

**建議修法**

先以 `src/config.js`／`src/rules.js` 作唯一真相，修完 F-01 後同步 README、GDD、stage plan、data model。長期從 config 產生門／敵人／版本表，並加 docs guard 驗證 META_VERSION、gate 數與 README changelog。

---

## 6. 選單

### 整體判定

基地、設定、升級抽屜與拖車房間都有明確關閉鈕；drawer close 會把 focus 還給觸發按鈕：`src/ui.js:231-253`，拖車房間也有 focus return：`src/ui.js:1113-1128`。真正的死路發生在「戰鬥 → desktop rail → 基地」這個跨狀態導覽。另有兩個清除存檔入口都直接執行，風險過高。

### F-15｜P1｜戰鬥中開 desktop rail 會暫停並切回基地，關閉抽屜後無法返回原局

**證據／可重現步驟**

1. 桌機開始出勤。
2. 戰鬥中點左／右 rail 的升級、載具、任務、成就或設定。
3. `openShortcutPanel` 先 `game.pause()`，再 `showGarage()`、開 drawer：`src/ui.js:255-268`。
4. `showGarage` 會隱藏 pause panel：`src/ui.js:1595-1603`。
5. 關閉 drawer 只 hide／focus return，不會 `game.resume()` 或 `showPlaying()`：`src/ui.js:242-253`。
6. rail 綁定均走此路徑：`src/ui.js:1967-1971`。基地只剩重新出勤；新出勤會重建 run：`src/ui.js:1863-1868`。

**影響**

玩家只是想查看設定／任務，卻把本局停在不可返回的背景狀態；再次出勤等同丟失原局進度。這是選單死路，也是 run-loss bug。

**建議修法**

記錄 drawer 的來源狀態 `returnToRun`；由戰鬥 rail 開啟時，關閉／Esc 必須回到 pause panel 或原局，提供明確「返回戰鬥」。更簡單的短期方案是戰鬥中隱藏基地 rails，設定改由 pause overlay 開啟。

### F-16｜P1｜清除存檔為單擊立即執行，沒有確認、備份或復原

**證據／重現**

- clear handler 直接 `localStorage.removeItem`、建立新 meta 並重繪：`src/ui.js:1870-1878`。
- 基地與設定內兩個清除鈕都直接綁同一 handler：`src/ui.js:1914-1927,1947`。
- import 會先寫 backup：`src/ui.js:1793-1803`，但 clear 反而沒有相同保護。

**影響**

一次誤觸即可永久失去升級、藍圖、成就與設定；手機小畫面與 drawer 捲動時風險更高。

**建議修法**

使用二階段 destructive confirmation，明確顯示會刪除的資料；刪除前自動保存可下載／可復原 backup，提供當次 session 的 Undo。戰鬥中應禁用或延後到回基地。

---

## 7. 全平台 UX

### 整體判定

R76 對控制可達性的硬化方向正確：390×844 證據圖中搖桿與四個 action button 都在拇指區；觸控準星上移、Canvas drag 保留，桌機則以左右 rails 補足基地入口。桌機直式戰場本身符合產品定位，但目前只是窄直式畫面置中、兩側大量留白；tablet landscape 也沒有專用資訊架構。由於 live／E2E 被阻擋，以下屬程式幾何與既有證據驗證，不是實機驗收。

### 視口與控制驗證摘要

| 類型 | 可驗證結果 | 判定 |
|---|---|---|
| 手機直式 390×844 | stage 完整使用 390:844；既有 R76 圖中 joystick、技／閃／退／暫均在下方，Canvas drag 仍保留 | **條件通過**；需 live 觸控／safe-area／鍵盤再驗 |
| 平板直式 820×1180 | 390:844 比例約為 545×1180，控制可落在 stage 內 | **可用但浪費寬度** |
| 平板橫式 1180×820 | 依同一比例 stage 約 379×820，沒有橫式專用 layout／轉向提示 | **P2** |
| 桌機 1366×700 | stage 約 323×700；左右 rail 可達，但戰鬥資訊仍擠在窄柱 | **條件通過** |
| 桌機 1680×900 | stage 約 416×900 | **條件通過** |
| 桌機 1920×1080 | stage 約 499×1080 | **條件通過** |

CSS 依據：stage `aspect-ratio: 390 / 844`：`index.html:126`；desktop rails：`index.html:132-177`。以上尺寸為 CSS 幾何計算，不冒充瀏覽器實測。

### F-17｜P2｜桌機／平板橫式只放大窄直式舞台，rails 沒有承接即時戰況資訊

**證據／重現**

- stage 固定 390:844：`index.html:126`；桌機只額外顯示兩側 rail：`index.html:132-177,1828,2107`。
- `docs/evidence/R76_controls/desktop-1366x600-quick-wheel.png` 顯示 1366 寬中戰場約 277px，快速輪盤又覆蓋大部分中央。
- 1180×820 平板橫式依 CSS 只能得到約 379×820 的戰場，其餘寬度沒有目標、Boss 狀態、升級或地圖資訊；也沒有 landscape 特化或旋轉建議。

**影響**

控制雖可按，桌機／平板並未真正利用可用畫面；高密度波次、五選補給、Boss telegraph 與快速輪盤都擠在同一窄柱，資訊互蓋風險高。

**建議修法**

保留中央 390:844 戰場，但在寬螢幕把 quick wheel、任務、目前增益、Boss phase 與隊伍狀態移到 side panel；平板橫式提供同一套雙欄 composition 或明確建議直式。加入 320×568、390×844、820×1180、1180×820、1366×600、1920×1080 的可見性與 hit-target E2E。

### F-18｜P2｜開局預載所有環境大圖，低階手機有不必要的解碼記憶體壓力

**證據／重現**

- `preloadEnvironmentImages()` 會迴圈載入全部環境，不只本局所選環境：`src/game.js:464-483`；init 無條件呼叫：`src/game.js:5478`。
- 實際四張主要環境圖合計 4,871,296 pixels；以 RGBA 解碼約 **18.6 MiB**，尚未計入載具、敵人、action atlas、拖車、Canvas backing store、FX 與瀏覽器 overhead。
- Low profile 雖降低畫面效果，仍走相同預載路徑。

**影響**

低記憶體手機可能更早觸發 GC、texture eviction 或 tab reload；而玩家一局只使用一台載具／一個對應環境，這筆成本多數無即時價值。

**建議修法**

只預載目前載具的環境與必要 fallback；其他環境在基地選車或 idle 時 lazy load。建立 decoded image budget、離開房間時釋放大型暫存 canvas，並在真機量測 memory、首幀時間與 30 分鐘長局掉幀。

---

## 驗收建議

先修 F-01、F-02、F-15、F-11、F-05，再補齊 Playwright Chromium 後重跑完整 E2E。最低重驗矩陣應包含：

1. gate 可射擊、漏門、選門、補給接續與下一 pair。
2. 戰鬥中開／關每一個 rail，原局可恢復且不重建。
3. high／medium／low 在相同 seed 下的 spawn、敵人位置、傷害、結算完全一致。
4. 每個 ranged／Boss／席安攻擊逐幀驗證 anticipation → active impact → recovery，接觸敵人有 hurt/death reaction。
5. localStorage 正常、quota、SecurityError、corrupt JSON、匯入失敗、清除後 Undo。
6. 320×568、390×844、820×1180、1180×820、1366×600、1920×1080，含觸控 hit target、safe area、quick wheel、補給五選與 Boss wave。
7. production URL 的 console／network／service worker 更新與離線啟動；在取得實際證據前不可標記為通過。

## 最終分級清單

| ID | 分級 | 摘要 |
|---|---|---|
| F-01 | P1 | 增益門核心不吃子彈 |
| F-02 | P1 | 漏門後 gateChoice 永不清除 |
| F-03 | P2 | 中後期物量堆疊、Boss 重複 |
| F-04 | P2 | Hard／Endless 不可達 |
| F-05 | P1 | 攻擊動畫缺三階段與 impact 同步 |
| F-06 | P2 | 席安／房間與戰場畫風斷層 |
| F-07 | P2 | Low profile 變體辨識下降 |
| F-08 | P1 | 減少閃光錯誤關閉文字 bark |
| F-09 | P2 | 教學旗標未使用、提示重疊 |
| F-10 | P2 | 第五個補給無數字鍵 5 |
| F-11 | P1 | 效能檔位改變遊戲模擬 |
| F-12 | P1 | storage 例外可中斷 boot |
| F-13 | P1 | 快速升級生效時機不一致 |
| F-14 | P2 | README／GDD／資料模型過期矛盾 |
| F-15 | P1 | 戰鬥開 rail 後無法返回原局 |
| F-16 | P1 | 清除存檔無確認／復原 |
| F-17 | P2 | 桌機／平板橫式空間利用不足 |
| F-18 | P2 | 無條件預載所有環境大圖 |

**合計：P0 0、P1 9、P2 9。**
