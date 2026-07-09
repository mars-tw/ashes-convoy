# 《灰燼護航》R58 — 優化與潛在問題審查報告（Grok R1）

| 項目 | 內容 |
|------|------|
| 對象 | `src/` 全模組（`game.js` / `rules.js` / `fx.js` / `audio.js` / `ui.js` / `config.js` / `sprite-renderer.js` / `sprites.js` / `shelter-scene.js` / `version.js`） |
| 版本 | R58（`APP_VERSION` / `META_VERSION = 3`） |
| 姿態 | 對抗式：只列**可驗證、有實質效益**的項目，不列風格瑣事 |
| 產出日 | 2026-07-09 |
| 約束 | 本檔僅審查建議；**不修改**遊戲程式碼 / 測試 / 資源（改動須走總稽核 + CI） |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **P0** | 正確性/平衡明顯失真，或熱路徑上可量測的嚴重效能問題；建議下一版優先處理 |
| **P1** | 實質 bug 邊界、可觀測的效能/GC 壓力、擴充成本；建議排程 |
| **P2** | 架構債、體感/數值可驗證缺口、中長期整理 |

---

## 1. 正確性與潛在 bug

### P0

#### 1.1 `game.js`：穿透彈可對**同一敵人**每幀重複結算傷害
- **問題**：`updateProjectiles` 命中後若 `projectile.pierce > 0` 只減 pierce 並繼續飛行，**沒有 hit-set / 冷卻**。同幀之後、或重疊多幀時，同一 `enemy` 可被同一子彈反覆扣血。
- **影響範圍**：`void_lance`（基礎 pierce 2）、雷射彈種（`pierceAdd: 3`）、overload 額外 pierce、高射速載具。星窗穿梭艇 + 雷射在貼身重疊時會遠超設計 DPS。
- **建議**：子彈上維護 `hitIds: Set`（或稀疏陣列），命中時 `if (hitIds.has(enemy.id)) continue`；pierce 僅在「新目標」時遞減。補 `test-rules`/`test-e2e`：固定速度下重疊 3 幀只結算一次。
- **預期效益**：恢復穿透武器的可預測傷害曲線；避免 void_runner / 雷射成為非預期碾壓解。

#### 1.2 `rules.js`：`pickWeighted` 把 `poolWeight < 1` 全部夾成 1，生成池權重失效
- **問題**：
  ```js
  Math.max(1, item.weight || 1)
  ```
  `config.ENEMIES` 中 `spore_spitter.poolWeight: 0.52`、`tar_brute: 0.32`、`void_wraith: 0.34` 等**全部變成 1**；僅 `runner` 預設 1.15 仍有微弱差異。
- **後果**：精心調的稀有/精英出現率與設計文件脫節；後期波次精英密度偏高，難度曲線與作者意圖不一致，且 **CI 目前未守護此行為**（`test-rules.js` 未斷言權重分佈）。
- **建議**：改為 `const w = Math.max(0, Number(item.weight) || 0)`，total 為 0 時回退均勻；為 `poolWeight` 寫固定 rng 序列下的直方圖斷言。
- **預期效益**：波次組成回到資料驅動的真實權重；精英/遠程密度可調、可測。

### P1

#### 1.3 `game.js` + `rules.js`：濺射 / 死亡爆炸繞過 `resolveEnemyIncomingDamage`
- **問題**：
  - `damageSplash`：直接 `enemy.hp -= splashDamage`，不走盾殼 front 減傷、相位減傷。
  - `killEnemy` 的 `deathBurst`：對鄰近敵人同樣直接扣 HP。
- **後果**：`ark_cannon` 濺射、腫囊屍連鎖對 `shield_husk` / `void_wraith` 等效「無視機制」；海面載具被動清場也類似（`resolveBroadsideEcho` 回傳 damage 後直接扣）。
- **建議**：統一經 `resolveEnemyIncomingDamage`（可傳 `projectile: { vy: -1 }` 或新增 `sourceKind: "aoe"` 規則）；文件化「AOE 是否吃盾」。
- **預期效益**：敵方機制一致、海載具/甲板砲不再隱性剋盾。

#### 1.4 `rules.js`：`shield` 的「正面判定」在本遊戲座標系下幾乎恆真
- **問題**：`frontHit = projectile.vy < 0`。縱射時玩家彈幾乎永遠 `vy < 0`（向上飛），側/背擊條件幾乎不可達。
- **後果**：`frontDamageMul` 變成「對玩家子彈恒定減傷」，盾殼設計語意（正面硬、側面弱）名存實亡。
- **建議**：改以彈道相對敵人朝向（例如相對 `vehicle.x` 的入射角、或敵面向向量）判定；或改為「僅近戰接觸破盾、遠程恒減傷」並在 UI/圖鑑寫清。
- **預期效益**：盾殼變成可讀、可操作的機制，而非純數值牆。

#### 1.5 `game.js`：正式主迴圈與 `step()` 固定步長不一致
- **問題**：
  - `loop`：`delta = min(0.05, …)` 後**單次** `update(delta)`。
  - `step`（測試/手動）：以 `MAX_STEP = 1/30` **切塊**模擬。
- **後果**：同 seed 在瀏覽器與 CI/`step` 下碰撞、射速累積、相位週期可能分叉；「決定性」只在 rules 波次層級成立，**整局回放不保證**。
- **建議**：`loop` 與 `step` 共用同一 fixed-timestep accumulator；或明確標註「僅 rules 決定性、模擬非決定性」並避免用 `step` 當整局 oracle。
- **預期效益**：回歸測試與實機行為對齊；減少「測試過了實機怪」的幽靈 bug。

#### 1.6 `game.js`：Boss 召喚在敵人 cap 時靜默失敗
- **問題**：`executeBossPhase("summon")` 呼叫 `spawnEnemy`；達 `effectiveMaxEnemies()` 時回 `null` 且不重試。
- **後果**：高壓/低品質 cap 下 Boss 二階段召喚空放，難度與演出不一致。
- **建議**：佇列延遲召喚，或強制替換最遠/最弱非 Boss 敵人；至少記錄 stats 供診斷。
- **預期效益**：Boss 階段可預期；低階裝置難度不「意外變簡單」。

#### 1.7 `rules.js`：`migrateMeta` 舊版存檔祖父條款過寬
- **問題**：`oldPlayer = input.version !== META_VERSION && meta.totalRuns > 0` 時**解鎖全部載具**並把藍圖填滿。
- **後果**：任何未來 `META_VERSION` bump（v3→v4）只要 `totalRuns > 0` 就全解鎖，削弱藍圖進度；若僅修欄位也會觸發。
- **建議**：改為「僅當 `input.version < 某門檻` 的一次性遷移旗標」，或依 `hasVehicleUseSignal` / 既有 `unlockedVehicles` 遷移，禁止版本號不相等即全開。
- **預期效益**：長期存檔相容不破壞進度經濟。

#### 1.8 `game.js`：`damageVehicle` / `applyVehicleDamage` 每擊 `deepClone` 整輛車
- **問題**：不單是效能——若未來在 vehicle 上掛不可序列化/循環欄位，clone 行為可能靜默丟失。
- **建議**：改 in-place 變更 + 回傳 damage 值（rules 仍可提供 pure 版本給測試）。
- **預期效益**：減少 GC；降低狀態形狀漂移風險。

#### 1.9 `ui.js`：`saveMeta` 無 quota / 私密模式錯誤處理
- **問題**：`localStorage.setItem` 未 try/catch；額度滿或禁用時結算獎勵可能已進記憶體 meta 卻落盤失敗。
- **建議**：catch 後提示「存檔失敗」、保留 export code；與既有 recovery 路徑串接。
- **預期效益**：避免「打完沒零件」的客訴級進度遺失。

### P2

#### 1.10 `game.js`：非 Boss 接觸即自毀（自殺式碰撞）
- **問題**：一般敵人碰車立刻 `dead = true` + 全額 `contactDamage`。合理但與「多段摩擦」體感不同；Boss 才有 `hitCooldown`。
- **建議**：若要做摩擦傷，需明確設計；否則在圖鑑標「撞擊即爆」。
- **預期效益**：預期管理，減少「怎麼一下就沒了」的誤解。

#### 1.11 `rules.js`：`runMods.burn / shock / slow` 死欄位
- **問題**：`defaultRunMods` 有三欄，全 codebase 無讀寫效果。
- **建議**：刪除或實作 DoT/緩速彈種；避免擴充時誤以為已生效。
- **預期效益**：資料模型誠實，減少半成品陷阱。

#### 1.12 `game.js`：全域 `keydown` / pointer 綁定 `boundInput` 後永不移除
- **問題**：單頁生命週期可接受；若未來 HMR / 多實例 init 會重複綁定。
- **建議**：`dispose()` 對稱 unbind（測試 API 可呼叫）。
- **預期效益**：可測、可嵌入。

#### 1.13 浮點：`state.time` 長局累加
- **問題**：波次 50–100、數十分鐘後，以 `state.time` 做 `% cycle` 的相位/動畫仍多半可用，但與 wall-clock 比對會有誤差。
- **建議**：相位改用整數 tick 或 `waveElapsed`；非緊急。
- **預期效益**：超長局相位穩定。

---

## 2. 效能

### 現況（已做得好的）

- 邏輯解析度 195×422 + 2× 上採樣，比 native 844p 便宜。
- `DSFx` 固定粒子池、free-list、品質分級、`trailEvery`。
- `PERFORMANCE.qualityProfiles` 動態降 `maxEnemies` / `maxEffects` / 粒子。
- 背景 PNG 捲動、星塵直繪、部分 vignette cache。
- 音效節流 50ms、合成音無檔案 I/O。

### P0

#### 2.1 `game.js` + `ui.js`：遊玩中**每幀** `emitState → getState` 深度複製世界
- **問題**：`loop` 在 `!paused && !over` 時每幀呼叫 `emitState()` → `getState()`：
  - 對 `enemies / projectiles / effects / …` 做 `publicEntity` + `rules.deepClone`
  - 再 `deepClone(meta)`、`effectiveRunMods()`（內部又 clone `runMods`）
  - UI `onState` → `renderHud` + `renderPerformanceDiagnostics` 寫 DOM
- **量級**：高密度時每幀分配數百–數千小物件；行動裝置 GC 尖峰是掉幀主因之一，**與粒子池優化互相抵消**。
- **建議**：
  1. 熱路徑改「可變最新狀態指標 + 髒旗標」；UI 只訂閱 HUD 欄位（hp/wave/kills/parts）。
  2. `getState` 僅測試 API / 結算 / 暫停時全量 snapshot。
  3. HUD 文字用 dirty-check（值沒變不寫 `textContent`）。
- **預期效益**：中低階手機最有感的一刀；預估主執行緒可省每幀 1–4ms+（視密度），並降低 GC 卡頓。

### P1

#### 2.2 `game.js`：碰撞與追蹤為 O(projectiles × enemies)（+hazards）
- **問題**：每彈掃全部敵人與 hazard；homing 每彈再掃全部敵人找最近。上限約 96×72 尚可，但加上 1.1 穿透重複命中與多彈種時成本與「有效 DPS」同時膨脹。
- **建議**：粗網格（例如 32px cell）或「只測 y 軸窗口內敵人」；homing 每 N 幀重選目標或共用 spatial hash。
- **預期效益**：高壓波次穩定 60→少掉到 30 的機會下降。

#### 2.3 `game.js`：`fireProjectiles` 每幀呼叫 `calculateShotStats` + `effectiveRunMods`
- **問題**：即使 `weaponCooldown > 0` 仍先算完整射擊統計（含升級、拖車加成、彈種）。
- **建議**：cooldown 期間只減 CD；stats 在 gate/buff/升級變化時 cache。
- **預期效益**：射擊熱路徑分配與 CPU 下降。

#### 2.4 `game.js`：每幀 `updatePartsPreview` → `rewardPartsForRun`
- **問題**：零件預覽只在 kills/wave/event 變化時才需重算，卻綁在 `update` 末尾每幀執行。
- **建議**：事件觸發式更新（kill / wave complete / supply / hazard）。
- **預期效益**：小但穩定的每幀節省；邏輯更清晰。

#### 2.5 `game.js`：渲染端高成本狀態切換
- **問題**：
  - 每彈 **3 次** `drawSprite` 做拖影（`drawGame`）。
  - 變異敵 `ctx.filter = css filter`（行動 GPU 極痛）。
  - spark/ember 每粒子 `createRadialGradient`（`drawFxParticle`）。
  - 敵影 `ellipse` + 多次 `save/restore`。
- **建議**：
  - 低品質：彈拖影 0–1 層；spark 改實心圓（已有 reduced 分支可擴大）。
  - 變異 tint：預烘焙 `tintedCache`（sprite-renderer 已有 tint 架構）替代 runtime `filter`。
  - 粒子：批次同色 `fill`、少用 gradient。
- **預期效益**：variant 密集波 + full FX 時幀率改善最明顯。

#### 2.6 `game.js`：陣列 `filter` / `forEach` 每系統每幀新陣列
- **問題**：`enemies`、`projectiles`、`effects`、`messages` 等多處 `filter` 產生新陣列；`forEach` 建 callback。
- **建議**：swap-remove / 雙指標壓縮；熱路徑 `for` 迴圈。
- **預期效益**：降低分配、對低階裝置 GC 友好。

#### 2.7 `fx.js`：`updateParticles` 掃整個 pool（含 inactive）
- **問題**：high 96 / low 48 全掃可接受；若未來提高 cap 會線性變差。
- **建議**：維護 active 鏈結或 dense active 列表（僅當 cap 上調時必要）。
- **預期效益**：中長期粒子擴充空間。

#### 2.8 `game.js`：背景 fallback 每幀建 gradient / 大量 path
- **問題**：PNG 失敗時 `drawLand/Air/Sea/SpaceBackground` 每幀 `createLinearGradient` 與大量 path。主路徑已用 raster，風險在載入中/失敗。
- **建議**：fallback gradient cache；載入中用單色。
- **預期效益**：弱網首屏不掉幀。

### P2

#### 2.9 `ui.js`：`renderGateChoices` / supply 每幀進入但有 key 快取
- 現況已有 `lastGateChoiceKey` 等，方向正確；可再避免無 choice 時重複 clear。
- **預期效益**：微小 DOM 節省。

#### 2.10 雙 Canvas blit
- world→display 的 `drawImage` 擴尺度必要；保持 `imageSmoothingEnabled = false`。無需改，僅記錄為已知固定成本。

---

## 3. 架構與可維護性

### P1

#### 3.1 `game.js` 過肥（約 3.8k 行）職責混雜
- **現況**：輸入、模擬、生成、結算銜接、渲染（背景/敵/FX/UI 字）、效能、資源預載、測試 API 全在同一 IIFE。
- **建議拆分（保持全域掛載相容，避免大爆炸重寫）**：
  | 模組 | 職責 |
  |------|------|
  | `sim/` 或 `combat.js` | 彈/敵/碰撞/擊殺 |
  | `spawn-runtime.js` | wave events、gate/supply 流程 |
  | `render-world.js` | draw* 系列 |
  | `game-api.js` | init/loop/getState/test hooks |
- **預期效益**：改武器/碰撞不必 diff 整個 4k 檔；審查與 bisect 成本下降。

#### 3.2 資料驅動「八成到位」，行為仍散落 switch
- **已資料化**：載具、武器、敵人、variant、環境事件、補給、家具、任務、成就、FX spec。
- **仍硬編碼**：Boss phase 行為（`summon`/`charge`）、敵 AI 分支（`swarm`/`phase`/`brute`/`ranged`/`shield`）、gate 標籤字串、接觸規則。
- **建議**：新敵優先「behavior 表 + 小型 handler map」；Boss phase 改 config 驅動 `actions[]`。
- **預期效益**：加敵種/加 Boss 不必改主迴圈核心。

#### 3.3 擴充成本速查

| 擴充類型 | 成本 | 瓶頸 |
|----------|------|------|
| 新武器數值 | 低 | `config.WEAPONS` + 載具綁定 |
| 新彈種模式 | 中 | `WEAPON_POWERUPS` + `calculateShotStats` + 繪製 |
| 新敵（既有 behavior） | 低–中 | `ENEMIES` + 圖 + pool |
| 新 behavior 類型 | 高 | `updateEnemies` + 傷害解析 + 測試 |
| 新環境 | 中 | 背景圖、事件、FX layers、可能 UI |
| 新載具被動 | 中–高 | 被動分叉散落 `damageVehicle` / 擊殺 / 射擊 |

#### 3.4 `rules.js` 純函式層優秀但部分 API 過重
- **優點**：migrate、settle、wave gen、rng 注入、測試友好。
- **問題**：`resolveBroadsideEcho` 對敵人陣列 deepClone；`applySupplyRewardById` 多層 clone——正確但重。
- **建議**：純函式回傳「diff / hits」由 game 套用；測試用 clone fixture。
- **預期效益**：結算與被動路徑更省、介面更清晰。

### P2

#### 3.5 雙套 RNG 實作
- `rules.createSeededRng`（字串 seed hash）與 `fx`/`audio` 的數值 mulberry32 分家。可接受（域分離），但文件應寫明「局內邏輯只用 rules rng；FX 用獨立 seed 以免污染決定性」。
- **現況 FX 已分離**，維持即可；避免日後有人把 `Math.random` 塞回邏輯。

#### 3.6 `sprites.js` 體量大
- 與 runtime 邏輯分離得當；注意 `preRenderSprites` 啟動成本。已可接受。

#### 3.7 `config.js` 單檔 2k+ 行
- 可依 domain 拆 `config/enemies.js` 等再由 barrel 匯出（需 CI 與 script 路徑同步）。非緊急。

---

## 4. 玩法 / 平衡 / 體驗（工程可驗證為主）

### P1

#### 4.1 穿透重複命中 → 星窗 / 雷射隱性過強（連動 1.1）
- 可驗證：同 seed、固定重疊幀數下 void_lance 對單目標傷害遠高於 `damage * (1+pierce)` 上界。
- **建議**：修 hit-set 後重跑傷害曲線；再調 `void_lance.damage` / 雷射 `damageMul`。

#### 4.2 生成權重失效 → 精英密度偏離設計（連動 1.2）
- 可驗證：wave 6+ 固定 seed，`tar_brute`/`void_wraith` 出現率應接近 poolWeight 比例，現況接近均勻。
- **建議**：修權重後用直方圖對齊 GDD。

#### 4.3 拖車家具數值過薄（可讀但幾乎無感）
- **問題**：例如 `maxHpPct: 0.006`、`fireIntervalMul: 0.992`、`damageTakenMul: 0.996`。滿房加總仍常 < 數個百分比。
- **建議**：若定位是「敘事收藏」應在 UI 強調；若定位是「養成」需把量級拉到可感知（例如單件 2–5% 或閾值套裝）。
- **預期效益**：逃生艙系統投入感；避免玩家覺得家具是假成長。

#### 4.4 不拖曳時射速 `idleMul = 1.35`（射速變慢）
- **問題**：`fireProjectiles` 未拖曳時 `fireInterval * 1.35`，意圖可能是懲罰站樁或省彈幕；但新手教學鼓勵拖曳，未說明「不瞄準會降射速」。
- **建議**：教學/設定說明，或改為僅影響自動瞄準強度而非射速。
- **預期效益**：操作預期一致。

### P2

#### 4.5 接觸秒殺敵對 + 高 contactDamage 的尖刺死亡
- 腫囊/肉盾貼身一下很痛且敵消失；死亡回饋夠，但「來向」資訊在橫向擠壓時偏少。
- **建議**：接近時警告圈或音高（非必須）。

#### 4.6 環境事件獎勵倍率堆疊體感
- 事件 `rewardMulAdd` 進結算；零件 cap（event/supply）有上限——設計健康。確保 HUD/結算 breakdown 已展示（若沒有可加強），避免玩家不知道沙塵暴多給零件。

#### 4.7 隊友機槍（熹）固定 6 傷 / 0.9s
- 後期敵 HP 成長後貢獻下降（可接受的陪伴定位）；若要 scaling 應吃 wave 或 weapon level。
- **建議**：明確「陪伴向」或掛 `calculateShotStats` 的百分比。

#### 4.8 增益門與補給「溢出超載」系統
- 設計成熟（maxed → overload）。注意 overload 疊高後 crit/pierce 成長，與 1.1 疊加時爆炸。
- **建議**：修穿透後再壓測 overload 10+。

---

## 5. 建議修復順序（給排程）

| 順序 | 項目 | 級別 | 預估風險 | 測試重點 |
|------|------|------|----------|----------|
| 1 | 穿透 hit-set | P0 | 中（改 DPS） | 單彈重疊多幀、pierce 跨多敵 |
| 2 | `pickWeighted` 分數權重 | P0 | 中（改波次組成） | 固定 seed 直方圖、opening wave 不變 |
| 3 | 每幀 `getState`/HUD 降載 | P0 | 中（UI 契約） | e2e HUD、暫停/選擇仍更新 |
| 4 | 主迴圈 fixed timestep 對齊 | P1 | 中 | step vs loop 同 seed 前 N 秒 |
| 5 | 濺射/爆濺走統一受傷 | P1 | 低–中 | 盾殼+艦砲、相位+死亡爆 |
| 6 | 渲染 filter/彈拖影/粒子 gradient | P1 | 低 | 效能分級截圖契約 |
| 7 | migrate 祖父條款收斂 | P1 | 高（存檔） | storage 遷移全矩陣 |
| 8 | game.js 拆模組 | P2 | 高 | 全 CI 綠 |

---

## 6. 明確不在本次挑刺範圍（刻意省略）

- 命名風格、註解語氣、prettiness。
- 尚未造成問題的「可以再多寫 JSDoc」。
- 美術風格偏好（非工程可驗證）。
- 重寫成 TypeScript/框架——成本遠高於收益，且與現行 CI 契約衝突。

---

## 7. 總評

《灰燼護航》R58 的 **rules 純函式層、存檔 sanitize、效能分級、FX 物件池、補給/門/藍圖 pity** 都已是上線成熟作品水準；測試面也明顯擋過一輪經濟與波次回歸。

對抗式審查後，**真正值得動刀**的集中在：

1. **穿透命中語意錯誤**（正確性 + 平衡）；
2. **`poolWeight` 被 `Math.max(1, …)` 廢掉**（資料驅動失真）；
3. **每幀全量 deepClone 狀態給 UI**（效能主兇，池化特效被抵消）；
4. 其次才是碰撞空間分割、渲染 filter/gradient、timestep 一致、migrate 政策。

建議以「小 PR + 契約測試」推進，避免一次大拆 `game.js` 卻混進數值改動。
