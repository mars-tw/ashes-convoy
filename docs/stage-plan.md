# Stage Gate 與版本計畫

本文件記錄灰燼護航目前已完成的階段與後續維護 Gate。現況已超過原 Stage 1 MVP，文件以 R8/R12 後的線上版本為準。

## 已完成里程碑

| 里程碑 | 狀態 | 重點 |
|---|---|---|
| Stage 1 MVP | 完成 | Canvas 戰鬥、基本波次、3 種小怪、Boss、增益門、結算與 localStorage |
| 美術整合 | 完成 | AI key art、載具 PNG、殭屍 PNG、避難所背景、pixel matrix fallback |
| R8 | 完成 | 增益門 2.0、手機觸控分離、Boss 事件化 |
| R12 | 完成 | 藍圖解鎖、成就牆、載具專屬升級分支、meta v2 |

## 現行內容 Gate

### 戰鬥

- 一般敵人：`shambler`、`runner`、`bloater`。
- Boss：`boss_hive_titan`，每 5 波出現，支援 66% 與 33% 血量事件。
- 增益門：傷害、射速、多重射擊、維修；門 HP 隨波次成長。
- 波次：基礎 30 秒、每波 +1 秒、上限 45 秒。

### 車庫與 meta

- `META_VERSION = 2`。
- `land_rig` 預設解鎖；`sky_barge`、`sea_ark`、`void_runner` 各需 3 張藍圖。
- 通用升級四條：`hull`、`weapon`、`energy`、`gate`。
- 每台載具兩條專屬分支，`void_runner` 的穿透節點上限 1。
- 成就牆至少包含 10 個成就項目，並能在結算時補發零件。

### 美術

- `assets/ui/start.png` 作為 key art 入口。
- `assets/vehicles/land.png`、`air.png`、`sea.png`、`space.png` 對應四載具。
- `assets/zombies/shambler.png`、`runner.png`、`bloater.png`、`titan.png` 對應敵人。
- `assets/shelter/snow.png`、`workshop.png`、`greenhouse.png`、`bunker.png` 對應避難所主題。
- 圖像載入失敗時仍須能用 `src/sprites.js` 的 matrix fallback 繪製核心物件。

## 測試 Gate

`npm test` 應執行：

```bash
node scripts/test-config.js
node scripts/test-rules.js
node scripts/test-economy.js
node scripts/test-storage.js
node scripts/test-sprites-contract.js
```

必要驗收：

- config shape：載具、武器、敵人、門、升級、成就欄位完整。
- rules deterministic：波次、門、獎勵、藍圖與成就不可依賴不可控時間。
- economy：零件公式、難度倍率、最低獎勵與藍圖保底正確。
- storage：壞資料、舊版 id、缺欄位、未解鎖選車都能遷移。
- sprite contract：matrix fallback、palette、動畫 frame 與必要 sprite 存在。

## 文件維護 Gate

- README 必須有繁中玩法、主要數值與「📋 更新日誌」。
- `references/data-model.md` 必須同步 `META_VERSION`、藍圖、成就與升級表。
- `docs/gdd.md` 必須描述現行設計，不保留過期 Stage 1/2 待辦當成現況。
- `docs/art-contract.md` 必須列出目前實際存在的 AI 圖像資產與 fallback 契約。
- 除非任務明確允許，文件更新不得修改程式碼、測試或資產。

## 後續候選方向

以下只是文件化候選，不代表已實作：

- 更多 Boss 事件組合與環境差異。
- 難度解鎖條件的 UI 強化。
- 避難所主題與成就牆的更明確視覺回饋。
- Playwright E2E 補手機戰鬥、車庫升級、藍圖解鎖長流程。
