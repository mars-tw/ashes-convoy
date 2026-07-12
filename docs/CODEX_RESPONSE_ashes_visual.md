# 《灰燼護航》R66 畫面強化回覆

## 結果

- 已完成 R66，未改傷害、射速、掉落、碰撞、敵人或波次平衡；未 commit／push。
- Kenney Particle Pack 1.1 原包存於 gitignore 的 `tools/`。實際採用 `smoke_04`、`fire_01`、`dirt_02`、`star_07`，裁透明邊、縮圖、調成廢土色後放入 `assets/fx/`；來源與 CC0 記於根目錄 `CREDITS.md`。
- 敵死、Boss 爆與命中改為「閃光＋碎片＋煙／火」紋理合成。素材載入後先在離屏 canvas 建立固定 tint cache，逐幀只做 `drawImage`；仍使用 high 96／low 48 固定粒子池。
- standard／scatter（內部 mode `spread`）／fracture／ember／laser 使用固定且互異的色、輪廓與拖尾；homing 亦有獨立語言。彈種補給與 HUD 邊色會立即切換。
- 陸地 raster／fallback 共用低對比胎痕與裂紋層；low 減半密度。沙塵暴加強黃褐濾色，暗流加強冷藍濾色；Boss 入場加入全場暗角脈動。
- HUD HP／波次／擊殺／零件／Boss 百分比加入跳字。HP ≤ 25% 時有全屏紅暈呼吸。
- `reducedFlash` 會關閉紋理閃光、Boss 暗角脈動、低 HP 呼吸、HUD 跳字與既有震屏／閃爍；OS `prefers-reduced-motion` 亦關閉 HUD 動畫。low 自動減少發射量與路面細節，並停用高成本疊色。

## Guards

- 新增 `scripts/test-visual-guards.js` 並納入 `npm test`：檢查 PNG 尺寸／透明度、CC0 provenance、三類死亡多層紋理、命中紋理、offscreen tint、五彈種唯一色形、場景／HUD／reduced 與粒子上限。
- e2e 新增實際載入／繪製 Kenney 紋理、tint cache、五彈種 renderer、HUD 即時彈種簽名、Boss／低 HP overlay 及 reduced 抑制斷言。
- R66 已同步 `src/version.js`、config fallback、HTML query、boot guard、SW app shell／cache、測試名稱與斷言；repo（排除 `.git` 與 gitignored `tools/`）舊版字串 grep 為 0。

## 驗證

- `npm test`：PASS（含 Visual guard）。
- `npm run test:rwd`：PASS，9 視口 × 3 狀態，頁捲／橫溢皆 0。
- `npm run test:e2e`：PASS ×3；每輪含 4 視口、素材 fallback、音訊與 service-worker offline。
- Browser 實頁：390×844 canvas、HUD 與路面細節顯示正常。
- `git diff --check`：PASS。
