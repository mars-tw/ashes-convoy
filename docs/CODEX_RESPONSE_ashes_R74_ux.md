# Ashes R74 UX/RWD 重設計回報

## 結論

R74 已落地老闆三方向：手機有可見控制盤、桌機不再被 390/844 外殼壓成窄條、設定與戰鬥中操作改成更短路徑的小按鈕/點物件。既有全 canvas 拖曳轉向仍保留為備援，未改遊戲數值，R73 敵人 walk/hurt/death 動畫資產與流程未動。

## 稽核對照

| 稽核項 | R74 處理 |
|---|---|
| P0 手機無控制盤 | `index.html` 新增 `#touchControls` overlay，coarse/touch 才顯示；左下 `#virtualJoystick` 對接 `game.setVirtualAim()`，右下 `衝/技/彈` 小圓鈕接既有瞄準、補給與武器 powerup 導向。 |
| P0 桌機畫面過小 | 解除 `.app` 固定手機 aspect shell；桌機改為 viewport grid，`#battleStage` 以最大可用高度置中放大，左右 `desktop-rail` 放常駐基地捷徑。手機仍維持單欄直式。 |
| P1 設定抽屜長捲動 | `#settingsPanel` 改成明確 2 欄 grid；診斷與存檔管理跨欄，避免 11 列設定全部單欄堆疊。 |
| P2 in-run 無畫面內小按鈕 | 戰鬥中點擊護送車會開 `#quickUpgradeWheel`，使用現有 upgrade track 與 `rules.buyUpgrade()`；右下快捷鈕也提供衝刺/技能/武器操作入口。 |
| 保留項 | 全 canvas invisible drag 仍在 `src/game.js` 原 pointer handler；本輪只新增 overlay/API，不改敵人動畫、不改戰鬥數值。 |

## 改動檔案

| 檔案 | 重點 |
|---|---|
| `index.html` | RWD shell、桌機側欄、手機控制盤 overlay、快速升級輪盤、設定 2 欄 CSS、R74 cache query。 |
| `src/ui.js` | 搖桿 pointer handling、右下快捷鈕、桌機 rail 開抽屜、護送車點擊 hit test、快速升級輪盤 render/定位。 |
| `src/game.js` | 新增 `setVirtualAim()`、`releaseVirtualAim()`、`focusRunObject()`，沿用既有 `setAimFromPoint()`。 |
| `src/version.js`, `src/config.js`, `sw.js` | App/cache 版本 bump 到 R74。 |
| `scripts/test-*.js` | R74 版本守門與 RWD stage/desktop shell 斷言更新。 |
| `README.md` | 更新 R74 版本與 UX/RWD 說明。 |

## Evidence

| 截圖 | 視口 | 驗收點 |
|---|---:|---|
| [`docs/evidence/R74_ux/phone-run-controls.png`](evidence/R74_ux/phone-run-controls.png) | 390x844 | 手機戰鬥中可見左下搖桿與右下 `衝/技/彈`。 |
| [`docs/evidence/R74_ux/desktop-rails.png`](evidence/R74_ux/desktop-rails.png) | 1440x900 | 桌機戰場吃滿高度置中，左右側欄小按鈕常駐。 |
| [`docs/evidence/R74_ux/tablet-settings-grid.png`](evidence/R74_ux/tablet-settings-grid.png) | 820x1180 | 設定抽屜為 2 欄 grid，不再是單欄長捲。 |

## 驗證

| 命令/檢查 | 結果 |
|---|---|
| `npm test` | PASS |
| `npm run test:e2e` | PASS |
| `npm run test:rwd` | PASS |
| Playwright quick wheel probe | PASS，點擊護送車開啟 6 個既有升級選項 |
| `git diff --check` | PASS |
| `grep -rniE "sk-proj-[A-Za-z0-9_-]{20}|sk-[a-z0-9]{40}"`，排除 `.git` / `node_modules` | PASS，0 命中 |

