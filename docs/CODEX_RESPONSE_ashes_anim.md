# 《灰燼護航》R70 動畫升級回應

本輪在不改碰撞、敵人數值、波次、掉落與決定性邏輯的前提下，把敵人渲染由單張 raster 升級為多幀 atlas，並以 CC0 裝甲／路障素材補強陸地戰場。未執行 git commit 或 push。

## 下載素材與授權

| 來源 | 下載檔 | 授權／用途 |
| --- | --- | --- |
| OpenGameArt — [Characters, Zombies, and Weapons. Oh My!](https://opengameart.org/content/characters-zombies-and-weapons-oh-my)（Curt） | `PartsSpriteSheetVersion1.zip`（395,727 B）、`Bases&Assets.xcf`（3,130,907 B） | 來源頁目前標示 CC0／public domain；使用 front body/head/zombie face/arms 與 3 組腿腳步態，組成 1-2-3-2 四幀敵人 atlas。包內舊 readme 早於作者後續 CC0 重新授權，CREDITS 已明記此沿革。 |
| Kenney — [Top-Down Tanks](https://kenney.nl/assets/top-down-tanks) | `kenney_top-down-tanks.zip`（360,093 B） | 包內 `license.txt` 為 CC0；保留作來源／比較。 |
| Kenney — [Top-down Tanks Remastered](https://kenney.nl/assets/top-down-tanks-remastered) | `kenney_top-down-tanks-remastered.zip`（1,567,419 B） | 包內 `License.txt` 為 CC0；使用履帶、車體、砲管、金屬／木路障、鏽桶與沙包。 |

來源頁 HTML、原始包、解壓內容與包內 license 全留在 gitignored `tools/asset_sources/`；實際來源、使用檔名、修改與連結已逐項寫入 `CREDITS.md`，README 亦新增素材授權摘要。所有列入遊戲的第三方素材均為 CC0，與 MIT 程式碼相容。

## 敵人動畫：前後差異

| 項目 | 升級前 | R70 後 |
| --- | --- | --- |
| 一般殭屍 | 每敵種一張靜態 PNG，加整體 bob／squash | `shambler`、`runner`、`spitter` 使用 OGA 三步態組成的四格透明 atlas；依實際 `vx/vy` 移動才換幀 |
| 變種／特殊敵 | 同一靜態圖以 filter/tint 區分 | bloater、shield、mite、wraith、titan 保留原輪廓，裁切縮放成四格姿勢 atlas；變種仍沿用既有 tint/filter，辨識與數值不變 |
| brute 類 | `tar_brute.png` 靜態肉盾 | `tar_brute`、`chain_tether` 改用 Kenney `tracksLarge + tankBody_darkLarge + tankDark_barrel3` 分層合成，四格含履帶位移／砲管後座 |
| 色調 | 每實體 draw 時套用部分 filter/tint | 每個敵種載入時只建一張共享 offscreen tint canvas，預渲染暖橘／鏽褐色；逐實體只裁切來源格與 drawImage |
| 面向 | raster 不翻面；code fallback 才翻面 | raster 與 fallback 都依橫向移動方向翻面 |
| 品質分級 | raster 單張 | high/full 使用 4 幀；reduced 使用 2 幀；low 固定 frame 0；靜止回 frame 0 |
| fallback | raster 載入失敗回 code sprite | 完整保留，並新增 e2e 缺 `assets/enemies/*.png` 的驗證 |

13 種現有敵人都具 `spriteAnimation` 契約；未修改半徑、visualWidth、HP、速度、接觸傷害、行為、生成或獎勵。共享 atlas/tint cache 不隨敵人實體數增加；逐實體動畫計算只有 `Math.hypot`、幀索引與一次裁切 draw，原本的 72/54 敵人上限與 96/48 粒子上限均未提高，壓力情況不會為 150+ 實體建立額外 canvas/image/cache。

## 場景強化

- 新增 `assets/env/kenney_road_debris.png`：金屬路障、木路障、鏽桶、沙包共四格透明 atlas。
- 僅在 land 路面邊緣以固定 scroll 公式低密度點綴；full 最多 4、low 最多 2 個可見，沒有碰撞、hazard、阻擋或亂數消耗。
- atlas 失敗時直接略過，原有程序式裂痕／胎痕／側邊殘骸仍是完整 fallback。

## 檔案預算

- 新增 runtime PNG：9 個敵人 atlas + 1 個道路 atlas，共 **83,750 bytes（約 81.8 KiB）**。
- vanilla web 專案沒有 `.pck`；實際 `assets/` 增量即上述 83,750 bytes，遠低於 1.5 MiB 預算。
- 原始下載與解壓包全在 `tools/asset_sources/`，受既有 `.gitignore` 的 `tools/` 規則排除。
- `scripts/build-cc0-assets.py` 可由保存的原始包重建全部衍生 PNG。

## 守門與測試

- 新增 `scripts/test-animation-assets.js`：檢查 13 種敵人皆有 2–4 幀契約、PNG 透明、atlas 寬高正確、warm tint、code-sprite fallback、SW 快取、Kenney 裝甲標記、道路密度與 1.5 MiB 預算。
- e2e 新增：實際 atlas/tint cache 載入、full 幀前進、向左翻面、low frame 0、brute 裝甲路徑、道路 atlas、動畫缺圖 fallback。
- `npm test`：PASS（含新 animation asset guard，10 個唯一 runtime PNG／83,750 B）。
- `npm run test:rwd`：PASS，27/27（desktop/tablet/mobile/landscape，三種 UI 狀態）。
- `npm run test:e2e`：最終程式與守門連續 3 輪 PASS；每輪含 4 viewport、影像／載具／敵人／環境 fallback、音訊與 service-worker offline。
- R70 同步：`src/version.js`、config fallback、HTML query/boot guard、SW cache、scripts 斷言均為 R70 / `ashes-convoy-r70-v1`。排除前一版歷史回應與 review 輸入文件後，tracked runtime／scripts 舊版 release token grep 為 0。
- `git diff --check`：PASS；HEAD 維持 `2bff8e8`，未 commit、未 push。
