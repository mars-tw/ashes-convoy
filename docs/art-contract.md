# 美術與資產契約

本文件對齊目前灰燼護航的 AI key art、載具/殭屍圖像、避難所背景與 pixel matrix fallback。文件只描述資產與渲染契約，不改動實作。

## 資產來源

| 類型 | 路徑 | 用途 |
|---|---|---|
| 開始圖 | `assets/ui/start.png` | 首屏 key art |
| 載具 | `assets/vehicles/land.png` | `land_rig` |
| 載具 | `assets/vehicles/air.png` | `sky_barge` |
| 載具 | `assets/vehicles/sea.png` | `sea_ark` |
| 載具 | `assets/vehicles/space.png` | `void_runner` |
| 殭屍 | `assets/zombies/shambler.png` | `shambler` |
| 殭屍 | `assets/zombies/runner.png` | `runner` |
| 殭屍 | `assets/zombies/bloater.png` | `bloater` |
| 殭屍 | `assets/zombies/titan.png` | `boss_hive_titan` |
| 避難所 | `assets/shelter/snow.png` | 預設主題 |
| 避難所 | `assets/shelter/workshop.png` | 工作間主題 |
| 避難所 | `assets/shelter/greenhouse.png` | 溫室主題 |
| 避難所 | `assets/shelter/bunker.png` | 地堡主題 |

## 工程接點

| 檔案 | 職責 |
|---|---|
| `src/config.js` | 在 `VEHICLES` 與 `ENEMIES` 宣告 `spriteImage` 與 fallback `sprite` |
| `src/game.js` | 載入 PNG，載入失敗時改用 `DSSpriteRenderer` fallback |
| `src/ui.js` | 車庫縮圖優先使用載具 PNG |
| `src/sprites.js` | pixel matrix fallback、門、子彈、特效、地面與舊載具 sprite |
| `src/sprite-renderer.js` | 提供 `drawSprite`、`drawSpriteAnim` 與預渲染快取 |
| `src/shelter-scene.js` | 避難所主視覺與 hotspot 場景 |
| `scripts/test-sprites-contract.js` | 驗證 matrix sprite、palette、動畫與必要 key |

## 圖像契約

- PNG/JPG/WebP 類資產只透過 `assets/` 被引用，不內嵌 base64。
- `spriteImage` 是主要圖像；`sprite` 是 fallback 名稱，兩者都要存在或可合理降級。
- 新圖像不應破壞 390 x 844 手機版構圖；載具縮圖也需在車庫卡片內完整顯示。
- 透明背景載具與殭屍圖要保留主體可讀性，避免裁切輪廓。
- `reducedFlash` 開啟時，閃光、爆炸與避難所燈光效果需降低刺激。

## Pixel Matrix Fallback

Fallback 的目標不是取代 AI 圖，而是保證測試、離線載入與圖像失敗時遊戲仍可辨識。

必要 renderer API：

```js
preRenderSprites(options)
getSprite(name)
getSpriteFrame(name, frame)
measureSprite(name, scale)
drawSprite(ctx, name, frame, x, y, scale, options)
drawSpriteAnim(ctx, name, anim, timeMs, x, y, scale, options)
```

必要規則：

- palette 必須含透明 key `"."`。
- 每個 frame 高度等於 `h`，每列字元長度等於 `w`。
- `anims` 只能引用存在的 frame。
- `pivot` 與 `hitbox` 需為合理數值，供繪製與測試使用。

## 目前 fallback 清單

| 類型 | sprite |
|---|---|
| 載具 fallback | `vehicle_iron_crow`、`vehicle_dawn_skiff` |
| 敵人 fallback | `zombie_shambler`、`zombie_runner`、`zombie_bloater`、`boss_hive_titan` |
| 子彈 | `bullet_machine`、`bullet_pulse`、`bullet_rocket` |
| 門 | `gate_damage`、`gate_rate`、`gate_multishot`、`gate_repair` |
| 特效 | `effect_muzzle`、`effect_hit`、`effect_explosion_small`、`effect_shield` |
| 地形 | `tile_road`、`tile_wasteland`、`bg_ruins_strip` |

## 載具對應

| 載具 id | 主要圖像 | fallback | 備註 |
|---|---|---|---|
| `land_rig` | `assets/vehicles/land.png` | `vehicle_iron_crow` | 預設解鎖 |
| `sky_barge` | `assets/vehicles/air.png` | `vehicle_dawn_skiff` | 3 藍圖 |
| `sea_ark` | `assets/vehicles/sea.png` | `vehicle_iron_crow` | 3 藍圖 |
| `void_runner` | `assets/vehicles/space.png` | `vehicle_dawn_skiff` | 3 藍圖 |

## 敵人對應

| 敵人 id | 主要圖像 | fallback | 動畫語意 |
|---|---|---|---|
| `shambler` | `assets/zombies/shambler.png` | `zombie_shambler` | 慢速步行、受擊、死亡 |
| `runner` | `assets/zombies/runner.png` | `zombie_runner` | 快速步行、受擊、死亡 |
| `bloater` | `assets/zombies/bloater.png` | `zombie_bloater` | 步行、受擊、死亡爆裂 |
| `boss_hive_titan` | `assets/zombies/titan.png` | `boss_hive_titan` | 步行、攻擊、階段事件、死亡 |

## 避難所場景

避難所是局外主畫面，用於承載出擊、車庫、升級、成就牆與設定入口。場景可使用四張背景主題，但目前 meta 預設為 `snow`。

`src/shelter-scene.js` 對外提供：

```js
drawShelterScene(ctx, opts = {}) => sceneMetrics
SHELTER_HOTSPOTS
```

Hotspot 必須維持 0-1 正規化座標，讓 DOM 按鈕能跟著 `contentRect` 對齊，不直接綁死像素。

## 測試契約

`scripts/test-sprites-contract.js` 至少要守住：

- 必要 sprite key 存在。
- palette key 與 matrix 字元相容。
- frame 尺寸正確。
- animation frame 引用有效。
- 新增 AI 圖像不會移除 fallback sprite。

文件若新增資產說明，必須同步檢查 `assets/` 實際檔名與 `src/config.js` 的引用。
