# 《灰燼護航》R66 視覺品質審核（Grok V1）

| 項目 | 內容 |
|------|------|
| 對象 | R66 視覺升級：Kenney 多層爆炸／五彈種視覺／路面細節／事件濾色 |
| 版本現況 | 程式標為 **R66**（`src/version.js:4`，`CACHE_VERSION` = `ashes-convoy-r66-v1`） |
| 姿態 | **視覺品質監工**：**只審不改**；給 PASS／缺口／優先建議、**檔案:行號** |
| 產出日 | 2026-07-13 |
| 讀取範圍 | `src/fx.js`、`src/config.js`（`FX`／`WEAPON_POWERUPS`）、`src/game.js` 繪製路徑、`scripts/test-visual-guards.js`、`docs/CODEX_RESPONSE_ashes_visual.md`、`CREDITS.md` |
| 約束 | 僅本檔；**不修改**遊戲程式碼／測試／其他文件 |
| 對照宣稱 | Codex 回覆：紋理合成爆炸、固定 tint cache、五彈種互異色形、路面疊層、沙塵／暗流濾色、Boss／低 HP overlay、reduced／low 降級 |
| 靜態 guard | `node scripts/test-visual-guards.js` → **PASS**（本輪已跑） |

### 評分尺標（宣傳截圖視角）

| 級別 | 意義 |
|------|------|
| **PASS** | 已達「可上架預覽」門檻，專業感合格或優於同價位 HTML5 |
| **P1** | 明顯拉低宣傳幀／實戰可讀性，下一輪應優先處理 |
| **P2** | 可辨識但未達 AAA 粒子／截圖打磨；補上 CP 高 |
| **P3** | 打磨項、維護債、邊界美學 |

### 總表

| # | 審核軸 | 結論 |
|---|--------|------|
| 1 | 爆炸合成時序與層次專業感 | **條件 PASS（P2）** — 規格與渲染管線正確；Boss 有節奏，雜兵「同幀堆疊」偏薄，池壓力下後層易被擠掉 |
| 2 | 彈種色彩 vs 敵彈區分度 | **條件 PASS（P1 一處）** — 五主彈種色形互異成立；**綠系友彈 × 敵酸液彈** 危險重疊 |
| 3 | 整體畫面缺什麼（截圖 CP） | 最划算三步：**敵人受擊可讀性**、**車體微細節／受損狀態**、**背景景深層** |

---

## 1. 爆炸合成時序與層次 — **條件 PASS（P2）**

### 1.1 架構是否專業

`DSFx`（`src/fx.js`）把**模擬**與**繪製**切開：固定粒子池、注入 `rng`／`dt`、`spawnKillBurst` 只寫狀態，渲染在 `game.js` 的 `drawFxParticle`。這是正確的產品級分層，不是「在 update 裡亂畫圓」。

| 能力 | 位置 | 評價 |
|------|------|------|
| 固定池 + free list | `fx.js:82–111`、`156–186` | PASS — 零逐幀配置 |
| 多段 delay | `p.delay` + `updateParticles`（`236–241`） | PASS — 可見性門檻清楚 |
| 擊殺多規格合成 | `spawnKillBurst`（`295–301`）讀 `FX.killBurst` | PASS — 資料驅動 |
| 紋理預 tint | `game.js:486–514` multiply + destination-in | PASS — 避開逐幀 filter |
| fire／flash additive | `drawFxParticle` lighter（`4001–4006`） | PASS — 高光層正確語意 |
| smoke 降 alpha | `0.48`（`4000`） | PASS — 避免煙糊死畫面 |
| reduced 關 flash 紋理 | `3993` | PASS — 與宣稱一致 |

Kenney 四層資產齊全（smoke／fire／debris／flash），`CREDITS.md` 記 CC0 來源；guard 強制三類 kill 至少含 flash＋debris＋smoke。

### 1.2 層次讀序（專業爆炸語彙）

規格意圖（`config.js:1509–1733`）：

| 種類 | 層序（spawn 順序） | 時序 | 語意 |
|------|-------------------|------|------|
| **zombie** | flash → debris → shard(無紋理) → smoke | **全 delay=0** | 血綠碎塊＋骨屑＋褐煙 |
| **mech** | flash → spark(無紋理) → smoke → debris | **全 delay=0** | 電火花＋黑煙＋鏽鐵片 |
| **boss** | flash＋fire → debris(`0.16`) → smoke(`0.34`) | **有節奏** | 閃→火→碎→煙 |

**繪製順序意外正確：** free list 為 LIFO、`forEachActive` 由低 index 畫到高 index → 後 spawn 的粒子較先畫（在下）、先 spawn 的 flash 較晚畫（在上）。實務結果約為 **smoke／後層在底、flash 在頂**，符合「additive 閃光蓋在煙火上」的常見做法，**不是亂序**。

`drawFxParticles` 在載具之後（`game.js:4643`），爆炸不會被車體吞掉，截圖主體仍清楚。

### 1.3 時序專業感 — 分數拆開看

**Boss：PASS（接近宣傳級）**

- `0`：大 flash（24–34→48）＋ fire 紋理 14 粒（`1656–1694`）
- `0.16s`：debris 二次爆裂
- `0.34s`：長壽命煙柱
- 另有 `drawBossKillFx` 環波＋頂底壓暗（`4389–4420`）與純表現 slow-mo 旗標
- 擊殺時 `burstCount = 3`（`game.js:1786–1789`）疊三套完整 boss 規格 → **重量感有**，但見 1.4 池風險

**雜兵 zombie／mech：P2（能讀、偏「同時灑花」）**

- 無 `delay`，視覺是 **單幀多形狀疊加**，不是「爆心 → 飛散 → 殘煙」三拍
- zombie **沒用 `fire` 紋理**（僅 boss 用）；guard 也不要求 fire → 合法但熱感弱
- mech 的 spark 層無紋理、靠 radial gradient（`4055–4099`），在 low／reduced 會退成實心圓 → 電弧感掉一截
- 命中 `hitSpark.layers`（flash 1 + debris 2，`1755–1792`）短促乾淨，**命中比雜兵死亡更「利落」** — 死亡反而略輸命中的節奏設計

### 1.4 會傷專業感的實作細節

| 議題 | 證據 | 影響 | 級別 |
|------|------|------|------|
| **線性 alpha** | `fx.js:263` `p.alpha = life/maxLife` | 閃光無「峰值停留」，全部等速淡出，少「爆心一滯」 | P2 |
| **池滿時砍後層** | `spawnBurstCore` freeCount 用完即 `break`；smoke 最後 spawn | 群殺時**最該留的煙常被先砍**，畫面變「碎屑無煙」廉價感 | P2 |
| **Boss ×3 全套** | `burstCount=3` 全規格重播 | 約 3×(2+14+12+8)=108 粒需求 > high 池 96 | 易糊、後段 delay 層不完整 | P2 |
| **無地面 scorch／殘留** | 粒子生命結束即回收，無 decal | 爆炸「浮在空中」，截圖缺少落地錨點 | P2 |
| **alpha 曲線無 hold** | 同上 | 與 Kenney 素材本身品質不匹配 — 素材夠，曲線偏遊戲 jam | P3 |

### 1.5 本軸結論

> **合成管線與 Boss 多段時序已達「有設計」等級；雜兵爆炸仍是同幀堆料。**  
> 宣傳若截 **Boss 擊殺瞬間** 可過關；若截 **清小怪高潮** 仍偏「粒子雨」而非電影分鏡。  
> **不阻擋 R66 上線**，但標為 **P2 打磨債**（優先：雜兵微 delay、池耗盡時保護 smoke／flash、可選 scorch decal）。

---

## 2. 彈種色彩與敵彈區分度 — **條件 PASS（P1 一處）**

### 2.1 友方彈種語言（宣稱對齊）

`WEAPON_POWERUPS.modes`（`config.js:822–871`）＋ `drawProjectile`／`traceWeaponShape`（`game.js:3782–3890`）：

| 彈種 | visual.id | shape | core | trail | 形狀語意 |
|------|-----------|-------|------|-------|----------|
| 標準 | standard | capsule | `#ffd36a` | `#d5963f` | 暖金膠囊 |
| 散射 | scatter（mode `spread`） | pellet | `#8fe388` | `#4f9a63` | 綠彈丸＋三點拖尾 |
| 裂片 | fracture | diamond | `#64ddff` | `#3b91c8` | 青鑽＋分叉尾 |
| 燼燃 | ember | flame | `#ff7a38` | `#b43c22` | 焰形＋尾焰圓 |
| 雷射 | laser | beam | `#f06cff` | `#a94fcc` | 洋紅長束 |
| （額外）追蹤 | homing | chevron | `#a9ff5f` | `#6cbe47` | 石灰 V 形＋弧尾 |

Guard 強制五主彈種 **core 色互異、shape 互異、trail≠core**（`test-visual-guards.js:44–53`）— **PASS**。  
HUD `dataset.weaponMode` 即時簽名（`ui.js:1489`）— **PASS**。  
彈種補給箱用 core 光暈＋迷你 shape（`drawWeaponPowerup`）— 拾取前可預讀，**PASS**。

### 2.2 敵彈現況

`drawEnemyProjectile`（`game.js:3686–3704`）**全種類共用一套**：

- 外暈 `rgba(95, 228, 120, 0.22)`
- 本體 `#5fe478`
- 描邊 `#142319`
- 高光 `#d8ff7a`
- 橢圓＋方向旋轉

`ash_screamer` 雖有 `projectileKind: "scream"`（`config.js:586`），**繪製不分流** — 尖叫彈與酸液彈同綠橢圓。

### 2.3 區分度矩陣（截圖／實戰）

| 友彈 | 與敵彈 `#5fe478` | 判定 |
|------|-----------------|------|
| standard 金 | 色相遠 | **安全** |
| laser 洋紅 | 色相遠 | **安全** |
| fracture 青 | 色相遠 | **安全** |
| ember 橙 | 色相遠 | **安全** |
| **scatter 綠 `#8fe388`** | **同綠帶，僅明度／飽和略差** | **P1 危險** |
| **homing 石灰 `#a9ff5f`** | **同綠帶，更亮更易混** | **P1 危險**（cycle 會抽到） |

補充：

- 形狀上敵彈是**橢圓彈頭**，scatter 是 pellet、homing 是 chevron — **靜止特寫可分**；**高速交會、多彈幕、沙塵黃濾色下** 色相優先於形狀，綠對綠仍會誤判。
- 友方曳光粒子 trail 色亦走彈種色（`game.js:302–311`）；scatter／homing 曳光進一步把綠「刷」進戰場，敵彈軌跡（短橢圓尾）可讀性被稀釋。
- zombie 死亡 debris 也是 `#6f8f3f` 系綠褐（`config.js:1542`）— 群殺時綠色通道更吵，**對 scatter 玩家不友善**。

### 2.4 本軸結論

> 五主彈種**彼此**區分設計合格，達 R66 宣稱。  
> **對敵彈的區分**被 **雙綠友彈（scatter／homing）** 破壞 — 這是宣傳圖「子彈滿天」時最傷可讀性的一刀。  
> **建議標 P1（僅色相）**：把 scatter／homing 移出敵彈綠帶（例如 scatter→琥珀褐、homing→ induct 白青），敵彈改 **毒紫／膿黃** 或依 `projectileKind` 分色，形狀可維持。成本低、截圖與操作同時受益。

---

## 3. 整體畫面還缺什麼 — 宣傳截圖標準的 3 個最划算下一步

### 3.1 已上線、截圖已加分的部分（不必重做）

| 項目 | 證據 | 截圖價值 |
|------|------|----------|
| Kenney 紋理爆炸 | `assets/fx/*` + tint cache | 高 |
| 路面胎痕／裂紋 | `drawRoadDetailOverlay` `3151–3198` | 中（近景可讀） |
| 事件濾色 | sandstorm 黃褐／undertow 冷藍 `4473–4508` | 中高 |
| vignette 分環境 | `FX.vignette` + `drawVignette` | 中 |
| Boss 入場暗角、低 HP 紅暈 | `bossArrival`／`lowHpPulse` | 敘事加分 |
| 載具陰影＋bob＋tilt＋後座 | `vehicleMotion`、recoil | 中 |
| 敵人陰影＋bob／squash | `drawEnemyEntity` | 中 |
| 受擊白閃＋knock 偏移 | `hitFlash` 0.12–0.16s、`knockback*` | 有但不夠 |

### 3.2 以「一張 App Store／商店預覽圖」為尺 — 仍弱的層

宣傳幀通常要同時交代：**英雄（車）→ 威脅（敵／敵彈）→ 爽感（擊中／爆炸）→ 世界（路＋景深）**。R66 把爽感粒子與路面微結構補上了；**英雄細節、受擊可讀、遠景層**仍是截圖最大空洞。

### 3.3 最划算三步（依 CP 排序）

#### ① 敵人受擊反饋升級（最高 CP）— 建議 **P1 產品優先**

**現況缺口**

- 白閃僅 `source-atop` 白半透 + 整隻 alpha 0.7（`3609–3613`、`4575`），時長 **0.12–0.16s**
- knockback 是位移偏移，**無受擊 pose／受擊色偏（彈種染色）**
- `spawnHitSpark` 已有 flash+debris 且可吃彈種 core 色（`2500`／`2590`）— **命中點有料，身體回饋偏薄**
- 截圖若停在「彈著但怪還在正常 walk bob」，觀者感覺不到 impakt

**最小高 CP 作法（仍屬視覺、可不碰數值）**

1. 受擊 2–3 幀 **squash 加劇**（沿彈道軸壓扁）+ 閃光改 **彈種 core 染色** 而非純白  
2. 命中瞬間 **短 rim light**（1px 色邊）  
3. 大體型／Boss 命中加 **1 顆方向性 hit streak**（已有 angle 參數）

**為何最划算：** 不需新美術檔；改 `drawEnemyEntity` + 延長 `hitFlash` 曲線即可讓每張戰鬥截圖「有打到」。比重畫背景 ROI 更高。

---

#### ② 車體微細節／受損可讀（英雄主體）— 建議 **P1 截圖優先**

**現況缺口**

- Raster 載具路徑**忽略** `opts.anim`（`3503–3522`）：`damage`／`wreck` 動畫名只服務 fallback sprite  
- 受擊僅 `globalAlpha *= 0.76`（`3515–3517`）— **沒有火花、沒有護甲缺口、沒有燈效**  
- 已有 exhaust 粒子層與 shadow（`vehicleMotion`）— 底座有了，**車本身仍是一張靜態 PNG**  
- 宣傳主體永遠是車：靜態 PNG + 粒子 = 「特效貼在貼圖上」，缺 AAA mobile 的 **主動視覺生命**

**最小高 CP 作法**

1. **車頭錐光／航行燈** 1–2 顆 soft circle（環境分色：land 暖、space 冷）  
2. HP 分帶 **程序 scorch／煙**（低 HP 時引擎位冒 dark smoke，重用 Kenney smoke tint）  
3. 開火時砲口已有 muzzle — 可加 **極短炮管 recoil 偏移**（邏輯座標不動，只 draw）

**為何划算：** 全程序或重用現有 smoke；不必重繪四車。截圖英雄立刻「活」與「有故事（殘破護航）」。

---

#### ③ 背景景深層（世界厚度）— 建議 **P2，但截圖差異大**

**現況缺口**

- 環境多為 **單層 scroll tile**（`drawRasterEnvironmentBackground` `3132–3147`）或 procedural 近景  
- land 有路側 wasteland tile + 路面細節，**缺中景剪影／遠景 haze 分帶**  
- space 有 parallax 星塵（`FX.environments.space`），land／sea／air **沒有同級景深**  
- 事件濾色是全屏 multiply 感 — 有氣氛，**不增加可讀的世界結構**

**最小高 CP 作法**

1. land：路外 **2 帶確定性剪影**（遠矮、中高），用現有 palette 色塊 + 低 alpha，scroll 倍率 0.15／0.4  
2. 垂直 **大氣梯度**（天際更灰、近處對比高）一條 linear gradient  
3. 與現有 `drawRoadDetailOverlay` 共存 — 近中遠三層敘事一次補齊

**為何划算：** 純 canvas 幾何／gradient，無新 PNG；商店圖「看起來像有關卡美術」而非「一條路貼圖」。  
**為何排第三：** 不直接提升操作可讀；①② 同時服務玩感與截圖，③ 偏行銷幀。

---

### 3.4 故意沒選進「三步」的項目（避免範圍膨脹）

| 項目 | 理由 |
|------|------|
| 重做全套載具／敵人 AI 圖 | 成本高；R66 瓶頸不在主貼圖解析度 |
| 粒子池擴到 256 | 治標；應先做 spawn 優先級（保 smoke／flash） |
| 全事件粒子化 | 現有濾色已夠辨識；ROI 低於 gre 友彈改色 |
| HUD 大改 | 已有 pop／weaponMode；非截圖主體 |

---

## 4. 交叉風險（視覺相關，非本輪主軸）

| 項 | 說明 | 級別 |
|----|------|------|
| 綠友彈 × 綠敵彈 × 沙塵黃濾 | 三色相擠在暖畫面，scatter 局最糟 | P1 |
| Boss 三套 burst × 96 池 | 煙層 delay 0.34 可能抽不到 | P2 |
| Raster 車無視 damage anim | 低血／受擊敘事斷層 | P2 |
| 敵彈不讀 `projectileKind` | 內容多樣性沒反映在畫面 | P3 |

---

## 5. 總評與放行建議

### 5.1 對 R66 宣稱的對照

| 宣稱 | 審核 |
|------|------|
| Kenney 多層爆炸 | **成立**；Boss 時序佳，雜兵偏同幀 |
| 五彈種視覺 | **彼此成立**；對敵彈有綠帶漏洞 |
| 路面細節 | **成立**（land + quality tier） |
| 事件濾色 | **成立**（sandstorm／undertow 等） |
| reduced／low 降級 | **成立**（guard + 程式路徑） |

### 5.2 一句話

> R66 把「特效素材與彈種語言」拉到可宣傳的地板以上；離「一張定裝截圖就想下載」還差 **受擊可讀、車體生命、景深** 三刀，外加 **友／敵綠彈分離** 這條可讀性必修。

### 5.3 放行

| 面向 | 建議 |
|------|------|
| 工程／宣稱對齊 | **可放行 R66**（guard PASS，無「宣稱未做」） |
| 視覺品質天花板 | **有條件通過** — 標 P1：綠彈區分 + 受擊升級；P2：車體微細節、景深、爆炸時序微延遲 |
| 下一迭代標籤建議 | **V1.1 可讀性**（彈色＋受擊）→ **V1.2 定裝截圖**（車燈／損傷煙＋land 景深） |

### 5.4 給實作端的最小順序（仍只建議、本輪不改碼）

1. **改 scatter／homing 或敵彈色相**（半日級）  
2. **受擊染色 + squash + 略延 hitFlash**（半日～一日）  
3. **低 HP 車體煙 + 錐光**（一日）  
4. **land 雙帶剪影 + 大氣梯度**（一日）  
5. **zombie／mech 給 0.05–0.12s 層間 delay；spawn 優先保 smoke**（半日）

---

*本報告為視覺品質監工文件，只審不改。對應實作版本：R66。*
