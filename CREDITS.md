# 素材來源與致謝 / Asset provenance

本文件記錄《灰燼護航》目前入庫素材的來源、製作方式與第三方授權。專案程式碼採 [MIT License](LICENSE)；第三方素材仍依各自的 CC0 或工具授權，不因收錄於本 repo 而改變。

## `image_gen` 標註規則

本專案自行生成的正式圖像，不標成第三方素材。每一批 `image_gen` 交付至少要在本文件或對應 release 報告記錄：

1. 產出版本與工具名稱。
2. 最終遊戲檔案路徑，以及使用的角色／風格參考。
3. prompt 目的與重要限制的摘要。
4. 去背、裁切、縮放、調色與 atlas 打包方式。
5. 可重建母圖的 gitignored 保存位置，以及對應的製作／量測報告。

R71、R72 已依此格式標註。更早的專案自製圖像只保有 repo 歷史中的「AI 生成／圖生圖」紀錄，精確工具與完整 prompt 未全部保存；下方如實列出檔案範圍，不補寫無法驗證的資訊。

## R73 image-generated action atlases

- 工具：OpenAI built-in image generation（`image_gen`），以既有 walk atlas 為畫風／鏡位參考、既有高解析敵人圖為角色身分參考。
- 遊戲檔案：`assets/enemies/*_hurt.png`（每套 2 幀）與 `assets/enemies/*_death.png`（每套 3 幀），涵蓋 shambler、runner、bloater、spore spitter、shield husk、swarm mite、tar brute、void wraith、hive titan；共用外觀的變種沿用同一套 action atlas。
- Prompt 摘要：每張母圖固定一列六個獨立全身姿勢；前兩格為受擊反衝／恢復，後四格為屈膝／側摔／接地／最終倒地；禁止以同一姿勢平移、旋轉、縮放、擠壓或 bob 製造動畫。
- 背景與後製：平坦洋紅鍵色（void wraith 使用綠色），經 imagegen skill 的 `remove_chroma_key.py`（auto-key border、soft matte、despill）清理，再由 `scripts/build-r73-action-atlases.py` 以共同比例單次 Lanczos 下採樣到 walk frame 介面。
- 母圖：`tools/asset_sources/imagegen_r73/`（刻意 gitignored，不進 runtime cache）；生成提示、逐敵量測與驗收證據見 [R73 清償報告](docs/CODEX_RESPONSE_ashes_R73.md)。

## R72 image-generated production art

- 工具：OpenAI built-in image generation（`image_gen`），為本專案於 R72 產出，不是從外部素材網站下載。
- 遊戲檔案：`assets/ui/start.png`、`assets/cover.png`、`assets/vehicles/xi_gunner.png`；`assets/zombies/tar_brute.png`、`shield_husk.png`、`swarm_mite.png`；四幀 atlas `assets/enemies/tar_brute_walk.png`、`shield_husk_walk.png`、`swarm_mite_walk.png`；以及 R72 重新處理的 `assets/env/{land,air,sea,space}.png`。
- 角色參考：R71 `assets/shelter/trailer/base_escape_pod.png` 是熹的 canonical identity（短深棕髮、棕圍巾／披肩、深色長褲與靴）；砲手圖包含獨立 idle 與開火後座姿勢。
- 敵人參考：R71 遊蕩屍、疾奔屍、孢囊吐射者與 titan 建立 painterly-pixel 線條、暖灰燼低彩與體積光語言。
- 後製：高解析生成、平坦洋紅鍵色、soft matte／despill、alpha 清理、單次 Lanczos 下採樣；三種新敵人的四個獨立移動姿勢由 `scripts/build-r72-assets.py` 決定性打包。
- 母圖：`tools/asset_sources/imagegen_r72/`（刻意 gitignored，不進 runtime cache）。
- prompt、量測定義與製作限制：[R72 素材報告](docs/CODEX_RESPONSE_ashes_R72.md)。

## R71 image-generated production art

- 工具：OpenAI built-in image generation（`image_gen`），為本專案於 R71 產出。
- 遊戲檔案：`assets/shelter/trailer/base_escape_pod.png`；`assets/zombies/shambler.png`、`runner.png`、`spore_spitter.png`、`titan.png`；四幀 atlas 沿用既有 runtime 路徑 `assets/enemies/oga_shambler_walk.png`、`oga_runner_walk.png`、`oga_spitter_walk.png`、`titan_walk.png`。
- 角色參考：既有 `assets/story/xi.png` 提供熹的短深棕髮與棕圍巾／披肩；房間母圖只有一個熹。
- 後製：高解析生成、chroma-key 去背、透明邊清理、等比裁切／縮放，並透過 `scripts/build-cc0-assets.py` 輸出固定介面。`oga_` 檔名只為相容，內容不是 OpenGameArt 原圖。
- 母圖：`tools/asset_sources/imagegen_r71/`（刻意 gitignored）。
- prompt 與製作限制：[R71 美術報告](docs/CODEX_RESPONSE_ashes_R71.md)。

## R71 前的專案自製圖像

下列目前仍在 runtime 或 PWA 中的圖像由本專案早期 AI 生成／圖生圖與後製流程製作，沒有識別到外部第三方圖像來源：

- 載具與角色：`assets/vehicles/{land,air,sea,space,trailer}.png`、`assets/story/xi.png`。
- 基地背景：`assets/shelter/{snow,workshop,greenhouse,bunker}.png`。
- 拖車家具／故事物件：`assets/shelter/trailer/*.png` 中除 R71 房間母圖外的裝飾圖。
- 仍沿用的敵人主圖：`assets/zombies/bloater.png`、`void_wraith.png`；相應 `assets/enemies/bloater_walk.png`、`void_wraith_walk.png` 是可替換的既有 atlas 介面，不宣稱具有另繪的完整動作幀。
- PWA 圖示：`assets/icons/icon-192.png`、`assets/icons/icon-512.png`，由專案視覺衍生。

## Kenney Particle Pack

- 作者：Kenney Vleugels / [Kenney](https://kenney.nl/)
- 來源：[Particle Pack](https://kenney.nl/assets/particle-pack)，package version 1.1
- 授權：[Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/)
- 使用來源：`PNG (Transparent)/smoke_04.png`、`fire_01.png`、`dirt_02.png`、`star_07.png`
- 遊戲檔案：`assets/fx/kenney_smoke.png`、`kenney_fire.png`、`kenney_debris.png`、`kenney_flash.png`
- 修改：透明邊裁切、縮圖、廢土配色；runtime 色彩變體預先渲染到 offscreen canvas。

CC0 不要求署名；此處為來源追溯與致謝。

## Characters, Zombies, and Weapons. Oh My!

- 作者：Curt / [OpenGameArt](https://opengameart.org/)
- 來源：[Characters, Zombies, and Weapons. Oh My!](https://opengameart.org/content/characters-zombies-and-weapons-oh-my)
- 授權：[Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/)。來源頁目前標示為 CC0／public domain，無強制署名。
- 保存來源：`Bases&Assets.xcf`、`PartsSpriteSheetVersion1.zip`，保存在 gitignored `tools/asset_sources/` provenance archive。
- 歷史用途：正面 body、head、zombie arms／eyes／nose、hair 與三組腿腳姿勢曾用於 R70 以前的敵人 atlas。
- R72 現況：runtime 的 `oga_` 檔名內容已是 R71 專案生成圖，僅保留穩定路徑；目前沒有把 Curt 的角色圖層當成活動中的敵人主體。

## Kenney Top-Down Tanks packs

- 作者：Kenney Vleugels / [Kenney](https://kenney.nl/)
- 來源：[Top-Down Tanks](https://kenney.nl/assets/top-down-tanks)、[Top-down Tanks Remastered](https://kenney.nl/assets/top-down-tanks-remastered)
- 授權：[Creative Commons Zero (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/)，兩個下載包的 `license.txt` 亦載明 CC0。
- 保存來源：兩個完整 ZIP，保存在 gitignored `tools/asset_sources/` provenance archive。
- 使用 Remastered 來源：`barricadeMetal.png`、`barricadeWood.png`、`barrelRust_top.png`、`sandbagBrown.png`；歷史衍生另曾使用 `tracksLarge.png`、`tankBody_darkLarge.png`、`tankDark_barrel3.png`。
- 目前遊戲檔案：`assets/env/kenney_road_debris.png`。`assets/enemies/kenney_armored_brute_walk.png` 僅保留作來源／歷史參考，R72 不再作為敵人或離線快取內容。
- 修改：裁切、縮放、透明 atlas 打包與鏽褐調色；退役的裝甲衍生曾分層組合履帶、車體與砲管。

## 開發工具

- [Playwright](https://github.com/microsoft/playwright)（Apache-2.0）：`devDependency`，只用於 E2E／RWD 測試；實際版本與 transitive dependency 授權記錄於 `package-lock.json`。
- [Pillow](https://python-pillow.github.io/)（HPND）：選用的 Python 資產重建／量測工具；不隨遊戲發布，也不是 runtime dependency。

所有已識別的第三方遊戲素材均為 CC0／public-domain；本專案自願保留作者、來源、使用檔名與修改紀錄，以便重建與稽核。
