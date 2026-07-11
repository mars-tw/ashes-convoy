# Codex Response - Ashes R3

## Summary

本輪升版到 `R63`，只修 Grok R3 指定的必修洞，並保持平衡護欄不變：screamer 傷害、husk 權重、tick cost、gate_focus 不加傷、決定性波次與純規則段都未改。

## R3 Findings

| R3 項目 | 判定 | 本輪處置 |
|---|---|---|
| `deep_route` 只在 `pushWave(10/15)` 觸發 | 採納，已修 | 新增 `triggerWaveStartBarks(wave)`，`pushWave` 與 `completeWaveIfReady` 自然進波共用。第 9 波自然完成進第 10 波會觸發 `deep_route`。 |
| `visibilityLoss` 死欄位 | 採納，已修 | 保留欄位並接到 canvas overlay：事件會套用暗幕、上下/側邊遮罩，`land_blackout` 有專屬低能見度線條。`renderDebug.environmentVisibilityLoss` 記錄實際消費值。 |
| 新敵、變種、彈種、gate_focus 數值護欄 | 採納 PASS，不改 | 維持既有 config/rules 數值，不碰平衡。 |
| 決定性波次與純 rules 約束 | 採納 PASS，不改 | 未修改 `rules.js`，未引入 DOM、`Date.now`、`Math.random` 到純規則段。 |
| `mirror_husk` 正面盾與主彈相容 | 採納 PASS，不改 | 保持現行半平面盾邏輯。 |
| ember DoT 以 AOE 來源打盾 | 採納為待修，不列本輪必修 | R3 指出的是盾牌來源語意問題，會影響 burn/aoe 的平衡契約；本輪未改，以免碰到 R3 已確認守住的輸出護欄。 |
| Boss banner 與 bark/event banner 可能互相覆蓋 | 採納為 UX debt | 本輪未調整 banner queue/priority，避免擴大 UI 行為面。 |
| `reducedFlash` 連同關字幕 | 採納為 P2 UX debt | 現況是 `runBarksEnabled` 直接關閉 bark，後續應拆成字幕與閃光/動效兩個設定；本輪不做設定遷移。 |
| 交替環境事件缺少專屬 overlay | 部分採納 | 本輪先補必修的 `land_blackout`。`air_static`、`sea_fogbank`、`space_echo`、`meteor_shower` 專屬 overlay 延後。 |
| P0-5/6 日誌與成就未進前一版 | 記錄延後 | R3 也標為範圍註記，不是本輪必修回歸。 |
| overload + fracture 多段 pierce 語意 | 記錄延後 | R3 標 P2；不在本輪修補範圍。 |

## Tests Added

- e2e：`deep_route` 先從第 9 波自然完成進第 10 波，確認非 `pushWave(10)` 假陽性。
- e2e：強制選中 `land_blackout`，確認 `visibilityLoss` 存在且被 render overlay 消費。
- 版本守門同步到 `R63` / `ashes-convoy-r63-v1`。

## Verification

- `npm test` PASS
- `npm run test:e2e` PASS x3
- headless Chrome 已在 e2e 輪次間清理
- 未執行 `git commit` / `git push`
