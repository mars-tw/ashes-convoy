# 《灰燼護航》R70 全面健檢監工（Grok R6）

| 項目 | 內容 |
|------|------|
| 對象 | R69 選單瘦身／門穿越／補給不中斷 **＋** R70 CC0 敵人多幀動畫（已上）之整合品質與殘留 |
| 版本現況 | 程式標為 **R70**（`src/version.js:4`，`CACHE_VERSION` = `ashes-convoy-r70-v1`） |
| HEAD | `c169e5e` — *R70：CC0 素材動畫升級…*；前一 commit `2bff8e8` — *R69：熹重製／門單一化／選單瘦身／桌面放大* |
| 對照基線 | `docs/CODEX_RESPONSE_ashes_R69.md`、`docs/CODEX_RESPONSE_ashes_anim.md`；決定性沿革見 `docs/GROK_REVIEW_ashes_R5.md`；視覺收官見 `docs/GROK_REVIEW_ashes_V3.md` |
| 姿態 | **全面健檢監工**：**只審不改**；整合品質／殘留、決定性·效能快檢、缺口排序＋下一輪最划算 3 步 |
| 產出日 | 2026-07-13 |
| 讀取範圍 | `src/game.js`、`src/ui.js`、`src/config.js`、`src/version.js`、`index.html`、`sw.js`、`CREDITS.md`、`scripts/test-animation-assets.js`、`scripts/test-e2e.js` 相關段落；`assets/enemies/*`、`assets/zombies/*` 體量 |
| 約束 | **僅本檔**；不修改遊戲程式碼／測試／其他文件 |
| 靜態抽樣 | `node scripts/test-animation-assets.js` → **PASS**（10 files／83,750 B）；`node scripts/test-config.js` → **PASS** |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **PASS** | 宣稱落地、與現碼對齊，現況可接受 |
| **P0** | 破決定性核心／卡死局／宣稱與實作明顯相反 |
| **P1** | 可重現正確性缺口、跨設定邏輯分叉、會卡系統流程 |
| **P2** | 體感／輸入殘留、維護債、測試半有效、美學／資產冗餘 |
| **P3** | 文件微差、命名／死欄位、長期打磨 |

### 總表

| # | 審核軸 | 結論 |
|---|--------|------|
| 1 | R69 選單瘦身 | **PASS** — 收合兩 CTA、展開八鍵；e2e 有咬合 |
| 2 | R69 門穿越（道路實體門） | **條件 PASS（P1 殘留）** — 穿越／不暫停／無中央 modal 正確；**漏穿後 `gateChoice` 不清理會卡後續門與補給** |
| 3 | R69 補給一鍵列 | **PASS（P2 殘留）** — 戰鬥不中斷；快捷鍵只綁 `1–4`，第五項護盾無數字鍵 |
| 4 | R70 CC0 多幀動畫 | **PASS** — 13 敵種契約、共享 tint、品質分級、道路 atlas、授權與預算皆對齊 |
| 5 | 決定性快檢 | **無新 P0**；既有 **P1：效能 quality 吃進敵人位移／上限** 仍在；Boss visual clock 維持 R5 PASS |
| 6 | 效能快檢 | **可接受** — 不抬敵／粒子上限；逐種一張 offscreen；殘留 `ctx.filter` 變種與靜態 zombie 雙軌快取 |
| 7 | 整合整體 | **可宣傳戰鬥幀**；下一輪 CP 最高是 **門漏穿狀態機**，不是再堆動畫 |

---

## 1. R69 選單瘦身 — **PASS**

### 1.1 宣稱 vs 現碼

| 宣稱（`CODEX_RESPONSE_ashes_R69`） | 證據 | 判定 |
|----------------------------------|------|------|
| 首屏只留「出勤」「基地」 | `index.html` `#sortieBtn`／`#baseToggleBtn`；`ui.js` `setBaseMenu` 收合 `baseActions` | **PASS** |
| 基地展開才見升級／載具／成就／拖車／任務／清存檔 | `ui.js:268–278` 收 hotspot 列表；e2e 展開後 8 顆（含出勤＋基地） | **PASS** |
| 開頁到開打 ≤2 點（仍 1 點） | 收合態直接點出勤 | **PASS** |
| 守門：收合只兩鍵、出勤 ≥60px | `scripts/test-e2e.js` `checkMetaHotspotsFit`（約 `136–203`） | **PASS** |

### 1.2 殘留

| 項目 | 級別 | 說明 |
|------|------|------|
| 展開後仍顯示「出勤」 | P3 | 設計合理（不必收合才能開打）；非 bug |
| 抽屜／基地狀態機 | P3 | `openMetaDrawer` 會 `setBaseMenu(false)`，層級清楚 |

**小結：** 選單瘦身整合乾淨，測試覆蓋足夠，**無阻擋上線的殘留**。

---

## 2. R69 門穿越 — **條件 PASS（核心 P1）**

### 2.1 正確落地

| 行為 | 證據 | 判定 |
|------|------|------|
| 中央 `#gateChoiceOverlay` 已移除 | DOM 無此 id；e2e `count() === 0`（`test-e2e.js:1214`、`2176`） | **PASS** |
| 極簡提示層 | `#gateChoiceLayer` + `.gate-choice-layer`（`index.html:378–405`、`1587`）；`pointer-events: none` | **PASS** |
| 前 3.8s 提示、暫藏增益摘要 | `ui.js:1232` 逾時隱藏；`1364–1365` `hudMods` 在 hint 可見時 `visibility:hidden` | **PASS** |
| 全程不暫停 | `openGateChoice` 設 `mode: "playing"`（`game.js:1622`）；e2e `paused === false`（`2174`、`2190`） | **PASS** |
| 穿越左右實體門套用 | `updateGatesAndEffects` 跨 `vehicle.y` 取最近門 + touch 判定（`2668–2686`）→ `resolveGateChoice` | **PASS** |
| 射門不再選增益 | `shootGate` e2e：`gatesTaken === 0`、`damageAdd` 不變（`2134–2155`） | **PASS** |
| 穿越清除配對 | `resolveGateChoice` 清 `gateChoice`、濾掉同 `pairId`（`1663–1680`） | **PASS** |

### 2.2 P1：漏穿後 `gateChoice` 黏住

**根因鏈（靜態可證）：**

1. `openGateChoice` 若已有 `state.gateChoice` **直接 return**（`game.js:1603`），不更新新配對。
2. `gateChoice` **只在** `resolveGateChoice`（同 `pairId`）清為 `null`（`1666`）；**沒有**「門捲出螢幕／配對全滅」的清理。
3. 門被濾掉條件：`gate.y < H + 70 && !gate.broken`（`2687`）— 漏穿後門消失，**狀態仍留**。
4. 副作用：
   - 下一次 `spawnGatePair` 仍會生門，但 `openGateChoice` 被擋 → **新門無 active choice／提示錯位**。
   - `openSupplyChoice` 若 `state.gateChoice` 存在則 **拒開補給**（`1226`）。

**漏穿是否物理上可能？**

| 參數 | 值 | 來源 |
|------|-----|------|
| 左門 x | `roadLeft + gateHalf + 1` ≈ **56** | `1595`；`gateHalf = 32*1.75*0.5` |
| 右門 x | `roadRight - gateHalf - 1` ≈ **139** | `1596` |
| 路心 | ≈ **97.5** | `(27+168)/2` |
| `touchRadius` 預設 | **31** | `1582` |
| `land_rig.radius` | **8** | `config.js:259` |
| `reach` | **39** | `31+8` |
| 路心到左門 | **41.5** | `> 39` → **正中可 miss** |

e2e `tapGateChoice` 只測「移到左門 x 再 step」的命中路徑（`2179–2193`），**沒有 miss／過期清理** 斷言。

| 項目 | 級別 | 最小重現（概念） |
|------|------|------------------|
| 漏穿黏狀態 | **P1** | 固定 seed 生門 → 載具停路心 `x≈97.5` 直到門 `y > H+70` → 觀察 `gateChoice != null` 且 `gates.length===0` → 再 `spawnGatePair` 仍無法換新 `gateIds`；途中補給拾取被擋 |

### 2.3 其他門相關殘留

| 項目 | 級別 | 說明 |
|------|------|------|
| 畫布標籤仍寫「選擇後套用」 | P2 | `drawGateLabel`（`3098`）語感偏舊 modal；與「穿越即選」略脫節 |
| 提示 3.8s 後 UI 隱藏但 state 仍在 | P2／與 P1 連動 | 玩家以為結束，系統仍鎖補給／下門 |
| `chooseGate` API 仍在 | P3 | 測試／除錯入口；非玩家 UI 路徑，可保留 |
| 命中取「最近一扇」非「碰哪扇」 | P3 | 寬 touch 下幾乎總會選到一邊；與「可 miss」並存 |

**小結：** 門體驗主路徑（提示 → 穿越 → 增益 → 不暫停）**整合成功**；**狀態機缺 miss 出口** 是 R69 最大正確性殘留。

---

## 3. R69 補給列 — **PASS（P2 輸入殘留）**

| 宣稱 | 證據 | 判定 |
|------|------|------|
| 3 欄漂浮一鍵、戰鬥不中斷 | `openSupplyChoice` 註解與不設 `paused`（`1235–1236`）；`supply-choice-overlay` 頂部列 | **PASS** |
| 仍五項、原效果／溢出 | `config.SUPPLY_DROPS.rewards` 五 key；e2e 五顆按鈕（`test-e2e.js:421`） | **PASS** |
| 鍵盤可操作 | `handleSupplyChoiceKey`（`ui.js:1296–1320`） | **條件 PASS** |

**殘留：**

| 項目 | 級別 | 證據 |
|------|------|------|
| 數字鍵只綁 `1–4` | **P2** | `ui.js:1304` `/^[1-4]$/`；第五項 `overshield` 無 `5` |
| Escape 不關閉 | P3 | 明確 `return false`（`1313–1314`）；戰鬥中強制選一項可接受 |
| 與門黏狀態互鎖 | 併入 §2 P1 | `openSupplyChoice` 看 `gateChoice` |

---

## 4. R70 CC0 動畫 — **PASS（整合品質高）**

### 4.1 契約與授權

| 項目 | 證據 | 判定 |
|------|------|------|
| 13 敵皆有 `spriteAnimation` | `config.ENEMIES`；`test-animation-assets.js` 遍歷 assert | **PASS** |
| 2–4 幀、fps≤12、warmTint、sheet 寬高 | 同上 | **PASS** |
| OGA／Kenney 出處與修改 | `CREDITS.md`；response 表；guard 查 CREDITS 字串 | **PASS** |
| 衍生 PNG 預算 | 實測 **83,750 B**（9 敵 atlas + 道路）；遠低於 1.5 MiB | **PASS** |
| SW 快取動畫圖 | `sw.js` 含 `assets/enemies/*` 與 `kenney_road_debris.png` | **PASS** |
| 未改碰撞／數值／波次／掉落 | 動畫只進 draw／preload；radius／hp 欄位未因 R70 改口 | **PASS**（靜態對照 Codex 宣稱） |

### 4.2 渲染架構（品質）

| 設計 | 證據 | 評估 |
|------|------|------|
| 每敵種一張共享 `tintCanvas` | `buildEnemyAnimationTint`（`591–610`）；註解明寫 150+ 實體共享 | **優** — 不隨實體數長 canvas |
| low → frame 0；reduced → 2 幀取樣；full → 4 幀 | `enemyAnimationFrame`（`3850–3862`） | **優** — 與 e2e tier 斷言對齊（`2084–2088`） |
| 移動才換幀 | `hypot(vx,vy) > 1` 否則 idle frame 0 | **PASS** |
| 橫向翻面 | raster `vx < -0.5`（`3900`）；debug `enemyFacingLeftDrawn` | **PASS** |
| code-sprite fallback 保留 | 載入失敗走 `drawSprite`（`3943–3954`）；契約要求 `SPRITES[enemy.sprite]` | **PASS** |
| 道路 Kenney 點綴 | `drawRoadDebrisAtlas`（`3315–3354`）；land only；full≤4／low≤2；無碰撞 | **PASS** |
| 熹兩幀（R69）與 R70 並存 | `TRAILER_GUNNER.frames=2`；`companionFrame` e2e | **PASS** — 無互相踩腳 |

### 4.3 R70 殘留（非阻擋）

| 項目 | 級別 | 說明 |
|------|------|------|
| 靜態 `assets/zombies/*` 仍在且進 SW | **P2** | 體量約 **269 KiB** vs 動畫 atlas **74 KiB**；preload 優先 `animation.image`（`573`），靜態多為冗餘離線載入 |
| 變種／再色仍用逐畫 `ctx.filter` | **P2** | 如 `chain_tether`／`mirror_husk`／`ember_tick`（`config.js` filter 欄）；warmTint 已 bake，**filter 未 bake** → 高密度變種仍貴 |
| 走幀上疊 bob／squash／wobble | P2 | `drawEnemyEntity` 仍 sin bob（`3871–3878`）；動畫後可能「抖＋步」略吵 |
| raster 翻面閾值 ≠ fallback（`-0.5` vs `-8`） | P3 | fallback 路徑體感較鈍（`3947`） |
| `ROAD_DETAIL_ATLAS.density` 未驅動迴圈 | P3 | density 只被 guard 上限檢查；實際 step 寫死 184／238／310 |
| `enemyAnimScale` 名實不符 | 併 §5 | 名字像動畫，實際縮 **邏輯 sway**（`2149–2157`） |

**小結：** R70 是「架構正確的動畫升級」：契約、分級、快取、授權、測試一次到位。殘留主在 **舊靜態圖雙軌** 與 **filter 未進 tint 管線**，不是幀契約失敗。

---

## 5. 決定性快檢 — **無新 P0；既有 P1 仍在**

### 5.1 R70 是否把 RNG／邏輯吃進動畫？

| 檢查 | 結果 |
|------|------|
| 幀索引用 `stateTime()`（邏輯時鐘） | `3858` — **純渲染**；不寫 state、不 roll rng |
| `animPhase` 仍 spawn 時由 `state.rng` 定 | `1484` — **舊行為**；與動畫升級無關 |
| 道路 debris 位置 | 固定 scroll 公式、`slot` 整數 — **無 rng** |
| tint 建立時機 | image onload — 不進 step 序列 | **不破 seed 重播** |

→ **R70 本身未引入新的決定性破口。**

### 5.2 Boss slow-mo（R64／R5）仍成立

- `update`：`updateFxPresentationClock(dt)` 後 `state.time += dt`（`2860–2864`），模擬 dt 不縮。
- `fxVisualTime` 仍服務 draw／Boss 演出；R5 結論維持 **PASS**。

### 5.3 既有 P1：效能 quality 吃進模擬

| 機制 | 位置 | 風險 |
|------|------|------|
| `enemyAnimScale` 乘進 `enemy.vx` sway／eventDrift | `2149–2157` | auto 降檔 high→low 時 **軌跡分叉** |
| `effectiveMaxEnemies` 依 quality（72 vs 54） | `850–851`、`1523`、`2095` | 同 seed 不同裝置可能 **少生怪** |
| `updatePerformanceQuality` 依實測 FPS | `2893–2947` | 非決定性輸入驅動 quality |

這不是 R70 新引入，但 **全面健檢必須點名**：宣稱「決定性」時，若含 auto 效能檔，**跨機／降檔不可重播**。固定 `performanceMode: high|low` 的測試路徑仍可自洽。

### 5.4 決定性測試殘留（沿 R5）

| 項目 | 級別 | 說明 |
|------|------|------|
| full vs reduced 比 `time`／`waveElapsed` | 有效抓 slow-mo 回歸 | 維持 |
| `remainingSpawns`／roster 在現 fixture | 對舊 bug **近乎死斷言** | **P2** 測試品質（R5 已述） |
| 未覆蓋「漏穿 gateChoice」 | **P1 缺口無測** | 見 §2.2 |
| 未覆蓋 quality 切換後 enemy x 軌跡 | P2 | 與 §5.3 對應 |

---

## 6. 效能快檢 — **可接受；有明確瘦身點**

### 6.1 守門與上限

| 項目 | 現況 | 評估 |
|------|------|------|
| 敵上限 | high 72／low 54（未因 R70 上調） | **PASS** |
| 粒子／特效池 | 既有分級；R70 未抬 cap | **PASS** |
| 動畫成本 | 每敵 `hypot` + 幀索引 + 一次 `drawImage` 裁切 | **輕** |
| 共享 tint | 每敵**種**最多一 canvas | **正確** |
| low 釘 frame 0 | 降採樣壓力 | **PASS** |
| 道路 debris | ≤4 draw／幀 | **可忽略** |
| 衍生資源增量 | +84 KiB runtime PNG | **優秀** |

### 6.2 壓力點（非 P0）

| 項目 | 級別 | 說明 |
|------|------|------|
| 變種 `ctx.filter` 逐實體 | P2 | 群潮＋filter 時 fill-rate／state change 仍痛；應 bake 進每 variant 的 offscreen |
| SW 預取靜態 zombie ≈269 KiB | P2 | 拉長 offline install；若 fallback 改只靠 code-sprite 可砍 |
| `env/` 體量（含 land 等）≈1.9 MiB | P3／舊債 | 非 R70 引入，但整體載入預算仍大頭在環境圖 |
| 疊加 bob + 4 幀 | P3 體感 | 低階機可用；可選 low 時關 bob |

**FPS：** e2e `checkOpeningHordeGateAndFps` 有粗 FPS floor（≥30）；本輪未重跑完整 e2e／rwd（只跑 animation＋config 靜態）。以碼論：R70 **未提高** 實體／粒子上限，設計方向對。

---

## 7. 整合品質總評

| 面向 | 分數感 | 一句話 |
|------|--------|--------|
| R69 UX 收斂 | 高 | 選單／門／補給主路徑達成「少點、不暫停」 |
| R69 狀態機完整度 | 中 | **漏穿出口缺失** 拉低完整度 |
| R70 動畫工程 | 高 | 契約＋分級＋共享 tint＋測試是教科書級小而美 |
| R70 美術辨識 | 中高 | OGA 步態＋Kenney 裝甲有差異；變種仍靠 filter／tint |
| 決定性纪律 | 中高 | 新動畫守住；**效能檔吃邏輯** 是舊傷 |
| 資產衛生 | 中 | 新圖瘦、舊 zombie／環境圖仍肥 |

**一句監工結論：**  
R69＋R70 疊加後，**玩家可見體驗與戰鬥可讀性明顯升級**；真正該修的不是「再多一輪動畫」，而是 **門選擇狀態機的 miss 路徑** 與 **效能分級是否允許改模擬**。

---

## 8. 缺口排序（全表）

| ID | 級別 | 缺口 | 影響 | 粗估成本 |
|----|------|------|------|----------|
| **R6-1** | **P1** | 門漏穿不清 `gateChoice` → 卡下門／擋補給 | 正確性／進度感 | **小**（filter 門時同步清；可加 e2e） |
| **R6-2** | **P1** | `enemyAnimScale`／`maxEnemies` 隨 quality 改模擬 | 跨機決定性／平衡 | **中**（邏輯與表現拆檔） |
| R6-3 | P2 | 補給快捷鍵無 `5` | 鍵盤完整度 | **極小** |
| R6-4 | P2 | 靜態 `zombies/*` 雙軌仍 SW 預取 | 離線體積／維護 | **小** |
| R6-5 | P2 | 變種 `ctx.filter` 未 bake | 高密度幀時間 | **中** |
| R6-6 | P2 | 門標「選擇後套用」文案 | 語意 | **極小** |
| R6-7 | P2 | 決定性 e2e spawn 死斷言（R5 債） | 回歸敏感度 | **小** |
| R6-8 | P2 | 走幀＋bob 略吵 | 定裝美感 | **小** |
| R6-9 | P3 | `density` 死欄位、翻面閾值不一致 | 衛生 | **極小** |
| R6-10 | P3 | 非 land 景深仍薄（V3 債） | 世界感 | **中**（非本輪主軸） |

**未列 P0：** 靜態碼審未發現「必現破局／必現決定性錯亂」的新 P0；R6-1 在漏穿條件下接近流程鎖，但可操作迴避（靠路側），故標 **P1** 非 P0。

---

## 9. 下一輪最划算 3 步（只建議、不實作）

> 排序原則：**正確性 > 決定性紀律 > 低成本衛生**；避免再開大美術案。

### ① 修門選擇狀態機（對 R6-1）— **必做、最划算**

- 當某 `pairId` 的門全部離開世界（或 `gates` 中已無該 pair）→ **`gateChoice = null`**。
- 可選強化（二選一即可）：路心 soft-resolve 最近門，或漏穿顯示「未取得增益」短訊息。
- e2e：路心漏穿 → `gateChoice===null` → 可再開 `spawnGatePair` → 可拾補給。
- **預期：** 半日內可收；直接消最大流程風險。

### ② 效能檔與模擬解耦（對 R6-2）— **決定性本尊**

- **最小案：** `enemyAnimScale` 只影響 draw（bob／wobble），**不要乘進 `vx`**；`maxEnemies` 改為 run 開始鎖定或兩檔相同。
- quality 仍可砍：粒子、filter、動畫幀、道路密度、floating text。
- 回歸：同 seed 在 high／low（或 auto 模擬降檔）比敵座標序列／擊殺時序。
- **預期：** 半日～一日；換「裝置公平＋可重播」長期紅利。

### ③ 殘留清倉包（對 R6-3/4/6）— **半小時級 CP 極高**

- 快捷鍵 `/^[1-5]$/`（或依 `rewardIds.length` 動態）。
- SW／preload：確認 animation 路徑穩定後，**靜態 zombie 改非預取**或刪冗余（保留 code-sprite fallback）。
- 門標文案改「穿越取得」類；可選 wire `ROAD_DETAIL_ATLAS.density` 或刪死欄位。
- **預期：** 極小 diff、測試與體感立即乾淨。

**刻意不排進「最划算 3 步」：** 新敵動畫、非 land 景深加厚、filter bake（R6-5 有價值但比 ①② 貴且非流程風險）。可作 ①②③ 之後的第 4 步。

---

## 10. 與 Codex 宣稱對照（濃縮）

| 來源 | 宣稱 | R6 判定 |
|------|------|---------|
| R69 | 選單兩 CTA／基地展開 | **成立** |
| R69 | 門無 modal、穿越套用、不暫停 | **主路徑成立**；miss 狀態 **未言明且未測** |
| R69 | 補給不中斷五選一 | **成立**；鍵位 1–4 **未對齊五項** |
| R70 | 13 敵多幀、共享 tint、分級、+≈84KiB | **成立**（本輪量測 83,750 B） |
| R70 | 不改碰撞／數值／決定性邏輯 | **動畫路徑成立**；全專案決定性仍受 **quality→sway／cap** 約束 |
| R70 | 壓力不為 150+ 實體建 canvas | **成立**（每種一張） |

---

## 11. 監工簽署

| 項 | 內容 |
|----|------|
| 可否繼續疊功能 | **可以** — 建議先清 R6-1 再堆內容 |
| 可否對外講「R70 動畫已上」 | **可以** — 契約與授權站得住 |
| 是否建議立刻大重構 | **否** — 三步皆局部 |
| 本輪動作 | **只審不改**；產出本檔 `docs/GROK_REVIEW_ashes_R6.md` |

---

*本報告為對抗式健檢產物，不修改 `src/**`、測試或資產。*
