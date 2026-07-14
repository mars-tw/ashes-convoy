# 《灰燼護航》R71 美術回饋修正

三項玩家回饋已全修；戰鬥數值、敵人行為、掉落、波次、RNG 與粒子池上限未改。本回合未執行 `git commit`／`git push`；工作期間外部程序將主變更提交並同步為 `1a48662`，目前僅本回應文件的末次校正維持未提交。

## 交付

### 1. 熹的拖車房間

- 以內建 `image_gen` 產出 `1164×1351` 高解析母圖，再以單次 Lanczos 等比裁切縮至既有 `780×900` 接口：`assets/shelter/trailer/base_escape_pod.png`。
- 場景包含壁爐、厚毯、罐頭架、油燈與雨夜廢墟窗景；只有一個清晰的熹，髮色與棕色圍巾／披肩沿用 `assets/story/xi.png` 人設。
- `src/shelter-scene.js` 移除第二張熹立繪與 `characterAnchor` 疊畫；room metrics 固定回報 `characterCount: 1`、`characterEmbedded: true`。
- 保留 `fitContain`，未拉伸；E2E 鎖定顯示比 `780/900`。實機檢查 `390×844` 與 `1366×700`，人物清晰、構圖完整；RWD 的 9 個視口皆無頁面捲動或水平溢位。

### 2. land 沙塵暴舒適度

- 移除每 22px 的高頻亮線與黃色高飽和覆蓋，改成低彩度棕灰薄幕、7 條以下寬柔流帶與 14 顆以下稀疏橢圓塵粒；位置連續流動，不取樣噪點。
- 對比 alpha 固定，無週期閃爍：診斷 `sandstormFlickerHz = 0`；色彩強度診斷 `sandstormSaturation = 0.42`。
- `reduced` 或 `reducedFlash`：強度精確乘 `0.5` 且流動元素減量；`low`：再乘 `0.65` 且只留 3 帶／6 粒；`off` 僅留最弱靜態氣氛。
- 未改 `visibilityLoss`、事件機率、獎勵、波次或任何玩法 state。E2E 連續取樣確認 full 強度不跳動，並驗證 full/reduced/low 分級。

### 3. 常見敵人與 titan

以高解析去背母圖更新三個常見敵人與 Boss，靜態尺寸、碰撞半徑、scale、FPS 與既有 4 幀消費接口均不改；舊 `oga_*` 檔名只為避免破壞 runtime 路徑。

| 級別 | 角色 | 靜態圖 | 4 幀 atlas |
|---|---|---|---|
| 普通 | 遊蕩屍 | `assets/zombies/shambler.png` `160×249` | `assets/enemies/oga_shambler_walk.png` `160×40` |
| 快速普通 | 疾奔屍 | `assets/zombies/runner.png` `160×242` | `assets/enemies/oga_runner_walk.png` `160×40` |
| 菁英讀色 | 孢囊吐射者 | `assets/zombies/spore_spitter.png` `160×240` | `assets/enemies/oga_spitter_walk.png` `160×40` |
| Boss | 母巢巨屍 titan | `assets/zombies/titan.png` `256×234` | `assets/enemies/titan_walk.png` `352×80` |

威脅配色依序為灰綠低彩度／鐵鏽橙動勢／毒黃核心／暗紅骨甲＋熔金核心。`scripts/build-cc0-assets.py` 現會從 gitignored 高解析母圖重建上述靜態圖、房間與 4 幀 atlas；full/reduced/low 仍分別使用 4/2/1 幀。

## image_gen prompt set

使用內建 `image_gen`，未使用 CLI/API fallback。

- 房間：Image 1 為舊房間的像素風格／構圖參照，Image 2 為熹的人設參照；「溫馨末世拖車房間，壁爐、毯子、罐頭架、油燈，13:15 portrait，高解析 crisp pixel art；整張圖恰好一個人且只能是熹；短深棕髮、棕色圍巾披肩與深棕長褲一致；窗外無人物／殭屍／人形剪影；無睡眠人物、相片人物、重影、模糊、文字或浮水印」。
- 遊蕩屍：舊圖僅作身份／輪廓參照；「單一正面全身、沉重垂臂、灰綠皮膚、破工作服、普通威脅低彩度、清楚手腳分離、crisp pixel art、純 `#00ff00` 無影 chroma 背景」。
- 疾奔屍：舊圖僅作身份／前傾輪廓參照；「單一正面全身衝刺、非對稱長臂、鐵鏽橙布條與較亮琥珀眼、比遊蕩屍更銳利但低於菁英、純 `#00ff00` 無影 chroma 背景」。
- 孢囊吐射者：舊圖僅作身份／胸囊參照；「單一全身菁英、厚重駝背、清楚圓形分節胸部孢囊、苔綠／骨米色／毒黃核心、縮到 40×40 仍可辨、純 `#ff00ff` 無影 chroma 背景」。
- titan：舊圖僅作母巢身份／體量參照；「單一全身 Boss、極寬肩、分離巨爪、厚腿、冠狀背刺、暗紅骨甲與熔金蜂巢核心，大塊面高細節而不成噪點、純 `#ff00ff` 無影 chroma 背景」。

四個敵人母圖以技能內建 chroma-key helper 去背（soft matte、despill、edge contract 1），角落 alpha 均為 0；房間四角 alpha 均為 255。

## R71 同步與護欄

- `src/version.js`、config fallback、HTML manifest/icon/script query、boot reload key、SW app shell/cache、測試名稱與斷言均同步為 `R71` / `ashes-convoy-r71-v1`。
- active runtime 範圍 `index.html sw.js manifest.webmanifest README.md CREDITS.md src/** scripts/**` 的前版大小寫 token grep = `0`；歷史回應／review 文件保留當時版本記錄。
- 新增護欄：單一熹、房間 `780×900` 與等比顯示、高細節靜態圖尺寸、4 幀 atlas、沙暴 0 Hz／低彩度／soft flow、reduced/low 分級。

## 驗證

最終矩陣連跑 3 輪全綠：

- `npm test` ×3：config、automation、visual、animation assets、rules、supply、economy、storage、sprite contract、FX、audio 全 PASS；14 個動畫／重製靜態檔共 `367881` bytes，低於 1.5 MiB 上限。
- `npm run test:rwd` ×3：shelter／ops drawer／trailer room，`1920×1080` 至 `360×640` 與 `844×390` 共 9 視口全 PASS，頁捲與橫溢皆 0。
- `npm run test:e2e` ×3：`390×844`、`820×1180`、`1280×900`、`1366×700`，image/vehicle/zombie/environment fallback、audio、service-worker offline 全 PASS。
- `git diff --check` PASS；本回合未執行 `git commit` 或 `git push`。外部程序於工作期間將 HEAD／`origin/main` 從輸入的 `f8bdab6` 推進到 `1a48662`，本回合未回退或覆寫該外部狀態。
