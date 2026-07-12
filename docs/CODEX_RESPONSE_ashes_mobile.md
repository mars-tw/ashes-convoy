# 《灰燼護航》手機監工回覆（前版）

## 結論

Grok 手機報告的兩項 P0 已修復，高價值 P1 已補齊。戰鬥決定性、傷害／敵量／經濟與射速倍率未改；`reduced` 既有語意維持，僅把新存檔的特效預設由 `full` 改為 `reduced`。既有存檔仍保留玩家原選項。

## 修復對照

| ID | 狀態 | 前版處理 |
|---|---|---|
| M-P0-1 | Fixed | Pointer 拖曳會同步 `aimX` 與 `followX`，載具在按住時即開始橫移；觸控／觸控筆準星固定上移 28 邏輯 px，避免手指遮擋。遊戲教學、README、GDD 已統一為「拖曳移動＋瞄準」。 |
| M-P0-2 | Fixed | 新存檔預設 `fxLevel=reduced`；auto 依 `deviceMemory <= 4`、`hardwareConcurrency <= 4` 或 Save-Data 直接使用 low；一般裝置低 FPS 降檔門檻 45→18 samples；low 路徑略過敵人與屍體 `ctx.filter`。 |
| M-P1-1 | Fixed | 保留既有未拖曳射擊間隔 `×1.35`，不動平衡；開場明示「放開仍射擊（射速較慢）」。 |
| M-P1-2 | Fixed | touch／pen 準星上移，mouse 座標語意不變。 |
| M-P1-3 | Fixed | hotspot、拖車操作、抽屜關閉、系列連結、設定 select/input/checkbox 全部提升至至少 44 CSS px；e2e hotspot 門檻同步提高為 44×44。 |
| M-P1-4 | Fixed | `fontSize=large/small` 現在也會縮放 Canvas 戰鬥文字；medium 維持原尺寸。 |
| M-P1-5 | Fixed | 設定頁新增「減少閃光」，直接綁既有 `reducedFlash`，未改旗標語意。 |
| M-P1-6 | Fixed | HUD、補給／增益選擇、拖車、面板、避難所 summary/hotspot/drawer 補齊 left/right safe-area；離線頁補 `viewport-fit=cover`、theme color 與四向 safe-area。 |
| M-P1-7 | Fixed | 自動降檔加快；FPS 降檔後同一波不回升，且需 180 個穩定 samples，避免品質震盪。低規預檢在 auto 下維持 low，玩家仍可明確鎖 high。 |

另補 iOS standalone meta。增益門與補給原有全螢幕 modal／68px 選項沿用，未改選項、數值或隨機流程。

## Guard 與驗證

- 新增觸控 e2e guard：驗證拖曳中 `followX === aimX`、載具確實移動、準星位於手指上方、放開後仍自動射擊。
- automation guard：鎖定觸控同步／Y offset、low 跳過 filter、`reducedFlash` UI、左右 safe-area。
- `npm test`：PASS。
- `npm run test:rwd`：PASS（9 viewports × 3 states，無頁面捲動／橫向溢出）。
- `npm run test:e2e`：3/3 PASS。
- 當時的 runtime／HTML query／SW cache／測試 guard 已同步；現行程式與測試的前一版字串 grep 為 0。原始 Grok 報告保留其審核版本文字。

未執行 git commit／push。
