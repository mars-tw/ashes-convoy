# Ashes R75 桌機戰場放大回報

## 結論

R75 將桌機版面從 R74 的「左右 rail 欄位吃掉剩餘空間」改成「置中滿高直式戰場 + 貼邊固定 rails」。戰場仍維持 390:844，不裁切、不拉伸、不改遊戲數值與 R73 敵人動畫。

## 做法與取捨

- 採 CSS layout scale：`#battleStage` 高度改用 `min(100svh, --stage-max-h, width-limit)`，寬度由 `height * 390 / 844` 推出。
- 未提高 canvas 邏輯解析度：維持既有 `390x844` 顯示尺寸與 `LOGIC 195x422 + renderScale 2`，避免增加 canvas fill-rate、重算素材比例與觸控座標風險。
- 桌機 rails 改為固定 clamp 欄寬：`--rail-w: clamp(64px, 5vw, 92px)`，gap `8-14px`，不再用 `1fr` 把 rails 推到遠端。
- 高度上限 `--stage-max-h: clamp(844px, 74vw, 1644px)`：超高/超寬螢幕最高約 760px 寬，避免無限制放大。

注意：若完整顯示 390:844，16:9 的 1680x900 物理上限就是 `900 * 390 / 844 = 416px`。要在 900px 高螢幕達到 600px 寬，必須裁切上下、改寬比例或讓頁面垂直溢出；R75 選擇不裁切與不變形。

## 座標換算

沒有使用 CSS transform/crop。`#gameCanvas` 仍貼齊 `#battleStage`，`src/ui.js` 的 `canvasWorldPoint()` 以 `gameCanvas.getBoundingClientRect()` 將 client 座標線性映射到 `config.LOGIC.width/height`。因 R75 只改元素實際 CSS 尺寸，rect 會反映放大後的真實可視範圍，點擊/觸控換算不需額外補償。

## 尺寸對照

| 視口 | R74 估算 stage | R75 實測 stage | Rails gap |
|---|---:|---:|---:|
| 1366x700 | 301x652 | 323x700 | 12px / 12px |
| 1680x900 | 394x852 | 416x900 | 14px / 14px |
| 1920x1080 | 477x1032 | 499x1080 | 14px / 14px |

R75 在一般 16:9 桌機的主改進是吃滿垂直高度與 rails 貼邊；在高度足夠的桌機/超寬環境會自然放大到 600-760px 寬。

## Evidence

| 檔案 | 視口 | 重點 |
|---|---:|---|
| [`docs/evidence/R75/desktop-1366.png`](evidence/R75/desktop-1366.png) | 1366x700 | stage 滿高、rails 緊貼左右 |
| [`docs/evidence/R75/desktop-1680.png`](evidence/R75/desktop-1680.png) | 1680x900 | stage 416x900、rails gap 14px |
| [`docs/evidence/R75/desktop-1920.png`](evidence/R75/desktop-1920.png) | 1920x1080 | stage 499x1080、rails gap 14px |
| [`docs/evidence/R75/phone-390.png`](evidence/R75/phone-390.png) | 390x844 | 手機 stage/canvas 滿版，控制盤仍可見 |

量測檔：`docs/evidence/R75/desktop.metrics.json`、`docs/evidence/R75/phone-390.metrics.json`。

## 驗證

| 指令 | 結果 |
|---|---|
| `npm run test:rwd` | PASS，九視口矩陣全組合零違規、頁捲 0、橫溢 0 |
| `npm test` | PASS |
| `npm run test:e2e` | PASS |
| secret scan | PASS，排除 `.git` / `node_modules` 後零命中 |
| `git diff --check` | PASS，僅 Git 換行提示 |

