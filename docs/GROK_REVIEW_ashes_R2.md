# 《灰燼護航》R58 修正對抗性覆核（Grok R2）

| 項目 | 內容 |
|------|------|
| 對象 | R58／R59 已落地之 R1 修正：`hitIds` 穿透表、`pickWeighted` 分數權重、`resolveEnemyIncomingDamage` 統一受傷路徑、拓寬道路、拖車機槍手、命中輝光 |
| 版本現況 | 程式標為 **R59**（`src/version.js`）；本報告覆核的是「R1 點名並據稱已修」的行為 |
| 姿態 | **對抗式**：只審不改；逐條給成立／不成立、殘留、最小重現 |
| 產出日 | 2026-07-09 |
| 約束 | 僅本檔；**不修改**遊戲程式碼／測試／其他文件 |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **PASS** | 修正成立，現況可接受（可附測試證據） |
| **P0** | 正確性仍明顯失真；建議下一版優先 |
| **P1** | 邊界 bug／可觀測機制破洞／實質效能風險 |
| **P2** | 維護債、理論組合、體感或文件缺口 |

### 總表（五條任務）

| # | 議題 | 結論 |
|---|------|------|
| 1 | `hitIds` 同幀／跨幀重複傷害 + pool 回收認屍 | **PASS（主路徑）**；無 projectile 物件池故無認屍；殘留見 1.3–1.4 |
| 2 | `pickWeighted` 全 0 權重／除以 0 | **PASS** |
| 3 | 傷害源是否皆走 `resolveEnemyIncomingDamage` | **PASS（敵體傷害主路徑）**；殘留：主彈道未共用 helper、盾「非正面」語意 |
| 4 | 拖車機槍手／拓寬道路邊界與效能 | **大致 PASS**；機槍手放大既有 rear-hit 盾洞（P1） |
| 5 | 新引入／放大之 bug | 見 §5；無「修正本身直接寫壞」的 P0 |

---

## 1. `hitIds` 穿透表（`src/game.js` 命中迴圈）

### 1.1 同幀與跨幀對同一敵人 — **PASS**

**實作位置**

- 發射初始化：`game.js:1697`、companion `game.js:2357` → `hitIds: {}`
- 命中迴圈：`game.js:2107–2197`

**關鍵邏輯（摘）**

```text
game.js:2110–2116  校正 hitIds 形狀 → hitKey = String(enemy.id)
game.js:2114       若已命中 → continue（不結算、不扣 pierce）
game.js:2115–2116  距離命中後才 hitIds[hitKey] = true
game.js:2191–2196  僅「新目標命中」才 pierce--；pierce 用盡才 life = -1
```

**行為判定**

| 情境 | 結果 | 理由 |
|------|------|------|
| 同幀、同一敵人重疊 | 只結算 1 次 | 標記後同迴圈後續 `continue`；且命中後若仍有 pierce 是掃**其他**敵人 |
| 跨幀、同一敵人持續重疊 | 只結算 1 次 | `hitIds` 掛在**該彈物件**上，彈未銷毀前保留 |
| 跨多個**不同**敵人 | 各結算 1 次，pierce 逐新目標遞減 | 設計保留「穿透吞吐」 |
| pierce 已用在 A，之後再碰 A | 不扣血、不扣 pierce | `hitIds` 先於距離結算檢查 |

**測試證據（e2e）**

- `scripts/test-e2e.js:1086–1136`：`pierce=2`、`vy=0` 重疊 5 個 `step(50)` → `hp 100→90`、`damageDealt===10`、`pierce===1`。  
  這同時鎖住「不重複扣血」與「已命中目標不重複扣 pierce」。

**最小重現（手動／`__test`）**

1. `startRun("void_runner")`，清場後 `spawnEnemy` 固定位置、`speed:0`、`hp:100`。  
2. 注入 `projectiles:[{ pierce:2, hitIds:{}, damage:10, x/y=敵心, vx:0, vy:0, radius:12, life:1, ...}]`。  
3. `step` 多幀。  
4. **期望**：只掉 10 HP；彈上 `hitIds[敵id]===true`；`pierce===1`。

### 1.2 pool 回收後 `hitIds` 是否清空（認屍）— **PASS（不適用／安全）**

對抗假設：「子彈物件池回收未清 `hitIds` → 新彈誤認舊 id 已命中／或反向漏擋」。

**實際架構**

- 玩家／companion 彈：`state.projectiles.push({ ... hitIds: {} })`（`game.js:1686–1708`、`2344–2364`）。
- 銷毀：`filter` 掉 `life<=0` 或出界（`game.js:2201–2203`），**無 free-list／acquire**。
- 全 repo 物件池僅見 `fx.js` 粒子池；**與 projectile 無關**。
- 敵人 id：`nextId("enemy")` → `` `${prefix}_${++nextEntityId}` ``（`game.js:283–286`）；`startRun` 才把 `nextEntityId` 歸 0（`game.js:988`），同時 `projectiles: []` 清空。

**結論**

- **沒有** projectile pool 認屍路徑。  
- 局內 id 單調遞增，單彈 lifetime（約 1.2–1.45s）內不會與「死後重生同 id」碰撞。  
- 防禦性重綁（`game.js:2110–2111`）可處理缺欄／陣列形狀的測試注入，正常發射路徑每次新 `{}`。

### 1.3 殘留：`enemy.id` 缺漏時 hit-set 失效 — **P2（非生產主路徑）**

```text
game.js:2113–2116
hitKey = enemy.id == null ? "" : String(enemy.id)
if (hitKey && projectile.hitIds[hitKey]) continue;  // 空字串不擋
if (hitKey) projectile.hitIds[hitKey] = true;       // 空字串不記
```

- `spawnEnemy` 必有 id（`game.js:1141`）。  
- 僅 `__test.setState` 注入無 `id` 敵人時，穿透可每幀重打。  
- **建議**（不實作）：缺 id 時用陣列索引 fallback 或直接 skip。

### 1.4 殘留：穿透 + 濺射疊加時，次要目標可被多次 splash — **P2（目前武器幾乎互斥）**

```text
game.js:2189–2190  每次主命中都 damageSplash(projectile, enemy)
game.js:1876–1886  splash 無 hitIds；僅排除 primary target.id
```

- 若同一彈 `pierce>0 && splash>0`，主目標 A→B 各觸發一次 splash，旁支 C 可吃兩次衰減濺射。  
- 現況：`void_lance` pierce／`ark_cannon` splash 分家；升級軌道也大致分離 → **實戰機率低**。  
- 未來若做「貫穿榴彈」會變成真實倍傷。

### 1.5 熱路徑小債 — **P2**

- 每個敵人迭代都做 `hitIds` 形狀檢查（`game.js:2110–2111`）；應提到 per-projectile 外層。非正確性問題。

---

## 2. `pickWeighted` 與 `Math.max(0, …)`（`src/rules.js`）

### 2.1 分數權重是否恢復 — **PASS**

```text
rules.js:753–769
weights = map → Number.isFinite ? Math.max(0, weight) : 0
total = sum(weights)
if (total <= 0) → 均勻 index，不除 total
else roll = rng() * total; 遞減直到 roll <= 0
```

- 對比 R1 的 `Math.max(1, …)`：**已修正**。  
- `generateWave` 帶入 `poolWeight`（`rules.js:1374–1378`）；config 有 `0.52 / 0.46 / 0.8 / 0.32 / 0.34` 等。  
- 直方圖守門：`scripts/test-rules.js:86–102`（12000 samples，相對誤差 `<0.025`；`tar_brute` 頻率遠低於 `runner`）。

**本機抽樣覆核（覆核當下 node 腳本）**

- `weight 0.32 vs 1.15`：實測約 `0.221 / 0.779`（期望 `0.218 / 0.782`）→ 正常。

### 2.2 全 0 權重／除以 0 — **PASS**

| 輸入 | 行為 | 是否安全 |
|------|------|----------|
| `pool=[]` | `return null`（`753–754`） | 安全 |
| 全 `weight:0` | `total<=0` → `floor(rng()*n)` 均勻挑 | **不除以 0** |
| 負權重 | 夾成 0；若全負同均勻 | 安全 |
| `NaN` / `Infinity` | `Number.isFinite` 失敗 → 權重 0 | 安全 |
| 混 0 與正權重 | 0 權重項實質抽不到 | 正確 |

**全 0 抽樣**：3000 次約均勻三分 → 回退成立。

**index 邊界**：`Math.min(pool.length-1, floor(rng()*length))`；seeded rng 輸出 `[0,1)`，即使理論上 `rng()===1` 也被 `min` 夾住。

### 2.3 殘留：空 pool 呼叫端未防呆 — **P2**

```text
rules.js:1415–1417
selected = pickWeighted(pool, rng);
const enemy = cfg.ENEMIES[selected.enemyId];  // selected 為 null 則丟
```

- 正常 `enemyPoolForWave` 在 stage1 至少有 shambler／runner。  
- 僅當 config 被掏空時爆；屬資料完整性，非本修引入。

### 2.4 殘留：無「全 0 權重」單元測試 — **P2**

- 現有測試鎖 fractional 分佈，**未**顯式斷言 `total<=0` 分支。建議加 1 條防回歸。

---

## 3. `resolveEnemyIncomingDamage` 覆蓋率

### 3.1 敵體傷害主路徑 — **PASS（R1.3 成立）**

| 傷害源 | 位置 | 是否經 `resolveEnemyIncomingDamage` |
|--------|------|-------------------------------------|
| 主彈道直擊 | `game.js:2128–2137` 直接呼叫 | 是 |
| 濺射 `damageSplash` | `game.js:1883` → `applyEnemyIncomingDamage` | 是 |
| `deathBurst` | `game.js:1554` → `applyEnemyIncomingDamage` | 是 |
| 海載具 broadside echo | `game.js:1468` → `applyEnemyIncomingDamage` | 是 |
| Hazard 建築物 | `game.js:2081` `hazard.hp -=` | **否**（非敵人，無盾／相位） |

`applyEnemyIncomingDamage`（`game.js:1418–1439`）：

- 一律呼叫 `rules.resolveEnemyIncomingDamage`。  
- `projectile` 缺省 → `{ vy: -1, sourceKind: "aoe" }`（`1424`），使 AoE **固定走 front 分支**（有盾就吸盾 + `frontDamageMul` 漏傷）。  
- `deathBurst`：`trackStats: false`（`1554`）→ 不灌進玩家 `damageDealt`（與 Codex 回應一致）。

**e2e 證據**

- Splash vs shield：`test-e2e.js:1138–1183` → 盾耗盡、HP 落在漏傷區間。  
- deathBurst vs shield：`1185–1230` → `shieldHp:6`、HP 約 92–94（22 傷 × 漏傷係數）。

**rules 單測**

- `test-rules.js:133–148`：盾前傷、相位減傷。

### 3.2 殘留：主彈道未走 `applyEnemyIncomingDamage` helper — **P2（維護債）**

- 直擊自行套 `incoming.hp/shieldHp` 並加 stats（`2135–2141`）。  
- 功能與 helper 等價，但未來若只改 helper（例如統一破甲／元素）會**分叉**。  
- 非當前繞過盾。

### 3.3 殘留：`frontHit = projectile.vy < 0`（R1.4 未修）— **P1（機制，且被機槍手放大）**

```text
rules.js:722–729
frontHit = finiteNumber(projectile.vy, -1) < 0
if (shield && shieldHp > 0 && frontHit) { 吸盾 + 漏傷 }
// frontHit 為 false 時：整段盾邏輯跳過 → 全額扣 HP，盾量不動
```

**本機數值覆核（damage=20, shieldHp=28, hp=100）**

| 彈道 | shieldHp | appliedDamage | hp |
|------|----------|---------------|-----|
| `vy: -100`（前） | 8 | 6.4 | 93.6 |
| `vy: +100`（「非前」） | **28（未扣）** | **20** | **80** |

- 玩家主武器多為上射，`vy<0` 幾乎恆真（R1 已述）。  
- **拖車機槍手**可瞄任何方向（`game.js:2341–2351`）；敵人越過拖車後 `y > muzzleY` 時 `vy>0` → **等同無視盾殼**。  
- AoE 缺省 `vy:-1` 反而不會穿盾——與「側背弱點」語意相反且不一致。

**最小重現（機槍手 × 盾）**

1. 生成 `shield_husk` 於機槍 y 下方（例如 gunner ~386，敵 y=400）、同 x。  
2. 讓 companion 開火（或注入 companion 彈 `vy>0, damage:20`）。  
3. **觀察**：HP -20、`shieldHp` 仍 28。  
4. 對照：同傷 `vy:-1` 則盾下降且 HP 只掉漏傷。

### 3.4 `sourceKind: "aoe"` 未被 rules 讀取 — **P2**

- 僅 `vy` 生效；`sourceKind` 為死欄位／未來擴充點。不影響現況正確性。

---

## 4. 拖車機槍手與拓寬道路

### 4.1 道路寬度 — **PASS（邊界一致）**

```text
config.js:17–18
roadLeft: 27, roadRight: 168  → 寬 141（邏輯座標；全寬 195）
```

| 用途 | 位置 | 是否跟 road |
|------|------|-------------|
| 敵生成 x | `spawnEnemy` `1146`；`generateWave` `1422–1425` clamp | 是 |
| 敵移動 clamp | `game.js:1798` `roadLeft+5 … roadRight-5` | 是 |
| 載具 follow／x | `game.js:2266–2268` `road ± half` | 是 |
| 門左右 | `1265–1266` | 是 |
| 背景裁切／車道繪製 | `2681+` | 是 |

- 叢集橫向 `spread` 仍 `min(22, …)`（`rules.js:1408`）→ 拓寬**不**讓編隊無界變寬，只多路邊裕度。  
- 鍵盤 `followX` 偶用 `26 … W-26`（`2513–2515`）略寬於道路半車體 clamp，下一幀仍被道路夾回 → **無出界殘留**。  
- Boss 召喚 `x±38`（`1758`）可能短暫超道路，非 Boss 隨後 clamp → 可接受。

**效能**：道路變寬不改 O 複雜度；繪製仍單次 clip rect。

### 4.2 拖車機槍手 — **功能 PASS；邊界 P1（連動 3.3）**

| 項目 | 位置 | 評估 |
|------|------|------|
| 預設開 | `config.TRAILER_GUNNER.enabledDefault` | 可用設定 `showCompanion===false` 關（`2302–2306`） |
| 姿勢 | `resolveGunnerPose` → trailer follow lerp | 有 simplified 降負載 |
| 選敵 | `selectGunnerTarget` O(n)，距離球 `targetRange:320` | n≤maxEnemies，且僅 CD 就緒時完整選敵 |
| 射擊 | `fireInterval:0.9`、`damage:6`、`pierce:0`、`hitIds:{}` | 低射速；走同一 `updateProjectiles` |
| 彈容 | `projectiles.length >= maxProjectiles` 則本幀不射 | 靜默丟射，無佇列（可接受） |
| 被動破甲 | `source==="companion"` 排除 armor_break（`2122`） | 刻意 |
| 繪製 | raster + fallback | 有 debug 旗標 |

**效能**：每幀 `updateCompanionPose`（輕量 lerp）+ CD 遞減；完整選敵／push 彈約 1 Hz 級。對主迴圈壓力遠小於 `projectiles×enemies` 碰撞。

**邊界問題（P1）**：見 3.3 — 下射／後方目標讓盾殼失效。

**次要 P2**

- `targetRange:320` 在高 422 的場上接近全域，機槍手常有目標 → 額外 DPS 約 `6/0.9≈6.7`，屬平衡而非 bug。  
- 不對 hazard 特化（走一般彈 vs hazard 迴圈）— 一致。

### 4.3 命中特效輝光 — **PASS（視覺／成本）**

- 命中仍 `fx.spawnHitSpark` + `effect_hit`（`2171–2187`）。  
- spark 在非 low／非 reducedFlash 時用 `createRadialGradient` + `lighter`（`game.js:3329–3372`）→ **即「輝光」路徑**。  
- 高射速 + 穿透清雜兵時 spark 次數上升；有 quality／reducedFlash 實心圓退路。屬已知 FX 成本，非 R58 正確性回歸。

---

## 5. 新引入／被放大的問題

### 5.1 修正本身是否引入 P0 回歸？

| 修正 | 是否引入新 P0 |
|------|----------------|
| `hitIds` | **否**；e2e 鎖單目標；無 pool 認屍 |
| `pickWeighted` max(0) | **否**；全 0 安全；分數權重恢復 |
| AoE 走 resolve | **否**；盾／相位一致化成功 |
| 道路／機槍／輝光 | **無正確性 P0**；機槍放大舊盾語意洞 |

### 5.2 仍建議追蹤

| ID | 級別 | 摘要 |
|----|------|------|
| R2-1 | **P1** | 盾 `frontHit` 僅看 `vy<0`；非前向彈（含機槍後射）**全額扣 HP 且不耗盾**（`rules.js:722–729`） |
| R2-2 | P2 | 主彈道與 `applyEnemyIncomingDamage` 雙路徑，長期易分叉（`2128` vs `1418`） |
| R2-3 | P2 | 穿透+濺射同彈時 splash 無 per-target 去重（`1876–1886`+`2190`） |
| R2-4 | P2 | 缺 id 敵人使 hitIds 失效（測試／畸形狀態） |
| R2-5 | P2 | `pickWeighted` 全 0 回退無單測；空 pool 呼叫端 NPE |
| R2-6 | P2 | 機槍 `targetRange` 近全域 → 隱性常駐 DPS（平衡） |
| R2-7 | — | R1 未修項仍在：loop vs `step` 時步、Boss summon cap、migrate 祖父條款、每幀 `emitState` deepClone 等（本輪不重開細節） |

### 5.3 與 Codex「已修清單」對照

| Codex 宣稱 | R2 判定 |
|------------|---------|
| 1.1 穿透 hit-set | **成立** |
| 1.2 fractional poolWeight | **成立** |
| 1.3 splash／deathBurst（+echo）統一結算 | **成立** |
| 1.4 盾正面語意 | **仍未修**；機槍使其更可觸發 |
| 車損 fields helper 等 | 非本任務焦點；未深入重審 |

---

## 6. 建議驗收清單（給總稽核／CI，不實作）

1. **穿透**：維持 `test-e2e` pierce 重疊 5 幀；可加「兩敵同幀各傷一次、pierce 連降」案例。  
2. **權重**：維持 histogram；加 `all weights 0 → 不 throw、均勻`。  
3. **AoE 盾**：維持 splash／burst e2e。  
4. **機槍×盾（新）**：`vy>0` companion 彈對 `shield_husk` 斷言「不應無視盾」——**在產品定義 frontHit 之前，此測試會紅**，應用來驅動 1.4 設計決策。  
5. **道路**：生成 x 與 clamp 抽樣落在 `[roadLeft+ε, roadRight-ε]`。

---

## 7. 結論（一句話）

R58 三項戰鬥正確性修正（穿透去重、分數權重、AoE 吃盾／相位）在**真實程式碼與既有測試**上**成立**；projectile **無物件池**，不存在 hitIds 認屍。殘留以 **盾「正面＝vy&lt;0」被拖車機槍手實用化**為最大對抗發現（P1），其餘為維護債與理論組合（P2）。**本輪只審不改。**
