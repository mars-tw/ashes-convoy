# 《灰燼護航》R61 內容擴充 — 對抗性覆核（Grok R3）

| 項目 | 內容 |
|------|------|
| 對象 | `docs/CONTENT_PLAN_ashes_R1.md` **P0** 落地：新敵 ×4＋變種、彈種 fracture/ember、`gate_focus`、環境事件具名化＋第二互斥事件、`RUN_BARKS` |
| 版本現況 | 程式標為 **R61**（`src/version.js`） |
| 姿態 | **對抗式**：只審不改；逐條給 PASS／缺口／bug、檔案:行號、最小重現 |
| 產出日 | 2026-07-10 |
| 讀取範圍 | `src/config.js`、`src/rules.js`、`src/game.js`（輔以 `scripts/test-*.js` 作證據，不當作產品保證） |
| 約束 | 僅本檔；**不修改**遊戲程式碼／測試／其他文件 |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **PASS** | 落地正確且守護欄，現況可接受 |
| **P0** | 正確性／平衡明顯失真，或宣稱已落地的核心內容在真局中不觸發 |
| **P1** | 邊界 bug、機制語意破洞、可觀測內容缺口 |
| **P2** | 體感／維護債／文件與實作微差 |

### 總表

| # | 議題 | 結論 |
|---|------|------|
| 1 | P0 內容是否落地 | **大致落地**；`deep_route` 真局不觸發；`visibilityLoss` 死欄位；P0-5/6 日誌與成就未進 R61 |
| 2 | 平衡護欄（screamer／husk／tick／fracture／ember／gate） | **數值護欄 PASS**；ember 單目標「含 DoT」略貼／略超 laser 主彈，但未碾壓 standard |
| 3 | 決定性波次種子 × 新敵行為 | **PASS**（組成與行為皆可重播） |
| 4 | `mirror_husk` × R60 前向半平面 | **主路徑 PASS**；DoT／null projectile 走 AOE 一律吃盾 → 與弱側語意衝突（P1） |
| 5 | fracture 副彈 × `hitIds` | **PASS**（不重複打母體、無 pool 認屍）；穿透＋裂片可多段噴射（P2 組合強度） |
| 6 | ember DoT × 護盾／減傷次序 | **直擊次序 PASS**；**DoT 一律 AOE 正面（P1）** |
| 7 | `RUN_BARKS` 時序 × reduced 設定 | **多數節點 PASS**；`deep_route` 掛錯入口（P0）；`reducedFlash` 連同關字幕（P2） |
| 8 | 體驗：事件文案蓋警告／barks 頻率 | **有干擾風險（P1/P2）**：單槽 banner 後寫覆蓋；Boss 來襲被 bark 蓋掉 |

---

## 1. P0 落地盤點

### 1.1 新敵人 ×4 + 變種 — **PASS（資料與池）**

| ID | firstWave | behavior | 護欄相關 | config 行 |
|---|---:|---|---|---|
| `ash_screamer` | 5 | `ranged` + `projectileKind:"scream"` | `projectileDamage: 7` ≤ 8 | `config.js:559–589` |
| `chain_tether` | 7 | `brute` | `slowMul: 0.8` ≥ 0.78；`slowRadius: 44` | `config.js:591–615` |
| `mirror_husk` | 8 | `shield` | `poolWeight: 0.24` ≤ 0.28；`frontDamageMul: 0.08` | `config.js:616–641` |
| `ember_tick` | 4 | `swarm` | `budgetCost: 1` | `config.js:642–666` |

變種（各 1）：`screamer_white_noise` / `tether_rusthook` / `husk_backglint` / `tick_cindercloud`（`config.js:772–811`）。

池接點：`enemyPoolForWave`（`rules.js:782–787`）依 `firstWave` 放行；`generateWave` 吃 fractional `poolWeight`（`rules.js:1434–1440`）。

**抽樣（seeded wave 8 × 40 局，非 Boss spawn）**

| 敵 | 約佔比 |
|---|---:|
| `ember_tick` | ~9.7% |
| `ash_screamer` | ~6.1% |
| `mirror_husk` | ~3.5% |
| `chain_tether` | ~3.3% |

稀有度與權重方向正確；`mirror_husk` 明顯低於 runner/shambler。

### 1.2 彈種 fracture / ember + 循環 — **PASS**

- `WEAPON_POWERUPS.modes.fracture` / `ember`：`config.js:847–865`
- `cycleModes: ["spread","fracture","laser","ember","homing"]`：`config.js:867`
- 掉落：`game.js:924–932` 從 `cycleModes` 均勻抽
- 射擊屬性：`rules.calculateShotStats` 帶出 shard／burn 欄位（`rules.js:1823–1830`）
- 執行：`spawnFractureShards`（`game.js:1999–2037`）、`applyBurnToEnemy` / `updateEnemyBurn`（`game.js:1955–1997`）

### 1.3 `gate_focus` — **PASS**

- 定義：`config.js:1448–1456` — `effect: { type:"focus", duration:10, spreadMul:0.52 }`，**無 damage 欄**
- 池：Boss 前一波（`(wave+1) % bossEvery === 0`）才進池，一般波過濾掉（`rules.js:809–812`）
- 套用：只寫 `focusUntil` / `focusSpreadMul`（`rules.js:1875–1879`）
- 射擊：`focusActive` 只乘 `spread`（`rules.js:1796–1800`），`damage` 公式不含 focus

本地驗算：`focus` 開／關時 `damage` 相同，`spread` 約 ×0.52。

### 1.4 環境事件具名 + 第二互斥事件 — **部分 PASS**

| 主事件 | 具名 label | 第二事件（alternate） | 互斥 |
|---|---|---|---|
| `sandstorm` → 灰喉走廊 | 有 systemLine／barks／completeLine | `land_blackout` | 單一 roll 加權 |
| `turbulence` → 斷錨航道 | 有 | `air_static` | 同上 |
| `undertow` → 沉錨帶 | 有 | `sea_fogbank` | 同上 |
| `meteor_shower` → 星渣雨 | 有 | `space_echo` | 同上 |

選取：`rules.chooseEnvironmentEvent`（`rules.js:866–894`）— candidates = 主＋alternates，權重用各自 `chance`，`roll >= total` → 無事件。抽樣約 30% 主／14% 副／56% 無，互斥成立。

**缺口**

| 項目 | 嚴重度 | 說明 |
|---|---|---|
| `visibilityLoss` | **P1** | 僅寫在 `config.js:940,957`，全 `src/` **無讀取**；沙塵／燈火管制的「視野更差」未落地 |
| 交替事件畫面 | **P2** | `drawEnvironmentEventOverlay`（`game.js:3853–3891`）只畫 `sandstorm`／`turbulence`／`undertow`；`land_blackout`／`air_static`／`sea_fogbank`／`space_echo`／`meteor_shower` 無專屬 overlay |
| `air_static` 設計原文 | **P2** | 計畫曾提「射速門效果 + 一小段」；實作只有 `enemyProjectileSpeedMul: 0.88`（可接受為簡化，但與計畫不完全一致） |

### 1.5 `RUN_BARKS` — **部分 PASS（見 §7）**

表存在：`config.js:870–922`（7 個 id）。觸發掛點見 §7。

### 1.6 計畫內但未進 R61 的 P0 薄鉤 — **未落地（範圍註記）**

`b05b`／`b07b`／`b11b`、成就 `first_ash_screamer`／`boss_radio_calm`／`bark_complete` 僅見於 `CONTENT_PLAN`，`src/` 無對應。  
本輪任務主軸是敵／彈／門／事件／barks；**不列為 R61 回歸失敗**，但若對外宣稱「P0 全做完」則不成立。

---

## 2. 平衡護欄逐條

### 2.1 `ash_screamer` 彈傷 ≤ 8 — **PASS**

- 資料：`projectileDamage: 7`（`config.js:583`）
- 結算：`resolveEnemyRangedAttack` 直接用 behavior 傷害（`rules.js:738`）
- 守門：`test-config.js:148`、`test-rules.js:168`、e2e scream 斷言

**最小重現**

1. `spawnEnemy("ash_screamer", { attackCooldown:0, y: vehicle.y - 104, speed:0 })`
2. `step` 至出現 `enemyProjectiles`
3. 期望：`kind === "scream"` 且 `damage <= 8`（實測 7）

與 spitter（傷 10、CD 2.35s）相比：screamer CD 1.9s、傷較低，屬「較密較軟」彈幕，未破 cap。

### 2.2 `mirror_husk` poolWeight ≤ 0.28 — **PASS**

- `poolWeight: 0.24`（`config.js:630`）
- wave 8 直方圖約 3.5% 出場，符合「強正面、低權重」

### 2.3 `ember_tick` budgetCost 1 — **PASS**

- `budgetCost: 1`（`config.js:650`）
- 注意：wave 生成實際以 **targetCount + 加權抽取** 為主，budget 欄位較像成本標籤；cheap swarm 可堆密度，但與 `swarm_mite` 同階，非護欄違規。

### 2.4 fracture／ember 不超主力 DPS — **PASS（對 standard）；對 laser 貼邊**

`land_rig`、weaponLevel 1、無門加成（本地 `calculateShotStats`）：

| 模式 | 主彈傷害 | 全命中近似 | / standard |
|---|---:|---:|---:|
| standard | 20.00 | 20.00 | 1.00 |
| fracture | 13.60 | 13.60×(1+2×0.16)=**17.95** | **0.90** |
| ember | 15.60 | 15.60×(1+3×0.055)=**18.17** | **0.91** |
| laser | 18.00 | 18.00（+ pierce 多目標） | 0.90 主彈 |

- fracture 全命中上限守在 standard 附近（測試鎖 `≤ base * 1.08`，`test-rules.js:784`）— **PASS**
- ember 主彈 `0.78 < laser 0.90` — **PASS**
- ember **含滿 DoT** 約 **laser 主彈 ×1.01**：計畫原文「總 DPS 略低於 laser」**貼邊／微超**（**P2**）；但 laser 有 `pierceAdd:3`，清線總吞吐仍優。對「不超主力（standard）DPS」護欄 — **PASS**

### 2.5 `gate_focus` 不加傷 — **PASS**

只縮散射；HUD 標「校準門」（`game.js:717`）；門牌顯示「10 秒」（`game.js:2720–2721`）。

---

## 3. 新內容引入的 bug 與機制交互

### 3.1 新敵行為 × 決定性波次種子 — **PASS**

| 層 | 行為 | 判定 |
|---|---|---|
| 波表 | `generateWave` 全吃注入 `rng`（`rules.js:1408`） | 同 seed → 同 enemyId／座標／事件／門 |
| 變種 | `applyEnemyVariantToSpawn` 續用同一 rng | 決定性 |
| 事件 | `chooseEnvironmentEvent` 續用同一 rng | 決定性 |
| runtime AI | swarm zigzag／brute slow／ranged 射擊皆用 `state.time` + spawn 參數，**無 `Math.random`** | 同操作序列可重播 |
| 例外（既有） | `spawnEnemy` 對 ranged 初始 `attackCooldown` 用 `state.rng()`（`game.js:1230–1233`） | 與舊 spitter 相同；非 R61 新洞 |

**最小重現（組成）**

```js
const a = rules.generateWave({ wave: 8, vehicleId: "land_rig", rng: rules.createSeededRng("det-a"), config });
const b = rules.generateWave({ wave: 8, vehicleId: "land_rig", rng: rules.createSeededRng("det-a"), config });
// a.spawns 的 enemyId 序列 === b.spawns
```

### 3.2 `mirror_husk` 正面免傷 × R60 前向半平面 — **主路徑 PASS；DoT/AOE 語意 P1**

R60 語意（`rules.js:38–58` + Codex R2）：

- 有座標時：`enemy → shieldFacing(vehicle)` 為正面，`-projectile.v` 為來襲方向，`dot >= shieldFrontArcCos`（預設 0 → 半平面）吃盾
- `sourceKind === "aoe"` **一律** `frontHit = true`（`rules.js:40`）
- runtime 傳 `shieldFacing: state.vehicle`（`game.js:2298`、`1489`）

`mirror_husk`：`frontDamageMul: 0.08`、`shieldHp: 46`（比 `shield_husk` 的 0.32／28 硬很多）。  
rules 單測：正面 applied ≤ 2／背面全額（`test-rules.js:213–228`）— **PASS**。

| 情境 | 期望 | 實際 |
|---|---|---|
| 正上方 husk，玩家上射 | 吃盾，HP 幾乎不動 | PASS |
| 上射後反向下射（非面向弧） | 不吃盾，弱側全額 | PASS（既有 reverse 測） |
| 拖車下方 husk，companion 下射 | 仍吃盾（R60 修的洞） | 同 shield 路徑，mirror 繼承 |
| **ember DoT／deathBurst 等 `projectile=null`** | 語意上應否吃「正面」？ | 強制 `sourceKind:"aoe"` → **永遠吃盾**（見 3.4） |

### 3.3 fracture 裂副彈 × `hitIds` — **PASS（重複傷害／認屍）**

**實作（`game.js:1999–2037`, `2275–2281`, `2356`）**

1. 主彈命中後 `spawnFractureShards`
2. 副彈 `fractureShard: true`，不再遞迴裂片
3. 副彈 `pierce: 0`，新建 `hitIds`，**預先標記母體** `hitIds[String(target.id)] = true`
4. 主彈命中迴圈：已在 `hitIds` 則 `continue`（不結算、不扣 pierce）
5. 無 projectile 物件池；id 由 `nextId` 單調遞增，局內不重用 → **無認屍**

| 風險假設 | 結論 |
|---|---|
| 副彈回打母體雙重傷害 | **不成立**（預標記 hitIds） |
| 同幀 forEach push 副彈被立刻處理 | **不成立**（`forEach` 不訪問迭代中新 append 的元素；副彈下幀才飛） |
| 兩發副彈打同一第三隻 | **會各打一次**（各有 hitIds；設計上可接受的清雜爽感） |
| 主彈 `pierce>0`（overload）每穿透再噴 2 片 | **成立**（`game.js:2356` 每命中都噴）；屬組合強度 **P2**，非 hitIds bug |

**最小重現（副彈不打母體）**

1. 固定 `shambler` id=`fracture_target`，注入 fracture 主彈（帶 shard 欄位）重疊命中
2. `step` 一幀 → 應見 2 個 `fractureShard`
3. 再 `step` 讓副彈飛離／貼母體：母體只應再吃主彈那一次；`hitIds[母體]` 在副彈上為 true

### 3.4 ember DoT × 護盾／減傷次序 — **直擊 PASS；DoT P1**

**直擊次序（正確）**

1. 主彈：`resolveEnemyIncomingDamage`（先盾漏傷／相位）→ `enemy.hp`／`shieldHp`
2. `applyBurnToEnemy(enemy, projectile, appliedDamage)`（`game.js:2308`）  
   - `tickDamage = max(0.35, appliedDamage * burnDamageMul)`  
   - 即 **DoT 基值吃「已減傷後」的 appliedDamage**（正面 mirror 幾乎點燃不動）
3. companion 彈：`source === "companion"` 直接不掛燒（`game.js:1956`）

**DoT tick 次序（問題）**

```text
updateEnemyBurn
  → applyEnemyIncomingDamage(enemy, burn.damage, null, { sourceKey: "burn" })
  → projectile 預設 { vy:-1, sourceKind:"aoe" }   // game.js:1488
  → shieldFrontHit：aoe → 永遠 frontHit           // rules.js:40
  → 有盾則再乘 frontDamageMul，並扣 shieldHp
```

| 情境 | 結果 | 嚴重度 |
|---|---|---|
| 正面命中 mirror + ember | 直擊已極低；DoT 再吃正面 | 可接受（強盾） |
| **弱側／背面命中**（直擊全額、盾未破） | DoT 仍當 AOE 正面：主要在 **削盾**，HP 幾乎不燒 | **P1 語意破洞** |
| phase 中 void 被燒 | tick 再乘 `phaseDamageMul` | P2（雙重相位，視設計） |

**最小重現（弱側 ember DoT 被盾吃）**

1. `spawnEnemy("mirror_husk", { x:100, y:150, shieldHp:46, speed:0 })`
2. 注入 ember 彈：`vx:0, vy:220`（反向，確認直擊不吃盾、HP −主傷）
3. `step` 超過 `burnInterval` ×3
4. **期望（若 DoT 延續命中側）**：持續削 HP  
   **實際**：`shieldHp` 下降、HP 幾乎不動（每 tick applied ≈ tickDamage × 0.08）

對照 rules 單元：

```js
resolveEnemyIncomingDamage({
  enemy: { enemyId:"mirror_husk", x:100, y:150, hp:58, shieldHp:46, behavior: config.ENEMIES.mirror_husk.behavior },
  damage: 1.0,
  projectile: { vy:-1, sourceKind:"aoe" },
  shieldFacing: { x:100, y: config.LOGIC.vehicleY },
  config
});
// appliedDamage ≈ 0.08，shieldHp 45
```

### 3.5 其他行為備註（非必炸）

| 項目 | 說明 | 級別 |
|---|---|---|
| `chain_tether` 緩速 | 進半徑每幀刷新 `slowUntil = time+0.22`，`slowMul` 取更狠者（`Math.min`）；與 tar（0.68）同場時 tar 覆蓋 tether | PASS |
| 雙 ranged 彈幕 | screamer+spitter 可同屏；傷 cap 仍守 | PASS／體驗 P2 |
| `runMods.burn` 切離 ember | `collectWeaponPowerup` 重設 burn 欄（`game.js:2147`） | PASS |

---

## 4. `RUN_BARKS` 觸發時序與 reduced 設定

### 4.1 節點對照

| barkId | 掛點 | 行號 | 真局？ |
|---|---|---|---|
| `sortie_start` | `update`：`time >= 3` | `game.js:2540` | 是 |
| `first_supply` | 選補給獎勵後 | `game.js:994` | 是 |
| `first_gate` | `chooseGate` | `game.js:1381` | 是 |
| `boss_radio` | `spawnEnemy` 若 boss | `game.js:1257` | 是 |
| `boss_down` | `killEnemy` 若 boss | `game.js:1570` | 是 |
| `critical_hull` | 受傷後 HP≤25% | `game.js:1465–1466` | 是 |
| `deep_route` | **僅** `pushWave(10\|15)` | `game.js:1709` | **否（真局走 completeWaveIfReady）** |

`completeWaveIfReady`（`game.js:2398–2420`）遞增 wave、換 plan、播「第 N 波」訊息，**沒有** `pushRunBark("deep_route")`。

→ **P0 內容洞**：玩家正常打到第 10／15 波 **聽不到** deep_route；e2e 用 `__test.pushWave(10)` 綠燈（`test-e2e.js:2156`），屬 **假陽性覆蓋**。

**最小重現**

1. 真局或模擬：`completeWaveIfReady` 路徑把 `wave` 從 9→10（勿呼叫 `pushWave`）
2. 檢查 `state.runBarksSeen.deep_route`
3. **期望（計畫）**：true  
   **實際**：undefined

### 4.2 每局一次與非阻擋

- `state.runBarksSeen[barkId]` 擋重複（`game.js:510–514`）
- 不 `pause`；與 `pushEventBanner` 共用 UI（`game.js:520`）
- TTL 1.7–1.9s，符合計畫 1.2–2.0s

### 4.3 reduced／關閉設定

```text
runBarksEnabled (game.js:501–506)
  RUN_BARKS 存在
  && showCompanion !== false
  && reducedFlash !== true
```

| 設定 | 結果 | 評 |
|---|---|---|
| `showCompanion: false` | 關 bark | PASS（計畫允許併關） |
| `reducedFlash: true` | **也關全部 bark** | **P2**：減閃是光敏／特效，順帶掐敘事字幕偏重；計畫寫的是「可設定縮短／關閉」哲學，未強制綁 reducedFlash |

---

## 5. 體驗層

### 5.1 事件文案會不會蓋掉重要警告 — **會（P1）**

`state.eventBanner` **單槽後寫覆蓋**（`game.js:483–492`）。

| 衝突 | 行為 |
|---|---|
| 環境事件 banner（ttl 2.6，`game.js:864`）vs 其後 gate／補給／bark | 後者蓋前者 |
| **Boss 來襲**（`1255`）緊接 **boss_radio bark**（`1257`） | 系統「Boss 來襲」**幾乎永遠被 bark 蓋掉**（bark 開著時） |
| 事件 body 拼接 | `systemLine + 角色句 + 目標`（`game.js:532–538`）→ 長字串擠在單行 HUD |

緩和因素：Canvas `drawWaveBanner` 仍有波次／Boss 大字（`game.js:3822+`）；`messages` 仍推「母巢巨屍 逼近」。  
但 **eventBanner 槽位的系統 Boss 警告對開 bark 的玩家無效**。

**最小重現**

1. 預設設定 `startRun`，`spawnEnemy("boss_hive_titan")`
2. 讀 `state.eventBanner`
3. **實際**：`kind:"story"`，title 為「熹」／壁爐句，而非「Boss 來襲」

### 5.2 Barks 頻率是否干擾 — **大多克制（PASS）；節點撞車 P2**

- 每 id 每局最多 1 次 → 全開最多 7 次（深線還缺 1）
- 開場 3s、首補給、首門、Boss 雙節、危血、（設計上）10／15 波 — 節奏不密
- **干擾點**：Boss 進場 bark 與系統警告同秒；危血 bark 與受傷紅閃／震屏疊加；事件 banner 2.6s 內若撿彈種會被「彈種切換」蓋掉收束句

事件「輪播」：`eventBarkLine` 用 `(wave + environmentEvents.length) % barks.length`（`game.js:526–527`），是 **決定性選句**，不是時間軸輪播多句；同波只推一次長 banner。

---

## 6. 測試與守門現況（證據，非背書）

| 覆蓋 | 狀態 |
|---|---|
| config 護欄（傷／權重／budget／gate／cycle） | `test-config.js` 有 |
| pool 直方圖、mirror 正背面、gate_focus 池、事件互斥 | `test-rules.js` 有 |
| fracture 噴片、ember burn、R61 roster、bark e2e | `test-e2e.js` 有 |
| **deep_route 真局路徑** | **無**（只測 `pushWave`） |
| ember × mirror 弱側 DoT | **無** |
| visibilityLoss 生效 | **無**（也無法綠，因未實作） |

---

## 7. 優先修復建議（只建議，本輪不改碼）

| 優先 | 項目 | 建議最小修法 |
|---:|---|---|
| P0 | `deep_route` 真局不觸發 | 在 `completeWaveIfReady` 波次遞增後與 `pushWave` 共用同一 helper：`if (wave===10\|\|wave===15) pushRunBark("deep_route")`；e2e 改測自然進波或 mirror 兩入口 |
| P1 | ember DoT 永遠 AOE 正面 | burn tick 應帶「來源方位」或 `sourceKind:"dot"` 且 `frontHit=false`／繼承上一次直擊側；至少不要 `null→aoe` |
| P1 | Boss 來襲被 bark 覆蓋 | bark 勿無條件覆寫：延後 bark、雙槽、或 boss 系統 banner 優先更高 ttl／kind 合併 |
| P1 | `visibilityLoss` 死欄位 | 接 overlay 暗角／road 霧，或刪文案避免詐欺 |
| P2 | reducedFlash 關 bark | 敘事改綁獨立設定或只跟 `showCompanion` |
| P2 | 交替事件無畫面 | overlay 依 `event.id` 補分支或共用 dim |
| P2 | overload+fracture 穿透噴片 | 若過強：副彈僅主彈首次命中噴，或 pierce 時不噴 |

---

## 8. 結語

R61 把內容計畫 P0 的 **敵／彈／門／事件文案／字幕表** 主幹接進了 config + rules + game，數值護欄（screamer≤8、husk 權重、tick cost、gate 不加傷、fracture 近 standard）**守得住**；R60 盾半平面對 `mirror_husk` 主彈道 **相容**；fracture 與 `hitIds` **無認屍、無母體雙重結算**。

對抗式最值得下一版修的三點：

1. **`deep_route` 掛在測試 API 而非真局進波**（內容宣稱與體驗脫節）  
2. **ember DoT 走 AOE 一律吃盾**，破壞弱側點燃語意，並與 R60 半平面「非面向側全額」不一致  
3. **單槽 eventBanner**：Boss 系統警告被 bark 蓋掉；長事件文案與戰鬥警告搶同一 HUD  

其餘為視野欄位未接線、交替事件畫面、設定綁定過重等 P2。  

**本報告只審不改。**
