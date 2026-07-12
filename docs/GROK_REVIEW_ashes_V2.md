# 《灰燼護航》R67 視覺品質審核（Grok V2）

| 項目 | 內容 |
|------|------|
| 對象 | R67 視覺修正：scatter 琥珀／homing 白青、受擊染色＋方向 squash、車頭雙燈、雜兵爆炸錯峰 |
| 版本現況 | 程式標為 **R67**（`src/version.js:4`，`CACHE_VERSION` = `ashes-convoy-r67-v1`） |
| 姿態 | **視覺品質監工 V2**：**只審不改**；覆核落地、具體化景深、給下一批提升點 |
| 產出日 | 2026-07-13 |
| 讀取範圍 | commit `76cb4f3` diff；`src/config.js`、`src/game.js`、`src/fx.js`、`scripts/test-visual-guards.js`、`docs/GROK_REVIEW_ashes_V1.md`、`docs/CODEX_RESPONSE_ashes_V1.md` |
| 約束 | 僅本檔；**不修改**遊戲程式碼／測試／其他文件 |
| 對照基線 | V1 報告（R66）；Codex 施工回覆 `docs/CODEX_RESPONSE_ashes_V1.md` |
| 靜態 guard | `node scripts/test-visual-guards.js` → **PASS**；`node scripts/test-fx.js` → **PASS**（本輪已跑） |

### 評分尺標（同 V1）

| 級別 | 意義 |
|------|------|
| **PASS** | 已達宣稱／可上架預覽門檻 |
| **P1** | 明顯拉低宣傳幀／實戰可讀性，下一輪應優先 |
| **P2** | 可辨識但未達打磨；補上 CP 高 |
| **P3** | 邊界美學、維護債 |

### 總表

| # | 審核軸 | 結論 |
|---|--------|------|
| 1 | R67 四項宣稱落地 | **PASS** — 色分離、受擊、車燈、錯峰皆可對到 diff／行號；guard 同步 |
| 2 | 相對 V1 的殘債 | **P1 已清一條**（綠友彈）；受擊／車燈／錯峰達 V1 最小作法主幹；**景深未做**；車體損傷煙、池優先、scorch 仍欠 |
| 3 | 背景景深層（本輪具體化） | 見 §3 — 建議獨立 overlay、raster／fallback 共用，先做 land |
| 4 | 下一批 3 提升點 | ① 景深落地 ② 低 HP 車煙 ③ 池優先＋地面 scorch |

---

## 1. R67 修正落地覆核（讀 diff）

**Commit：** `76cb4f3` — *scatter 琥珀/homing 白青色分離、受擊染色+方向 squash+hitFlash 0.2s、車頭雙燈環境分色、爆炸錯峰*  
**觸及：** `src/config.js`、`src/game.js`、`src/version.js`、`sw.js`、`index.html`、視覺／e2e／config guards；**未動** `src/fx.js` 池結構、傷害／射速／掉落。

### 1.1 scatter 琥珀／homing 白青 — **PASS**

| 宣稱 | 證據 | 判定 |
|------|------|------|
| scatter → 琥珀褐 | `config.js:829` `core: "#d39a4a"`，`edge: "#ffe0a3"`，`trail: "#8b5a2b"` | **PASS** |
| homing → 白青 | `config.js:845` `core: "#d8fbff"`，`edge: "#ffffff"`，`trail: "#78cbd8"` | **PASS** |
| tint cache 同步 | `FX.textureTints` 以 `#d39a4a`／`#d8fbff` 取代舊綠（`config.js:1507`） | **PASS** |
| 敵彈仍毒綠 | `drawEnemyProjectile` 本體 `#5fe478`（`game.js:3737–3748`）未改 | **PASS**（刻意保留對比） |
| guard | `test-visual-guards.js:45–46` 鎖死兩色 | **PASS** |

**區分矩陣（R67 後）**

| 友彈 core | 敵彈 `#5fe478` | 判定 |
|-----------|----------------|------|
| standard `#ffd36a` | 遠 | 安全 |
| scatter `#d39a4a` | 暖褐 vs 毒綠 | **安全（V1 P1 已解）** |
| homing `#d8fbff` | 白青 vs 毒綠 | **安全（V1 P1 已解）** |
| fracture `#64ddff` | 遠 | 安全 |
| ember `#ff7a38` | 遠 | 安全 |
| laser `#f06cff` | 遠 | 安全 |

**殘留（非回歸）**

| 議題 | 級別 | 說明 |
|------|------|------|
| scatter 與 standard 同暖帶 | **P3** | 金 vs 琥珀，形狀 capsule／pellet 不同；高速下偶有「暖色一團」，不影響友敵判讀 |
| homing 與 fracture 同青帶 | **P3** | 飽和青 vs 近白青；chevron／diamond 可分，截圖特寫無礙 |
| 敵彈仍不讀 `projectileKind` | **P3** | V1 已標；本輪未承諾改 |

> **結論：** V1 唯一 **P1 可讀性必修**（雙綠友彈）已正確落地；色相策略與 Codex 回覆一致。

---

### 1.2 受擊染色＋方向 squash＋hitFlash 0.2s — **PASS（條件細節如下）**

| 宣稱 | 證據 | 判定 |
|------|------|------|
| full hitFlash `0.16→0.20` | `triggerEnemyHitFlair` `game.js:640` | **PASS** |
| reduced 維持 `0.12` | 同函式 ternary | **PASS** |
| 染色＝彈種 core | `hitFlashColor = weaponVisual(...).core`（`644`） | **PASS** |
| 方向向量 | `hitDirectionX/Y` 自 `vx/vy` 正規化（`645–647`） | **PASS** |
| 方向 squash | `hitScaleX/Y` 乘進既有 walk squash（`3623–3642`、`3667`） | **PASS** |
| Boss 強度約半 | `hitWeight = hitPulse * (boss ? 0.55 : 1)`（`3624`） | **PASS** |
| raster 染色 | `source-atop` + `fillStyle = hitColor` + `globalAlpha *= 0.68`（`3653–3657`） | **PASS** |
| fallback 染色 | `enemySpriteOptions.tint = flash ? hitColor : ...`（`3670`） | **PASS** |
| reduced 不染不 squash | `flash = hitFlash > 0 && flourishFxEnabled()`；reduced 時 `flash===false`，scale 退回 1 倍率 | **PASS** |
| 表現欄不進 public snapshot | `publicEntity` 排除 hitFlash*／hitDirection*（`815–817`） | **PASS**（決定性衛生） |
| guard | `hitFlashColor`＋`hitScaleX/Y` 字串守門（`test-visual-guards.js:60–61`） | **PASS** |

**與 V1 最小作法對照**

| V1 建議 | R67 | 註 |
|---------|-----|----|
| 彈種 core 染色 | 已做 | 取代純白 |
| 沿彈道 squash | 已做 | 衰減曲線跟 `hitFlash/hitFlashMax` |
| 略延 hitFlash | 已做（0.2s） | — |
| 短 rim light（1px） | **未做** | 可留 P3 打磨 |
| Boss 方向 hit streak | **未做** | 可選 P3 |

**實作品質註記（不擋 PASS）**

1. **「2–3 幀 squash」語意：** 實作為整段 0.2s 的衰減權重，峰值約在前 ~3–4 幀（60fps 下 `hitPulse` 高段），之後變弱 — 體感合理，甚至比「硬切 2–3 幀」更自然。  
2. **整隻 alpha 0.7** 仍在（`game.js:4621`）— 與染色疊加，高速連射時敵體會偏「半透明染色塊」；可讀性夠，美學上略廉價（**P3**）。  
3. `hitFlashMax` 僅在 flourish 路徑寫入；繪製有 `|| 0.2` fallback，安全。

> **結論：** V1 ① 主幹達標；戰鬥截圖「有打到」已成立。rim／streak 為可選加分，非回歸。

---

### 1.3 車頭雙燈（環境分色）— **PASS（半套英雄生命）**

| 宣稱 | 證據 | 判定 |
|------|------|------|
| land 暖光 | `"255, 194, 104"`（`game.js:3557`） | **PASS** |
| 其餘環境冷光 | `"184, 242, 255"` | **PASS** |
| full 2 燈＋微脈動 | `count=2`；`sin(visualStateTime()*7.5)*0.08`（`3558–3560`） | **PASS** |
| reduced 1 燈恆亮 | `count=1`；`pulse=1` | **PASS** |
| off 不繪 | `fxLevelSetting() === "off"` early return（`3553`） | **PASS** |
| soft radial + lighter | `createRadialGradient` + `globalCompositeOperation = "lighter"` | **PASS** |
| 掛在車體 transform 後 | `drawVehicle` 後呼叫（`4687`），同 bob／tilt／recoil | **PASS** |
| debug 計數 | `vehicleNavigationLightsDrawn`（`3577`、`4718`） | **PASS** |
| guard | 函式名＋`reduced ? 1 : 2`（`test-visual-guards.js:62`） | **PASS** |

**與 V1 ② 對照**

| V1 建議 | R67 | 註 |
|---------|-----|----|
| 車頭錐光／航行燈 | **航行燈點光** | 非路面長錐光；截圖仍明顯加分 |
| 低 HP 程序 scorch／煙 | **未做** | 英雄「殘破敘事」仍缺 |
| 炮管 recoil 繪製偏移 | **未做**（邏輯 recoil 既有） | 可選 |

**輕度缺口（P3）**

- 燈位以 `width*0.18`／`height*0.54` 幾何估算，未必對齊各車 PNG 實際燈孔；四環境共用公式，space 車高係數 1.65 已分流。  
- 無路面光斑 — 「會發光」有了，「照亮路」還沒。

> **結論：** 宣稱範圍 **PASS**；V1 車體生命只完成「燈」半套，損傷可讀仍欠（見 §4）。

---

### 1.4 雜兵爆炸錯峰 — **PASS**

| 種類 | 層 | delay | 語意拍點 |
|------|-----|-------|----------|
| **zombie** | flash | `0` | 爆心 |
| | debris | `0.035` | 碎塊 |
| | shard | `0.07` | 骨屑 |
| | smoke | `0.11` | 殘煙 |
| **mech** | flash | `0` | 爆心 |
| | spark | `0.025` | 電弧 |
| | debris | `0.065` | 鐵片 |
| | smoke | `0.11` | 油煙 |
| **boss** | 未改 | `0` / `0.16` / `0.34` | 與 R66 同 |

證據：`config.js:1533`、`1551`、`1570`、`1608`、`1627`、`1646`；guard 要求 zombie／mech 至少一層 `delay >= 0.1`（`test-visual-guards.js:56–57`）。

| 宣稱 | 判定 |
|------|------|
| 0.025–0.11s 錯峰 | **PASS**（區間吻合） |
| Boss 不動 | **PASS** |
| 池仍 high 96／low 48 | **PASS**（`config.js:1496–1497` + guard） |

**殘留（V1 1.4 未解，本輪未承諾）**

| 議題 | 級別 |
|------|------|
| 池滿時後 spawn 的 smoke 仍先被砍 | **P2** |
| Boss ×3 全套 ≈108 粒 > 96 池 | **P2** |
| 無地面 scorch decal | **P2** |
| 線性 alpha 無 hold | **P3** |
| 錯峰總窗 0.11s 仍偏短（Boss 0.34s） | **P3** — 已從「同幀灑花」升級為「短三拍」，清雜兵高潮仍偏快 |

> **結論：** V1 雜兵「給微 delay」建議 **PASS**；專業爆炸的池／落地錨點債仍在。

---

### 1.5 版本與工程衛生 — **PASS**

| 項 | 狀態 |
|----|------|
| `APP_VERSION` / SW query / HTML cache bust | R67 對齊 |
| 玩法數值（傷害、射速、掉落、行為、RNG） | diff 無觸及 rules 戰鬥邏輯核心 |
| 粒子池上限 | 未上調（符合 Codex） |
| visual + fx guards | 本輪 PASS |

---

### 1.6 R67 總判定

| 面向 | 建議 |
|------|------|
| 工程／宣稱對齊 | **可放行 R67** — 四項宣稱皆有程式證據，無「寫了沒做」 |
| 相對 V1 放行條件 | **P1 綠彈已解**；受擊主幹＋車燈＋錯峰達最小 CP；**定裝截圖仍欠世界厚度（景深）與英雄殘破** |
| 一句話 | R67 把「可讀性必修 + 受擊有感 + 車會發光 + 雜兵有拍點」做完了；離商店定裝圖還差 **遠中景結構** 與 **低血車敘事**。 |

---

## 2. V1 三刀進度板

| V1 最划算三步 | R67 | 狀態 |
|---------------|-----|------|
| ① 敵人受擊升級 | 染色 + 方向 squash + 0.2s | **主幹完成**；rim／streak 可選 |
| ② 車體微細節／受損 | 航行雙燈 | **半完成**；缺低 HP 煙／scorch |
| ③ 背景景深層 | — | **未做** → 本輪 §3 具體化 |
| （外加）友敵綠彈分離 | scatter／homing 改色 | **完成** |

---

## 3. 「背景景深層」具體化（V1 ③ → 可施工規格）

> 目標：不重繪 PNG、不佔粒子池、不碰 RNG／決定性；讓 land（優先）從「一條 scroll 貼圖」變成 **遠／中／近** 可讀的世界剖面。  
> 參考既有正確模式：`drawRoadDetailOverlay`（raster／fallback 共用）與 space `drawStarDust`（parallax 直繪不佔池）。

### 3.1 現況錨點（為何現在不夠厚）

| 層 | 現況 | 證據 |
|----|------|------|
| 底圖 | 多為 **單層** `drawImage` 直向 scroll | `drawRasterEnvironmentBackground` `game.js:3140–3156` |
| 近景路 | land 胎痕／裂紋 overlay | `drawRoadDetailOverlay` `3159–3206` |
| 路側 | fallback land 才有 wasteland tile；**raster 成功時整段 procedural 被 skip** | `drawBackground` 成功 raster 即 `return`（`3127`） |
| 遠景 | 僅 space 有 `FX.environments.space` parallax 星塵 | `drawStarDust` `4414–4431`；land／sea／air **無同級** |
| 事件 | 全屏濾色有氣氛、**不增加幾何結構** | `drawEnvironmentEventOverlay` |

**關鍵約束：** 景深**不可**只寫進 `drawLandBackground` — 真機載入 `assets/env/land.png` 後該路徑根本不會跑。必須做成 **獨立 overlay**（同 road detail）。

### 3.2 建議插入點與繪製序

```
drawBackground()              // 既有 raster 或 fallback
drawDepthLayers()             // 【新】遠剪影 → 大氣 → 中剪影（路外 clip）
drawRoadDetailOverlay()       // 既有近景路
… entities / fx …
```

| 函式 | 建議位置 | 理由 |
|------|----------|------|
| `drawDepthLayers()` | `draw()` 內緊接 `drawBackground` 之後、`drawRoadDetailOverlay` 之前（約 `4771` 附近） | 夾在底圖與路面細節之間；實體仍蓋在其上 |
| `depthLayerTier` debug | 寫入 `renderDebug` | 與 `roadDetailTier` 對稱，方便 e2e／肉眼 |

**quality／reduced**

| 設定 | 行為 |
|------|------|
| `fx === "off"` | 可不繪景深（或只留極淡大氣 1 條 gradient） |
| `quality === "low"` 或 reduced | 關閉中景細節柱／窗；保留遠帶剪影 + 大氣 |
| full | 遠 + 大氣 + 中 全開 |

### 3.3 三帶規格（land 優先、一日級）

#### A. 遠景剪影帶（scroll × 0.15）

| 欄位 | 建議值 |
|------|--------|
| 水平範圍 | 全寬，但 **不侵入** `[roadLeft, roadRight]` 核心（可允許 ±4px 滲邊） |
| 垂直 | 每「段」高 18–28px 的連續丘／廢墟塊，由確定性 hash 選型 |
| 顏色 | `#2a241c` → `#3d3428`，`alpha 0.35–0.55` |
| scroll | `(state.scroll * 0.15) % period`（idle 用 `idleTime * 6`） |
| 形狀 | 梯形丘、缺角方塊、矮塔 3 archetype；**禁止**逐幀 `Math.random` |
| 密度 | 路左／路右各 1 條豎帶（x ≈ `roadLeft - 28`、`roadRight + 28` 為錨） |

#### B. 大氣梯度（靜態＋微呼吸可選）

| 欄位 | 建議值 |
|------|--------|
| 型式 | 垂直 `linearGradient` 全屏一次 |
| 上（遠） | `rgba(90, 78, 62, 0.22)` 灰褐 haze |
| 中 | `rgba(0,0,0,0)` |
| 下（近） | `rgba(20, 16, 12, 0.12)` 壓近景對比 |
| 合成 | `source-over`，**不要** multiply 整屏（避免再吃事件濾色） |
| 呼吸 | full 才 `sin(time*0.35)*0.03` 調上緣 alpha；reduced 固定 |

#### C. 中景剪影帶（scroll × 0.4）

| 欄位 | 建議值 |
|------|--------|
| 位置 | 更貼路肩：`roadLeft - 14`／`roadRight + 14` |
| 高度 | 34–52px，比遠景高、比車矮（避免搶英雄剪影） |
| 顏色 | `#1a1612`，`alpha 0.45–0.7` |
| 細節（full only） | 1–2 條豎縫／窗洞用 `destination-out` 或深色細 rect |
| scroll | `(state.scroll * 0.40) % period` |
| 與 wasteland tile | 若 fallback 已有 tile，中景 alpha 降到 0.4，避免雙重噪點 |

### 3.4 決定性與效能守則

1. **禁止**使用 `state.rng`／`Math.random`；用 `floor(y / step) * 常量` 取模選 archetype（同 road crack 寫法 `game.js:3191`）。  
2. **不佔** `fx` 粒子池；純 path／rect／gradient。  
3. low 檔：遠帶段距加倍、中景關閉、大氣保留。  
4. 不改 `ENVIRONMENT_BACKGROUNDS` 檔案；PNG 繼續當「貼圖底」，景深是程序層。  
5. 可選 guard：`gameSource.includes("drawDepthLayers")` + land 且 full 時 `renderDebug.depthLayersDrawn === true`（施工輪再加，本輪不改碼）。

### 3.5 sea／air／space 最小擴充（同一 API，第二日）

| 環境 | 遠 | 中 | 備註 |
|------|----|----|------|
| **sea** | 冷色水平島影／礁石帶 `#0e2430` | 近岸浪線 2 條 cos 帶 | 與 undertow 濾色冷暖一致 |
| **air** | 大塊雲影橢圓 `alpha 0.12` scroll 0.12 | 細風線（既有 env 粒子可並存） | 避免再加厚粒子 |
| **space** | **已有** starDust — 不重做 | 可加極淡星雲 1 個 radial（P3） | 優先把預算留給 land |

### 3.6 驗收標準（施工後給 V3 用）

| # | 驗收 |
|---|------|
| 1 | land 截圖在 **raster 底圖** 下仍可見路外遠／中剪影（不是只有 fallback） |
| 2 | 路中央可讀性不降：剪影不蓋 lane、不蓋敵人腳底超過 4px |
| 3 | scroll 時遠慢中快，肉眼 3 秒內能感到 parallax |
| 4 | reduced／low 無閃爍、無額外 transient canvas |
| 5 | `npm test`／visual guards 綠；無新 RNG 讀取 |

### 3.7 工作量與風險

| 項 | 評估 |
|----|------|
| 工時 | land 核心 **0.5–1 日**；sea／air 參數表 **+0.5 日** |
| 風險 | 中景過黑搶車 — 用 alpha 上限 0.7 + 高度 cap 解 |
| 風險 | 與 sandstorm 黃濾疊加變髒 — 景深用中性褐，事件層仍在實體後／前既有順序即可 |
| 不做的 | 新 PNG 卷軸、Spine 遠景、即時 blur |

---

## 4. 下一批 3 個提升點（R68 建議序）

> 在 R67 已清 P1 綠彈與受擊主幹之後，依 **定裝截圖 CP × 實作成本** 排序。

### ① 落地 §3 背景景深層（land 先行）— **P1 截圖／P2 玩感**

- **為何現在是第一：** R67 英雄與爽感層已抬升，畫面最空的是「世界」；V1 已點名且本輪規格已可直接開工。  
- **最小交付：** `drawDepthLayers` + land A/B/C + low 降級 + debug flag。  
- **不做：** 四環境一次美術爆發。  
- **預估：** 1 日。

### ② 低 HP 車體損傷煙（完成 V1 ② 下半）— **P1 敘事截圖**

- **現況：** 車有燈、有 exhaust 環境層、raster 仍忽略 `anim: damage/wreck`（`drawVehicle` `3511–3530`）；低血只有全屏 `lowHpPulse`。  
- **最小作法：**  
  1. `hp/maxHp < 0.35` 時在車尾錨點每 N 幀噴 1 顆 dark smoke（重用 Kenney smoke tint `#5a514b`，走既有池、rate 受 low 檔 `emitRateMul`）。  
  2. `hp/maxHp < 0.2` 加 1 顆間歇火花（短 life spark，非 flash 紋理亦可）。  
  3. reduced：煙降頻；off：不噴。  
- **為何划算：** 無新圖；定裝圖直接讀出「護航在撐」。  
- **預估：** 0.5–1 日。  
- **注意：** 勿提高池 cap；可與 ③ 的 spawn 優先級一起做更穩。

### ③ 擊殺池優先級 + 地面 scorch 殘留 — **P2 專業爆炸**

- **現況：** `spawnBurstCore` 池盡即 `break`（`fx.js:157`）；smoke 後 spawn → 群殺變「碎屑無煙」。Boss ×3 仍可超過 96。R67 錯峰讓「看得到拍點」了，但高潮仍易扁。  
- **最小作法：**  
  1. **優先級：** spawn 順序改為「保 flash／smoke 名額」或分桶（例如 reserved 25% 給 texture∈{smoke,flash}）；或 killBurst 先分配 smoke 再 debris。  
  2. **scorch：** 擊殺點寫入長度固定的 decal 環形緩衝（8–12 槽），繪於 `drawRoadDetailOverlay` 之後、實體之前；life 0.8–1.4s、褐色橢圓 `alpha` 衰減；low 減半、off 關。  
- **不做：** 池擴到 256（V1 已否決治標）。  
- **預估：** 1 日。  
- **收益：** 清雜兵高潮與 Boss 同幀不再「抽不到煙」；截圖有落地錨。

### 4.1 刻意未進「下一批三點」的項目

| 項目 | 理由 |
|------|------|
| 敵彈 `projectileKind` 分色 | R67 後友敵已可分；轉為內容多樣性 P3 |
| 受擊 rim light | 邊際；染色+squash 已夠 P1 |
| homing／fracture 青帶微調 | 友友區分 P3 |
| 路面錐光（真 headlight volume） | 成本高於航行燈；燈已有，先做損傷煙 |
| HUD／音效 | 非本監工軸 |

### 4.2 建議迭代標籤

| 標籤 | 內容 |
|------|------|
| **V2.1 定裝世界** | §3 land 景深 |
| **V2.2 英雄殘破** | 低 HP 煙／火花 |
| **V2.3 爆炸收斂** | 池優先 + scorch |
| （之後） | sea／air 景深參數、敵彈分流、rim |

---

## 5. 交叉風險（R67 後更新）

| 項 | R66／V1 | R67 後 | 級別 |
|----|---------|--------|------|
| 綠友彈 × 綠敵彈 | P1 危險 | **已解除** | — |
| 沙塵黃濾 × 暖色 scatter | 曾加重綠混 | 琥珀在沙塵下仍可讀；略融進廢土 — 可接受 | P3 |
| Boss ×3 × 96 池 | P2 | **未變** | P2 |
| Raster 車無視 damage anim | P2 | **未變**；燈是外掛層 | P2 |
| 敵彈不讀 kind | P3 | **未變** | P3 |
| 受擊半透明 0.7 × 染色 | — | 連射時略「塑膠感」 | P3 |

---

## 6. 總評與放行

### 6.1 對 Codex R67 宣稱逐條

| 宣稱 | 審核 |
|------|------|
| scatter 琥珀／homing 白青；敵彈毒綠；tint 同步 | **成立** |
| hitFlash 0.2／reduced 0.12；染色；方向 squash；Boss 半權 | **成立** |
| 車頭燈 land 暖／他冷；full 2／reduced 1／off 無 | **成立** |
| zombie／mech 0.025–0.11 錯峰；Boss 不動 | **成立** |
| 池 96／48；未改玩法模擬 | **成立**（靜態 diff＋guard） |

### 6.2 一句話

> R67 是一次 **對症下藥的可讀性＋反饋** 小版本：V1 的 P1 綠彈與受擊主幹已收斂，車開始「活」、雜兵爆開始「有拍」；定裝圖下一刀應砍在 **路外景深**，再補 **低血車煙** 與 **爆炸池／落地疤**。

### 6.3 放行

| 面向 | 建議 |
|------|------|
| R67 上線 | **放行** |
| 視覺品質天花板 | **有條件通過** — 可宣傳「戰鬥可讀」；「世界厚 + 英雄殘破」仍是商店幀短板 |
| 監工姿態 | 本輪 **只審不改**；景深僅規格、無碼更 |

---

*本報告為視覺品質監工 V2 文件，只審不改。對應實作版本：R67（commit `76cb4f3`）。*
