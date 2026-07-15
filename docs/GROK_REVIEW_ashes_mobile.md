# 《灰燼護航》R64 — 手機端體驗監工審核

| 項目 | 內容 |
|------|------|
| 對象 | https://mars-tw.github.io/ashes-convoy/（vanilla JS 直式射擊 PWA） |
| 版本 | **R64**（`src/version.js:4`，`CACHE_VERSION` = `ashes-convoy-r64-v1`） |
| 視角 | 手機玩家／單手直式可玩性 |
| 姿態 | **只審不改** |
| 產出日 | 2026-07-11 |
| 主要讀取 | `index.html`、`src/ui.js`、`src/game.js`、`src/fx.js`、`src/config.js`、`manifest.webmanifest`、`sw.js`、`offline.html` |
| 輔讀 | `docs/gdd.md`、`README.md`（對照宣稱的觸控語意） |

### 優先級定義

| 級別 | 意義 |
|------|------|
| **P0** | 單手主循環明顯受損、控制與文件宣稱嚴重不一致、低階機高風險掉幀且預設不易避開 |
| **P1** | 可玩但摩擦大：觸控目標／可讀性／安全區／效能降級不夠主動 |
| **P2** | 拋光、安裝體驗細節、邊界裝置與維護債 |

### 總覽（四軸）

| # | 軸 | 一句話 |
|---|----|--------|
| 1 | 觸控操作 | **拖曳＝瞄準＋自動射擊**；載具橫移在觸控上**幾乎無即時跟手**，與 README／GDD 宣稱有落差 |
| 2 | 效能 | 邏輯解析度低（195×422）有利；但 **R63+ 特效預設 full**、**`ctx.filter` 逐敵**、粒子／曳光／vignette 在低階機仍重 |
| 3 | UI 可讀性 | 主按鈕多達 44px；HUD 12px 偏緊；**部分次要控件 < 44px**；safe-area 主要只顧 top/bottom |
| 4 | PWA | `standalone` + portrait + 192/512 icon 齊；**缺 iOS meta**、icon `purpose` 合併、無安裝引導 |

---

## 1. Viewport 與觸控操作

### 1.1 Viewport / App Shell

| 觀察 | 位置 |
|------|------|
| `viewport-fit=cover`（可配合 notch） | `index.html:5` |
| 無 `maximum-scale`／`user-scalable=no`（可 pinch 放大整頁；a11y 友善，遊戲中偶發誤縮放） | `index.html:5` |
| App 以 **390:844** 直式 aspect 置中，`100svh` 限高 | `index.html:78–87` |
| Canvas CSS 全鋪、`touch-action: none` | `index.html:97–105` |
| `overscroll-behavior: none` 抑制橡皮筋 | `index.html:41` |

**結論：** 殼層是「手機直式優先、桌面信箱」設計，方向正確。

### 1.2 觸控操作方式（實作）

**不是虛擬搖桿，也不是螢幕邊緣按鈕開火。**

| 行為 | 實作 | 位置 |
|------|------|------|
| 輸入 | Pointer Events（`pointerdown/move/up/cancel`）+ `setPointerCapture` | `src/game.js:2815–2846` |
| 座標 | `getBoundingClientRect` 映射到邏輯座標 `W×H`（195×422） | `src/game.js:2807–2812` |
| 拖曳中 | `dragging=true`，只呼叫 `setAimFromPoint` | `src/game.js:2818–2829` |
| 瞄準 | 寫入 `vehicle.aimX` / `aimY`（aimY 夾在 `aimMinY` 與 `vehicle.y - 40`） | `src/game.js:2801–2805` |
| 開火 | 自動射擊；拖曳時射速倍率 1.0，**未拖曳時 interval ×1.35（變慢）** | `src/game.js:1873`、`1953` |
| 教學文案 | Canvas 內「**拖曳瞄準**」（前 2 秒） | `src/game.js:2931–2962` |
| 鍵盤 | ←/→ 直接改 `followX`；Esc 暫停 | `src/game.js:2847–2857` |

**載具橫移鏈（關鍵）：**

```2601:2607:src/game.js
    if (!state.input.dragging) {
      const followRate = Math.min(1, 0.018 * dt * 60);
      vehicle.followX += (vehicle.aimX - vehicle.followX) * followRate;
    }
    const targetX = rules.clamp(vehicle.followX, config.LOGIC.roadLeft + half, config.LOGIC.roadRight - half);
    vehicle.x += (targetX - vehicle.x) * Math.min(1, vehicleConfig.moveResponsiveness * 0.28 * movementMul * dt * 60);
```

- **拖曳中：`followX` 凍結**，載具不會跟手指左右走。
- **鬆手後：** `followX` 才以約 **1.8%/frame** 追 `aimX`，再被 `moveResponsiveness`（例如鐵鴉 `0.14`，`src/config.js:251`）二次阻尼。
- `setAimFromPoint` **從不寫 `followX`**（`src/game.js:2801–2805`）。

### 1.3 與產品宣稱的落差

| 來源 | 宣稱 |
|------|------|
| `docs/gdd.md:9` | 「單手可玩，**觸控移動與瞄準分離**」 |
| `README.md:12`、`:18` | 「移動與瞄準分離」「**拖曳控制載具與瞄準線**」 |
| 遊戲內教學 | 只寫「拖曳瞄準」（`src/game.js:2953`） |

**手機實感：** 單指拖曳主要是**瞄準＋提高射速**；橫向站位是「瞄完鬆手，載具慢慢爬過去」。這既不是經典「拖載具」、也不是清晰的「雙系統分離（移動區＋瞄準區）」。鍵盤有獨立橫移，觸控沒有對等物。

### 1.4 單手直式可玩性

| 優點 | 風險 |
|------|------|
| 自動開火，拇指示意負擔低 | 橫移跟手差 → 躲彈／對齊增益門困難 |
| 直式 390:844 殼層適合直握 | 瞄準點＝觸點 → **手指遮住準星與目標**（無 aim offset） |
| 補給／增益門改 modal 大鈕（見下） | 暫停在 **右上**（`index.html:1520`），大拇指難及；誤觸風險在頂部 HUD 區 |
| 瞄準輔助可調 | 未拖曳懲罰射速（`idleMul`）未在 UI 說明 |

### 1.5 觸控目標尺寸

| 控件 | 規格 | 位置 | 評語 |
|------|------|------|------|
| 全域 `button` | `min-height: 44px`、`touch-action: manipulation` | `index.html:51–62` | 符合常見 44pt 門檻 |
| HUD 暫停 | `min-width/height: 44px` | `index.html:194–198` | OK |
| 補給／增益選項 | `min-height: 68px` | `index.html:420–427` | 優秀 |
| 避難所 hotspot | **`min-height: 42px`**（主出勤 50px） | `index.html:1338–1386` | 略低於 44；e2e 只要求 ≥40（`scripts/test-e2e.js:185`） |
| 拖車操作鈕 | **`min-height: 38px`** | `index.html:558–562` | 偏小 |
| 抽屜關閉 | **`min-height: 36px`** | `index.html:1423–1426` | 偏小 |
| 系列外連 | **`min-height: 32px`** | `index.html:1226–1234` | 偏小 |
| 設定 select/input | **`min-height: 38px`** | `index.html:971–974` | 偏小 |
| 世界座標增益門 DOM 鈕 | CSS 有 112×68，但 UI **永遠 hidden 並清掉** | `index.html:328–342`；`src/ui.js:1248–1251` | 死碼路徑；實際走 overlay |

**增益門／補給：** `renderGateChoiceOverlay` / `renderSupplyChoice` 使用全螢幕 modal + 大鈕（`src/ui.js:1254–1348`），手機可點性良好。

---

## 2. 手機效能風險

### 2.1 Canvas 解析度與 `devicePixelRatio`

| 層 | 尺寸 | 位置 |
|----|------|------|
| 邏輯／世界 buffer | **195×422** | `src/config.js:12–13`；`src/game.js:324–328` |
| 顯示 canvas | **390×844** 固定 | `src/config.js:14–15`；`src/game.js:4423–4424`；`index.html:1507` |
| 每幀 blit | `worldCanvas` → `displayCtx` 2× 放大 | `src/game.js:4381–4383` |
| 精靈預渲 | `pixelRatio: 1` | `src/game.js:4429` |
| **避難所** canvas | 依 CSS × **dpr（cap 2）** 重設 | `src/ui.js:304–311` |

**結論：**

- 戰鬥管線**刻意不跟 `devicePixelRatio` 走**，固定低解析像素風 → 對低階 GPU 是**加分**（填色像素少）。
- 高 DPI 機只靠瀏覽器把 390 CSS px 放大到實體像素 → 顆粒感屬風格，非糊掉 UI DOM。
- **不對稱：** 避難所可吃到 2× dpr 成本；戰鬥不吃 dpr。審核上不算錯，但「全 app 效能模型」不一致。
- **無**依 FPS／dpr 動態降顯示解析（只有 gameplay quality 分級）。

### 2.2 R63+ 特效在低階機的負擔（預設路徑）

預設設定（`src/config.js:2502–2509`）：

- `fxLevel: "full"`
- `performanceMode: "auto"`
- `reducedFlash: false`（且 **設定頁無開關**，見 3.3）

| 成本源 | 行為 | 位置 |
|--------|------|------|
| 粒子池 high | `maxParticles: 96`、`emitRateMul: 1` | `src/config.js:1489–1491`；`src/fx.js:15–16` |
| 環境層＋排氣 | 每幀 `spawnEnvironmentLayer` | `src/game.js:262–276` |
| 子彈曳光 | 每發投射物 `spawnTrailPoint`（high: `trailEvery: 1`） | `src/game.js:278–287` |
| 擊殺爆發 | 多 shape 規格（zombie/mech/boss） | `src/config.js:1495+`；`src/game.js:1696–1699` |
| spark/ember | **`createRadialGradient` + `lighter`**（low/reduced 才退回實心圓） | `src/game.js:3742–3769` |
| vignette | full + quality high 才畫；radial fill 全畫面 | `src/game.js:4376–4379`、`3978–3995` |
| 砲口 | 可能雙重 `drawSprite` | `src/game.js:4250–4258` |
| 敵體 `ctx.filter` | 多數敵人帶 CSS filter 字串，**每隻每幀** `ctx.filter = …` | `src/game.js:3421`、`3445`、`3467`；`src/config.js` 多處 `filter:` |
| 上限 | 敵 72／彈 96／特效 90（high） | `src/config.js:2050–2064` |
| 雙 canvas + 常駐 rAF | 即使暫停仍 `requestAnimationFrame(loop)` 畫 | `src/game.js:4386–4397` |

**自動降載：** `updatePerformanceQuality`（`src/game.js:2740–2782`）

- FPS < 30 累計 **45 幀** → quality `low`（敵 54、特效 48、粒子 48、關 vignette…）
- FPS > 48 累計 **100 幀** → 回 high  
- 使用者可鎖 low（設定「效能模式」）

**風險敘事（低階 Android）：** 預設 full 開局先吃一波重特效 + `ctx.filter` 敵群，掉到 30 以下才慢慢切 low；中段 Boss 爆發／多重射時仍可能抖。避難所 dpr×場景是另一條 rAF（`src/ui.js:300–331`），與戰鬥不同時通常可接受。

### 2.3 已有的效能逃生口（正向）

- 設定：畫面特效 full/reduced/off、效能 auto/high/low（`index.html:1669–1690`；`src/ui.js:1835–1837`）
- low 路徑簡化 spark、關 vignette、降敵動畫 scale（`enemyAnimScale: 0.45`）
- 診斷列顯示 FPS／品質（`src/ui.js:1040+`；`index.html:1704–1706`）

---

## 3. 手機 UI 可讀性

### 3.1 HUD

| 元素 | 樣式 | 位置 |
|------|------|------|
| 整體位置 | top + `max(10px, safe-area-inset-top)` | `index.html:107–109` |
| 字級 | 預設 **12px**（`.stat-line`、`.pill`、`.mods`） | `index.html:148`、`189`、`205` |
| HP 條 | 高 7px（護盾 5px） | `index.html:152–170` |
| 字級設定 | body `font-small` 12px / `font-large` 15px 作用在 `.hud` 等 | `index.html:211–228`；`src/ui.js:79–83` |
| Canvas 內文 | 邏輯座標字號 6–15px 再 2× 顯示 | 例 `src/game.js:2869`、`2953` |

**手機實感：** 12px 次要資訊在戶外／老花族群偏緊；`font-large` 有幫到 DOM HUD，但 **Canvas 教學／COMBO／傷害字不受 fontSize 設定**。

### 3.2 Safe-area

| 有處理 | 位置 |
|--------|------|
| HUD top | `index.html:109` |
| 事件橫幅 top | `index.html:282` |
| 面板 bottom | `index.html:779` |
| 補給 overlay、拖車、hotspot | `index.html:376`、`494`、`1322` |
| meta summary / drawer | `index.html:1294`、`1399` |

| 缺口 |
|------|
| **幾乎不見 `safe-area-inset-left` / `right`**（橫向 inset、曲面、有殼瀏覽器） |
| App 左右固定 `10px`，窄機＋粗瀏海橫安全區可能貼邊 |
| `offline.html` viewport **無** `viewport-fit=cover`、無 safe-area（`offline.html:5`） |

### 3.3 可讀性／無障礙相關缺口

| 議題 | 說明 | 位置 |
|------|------|------|
| `reducedFlash` 無 UI | 程式多處尊重，設定頁只有震屏／特效等級 | `src/config.js:2502`；設定 DOM `index.html:1652–1674`；`src/ui.js:1025–1035` |
| 10px 輔助字 | 增益門／補給 `small`、overflow badge | `index.html:366`、`451`、`480` |
| 故事台詞 11px | 拖車日誌 | `index.html:634` |
| 手遮準星 | 準星畫在 aim 點，等於觸點正下方 | `src/game.js:2931–2951` |
| 字級設定範圍 | 主要 DOM；戰鬥 canvas 文案不跟 | `src/ui.js:79–83` |

---

## 4. PWA 安裝體驗

### 4.1 現況（正向）

| 項目 | 狀態 | 位置 |
|------|------|------|
| Manifest 連結（帶 `?v=R64`） | 有 | `index.html:7` |
| `display: standalone` | 有 | `manifest.webmanifest:8` |
| `orientation: portrait` | 有 | `manifest.webmanifest:9` |
| `theme_color` / `background_color` | `#111317` | manifest + `index.html:6` |
| Icons 192 / 512 | 檔案實際 192×192、512×512 | `manifest.webmanifest:12–25`；`assets/icons/` |
| `apple-touch-icon` | 192 | `index.html:8` |
| Service Worker + shell 快取 | 有 | `sw.js`；註冊 `src/ui.js:146–164` |
| 離線頁 | `offline.html` | `sw.js:7` |
| 更新提示／檢查更新 | 有 | `src/ui.js:108–184`；`index.html:1702` |

### 4.2 缺口

| 議題 | 說明 | 位置 |
|------|------|------|
| 無 `apple-mobile-web-app-capable` / `status-bar-style` | 舊 iOS「加到主畫面」全螢幕依賴較不完整；現今多吃 manifest，但仍是常見缺口 | `index.html` `<head>` |
| Icon `purpose: "any maskable"` 合併 | 規格建議 **any** 與 **maskable** 分開；合併可能被裁切或留白不理想 | `manifest.webmanifest:17`、`23` |
| 無 maskable 安全區美術驗證 | 審核未開圖量測 safe zone；需設計再確認 | icons |
| 無 `beforeinstallprompt`／安裝 CTA | 依賴瀏覽器預設選單，玩家不一定知道可安裝 | 全庫無 |
| `start_url` / `scope` 相對 `./` | GitHub Pages 子路徑可接受 | `manifest.webmanifest:6–7` |
| 離線頁體驗單薄 | 無返回主殼大鈕樣式、無 theme-color | `offline.html` |

---

## 5. P0–P2 清單（附檔案:行號）

### P0

| ID | 議題 | 證據 | 玩家影響 | 建議方向（只審不改） |
|----|------|------|----------|----------------------|
| **M-P0-1** | 觸控拖曳不驅動載具橫移；`followX` 僅在**非拖曳**時緩追 `aimX` | `src/game.js:2801–2805`、`2601–2607`、`2818–2829`；對照 `README.md:18`、`docs/gdd.md:9` | 單手難以即時走位躲彈／對門；與「拖曳控制載具」不符 | 拖曳時同步 `followX`（或下半部移動／上半部瞄準的分離區）；並統一教學文案 |
| **M-P0-2** | 預設 `fxLevel=full` + 逐敵 `ctx.filter` + 高配粒子／曳光 | `src/config.js:2508`、`1489–1491`；`src/game.js:3421`、`278–287`、`3742–3769` | 低階機開局與屍潮易掉幀；auto 降載需連續低 FPS 才切入 | 預設 reduced／依硬體探測；low 品質跳過 `ctx.filter`；濾鏡改預烘焙色版 |

### P1

| ID | 議題 | 證據 | 玩家影響 | 建議方向 |
|----|------|------|----------|----------|
| **M-P1-1** | 未拖曳射速 ×1.35，無 UI／教學說明 | `src/game.js:1873`、`1953`；教學僅 `2953` | 「鬆手歇一下」被懲罰；新手困惑 | 教學註記或改為不懲罰射速 |
| **M-P1-2** | 準星在觸點上，手指遮擋 | `src/game.js:2931–2951`、`2807–2812` | 精瞄門核／精英困難 | 觸點上方固定 Y offset 或虛擬準星 |
| **M-P1-3** | 多處互動 < 44px | hotspot `42` `index.html:1341`；拖車 `38` `:558–562`；關閉 `36` `:1424`；系列連 `32` `:1227`；設定控件 `38` `:971–974` | 誤點、難點 | 一律 ≥44 CSS px |
| **M-P1-4** | HUD／輔助字 10–12px 偏緊；Canvas 字不受 `fontSize` | `index.html:148`、`366`、`451`；`src/ui.js:79–83` | 小螢幕可讀性 | large 連動 canvas 比例或 HUD 下限 14px |
| **M-P1-5** | `reducedFlash` 有實作、無設定項 | 邏輯遍佈 `src/game.js`／`fx.js`；UI 無對應 `index.html:1642–1698` | 光敏／暈動玩家只能靠關特效近似 | 設定列「減少閃光」綁現有旗標 |
| **M-P1-6** | safe-area 缺 left/right；橫向 inset 弱 | 僅 top/bottom 例 `index.html:109`、`779`、`1322` | 異形屏左右裁切風險 | padding 納入 `env(safe-area-inset-left/right)` |
| **M-P1-7** | 自動品質切換偏慢／回升震盪 | `src/game.js:2760–2781`（45 low / 100 high） | 卡頓發生後才降；來回切體感不穩 | 縮短降載門檻；sticky low 至整波結束 |
| **M-P1-8** | 暫停鈕右上 + HUD 佔頂 | `index.html:107–114`、`1520` | 單手難按；頂部拖曳易心理負擔 | 可選左下／右下暫停熱區 |

### P2

| ID | 議題 | 證據 | 玩家影響 | 建議方向 |
|----|------|------|----------|----------|
| **M-P2-1** | iOS 全螢幕 meta 缺失 | `index.html:3–9` 無 `apple-mobile-web-app-*` | 部分 iOS 加主畫面仍帶 Safari 工具列 | 補 capable + status-bar-style |
| **M-P2-2** | Manifest icon `purpose` 合併 any+maskable | `manifest.webmanifest:17`、`23` | 桌面圖示裁切／遮罩不一致 | 拆成 any 與 maskable 兩套 |
| **M-P2-3** | 無安裝引導 | 無 `beforeinstallprompt` | 發現性差 | 設定頁「安裝到主畫面」說明 |
| **M-P2-4** | 世界座標 gate 按鈕層死碼 | `src/ui.js:1248–1251`；CSS `index.html:317–342` | 維護混淆 | 刪或真用其一 |
| **M-P2-5** | 戰鬥 canvas 不理 dpr（有意）vs 避難所 cap2 | `src/game.js:4423–4429` vs `src/ui.js:306` | 避難所較銳也較耗 | 文件化；低端 cap 1 |
| **M-P2-6** | `offline.html` 無 `viewport-fit`／theme | `offline.html:5–16` | 離線態略陽春 | 對齊主殼 |
| **M-P2-7** | 可 pinch 整頁縮放 | `index.html:5` | 誤觸雙指時版面飄 | 遊戲中鎖定或提示（注意 a11y 取捨） |
| **M-P2-8** | 常駐 rAF 在暫停時仍 draw | `src/game.js:4386–4397` | 背景分頁耗電（視瀏覽器節流） | pause 降頻或停 rAF |
| **M-P2-9** | 鍵盤有橫移、觸控無對等 affordance | `src/game.js:2853–2856` vs 觸控僅 aim | 跨平台操作模型分裂 | 觸控也暴露移動隱喻 |

---

## 6. 已做得好的地方（監工也該記）

1. **直式 app shell**（390:844 + `svh`）與 `touch-action` 分層清楚（canvas `none`、按鈕 `manipulation`）。
2. **邏輯低解析 + 顯示 2×** 像素管線，本質上對手機 GPU 友善。
3. **補給／增益門 modal 大觸控塊**（≥68px）與 overflow 標示，手機決策可讀。
4. **效能／特效設定 + auto 分級 + 診斷列**，給進階玩家逃生口。
5. **PWA 基礎建設完整**：manifest 版本 query、SW shell、更新檢查、portrait standalone。
6. **e2e／RWD 矩陣**對 hotspot 與溢出有守門（雖觸控高度門檻是 40 而非 44）。

---

## 7. 建議驗證劇本（真機，不改碼）

1. **iPhone 直式 Safari / 主畫面 standalone：** 單指按住左右甩——確認載具是否幾乎不動、鬆手後是否慢爬；對照教學「拖曳瞄準」。
2. **低階 Android（≤4GB / 舊 Mali）：** 預設 full 打到第 3–5 波與 Boss；觀察設定診斷 FPS 與是否掉到 low；再鎖「效能低＋特效精簡」對照。
3. **有瀏海機：** 出勤中 HUD／暫停是否進 safe-area；避難所底列 hotspot 是否被手勢條擋。
4. **Android Chrome 安裝：** 清單圖示裁切、standalone 是否真全螢幕、更新後是否出現「新版本可用」。
5. **單手通勤姿勢：** 右下拇指能否穩定完成「瞄門→選補給→暫停結束」全流程。

---

## 8. 結語

R64 的**殼層與 PWA 骨架**已明顯「手機優先」：直式比例、44px 級主按鈕、modal 選擇、SW 離線。真正卡住「灰燼護航是一支好上手的單手射擊」的，是 **觸控位移模型與文件／README 不一致（M-P0-1）**，以及 **預設完整特效 + canvas filter 敵群對低階機不友善（M-P0-2）**。

其餘多為可讀性下限、safe-area 左右、安裝拋光與死碼清理（P1–P2）。**本報告僅審不改**；修復優先建議：**先對齊觸控走位語意 → 再砍預設渲染成本 → 再補 44px／safe-area／reducedFlash UI／iOS PWA meta。**
