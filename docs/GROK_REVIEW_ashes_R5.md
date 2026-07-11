# 《灰燼護航》R64 P0 修復 — 對抗性覆核（Grok R5）

| 項目 | 內容 |
|------|------|
| 對象 | R64 宣稱修好 R4 **P0「Boss slow-mo 破決定性」**：`fxVisualTime` 純表現層、決定性回歸（full/reduced 同 seed）、AudioContext 單例＋touchstart |
| 版本現況 | 程式標為 **R64**（`src/version.js:4`，`CACHE_VERSION` = `ashes-convoy-r64-v1`） |
| 覆核 commit | `922c704` — *灰燼護航 R64：修 P0——Boss slow-mo 改純表現層 fxVisualTime…* |
| 對照基線 | R4 覆核 `docs/GROK_REVIEW_ashes_R4.md`；Codex 回覆 `docs/CODEX_RESPONSE_ashes_R4.md` |
| 姿態 | **對抗式監工**：**只審不改**；逐條 PASS／缺口／bug、**檔案:行號**、最小重現 |
| 產出日 | 2026-07-11 |
| 讀取範圍 | `src/game.js`、`src/audio.js`、`scripts/test-e2e.js`、`scripts/test-audio.js`；輔以 `git show 922c704` |
| 約束 | 僅本檔；**不修改**遊戲程式碼／測試／其他文件 |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **PASS** | 落地正確且與宣稱對齊，現況可接受 |
| **P0** | 宣稱已修但仍破決定性／邏輯吃到 visual clock，或測試對宣稱回歸完全無效 |
| **P1** | 測試半有效、邊界失敗路徑、可觀測機制破洞 |
| **P2** | 體感不一致、維護債、文件與實作微差、防禦性缺口 |

### 總表（三條主審＋附帶）

| # | 議題 | 結論 |
|---|------|------|
| 1 | `fxVisualTime` 是否真的只進渲染（邏輯路徑零消費） | **PASS** — 模擬 `dt` 不再縮放；visual clock 僅供 draw／Boss 演出計時 |
| 2 | 決定性回歸測試是否真能抓回歸 | **條件 PASS（P1 缺口）** — `time`/`waveElapsed` 能抓 R4 舊 bug；`remainingSpawns`/`enemies` 對該場景幾乎死斷言 |
| 3 | 新引入 bug | **無 P0**；有 **P2** 表現層時鐘混用與測試死欄位 |
| 附 | AudioContext 單例＋touchstart 解鎖 | **PASS**（單元覆蓋到位；註解仍舊） |

---

## 1. `fxVisualTime` 是否只進渲染 — **PASS**

### 1.1 判定標準（沿用 R4）

| 允許 | 禁止 |
|------|------|
| 獨立 visual 時鐘驅動動畫／鏡頭／後處理 | 縮放 `update(dt)` 的 step `dt` |
| 表現旗標寫入 state 但不被模擬讀取 | `state.time`／`waveElapsed`／生成／冷卻／AI 吃 visual 或縮放後 dt |

### 1.2 全庫引用盤點（執行期；不含歷史 docs）

| 符號 | 位置 | 角色 | 是否進模擬決策 |
|------|------|------|----------------|
| `visualStateTime()` 定義 | `src/game.js:152–155` | 讀 `fxVisualTime`，fallback `state.time` | 否（純讀） |
| `updateFxPresentationClock(dt)` | `src/game.js:157–176` | 用 **未縮放** `dt` 推進 visual；可縮 **visualDt** | 只寫表現欄位 |
| 呼叫點 | `src/game.js:2709`（`update` 開頭） | 在 `state.time += dt` **之前**跑 | 不改傳入 `dt` |
| 初始化 | `src/game.js:1263–1265` | `fxVisualTime/Left/Scale` 歸零 | 否 |
| Boss 擊殺寫入 | `src/game.js:1705–1709` | `fxBossKillFx.start = visualStateTime()`；flourish 時設 `fxTimeScaleLeft=0.2`、`fxTimeScale=0.35` | 旗標寫入；不縮 step |
| `getState` 外洩 | `src/game.js:755–757` | 觀測用 | 否 |
| `drawBossKillFx` | `src/game.js:4032` | `elapsed = visualStateTime() - start` | **僅 render** |
| 主 `draw` 的 `timeMs` | `src/game.js:4353` | 精靈／背景 tile 動畫相位 | **僅 render** |

**Grep 結論：** `src/` 內 `fxVisualTime`／`visualStateTime` **無**第三處邏輯消費者（波次、碰撞、冷卻、RNG、完成條件皆未讀）。

### 1.3 舊 P0 是否已移除

R63 的 step 縮放（R4 證據：`dt = consumed * scale + …` 後再 `state.time += dt`）在 R64 **已刪除**。

現況 `update`：

```2707:2711:src/game.js
  function update(dt) {
    if (!state || state.paused || state.over) return;
    updateFxPresentationClock(dt);
    state.time += dt;
    state.waveElapsed += dt;
```

其後 `processWaveEvents`／`fireProjectiles`／`updateEnemies`／`completeWaveIfReady` 等一律吃**原始** `dt`（`src/game.js:2715–2727`）。

生成門檻仍綁邏輯時鐘：

```1961:1965:src/game.js
    while (state.spawnIndex < plan.spawns.length && plan.spawns[state.spawnIndex].time <= state.waveElapsed) {
      ...
      spawnEnemy(spawn.enemyId, Object.assign({}, spawn, { silent: true }));
```

敵 AI／zigzag／telegraph 等持續用 `state.time`（例如 `src/game.js:2019–2076`），**不用** `fxVisualTime`。

### 1.4 表現時鐘實作是否自洽

```157:176:src/game.js
  function updateFxPresentationClock(dt) {
    ...
    const logicEndTime = state.time + dt;
    ...
    if (state.fxTimeScaleLeft > 0 && flourishFxEnabled()) {
      ...
      visualDt = consumed * scale + (dt - consumed);
      state.fxTimeScaleLeft = Math.max(0, state.fxTimeScaleLeft - consumed);
    } else {
      ...
      if (lag > dt * 0.05) visualDt = Math.min(dt * 1.75, lag);
    }
    state.fxVisualTime = Math.min(logicEndTime, state.fxVisualTime + visualDt);
  }
```

| 行為 | 評估 |
|------|------|
| 縮的是 `visualDt`，不是 step `dt` | 符合「純表現」 |
| `fxTimeScaleLeft` 以 **wall／logic 秒** 消耗 0.2s | 與舊 slow-mo 窗長一致，但不再拖慢模擬 |
| 結束後 1.75× catch-up 追上 `logicEndTime` | 合理；仍只動 `fxVisualTime` |
| 與 `flourishFxEnabled()` 同閘（`src/game.js:148–149`） | reduced／`reducedFlash` 不啟 slow-mo |

### 1.5 小結 §1

**R4 P0 主因（模擬 `dt` 被 flourish 縮放）已修掉。**  
`fxVisualTime` 全引用符合「只進渲染／演出計時」；邏輯積分路徑未吃到。

---

## 2. 決定性回歸測試有效性 — **條件 PASS（P1）**

### 2.1 測試位置

`scripts/test-e2e.js` → `checkR64JuiceFx` 內 `deterministic` 區塊（約 `1792–1853`）。

流程摘要：

1. 同 seed `r64_fx_determinism` 各跑 `full/reducedFlash=false` 與 `reduced/reducedFlash=true`
2. 固定 `wavePlan.spawns` at **0.12 / 0.32 / 0.52**
3. 射死 Boss → `step(16)` + `step(640)`（約 +0.016s + 0.64s 邏輯）
4. 斷言 full ≡ reduced：`time`、`waveElapsed`、`remainingSpawns`、`enemies`（`enemyId` 排序）

### 2.2 對「R4 舊 bug」的反事實靈敏度

舊行為：Boss 死後 `slowMoLeft=0.2`、`scale=0.35` **縮 step dt**。

以 `step` 的 `MAX_STEP = 1/30`（`src/game.js:18`、`2785–2795`）重算：

| 設定 | 擊殺後再推進 0.64s wall 的大致 `time`／`waveElapsed` |
|------|------------------------------------------------------|
| 舊 full（縮 dt） | ≈ **0.526** |
| 新碼／reduced（不縮） | ≈ **0.656** |
| 差值 | ≈ **0.130s** |

| 斷言 | 舊 bug 下 full vs reduced | 能否抓回歸 |
|------|---------------------------|-------------|
| `time`（`1850`） | 0.526 ≠ 0.656 | **能** |
| `waveElapsed`（`1851`） | 同上 | **能** |
| `remainingSpawns`（`1852`） | 兩者皆 ≥ 三發 spawn 時間 → 多半都是 **0** | **幾乎不能** |
| `enemies` by `enemyId`（`1853`） | 三隻都會出 → roster 仍相同 | **幾乎不能** |

原因：最晚 spawn 在 **0.52**，舊 full 仍約 **0.526 > 0.52**，spawn 側斷言對 R4 場景是**死斷言**。  
真正有咬合力的是 **`time`／`waveElapsed` 相等**。

### 2.3 其他有效性缺口（P1）

| 缺口 | 說明 | 嚴重度 |
|------|------|--------|
| 只比 full vs reduced | 若回歸改成「Boss 死後**無論設定**都縮 dt」，兩邊仍一致 → **綠燈假陰性** | P1 |
| 未斷言 `fxVisualTime` 分叉 | 決定性區塊收集了 `fxTimeScaleLeft`（`1842`）但**從不** assert full≠reduced；且 0.64s 後 Left 已耗盡多為 0 | P1／測試盲區 |
| 未比座標／hp／cooldown／`nextEntityId` | 只比 `enemyId` 排序；sway 等 rng 欄位、實體 id 分叉抓不到 | P2（本 P0 主軸外） |
| `projectiles` 有收集無 assert | `1841` 死欄位 | P2 |
| juice 段另有「full 有 Left／reduced 為 0」（`1755`、`1789`） | 能證明旗標寫入，但**不能**單獨證明「未改模擬」 | 互補、非替代 |

### 2.4 測試自身有效性結論

| 宣稱 | 判定 |
|------|------|
| 「能抓 **flourish 縮 step dt** 那類 P0」 | **成立**（靠 `time`／`waveElapsed`） |
| 「spawn 時序斷言也有效」 | **對目前數值幾乎不成立**（P1：應用邊界 spawn 如 0.55～0.60 才有分辨力） |
| 「能抓一切決定性回歸」 | **不成立**（對稱縮 dt、非設定相關分叉等） |

**總評 §2：有條件通過** — 不是花瓶，但比 Codex 敘述「asserts identical … remaining spawns and roster」更弱；後兩項在此 fixture 下對舊 bug **無增量偵測力**。

---

## 3. 新引入 bug — **無 P0；有 P2**

### 3.1 未發現的回歸類

| 檢查 | 結果 |
|------|------|
| 模擬 `dt` 再被縮放 | 無 |
| 波次／冷卻讀 `fxVisualTime` | 無 |
| `setState` 合併弄壞 clock 導致邏輯分叉 | 測試同 evaluate 內同步設定；`time:0` 時初始 `fxVisualTime:0`；未見必現邏輯 bug |
| Audio 單例改壞決定性 | 音效用獨立 engine rng／`currentTime`；不進 `state.rng` |

### 3.2 新／浮現問題（P2）

#### A. 表現層時鐘混用 — slow-mo「半套」

| 路徑 | 時鐘 | 位置 |
|------|------|------|
| 精靈 `drawSprite`／多數 draw | `visualStateTime()` → `timeMs` | `4353`、下游 draw |
| Boss 衝擊環／白閃時長 | `visualStateTime()` | `4032` |
| 螢幕震動相位 | **`state.time`** | `4357–4364` |
| 背景 scroll 偏移 | **`state.time * 112`** | `3008` |
| 星塵 parallax | **`stateTime()` = `state.time`** | `4013`、`3319–3320` |
| FX 粒子／排氣 `updateFx` | **邏輯 `dt` + `state.time`** | `240–289`、`259` |
| 載具 tilt 取樣（draw） | **`stateTime()`** | `4269` |

Boss slow-mo 期間：角色／子彈動畫變慢，但捲軸、粒子、震動、星塵仍全速 → **體感 slow-mo 不完整**（非決定性破壞，屬 P2 演出）。

#### B. `drawBossKillFx` 在 render 路徑清狀態

`src/game.js:4034–4036`：`elapsed` 超窗時 `fxBossKillFx = null`。  
副作用在 draw 既有模式；改用 visual 後只改變**牆鐘上的存活長**（slow-mo 時演出拖長），非模擬 bug。

#### C. 表現狀態掛在 `update` 與 sim state 同物件

`fxTimeScaleLeft`／`fxVisualTime` 與 `state.time` 同居、在 step 內推進。  
目前無邏輯讀取 → 可接受；若未來做「全 state hash 重播」須剔除這些欄位（維護債 P2）。

#### D. 註解未跟上 touchstart

| 位置 | 內容 |
|------|------|
| `src/audio.js:9` | 仍寫 pointerdown／keydown |
| `src/game.js:4436–4437` | 同上 |
| 實作 | `installUnlockHandlers` 已加 `touchstart`（`src/audio.js:408–410`） |

### 3.3 AudioContext 單例＋解鎖（附帶宣稱）— **PASS**

| 項目 | 證據 | 判定 |
|------|------|------|
| 預設引擎單例 | `getDefaultEngine`（`src/audio.js:372–375`） | PASS |
| Context／master 懶建重用 | `ensureContext`（`228–251`） | PASS |
| `unlock()` 手勢內建 context + resume | `393–398` | PASS（對齊 R4 P1） |
| `play()` 在 `gestureSeen` 後 ensure+resume | `415–423` | PASS |
| touchstart | `409` | PASS |
| 單元：單例 create 一次、reuse | `scripts/test-audio.js:210–226` | PASS |
| 單元：handler 含 touchstart、不重複 install | `scripts/test-audio.js:230–244` | PASS |

---

## 4. 與 Codex R4 回覆對照

| Codex 宣稱（`docs/CODEX_RESPONSE_ashes_R4.md`） | R5 判定 |
|-----------------------------------------------|---------|
| 模擬 `dt` 縮放已移除；只推 `fxVisualTime` | **成立** |
| full/reduced 同 seed 邏輯 `time`／`waveElapsed` 一致（測試） | **成立且有咬合力** |
| 同測亦保證 remaining spawns／roster 抓回歸 | **過度宣傳** — 現 fixture 下對舊 bug 幾乎無感（P1） |
| Audio unlock／單例／touchstart | **成立** |
| reduced 敵 hit alpha 閘 `flourishFxEnabled` | 附帶修（`src/game.js:4226`）；非本 R5 主軸，略 |

---

## 5. 總結

### 主結論

1. **P0「Boss slow-mo 破決定性」：已修好（PASS）。**  
   模擬不再吃 slow-mo；`fxVisualTime` 引用點均為表現／觀測。
2. **決定性 e2e：有條件有效。**  
   `time`／`waveElapsed` 足以抓 R4 舊回歸；spawn／roster 斷言在現參數下對該 bug **接近無效**（P1 測試品質）。
3. **無新 P0 正確性 bug**；有表現時鐘混用與測試死欄位等 **P2**。

### 優先級清單（只審建議，不實作）

| ID | 級別 | 項目 |
|----|------|------|
| R5-1 | — | ~~Boss slow-mo 縮 step dt~~ → **已關閉** |
| R5-2 | P1 | 強化決定性測：spawn 落在舊縮放會漏接的時間帶（如 0.55）；可選 assert 過程中 full 曾 `fxTimeScaleLeft>0` 且 full `fxVisualTime` 落後於 reduced |
| R5-3 | P1 | 文件／測試敘述勿把「spawn roster 相等」說成對本 P0 的主證據 |
| R5-4 | P2 | 若要完整 slow-mo 體感：背景 scroll／粒子／震動改吃 visual 或明確標「僅角色動畫慢」 |
| R5-5 | P2 | 註解補 touchstart；決定性回傳欄位要嘛 assert 要嘛刪 |

### 最小重現（驗證「已修」）

1. 固定 seed，`fxLevel=full`、`reducedFlash=false`，Boss 擊殺後連續 `step` 累積 wall 0.2s+。  
2. 觀察：`state.time`／`waveElapsed` 增量 ≈ wall 秒（**非** ×0.35）；`fxVisualTime` 增量較小，`fxTimeScaleLeft` 下降。  
3. 同 seed 改 reduced 重跑：邏輯時鐘軌跡應一致；visual 旗標維持 0。  
4. 反例（舊碼）：同步驟 full 的 `time` 會少約 0.13s／每 0.64s 窗。

---

*本報告為對抗覆核產物，不修改 `src/**` 或測試。*
)
