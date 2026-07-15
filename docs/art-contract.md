# 美術與資產契約

本文件對齊目前灰燼護航的 AI key art、載具/殭屍圖像、避難所背景與 pixel matrix fallback。文件只描述資產與渲染契約，不改動實作。

## 資產來源

| 類型 | 路徑 | 用途 |
|---|---|---|
| 開始圖 | `assets/ui/start.png` | 首屏 key art |
| 封面圖 | `assets/cover.png` | GitHub / 分享用橫式 key art |
| 角色定裝 | `assets/vehicles/xi_gunner.png` | 熹的雙格 idle / fire 圖集 |
| 角色立繪 | `assets/story/xi.png` | 無線電日誌與早期角色識別參考 |
| 載具 | `assets/vehicles/land.png` | `land_rig` |
| 載具 | `assets/vehicles/air.png` | `sky_barge` |
| 載具 | `assets/vehicles/sea.png` | `sea_ark` |
| 載具 | `assets/vehicles/space.png` | `void_runner` |
| 拖車 | `assets/vehicles/trailer.png` | 出勤護送拖車 |
| 殭屍 | `assets/zombies/shambler.png` | `shambler` |
| 殭屍 | `assets/zombies/runner.png` | `runner` |
| 殭屍 | `assets/zombies/bloater.png` | `bloater` |
| 殭屍 | `assets/zombies/spore_spitter.png` | `spore_spitter` 與衍生變體 |
| 殭屍 | `assets/zombies/void_wraith.png` | `void_wraith` 與衍生變體 |
| 殭屍 | `assets/zombies/titan.png` | `boss_hive_titan` |
| 殭屍 | `assets/zombies/tar_brute.png` | `tar_brute` / `chain_tether` 靜態主圖 |
| 殭屍 | `assets/zombies/shield_husk.png` | `shield_husk` 靜態主圖 |
| 殭屍 | `assets/zombies/swarm_mite.png` | `swarm_mite` 靜態主圖 |
| 敵人動畫 | `assets/enemies/*_walk.png` | 4 格移動圖集；是否為獨立姿勢依各 release provenance，不以檔名推定 |
| 捲軸背景 | `assets/env/{land,air,sea,space}.png` | 780 x 1560 環境基底；Canvas 疊加遠／中／近景視差 |
| 路面裝飾 | `assets/env/kenney_road_debris.png` | Kenney CC0 路障／殘骸 atlas |
| 粒子材質 | `assets/fx/kenney_*.png` | Kenney CC0 煙、火、碎片與閃光 |
| 避難所 | `assets/shelter/snow.png` | 預設主題 |
| 避難所 | `assets/shelter/workshop.png` | 工作間主題 |
| 避難所 | `assets/shelter/greenhouse.png` | 溫室主題 |
| 避難所 | `assets/shelter/bunker.png` | 地堡主題 |
| 拖車房間 | `assets/shelter/trailer/base_escape_pod.png` | 熹的房間主圖 |
| 拖車物件 | `assets/shelter/trailer/*.png` | 家具、升級與故事裝飾 |
| PWA 圖示 | `assets/icons/icon-{192,512}.png` | 安裝與捷徑圖示 |

## 來源與標註

完整來源、第三方授權、使用檔名、修改方式與 `image_gen` 批次標註規則以 [`CREDITS.md`](../CREDITS.md) 為準。新增或替換資產時，必須同步更新該文件；無法確認的工具、prompt 或來源不得推測補寫。

R71／R72 的 prompt 摘要、母圖位置、後製與量測另見 [R71 美術報告](CODEX_RESPONSE_ashes_R71.md) 與 [R72 素材報告](CODEX_RESPONSE_ashes_R72.md)。第三方原包只保存在 gitignored `tools/asset_sources/`，runtime 僅收錄文件所列的衍生檔。

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
- 新敵人移動圖集固定為 4 格逐幀真姿勢；每格必須有肢體或身體接觸姿勢差異，不得只平移、縮放、旋轉或整圖晃動。
- 物理 root / collider 與視覺動畫分離。傷害只在碰撞／命中成立時結算；缺少專用 raster hurt / death 圖集時，必須使用具獨立姿勢的可替換 fallback 動畫，不得刪除受擊與死亡反應。

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
| `tar_brute` | `assets/zombies/tar_brute.png` + `assets/enemies/tar_brute_walk.png` | `zombie_bloater` | 4 格重步；受擊／死亡使用姿勢 fallback |
| `chain_tether` | `assets/zombies/tar_brute.png` + `assets/enemies/tar_brute_walk.png` | `zombie_bloater` | 共用 4 格重步；受擊／死亡使用姿勢 fallback |
| `shield_husk` | `assets/zombies/shield_husk.png` + `assets/enemies/shield_husk_walk.png` | `zombie_shambler` | 4 格盾步；受擊／死亡使用姿勢 fallback |
| `swarm_mite` | `assets/zombies/swarm_mite.png` + `assets/enemies/swarm_mite_walk.png` | `zombie_runner` | 4 格爬行；受擊／死亡使用姿勢 fallback |

## R72 首屏與環境契約

- `assets/ui/start.png` 固定 820 x 1728、上方約 18% 與下方約 22% 保留低資訊安全區，供標題、版本與 CTA 疊字。
- `assets/cover.png` 固定 1280 x 640，不烘焙文字或 logo。
- `assets/vehicles/xi_gunner.png` 固定 512 x 384，左右各 256 x 384；角色識別鎖定短深棕髮、棕圍巾、黑色裝甲與白色 V 胸徽。
- 四張環境基底固定 780 x 1560、各檔不超過 350 KB。`src/game.js` 以環境別的遠／中／近景、明暗與前景剪影補足視差；不得把單張背景上下平移宣稱為完整景深。

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
