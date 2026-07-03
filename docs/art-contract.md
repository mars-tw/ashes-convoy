# 美術/遊戲分工契約

這份文件是美術 Codex 與遊戲 Codex 的平行開發邊界。任何一方需要改動對方擁有的檔案時，必須先更新本契約或取得製作人確認。

## 核心原則

- 正式美術只能來自程式定義的 pixel matrix + 調色盤。
- 不使用外部圖片、二進位圖檔、SVG 插圖、emoji、網路資源。
- sprite 定義不可讀 DOM，不可依賴瀏覽器事件。
- 遊戲規則不可直接解析 pixel matrix，只能透過渲染 API 使用 sprite。
- sprite 尺寸、幀名、錨點、碰撞盒是雙方共用契約，改動必須同步測試。

## 檔案位置與責任

| 檔案 | 擁有者 | 用途 |
|---|---|---|
| `src/sprites.js` | 美術 Codex | 定義 `PALETTES`、`SPRITES`、`SPRITE_SPECS`，不得包含遊戲規則。 |
| `src/sprite-renderer.js` | 美術 Codex | 提供預渲染快取與 `drawSprite` 類 API。 |
| `scripts/test-sprites-contract.js` | 美術 Codex | 驗證 matrix 尺寸、palette key、動畫幀命名。 |
| `src/config.js` | 遊戲 Codex | 數值表、載具、敵人、增益門、波次設定。 |
| `src/rules.js` | 遊戲 Codex | 純函式規則、傷害、波次、結算、存檔遷移。 |
| `src/game.js` | 遊戲 Codex | Canvas 遊戲迴圈、輸入、物件生命週期。 |
| `src/ui.js` | 遊戲 Codex | HUD、車庫、結算、設定與 DOM UI。 |
| `index.html` | 遊戲 Codex | 頁面結構、載入順序、Canvas 容器。 |
| `docs/art-contract.md` | 製作人 Codex | 契約本身。美術與遊戲 Codex 不自行改。 |

## 匯出格式

`src/sprites.js` 必須同時支援瀏覽器全域與 Node 測試。

```js
const PALETTES = { /* ... */ };
const SPRITES = { /* ... */ };
const SPRITE_SPECS = { /* ... */ };

const DSSprites = { PALETTES, SPRITES, SPRITE_SPECS };

if (typeof window !== "undefined") window.DSSprites = DSSprites;
if (typeof module !== "undefined" && module.exports) module.exports = DSSprites;
```

`src/sprite-renderer.js` 必須匯出：

```js
function preRenderSprites(options)
function getSprite(name)
function getSpriteFrame(name, frame)
function measureSprite(name, scale)
function drawSprite(ctx, name, frame, x, y, scale, options)
function drawSpriteAnim(ctx, name, anim, timeMs, x, y, scale, options)
```

同樣支援：

```js
const DSSpriteRenderer = {
  preRenderSprites,
  getSprite,
  getSpriteFrame,
  measureSprite,
  drawSprite,
  drawSpriteAnim
};

if (typeof window !== "undefined") window.DSSpriteRenderer = DSSpriteRenderer;
if (typeof module !== "undefined" && module.exports) module.exports = DSSpriteRenderer;
```

## Palette 格式

palette key 使用單一字元。`.` 永遠代表透明，不可覆寫。

```js
const PALETTES = {
  zombie: {
    ".": null,
    "A": "#1f2a22",
    "B": "#3f6b3f",
    "C": "#8ac26f",
    "D": "#d6f5a3",
    "E": "#5b1f2a"
  },
  metal: {
    ".": null,
    "A": "#15191f",
    "B": "#38414a",
    "C": "#7f8b96",
    "D": "#d8e0e7",
    "E": "#ffcc66"
  }
};
```

規則：

- matrix 內每個字元都必須存在於指定 palette。
- 色碼使用 6 位 hex 或 `null`。
- 不允許 CSS 變數、漸層或 Canvas filter 作為正式 sprite 色彩。
- palette 可依 sprite 類型拆分，但同一 sprite 的所有幀必須使用同一 palette，除非在 `variants` 明確聲明。

## Sprite 格式

```js
const SPRITES = {
  zombie_shambler: {
    id: "zombie_shambler",
    type: "enemy",
    palette: "zombie",
    w: 16,
    h: 16,
    pivot: { x: 8, y: 14 },
    hitbox: { x: 3, y: 3, w: 10, h: 12 },
    frames: {
      walk_0: [
        "................",
        "................",
        "................",
        "................",
        "................",
        "......BB........",
        ".....BCCC.......",
        ".....BCCB.......",
        "......DD........",
        ".....BEEB.......",
        ".....B..B.......",
        "....BB..BB......",
        "....B....B......",
        "....B....B......",
        "................",
        "................"
      ],
      walk_1: [
        "................",
        "................",
        "................",
        "................",
        "................",
        "......BB........",
        "....BCCCC.......",
        ".....BCCB.......",
        "......DD........",
        ".....BEEB.......",
        "....BB..B.......",
        "....B...BB......",
        "....B.....B.....",
        ".....B....B.....",
        "................",
        "................"
      ]
    },
    anims: {
      idle: { frames: ["walk_0"], fps: 1, loop: true },
      walk: { frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true },
      hit: { frames: ["hit_0"], fps: 1, loop: false },
      death: { frames: ["death_0", "death_1", "death_2"], fps: 10, loop: false }
    },
    tags: ["stage1", "enemy"]
  }
};
```

規則：

- 每個 frame 都是 `h` 行字串。
- 每行字串長度必須等於 `w`。
- frame name 使用 `狀態_序號`，序號從 0 開始。
- 必要動畫名使用英文小寫：`idle`、`move`、`walk`、`attack`、`hit`、`death`、`damage`、`open`、`break`。
- `pivot` 是繪製錨點，遊戲端以此對齊物件座標。
- `hitbox` 供 debug 與測試，不等於實際碰撞規則；實際碰撞仍由遊戲規則控制。
- `tags` 用於測試與美術檢查，不用於核心規則。

## 渲染 API 詳細簽名

```js
preRenderSprites({
  pixelRatio = 1,
  smoothing = false,
  names = null
} = {}) => { cache, count }
```

- 由美術 renderer 提供。
- 將 matrix 依 palette 畫到 offscreen canvas 或一般 canvas fallback。
- 必須設定 `imageSmoothingEnabled = false`。

```js
getSprite(name) => sprite
getSpriteFrame(name, frame) => { canvas, w, h, pivot, hitbox }
measureSprite(name, scale = 1) => { w, h, pivot, hitbox }
```

- 找不到 sprite 或 frame 時要丟出明確錯誤，方便測試抓問題。

```js
drawSprite(ctx, name, frame, x, y, scale = 1, options = {}) => void
```

`options`：

```js
{
  flipX: false,
  flipY: false,
  rotation: 0,
  alpha: 1,
  origin: "pivot",
  tint: null,
  debug: false
}
```

```js
drawSpriteAnim(ctx, name, anim, timeMs, x, y, scale = 1, options = {}) => frameName
```

- 依 `anims[anim].fps` 與 `loop` 決定 frame。
- 回傳實際繪製的 frame name，方便 E2E 或 debug 顯示。

## 尺寸規格表

### 喪屍

| sprite | 邏輯尺寸 | 必要動畫 | 幀數 | Stage |
|---|---:|---|---:|---:|
| `zombie_shambler` | 16 x 16 | idle、walk、hit、death | 1、4、1、3 | 1 |
| `zombie_runner` | 16 x 16 | idle、walk、hit、death | 1、4、1、3 | 1 |
| `zombie_bloater` | 24 x 24 | idle、walk、hit、death、burst | 1、4、1、4、4 | 1 |
| `zombie_armored` | 20 x 20 | idle、walk、hit、death | 1、4、1、3 | 2 |
| `zombie_leaper` | 16 x 24 | idle、walk、jump、attack、death | 1、4、3、2、3 | 2 |
| `zombie_howler` | 20 x 20 | idle、walk、howl、hit、death | 1、4、4、1、3 | 2 |
| `boss_hive_titan` | 48 x 48 | idle、walk、attack、rage、hit、death | 1、6、4、3、1、5 | 1 |

### 載具

| sprite | 邏輯尺寸 | 必要動畫 | 幀數 | Stage |
|---|---:|---|---:|---:|
| `vehicle_iron_crow` | 64 x 36 | idle、move、damage、wreck | 2、4、2、3 | 1 |
| `vehicle_dawn_skiff` | 48 x 48 | idle、move、damage、wreck | 4、4、2、3 | 1 |
| `vehicle_rift_hauler` | 72 x 36 | idle、move、damage、wreck | 2、4、2、3 | 2 |
| `vehicle_frost_wing` | 56 x 48 | idle、move、shield、damage、wreck | 4、4、3、2、3 | 2 |

### 子彈與特效

| sprite | 邏輯尺寸 | 必要動畫 | 幀數 | Stage |
|---|---:|---|---:|---:|
| `bullet_machine` | 8 x 8 | move | 2 | 1 |
| `bullet_pulse` | 8 x 8 | move | 2 | 1 |
| `bullet_rocket` | 12 x 8 | move | 2 | 1 |
| `effect_muzzle` | 16 x 16 | burst | 3 | 1 |
| `effect_hit` | 16 x 16 | burst | 3 | 1 |
| `effect_explosion_small` | 24 x 24 | burst | 5 | 1 |
| `effect_shield` | 32 x 32 | pulse | 4 | 1 |
| `effect_arc` | 24 x 8 | pulse | 3 | 2 |
| `effect_freeze` | 24 x 24 | pulse | 4 | 2 |

### 增益門與背景

| sprite | 邏輯尺寸 | 必要動畫 | 幀數 | Stage |
|---|---:|---|---:|---:|
| `gate_damage` | 32 x 48 | idle、break | 4、4 | 1 |
| `gate_rate` | 32 x 48 | idle、break | 4、4 | 1 |
| `gate_multishot` | 32 x 48 | idle、break | 4、4 | 1 |
| `gate_repair` | 32 x 48 | idle、break | 4、4 | 1 |
| `tile_road` | 32 x 32 | idle | 1 | 1 |
| `tile_wasteland` | 32 x 32 | idle | 1 | 1 |
| `bg_ruins_strip` | 128 x 32 | scroll | 1 | 1 |
| `bg_cloud_strip` | 128 x 32 | scroll | 2 | 2 |

## 遊戲端取用方式

遊戲 Codex 在 `src/game.js` 中只能透過 renderer API 取用 sprite。

```js
const frame = window.DSSpriteRenderer.drawSpriteAnim(
  ctx,
  enemy.sprite,
  enemy.anim,
  nowMs,
  enemy.x,
  enemy.y,
  enemy.scale,
  { flipX: enemy.vx < 0, alpha: enemy.alpha }
);
```

遊戲端不得：

- 直接讀取 `SPRITES[name].frames` 來做規則判斷。
- 依 palette 顏色推導碰撞或陣營。
- 修改 `SPRITES` 或 `PALETTES`。
- 在遊戲規則中硬編 frame name，除非該 frame name 已列入本契約。

## 測試要求

`scripts/test-sprites-contract.js` 至少驗證：

- 每個 sprite 的 `id` 與 key 一致。
- `palette` 存在。
- 每個 frame 行數等於 `h`。
- 每行長度等於 `w`。
- 每個 matrix 字元都存在於 palette。
- `anims` 引用的 frame 都存在。
- Stage 1 必要 sprite 全部存在。
- `pivot` 與 `hitbox` 在尺寸範圍內。

Playwright E2E 至少驗證：

- Canvas 有非空像素。
- Stage 1 載具、喪屍、Boss、增益門都有被繪製。
- 手機與桌機縮放後 sprite 不模糊，`imageSmoothingEnabled` 為 false。

## 平行工作線

### 美術 Codex 可碰檔案

- `src/sprites.js`
- `src/sprite-renderer.js`
- `scripts/test-sprites-contract.js`
- 後續若需要：`references/art-notes.md`

### 遊戲 Codex 可碰檔案

- `index.html`
- `src/config.js`
- `src/rules.js`
- `src/game.js`
- `src/ui.js`
- `scripts/test-config.js`
- `scripts/test-rules.js`
- `scripts/test-economy.js`
- `scripts/test-storage.js`
- `scripts/test-e2e.js`

### 不可同時碰的檔案

- `docs/art-contract.md` 只能由製作人 Codex 改。
- `README.md` 若需要雙方更新，先由提出方新增段落，再請製作人整併。
- `.github/workflows/ci.yml` 只能由製作人或總稽核改，避免測試門檻被工作線自行放寬。
