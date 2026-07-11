# 《灰燼護航》R63 爽度層 — 對抗性覆核（Grok R4）

| 項目 | 內容 |
|------|------|
| 對象 | R63 vanilla JS「爽度層」：受擊白閃／視覺 knockback／車體後座／combo 浮字／波次慶祝 banner／Boss slow-mo／拾取飛 HUD／WebAudio 合成音 |
| 版本現況 | 程式標為 **R63**（`src/version.js:4`，`CACHE_VERSION` = `ashes-convoy-r63-v1`） |
| 姿態 | **對抗式監工**：只審不改；逐條給 PASS／缺口／bug、**檔案:行號**、最小重現 |
| 產出日 | 2026-07-11 |
| 讀取範圍 | `src/game.js`、`src/audio.js`、`src/fx.js`、`src/config.js`、`src/rules.js`；輔以 `scripts/test-e2e.js`、`scripts/test-audio.js`、`scripts/test-fx.js` 作證據（測試通過≠產品保證） |
| 約束 | 僅本檔；**不修改**遊戲程式碼／測試／其他文件 |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **PASS** | 落地正確且與設計意圖對齊，現況可接受 |
| **P0** | 正確性／決定性明顯失真，或宣稱「純視覺」卻動到 step 邏輯 |
| **P1** | 邊界失敗路徑、設定閘門漏關、可觀測機制破洞 |
| **P2** | 體感／維護債／效能邊際／文件與實作微差 |

### 總表（五條覆核）

| # | 議題 | 結論 |
|---|------|------|
| 1 | Boss slow-mo：動 render 還是動 step？是否破決定性波次 | **P0 FAIL** — 縮放的是 `update(dt)` 的 **step `dt`**，不是純渲染時序 |
| 2 | 視覺 knockback／車體後座是否只動渲染座標 | **PASS** — 不改 `enemy.x/y`／載具邏輯座標；僅 draw 偏移 |
| 3 | WebAudio 首次手勢解鎖失敗路徑 + 節點／Context 重用 | **部分 PASS** — Context／master／noise 單例重用正確；iOS 首段解鎖路徑偏弱（P1） |
| 4 | reduced 設定是否關掉全部新特效 | **部分 PASS** — `flourishFxEnabled` 蓋住多數 R63 juice；仍有漏關與語意分裂（P1） |
| 5 | FX 對 150+ 實體效能 | **條件 PASS** — 硬上限遠低於 150 敵；池化合格；高密度仍有合成／漸層成本（P2） |

---

## 1. Boss slow-mo × 決定性波次邏輯 — **P0 FAIL**

### 1.1 判定標準

覆核鐵則：**時間縮放若動 step（模擬 `dt`），即破「視覺與設定不應改變波次推進／命中時序」的決定性邊界**；正確作法是只動 render 時鐘（鏡頭／插值／後處理），`state.time`／`waveElapsed`／生成／移動一律吃未縮放 `dt`。

### 1.2 實作：明確動 step，不是動 render

**觸發（Boss 擊殺，且 flourish 開）：**

```1674:1680:src/game.js
    if (enemy.boss) {
      // Boss 死亡演出：多段爆炸由 killBurst 的 delay 規格構成；此旗標驅動純視覺慢放感
      fxBossKillFx = { x: enemy.x, y: enemy.y, start: state.time };
      if (flourishFxEnabled()) {
        state.slowMoLeft = Math.max(state.slowMoLeft || 0, 0.2);
        state.slowMoScale = 0.35;
      }
```

**套用位置在 `update(dt)` 開頭 — 整段模擬共用同一個被縮放的 `dt`：**

```2677:2706:src/game.js
  function update(dt) {
    if (!state || state.paused || state.over) return;
    if (state.slowMoLeft > 0 && flourishFxEnabled()) {
      const consumed = Math.min(dt, state.slowMoLeft);
      const scale = Math.max(0.1, Math.min(1, state.slowMoScale || 0.35));
      dt = consumed * scale + (dt - consumed);
      state.slowMoLeft = Math.max(0, state.slowMoLeft - consumed);
    } else {
      state.slowMoLeft = 0;
      state.slowMoScale = 1;
    }
    state.time += dt;
    state.waveElapsed += dt;
    // ...
    processWaveEvents();
    fireProjectiles(dt);
    // ...
    updateEnemies(dt);
    // ...
    completeWaveIfReady();
```

主迴圈與測試 step 皆呼叫此 `update`：

| 入口 | 位置 | 說明 |
|------|------|------|
| `loop` | `game.js:4364–4372` | rAF 以 wall `delta` 進 `update` |
| `step` | `game.js:2763–2770` | 測試／自動化以 `deltaMs` 切 `MAX_STEP` 後進 `update` |

### 1.3 對波次決定性的實際影響

| 路徑 | 行號 | 與 slow-mo 的耦合 |
|------|------|-------------------|
| 波次時鐘 | `game.js:2688–2689` | `state.time`／`state.waveElapsed` 吃**縮放後** `dt` |
| 生成／閘門 | `game.js:1928–1941` | `plan.spawns[i].time <= state.waveElapsed` — 生成節奏被拖慢 |
| 清波條件 | `game.js:2535–2541` | `waveElapsed` vs `plan.duration`／`staleWave` 一併變形 |
| 射速／冷卻 | `game.js:1844` 等 | `weaponCooldown -= dt` 等戰鬥時序變慢 |
| 敵移動 | `game.js:1962+` | 全敵積分用同一 `dt` |

Boss 擊殺後常見「當波結束 → 下一波 `waveElapsed = 0`」（`game.js:2542–2549`），但 **`slowMoLeft` 仍可跨波殘留**（約 0.2s wall、scale 0.35）。結果：下一波開頭的 `processWaveEvents` 在「完整特效」局會比「reduced」局**晚吐出** seed 已決定的 spawns。

**種子本身**（`makeWavePlan`／spawn 表）仍可決定性生成；被破壞的是：

1. **同 seed、同操作序列、不同特效設定 → 局內時序分叉**（`flourishFxEnabled` 綁 `fxLevel === "full"` 且 `!reducedFlash`，`game.js:148–149`）。
2. **「設定不應改模擬」契約**（與註解宣稱衝突，見下）。

### 1.4 註解與實作自相矛盾

`drawBossKillFx` 註解寫「純視覺慢放感（**不動邏輯時序**）」：

- `game.js:4007–4008`

但同套 Boss 擊殺路徑又寫入 `slowMoLeft` 並在 step 縮 `dt`（上節）。  
**純視覺部分**（衝擊環／白閃／上下黑邊）確實只在 `drawBossKillFx`（`game.js:4008–4039`）；**真正的 slow-mo 不是它**，是 `state.slowMoLeft` 系統。

e2e 只斷言「有／無 slowMoLeft」，**不斷言時序是否與設定無關**：

- `scripts/test-e2e.js:1755`、`1789`

### 1.5 最小重現

1. `fxLevel=full`、`reducedFlash=false`，seed 固定，打到 Boss 擊殺。
2. 觀察擊殺後 ~0.2s wall 內：`waveElapsed`／下一波 spawn 推進約 ×0.35。
3. 同 seed 改 `fxLevel=reduced` 或 `reducedFlash=true` 重跑：`slowMoLeft` 保持 0（`game.js:1677` 不寫入；`2684–2686` 清零），波次以正常 `dt` 推進。
4. 比對：同操作下後續生成／冷卻／位置軌跡分叉 → **決定性邊界被特效設定刺穿**。

### 1.6 建議方向（只審不改，僅列最小修法意圖）

- 刪除或停用 `update()` 內 `dt` 縮放；slow-mo 只驅動 render（例如獨立 `visualTime`、鏡頭插值、`drawBossKillFx` 既有 0.55s 演出）。
- 若必須保留「手感慢動作」，也應保證 **`flourish` 開關不改變任何 `state.time` 積分**。

---

## 2. 視覺 knockback／受擊白閃／車體後座 — **PASS**

### 2.1 Knockback：只寫輔助欄位，draw 才加偏移

| 步驟 | 位置 | 行為 |
|------|------|------|
| 寫入 | `game.js:525–531` | `knockbackX/Y` 由彈速方向 × 係數；受 `flourishFxEnabled()` 閘 |
| 衰減 | `game.js:1970–1975` | 只把 `knockbackX/Y` 乘 `keep`，**從不** `enemy.x += …` |
| 繪製 | `game.js:3383–3385`、`3394`、`3418` | `translate(enemy.x + knockX, enemy.y + knockY + lift)` |
| 狀態外洩 | `game.js:696` | `publicEntity` 剔除 `hitFlash`／`knockbackX`／`knockbackY` |

全庫 `knockbackX/Y` 引用僅上述（grep 確認無碰撞／AI 讀取）。  
**命中半徑、路徑追蹤、子彈碰撞皆用邏輯 `enemy.x/y`** → 符合「視覺 knockback」。

### 2.2 受擊白閃

| 項目 | 位置 | 說明 |
|------|------|------|
| TTL | `game.js:526` | flourish 時 0.16s，否則仍設 0.12s（見 §4 漏關） |
| 白閃 fill | `game.js:3383`、`3407–3410` | `flash = hitFlash > 0 && flourishFxEnabled()`；`source-atop` 白遮 |
| 衰減 | `game.js:1969` | 邏輯上倒數 TTL，不改座標 |

### 2.3 車體後座

| 項目 | 位置 | 說明 |
|------|------|------|
| 寫入 | `game.js:534–539` | `recoilX/Y` + 時間窗；flourish 閘 |
| 繪製 | `game.js:4253–4258` | 僅 `ctx.translate(recoil * kick)`，註解同檔載具段亦標「純視覺」 |
| 射擊邏輯座標 | `game.js:1873–1874` 等 | muzzle 用 `vehicle.x/y`，不受 recoil 偏移 |

### 2.4 殘留（不降 PASS，列 P2）

- Knockback 衰減跑在 `updateEnemies`（step）——合理（欄位壽命），只要不進座標即可。
- 受擊時 `draw` 路徑仍可能用 `enemy.hitFlash > 0 ? 0.7 : 1` 調 alpha（`game.js:4204`），**未再查 flourish** → 精簡設定下仍有「變暗一下」的微視覺（併入 §4）。

---

## 3. WebAudio 解鎖失敗路徑 × 節點重用 — **部分 PASS**

### 3.1 Context／主鏈／噪聲 — **PASS（無每音 new AudioContext）**

| 機制 | 位置 | 判定 |
|------|------|------|
| 預設引擎單例 | `audio.js:368–375`、`409–414` | `getDefaultEngine()` 只建一次 |
| Context 懶建立 | `audio.js:228–251` | `ensureContext`：已有則重用；失敗 `engine.failed = true` |
| Master gain 單例 | `audio.js:240–244` | 連一次 `destination` |
| Noise buffer 單例 | `audio.js:254–266` | 同 context 只建一次 |
| 每發音節點 | `audio.js:286–339`、`358–361` | 每次 `playEvent` **新建** osc／bufferSource／gain／filter（one-shot 常態），**不是** new AudioContext |
| 節流 | `audio.js:18`、`351–354` | 同 key 50ms 合併，壓高射速建點 |

頁面掛載：`game.js:4414–4415` → `audio.installUnlockHandlers(root)`。

### 3.2 首次手勢解鎖 — **P1（iOS Safari 失敗路徑偏弱）**

```390:415:src/audio.js
function unlock() {
  gestureSeen = true;
  resumeContext(defaultEngine);
  return gestureSeen;
}

function installUnlockHandlers(target) {
  // ...
  scope.addEventListener("pointerdown", handler, { passive: true });
  scope.addEventListener("keydown", handler);
  // 注意：成功後不 remove、不在手勢內 create+unlock 出聲
}

function play(name, options) {
  const engine = getDefaultEngine();
  const created = playEvent(engine, name, options, GLOBAL_ROOT); // 此處才可能 ensureContext
  if (gestureSeen) resumeContext(engine);
  return created;
}
```

`resumeContext`（`audio.js:377–387`）：

- 僅在 `ctx.state === "suspended"` 時 `resume()`；
- `result.catch(() => {})` **吞掉 rejection**；
- `try/catch` 空身 — 無重試佇列、無使用者可見失敗、無 `touchend` 備援。

**典型 iOS 失敗時序：**

1. 第一次 `pointerdown`：`gestureSeen = true`，但 `defaultEngine.context` 多半仍是 `null` → `resumeContext` no-op（`audio.js:378`）。
2. 之後局內第一次 `playSound`（`game.js:118–120`）在**非手勢同步堆疊**呼叫 `play` → `ensureContext` 新建 `AudioContext`（iOS 常直接 `suspended`）。
3. 同呼叫尾端 `resumeContext`：若瀏覽器要求 resume 必須在 user gesture 內，此次可能失敗並被 `.catch` 吃掉 → **靜音**。
4. **第二次**手勢會再 `unlock()` → 此時 context 已存在，`resume` 往往才成功 → 多一次點擊才有聲（弱恢復，非明確失敗 UX）。

其他邊界：

| 項目 | 位置 | 風險 |
|------|------|------|
| 永久 `failed` | `audio.js:236–237`、`246–248` | create 丟例外後整局音效死；測試有覆蓋（`scripts/test-audio.js:251–256`） |
| 無 `touchstart` 雙掛 | `audio.js:404–405` | 現代 iOS 有 pointer events；舊 WebView 較吃虧（P2） |
| handler 永不移除 | `audio.js:400–406` | 非正確性 bug；每次手勢重試 resume 反而是弱恢復 |

測試覆蓋：配方／節流／無 Context 安全失敗（`scripts/test-audio.js`）— **無**真實 iOS autoplay 手勢整合測。

### 3.3 小結

- **「每音 new AudioContext 會爆」** → 現況 **不會**；單例 + master + noise 重用正確。  
- **「首次手勢解鎖失敗路徑」** → 有 silent fail、無手勢內建 context、無明確降級提示 → **P1**。

---

## 4. reduced 設定是否關掉全部新特效 — **部分 PASS（P1 漏關）**

### 4.1 閘門定義

```148:149:src/game.js
  function flourishFxEnabled() {
    return !!FXC && fxLevelSetting() === "full" && !(meta.settings && meta.settings.reducedFlash);
  }
```

| 設定 | UI | 語意 |
|------|-----|------|
| `fxLevel` | `index.html:1670–1674` full／reduced／off | `game.js:108–110`、`rules.js:159–160` |
| `reducedFlash` | meta settings | 與 flourish **AND** 綁死 |

→ **`fxLevel=reduced` 或 `reducedFlash=true` 任一成立，flourish 全關。**

e2e 同時開兩者測 R63（`scripts/test-e2e.js:1758–1790`）— 通過不代表單一設定也乾淨。

### 4.2 R63 新特效 × 閘門矩陣

| 特效 | 寫入／觸發 | 繪製／可聽 | reduced／!flourish |
|------|------------|------------|---------------------|
| 受擊白閃 fill | `525–526` | `3383`、`3407–3410` | 白閃 **關**；仍寫 `hitFlash=0.12` |
| 視覺 knockback | `527–531` | `3384–3385` | **關** |
| 車體後座 | `534–539` | `4253–4258` | **關** |
| combo 浮字 | `550–556` | — | **關** |
| combo 大字 HUD | — | `3639–3654` | **關** |
| 波次慶祝 banner | `560–576`、`2560` | `4223–4224`、`3628–3636` | **關** |
| 拾取飛 HUD | `493–522`、`1096–1100`、`2277` | `4219–4222` | **關** |
| Boss slow-mo | `1677–1679` | step 縮 `dt`（§1） | **不啟動**（e2e:1789） |
| Boss 擊殺環／黑邊 | `1676` `fxBossKillFx` | `4008–4039` | **仍播**（白全屏才看 `reducedFlash`，`4018–4034`） |
| 擊殺粒子 burst | `1666–1671` | `3774–3778` | `fxLevel!=="off"` 仍可；`reduced` 走 low 池（`123–124`） |
| 波次開場大字 | `1822–1824` 等 | `4042–4069` | `fxLevel==="off"` 才整段 return；**reduced 仍顯示** |
| WebAudio | `playSound` | `audio.js` | 只看 `sound`（`114–116`），**與 fxLevel／reducedFlash 無關** |

### 4.3 漏關細節

1. **`hitFlash` 仍寫入 + 全域 alpha 變暗（P1）**  
   - 寫入：`game.js:526`（非 flourish 仍 `0.12`）  
   - 繪製：`game.js:4204` `alpha = enemy.hitFlash > 0 ? 0.7 : 1` **未** `&& flourishFxEnabled()`  
   → 「精簡／減閃」仍有受擊變暗，不算完整關掉受擊反饋特效。

2. **`fxLevel=reduced` ≠ 關光敏／關全部 juice 周邊**  
   - Boss 殺電影感（環＋黑邊）仍在（`4017` 只擋 `off`）。  
   - 粒子／環境 FX 降級為 low，不是 off（`123–124`、`144–146`）。  
   - 開場 wave／boss banner 仍可 flash/shake（另受 `reducedFlash` 於 `fx.waveBanner`，`fx.js:416–437`）。

3. **combo 狀態機仍跑（P2）**  
   - `updateCombo` 永遠累計（`542–549`）；只擋浮字與 `drawComboCounter`。  
   - 不影響平衡，但「特效 off」與「狀態 off」未對齊。

4. **雙開關語意分裂（P2）**  
   - 使用者只勾 `reducedFlash`、維持 `fxLevel=full`：flourish 關，但粒子仍 high 池（除非 performance 降）。  
   - 使用者只選 `fxLevel=reduced`、不勾減閃：flourish 關，Boss 白閃全屏仍可能（`4018–4034` 只看 `reducedFlash`）。

### 4.4 小結

- 對 **R63 核心 flourish 清單**（knockback／後座／combo 字／慶祝／HUD 飛／slow-mo 旗標）：**閘門有效**。  
- 對字面「**全部**新特效」：**否** — 受擊 alpha、Boss 殺演出殘件、粒子、wave banner、音效仍在。  
- 若產品定義「reduced = 可玩的降載」而非「零 juice」→ 應在設定文案寫清；現 UI 只有「精簡」（`index.html:1672`）。

---

## 5. FX 對 150+ 實體效能 — **條件 PASS（P2 邊際）**

### 5.1 實際上限：到不了「150 敵」

| 資源 | high | low | 定義位置 |
|------|-----:|----:|----------|
| `maxEnemies` | 72 | 54 | `config.js:2051`、`2058–2070`；套用 `game.js:686–687`、`1932` |
| `maxProjectiles` | 96 | 96 | `config.js:2052`；發射 `game.js:1864` |
| `maxEffects` | 90 | 48 | `config.js:2053`；裁切 `game.js:461–464` |
| 粒子池 | 96 | 48 | `config.js:1489–1491`；`fx.js:15–17`、`81–106` |

「150+ 實體」若指 **敵+彈+effect+粒子** 同屏加總，高負載理論可 >150；若指 **150 敵**，**現行硬頂 72，不可能**。

### 5.2 R63 juice 的複雜度

| 成本 | 位置 | 評估 |
|------|------|------|
| knockback 衰減 | `1970–1975` | O(敵) 純純量乘，可忽略 |
| hitFlash 倒數 | `1969` | 同上 |
| 白閃 `source-atop` | `3407–3410` | 命中中敵體多一次 fill；flourish 限定 |
| 敵 draw 本體 | `3369–3427`、`4203–4207` | 既有 raster／fallback；非 R63 獨有 |
| combo／慶祝／HUD 飛 | `3639+`、`560+`、`493+` | 少量 effect，有 `maxEffects` 裁切 |
| 粒子 update | `fx.js:227–262` | **掃整個 pool 長度**（96/48），非僅 active — 固定上限 |
| spark 漸層 | `game.js:3722–3746` | high + 非 reducedFlash 時 `createRadialGradient` + `lighter`（舊债，R2 已點過） |
| slow-mo | `2679–2682` | 幾乎零繪成本；改的是模擬速率（§1） |

固定池（`fx.js:80–109`）與 effects cap 符合「不應隨擊殺無界配置」方向。

### 5.3 壓力場景（對抗假設）

- **高波清雜兵 + 穿透 + full flourish**：每殺 1–3 次 `spawnKillBurst`（`1668–1670`），池滿則靜默丟粒子（池設計），effects 陣列超過 cap 從頭部 splice（`461–464`）— 可能砍掉仍在播的 HUD／浮字（P2 體感，非崩潰）。  
- **72 敵全 hitFlash 白閃**：額外 composite 可感，但仍綁 flourish；low／reduced 粒子與 floating 間隔（`2068`）有退路。  
- **音效**：50ms 節流（`audio.js:18`）+ 每發數個 AudioNode；高射速 GC 壓力存在但有界，且非 new Context。

### 5.4 小結

- **不會因 R63 juice 在 150 敵下爆掉**（敵根本不到 150）。  
- 150+ **總實體**時主成本仍是既有敵／彈／粒子繪製；R63 增量在可控範圍。  
- 殘留 **P2**：pool 全長掃描、spark 漸層、effects 粗暴裁切、flourish 全開時命中白閃 composite。

---

## 6. 跨條交叉風險

| 交叉 | 說明 | 級別 |
|------|------|------|
| slow-mo × reduced | 設定改變模擬時序 → 平衡／重播／自動化若假設「設定無關」會被騙 | **P0** |
| slow-mo × combo 窗 | combo 用 `state.time`（`544–548`）；slow-mo 下窗在 wall 上變長 | P2 |
| flourish 閘 × hitFlash alpha | 精簡模式仍變暗（`4204`） | P1 |
| 註解「純視覺」× 實作 | `1675`／`4007` 與 `2679–2682` 衝突，後續維護易再踩雷 | P2 |

---

## 7. 總評與建議優先序（只審）

### 必須下一版對齊（P0）

1. **Boss slow-mo 移出 step**：禁止在 `update(dt)` 縮放供波次／戰鬥使用的 `dt`；改純 render 或獨立 visual clock。  
2. 同步修正誤導註解（`game.js:1675`、`4007`），避免下一位實作者以為已是純視覺。

### 應修（P1）

3. **iOS 解鎖**：在首次 gesture handler 內 `ensureContext` + `resume`（必要時播靜音 buffer）；失敗可重試；避免只設 `gestureSeen` 卻延後建 context。  
4. **reduced 完整性**：`game.js:4204` alpha 受擊變暗應掛 `flourishFxEnabled()`；釐清 `fxLevel=reduced` 是否也應抑制 `drawBossKillFx` 全屏閃與 letterbox。

### 可排（P2）

5. 文案區分「精簡特效」vs「減閃」vs「關音效」。  
6. 粒子 full-pool scan／spark 漸層在低階機再收一刀（既有债）。  
7. e2e 補：**同 seed 固定 step 序列下，full vs reduced 的 `waveElapsed`／spawnIndex 應一致**（會直接抓住 §1）。

### 本輪判定句

> R63 爽度層在 **knockback／後座／多數 flourish 閘門／AudioContext 單例** 上方向正確；但 **Boss slow-mo 動到 step `dt`，直接違反決定性／設定無關模擬的底線（P0）**。WebAudio 與 reduced 屬「主路徑能動、失敗與漏關未封死」。效能在現有 72 敵硬頂下可接受。

---

*本報告由對抗覆核產出，未改動任何執行期程式碼。*
