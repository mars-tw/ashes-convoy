# 《灰燼護航》監工快掃 — Form Factor：觸控誤套手機版面？

| 項目 | 內容 |
|------|------|
| 對象 | 本機 `doomsday-shooter`（vanilla JS 直式射擊 PWA） |
| 版本 | **R68**（`src/version.js`：`APP_VERSION = "R68"`） |
| 焦點 | 手機優化輪之後，是否存在「**偵測到觸控就套手機版面、不看視口**」bug |
| 關鍵情境 | 平板 touch **1024×768**、觸控筆電 touch **1920×1080** 會否誤套手機版面跑版 |
| 期望原則 | **版面由視口決定**；**觸控只影響目標大小／輸入語意** |
| 判定規則 | **純 CSS media query（寬高）→ PASS**；JS/UA/`pointer:coarse` 綁版面 → FAIL |
| 姿態 | **只審不改** |
| 產出日 | 2026-07-13 |
| 主要讀取 | `index.html`、`src/game.js`、`src/ui.js`、`src/audio.js`、`scripts/test-rwd-matrix.js`、`scripts/test-automation-guards.js`、`docs/CODEX_RESPONSE_ashes_mobile.md` |

---

## 總評

| 項目 | 結果 |
|------|------|
| **裁決** | **PASS** |
| **有無「觸控 ⇒ 手機版面」** | **無**。執行期沒有以 touch / `maxTouchPoints` / UA / `matchMedia('(pointer: coarse)')` 切版面 class 或 inline style。 |
| **版面決策** | **純 CSS `@media` 視口寬高**（外加 `prefers-reduced-motion` 僅動畫，不影響版型）。 |
| **觸控用途** | Pointer 輸入語意（準星 Y offset）、`touch-action`、全域按鈕最小高度（觸控目標）— **不改 form factor 版面樹**。 |
| 平板 1024×768 touch | **不會**因觸控誤套手機版面；走桌面／大視口 media。 |
| 觸控筆電 1920×1080 | **不會**因觸控誤套手機版面；走桌面 media。 |

近期手機輪（見 `docs/CODEX_RESPONSE_ashes_mobile.md`）強化的是：拖曳橫移、touch/pen 準星上移、44px 目標、safe-area、效能降檔 — **沒有引入「有觸控就當手機」的版面分支**。

---

## 1. 版面判斷條件一覽

### 1.1 執行期：零 JS form-factor 偵測

全專案（`src/**`、`index.html`、非 node_modules）搜尋：

| 訊號 | 執行期是否用於版面 |
|------|-------------------|
| `matchMedia` | **無** |
| `maxTouchPoints` / `ontouchstart` | **無**（`touchstart` 僅 `src/audio.js` 音效解鎖） |
| `pointer: coarse` / `hover: none` | **無**（CSS 與 JS 皆無） |
| `isMobile` / `hasTouch` / `userAgent` 裝置分支 | **無**執行期版面用途；僅 `scripts/test-rwd-matrix.js` Playwright context |
| `classList` 與裝置相關 | 僅 `font-small` / `font-large`、避難所 `is-illustration` / `is-shelter` / `is-fallback`、HUD `is-visible` / `is-reduced` — **皆非觸控／裝置型別** |

**結論：** 沒有「偵測到觸控 → 加 mobile class / 改 DOM 版面」路徑。

### 1.2 CSS media query（版面唯一來源）

全部定義在 `index.html` `<style>`：

| # | 條件 | 作用範圍 | 是否觸控相關 | 語意 |
|---|------|----------|--------------|------|
| A | 預設（無 query） | `.app` 以 `390/844` aspect 限於 `100vw`/`100svh`，`max-width: 820px`、`max-height: 1180px` | 否 | 產品殼層：直式手機比例信箱；**全裝置共用** |
| B | `@media (min-width: 860px)` | `.app` 改 `min(46vw, 520px)` 寬、加邊框 | 否 | **大視口**再收窄手機框 |
| C | `@media (min-width: 700px)` | `.panel` / `.garage-grid` 雙欄 / hotspot / meta-drawer 間距 | 否 | **≥700px 寬**較寬 UI |
| D | `@media (max-width: 430px), (max-height: 740px)` | 拖車 overlay：改單欄、房間區可捲 | 否 | **窄或矮視口**拖車緊湊（見 §3 邊界） |
| E | `@media (max-height: 500px)` | 拖車更矮：列高、肖像、padding 壓縮 | 否 | **極矮視口** |
| F | `@media (prefers-reduced-motion: reduce)` | HUD 數字彈跳動畫關閉 | 否 | 無障礙，非 form factor |

**無**下列常見誤傷模式：

```css
/* 本專案沒有這種寫法 */
@media (pointer: coarse) { /* 手機版面 */ }
@media (hover: none) { /* 手機版面 */ }
```

### 1.3 觸控相關、但**不是**版面切換

| 機制 | 位置 | 行為 | 是否改版面 |
|------|------|------|------------|
| `pointerType === "touch" \|\| "pen"` → aimY − 28 | `src/game.js` `setAimFromPoint` | 準星在指尖上方，防遮擋 | **否**（僅瞄準座標） |
| `followX = aimX` 於 pointer 拖曳 | 同上 + 移動同步 | 觸控／滑鼠共用 pointer 路徑 | **否** |
| 全域 `button { min-height: 44px; touch-action: manipulation }` | `index.html` | 全平台觸控目標門檻 | **否**（尺寸策略，非 mobile layout tree） |
| canvas / joystick 區 `touch-action: none`；面板 `pan-y` | `index.html` | 手勢與捲動語意 | **否** |
| `touchstart` + `pointerdown` 解鎖 AudioContext | `src/audio.js` | autoplay 政策 | **否** |
| 補給／增益選項 `min-height: 68px` 等 | CSS | 大觸控目標 | **否** |

與期望原則對齊：**觸控只影響輸入與目標大小，不決定版面 form factor。**

### 1.4 測試層（非執行期）

`scripts/test-rwd-matrix.js`：

```js
const isTouch = vp.kind === "mobile" || vp.kind === "landscape";
// Playwright: hasTouch / isMobile = isTouch
```

- 僅 **390×844、360×640、844×390** 開 `hasTouch`/`isMobile`。
- **1024×768、1920×1080** 標為 `desktop`，`hasTouch: false`。
- 因執行期不讀 touch 能力，此設定**不會**掩蓋「觸控誤套手機版面」；也**尚未**用「大視口 + hasTouch:true」做反誤傷回歸（建議見 §5，非本輪 FAIL）。

---

## 2. 情境矩陣：會否誤套手機版面？

此處「手機版面」指：因 **D**（拖車緊湊）或缺乏 **C**（≥700 寬面板）等 **mobile-oriented media** 而與大桌面不同；殼層 A 的 390:844 是產品設計，**不**算 bug。

| 裝置假設 | 視口 | 觸控 | Query 命中 | 誤因觸控套手機？ |
|----------|------|------|------------|------------------|
| 手機 | 390×844 | 有 | D 可能（寬≤430）；C 否；B 否 | 不適用（本來就是小視口） |
| 平板 | **1024×768** | **有** | B 是（≥860）；C 是（≥700）；D **否**（寬>430 且高 768>740）；E 否 | **否** — 與同解析無觸控桌面相同 |
| 觸控筆電 | **1920×1080** | **有** | B 是；C 是；D 否；E 否 | **否** — 桌面 media |
| 矮視窗筆電 | 1366×700 | 可有可無 | D **是**（高 700≤740） | **否** — 因**視口高度**，非觸控 |
| 橫向手機 | 844×390 | 有 | D 是（高≤740）；E 是（高≤500） | 視口合理 |

**直接回答使用者問題：**

1. **平板 touch 1024×768 → 不會誤套手機版面跑版**（相對同視口的非觸控裝置，CSS 結果相同）。
2. **觸控筆電 touch 1920×1080 → 不會誤套手機版面跑版**。

---

## 3. 非本 bug、但需知情的邊界

### 3.1 產品殼層永遠是「手機比例框」

`.app` 預設 `aspect-ratio: 390 / 844`，大螢幕左右／上下 letterbox。這是 **GDD／產品定位（直式射擊）**，不是「偵測到觸控才變手機」。觸控筆電與滑鼠桌面在同視口下殼層一致。

### 3.2 拖車緊湊：`max-height: 740px` 的 OR

```css
@media (max-width: 430px), (max-height: 740px) { /* 拖車單欄等 */ }
```

- **仍是視口條件**，符合「版面由視口決定」。
- 副作用：高度 ≤740 的**桌面視窗**（例如 1366×700、或瀏覽器 chrome 後 innerHeight 變矮）也會進入拖車緊湊，**與有無觸控無關**。
- 1024×768 平板 **剛好在 740 之上**，目前不會進 D；若未來改成 `max-height: 800` 才可能誤傷橫向平板，屬未來改動風險。

### 3.3 全域 44px 按鈕

手機輪把多數控件拉到 ≥44 CSS px，**桌面也套用**。這是觸控目標策略全站化，不是 mobile layout 誤套；桌面只會略「胖」一點，不改欄位／grid 結構。

### 3.4 效能 auto 與硬體

`deviceMemory` / `hardwareConcurrency` / Save-Data（手機輪 M-P0-2）只影響 **fx 品質分級**，**不**切 DOM 版面。

---

## 4. 修法建議

### 本輪裁決：**無需修 form-factor bug**

版面已符合：

- 視口 media query 決定結構與間距  
- 觸控只影響 aim offset、touch-action、最小點擊區  

若日後要**加固**（預防回歸，非修現有 FAIL）：

| 優先 | 建議 | 說明 |
|------|------|------|
| P2 | 維持禁令：禁止 `pointer: coarse` / `hover: none` / `maxTouchPoints` 綁 layout class | 文件化於 RWD 慣例或 automation guard 字串掃描 |
| P2 | RWD 矩陣加一組 **touch 大視口** | 例如 `1024×768` + `hasTouch: true`、`1920×1080` + `hasTouch: true`，assert 與無觸控同視口的 computed 關鍵規則（如 `.garage-grid` 欄數、`.trailer-room-body` display）一致 |
| P3 | 拖車 query 若再收緊高度門檻 | 優先 `max-width`；`max-height` 宜高於常見平板橫向短邊，或改 `(max-width: 430px) and (max-height: …)` 降低 OR 誤傷 |
| — | 勿為「桌面觸控」單獨做手機版面 | 繼續 pointer 事件統一；需要時用 `pointerType` 只調 aim／haptics |

**錯誤修法（避免）：** 以 `if (navigator.maxTouchPoints > 0) document.body.classList.add('mobile')` 當版面開關 — 正是本審要抓的反模式，平板與觸控筆電必炸。

---

## 5. 證據摘要（grep / 讀碼）

| 檢查 | 結果 |
|------|------|
| 執行期 `matchMedia` / `maxTouchPoints` / `pointer: coarse` / form-factor class | **0 命中**（除測試 Playwright 與音效 `touchstart`） |
| Layout `@media` | 僅寬／高 + reduced-motion（`index.html` 五處） |
| 觸控邏輯 | `game.js` pointerType Y-offset；CSS `touch-action` / `min-height: 44px` |
| 手機輪文件 | 修正輸入、目標、safe-area、效能；**未**描述 touch→layout 開關 |

---

## 6. 最終裁決

```
PASS — 純 CSS 視口 media query 決定版面；
       無「偵測觸控就套手機版面」bug；
       平板 touch 1024×768 與觸控筆電 1920×1080 不會因此誤套手機版面跑版。
```

**只審不改。** 本文件為監工快掃報告，未修改遊戲程式。
