# R79.1 素材來源合規重生與首屏硬閘門計畫

## 開工基線

| 項目 | Before | After 上限／契約 |
| --- | --- | --- |
| 來源治理 | 現行 `start-atmosphere-r79.png` 無保留 C2PA master，manifest 只記單層 runtime SHA-256，model 未證實。 | 內建 imagegen master 保存在 `docs/evidence/R79_start/masters/`；Python 驗出 `softwareAgent = gpt-image 2.x`；manifest 同時記 master/runtime SHA-256、C2PA 摘要與確定性後製。 |
| Fast 3G／4× CPU 主焦點 | `13999.2ms`（FAIL，`docs/evidence/R80/start-fast3g-before.json`；本機併發量測，不可信，總稽核需淨機重測）。 | p95 `<=3000ms`，加入 app performance mark 與硬斷言。 |
| Fast 3G／4× CPU 首屏可互動 | `14028.2ms`。 | 不得比 before 退步 >10%，即 `<=15431.0ms`；目標與主焦點一起壓到 3 秒附近。 |
| runtime atmosphere | 2048×1152，3,703,502 bytes；中央 32% 已壓暗但來源不合規。 | 檔名維持不變、2048×1152；構圖契約不變；增加 medium/low 同源真素材，低檔不可改成純色。 |
| 新增貼圖解碼記憶體 | 尚未新增。 | 桌機同時載入 `<=64MiB`；行動低檔同時載入 `<=32MiB`，逐張列 `w×h×4`。 |
| 安全裁切／中央細節 | 只有目測與 key-art DOM 中央層守門。 | 10 視口焦點 bbox 安全區斷言；中央 32% 局部對比／邊緣密度硬上限。 |
| UI 文字對比 | 無新 atmosphere 自動取樣報告。 | 疊圖文字區域自動量測 `>=4.5:1` 並輸出 JSON。 |
| cache／引用 | `ashes-convoy-r79-v1`，runtime URL 無 content hash。 | R79.1 階段 cache=`ashes-convoy-r79-v2`；每個換血 runtime URL 帶 `?v=<sha256前8碼>`，SW 離線清單一致。 |

## 可驗收工作

1. 內建 imagegen 生成單一原始 master，不走 CLI/API；生成前確認可用實體記憶體 `>=2GB`。
2. Python C2PA 驗證失敗即作廢重生；保留驗證 JSON／文字。
3. 以固定腳本從 master 做色彩不變的 deterministic crop/resample，輸出 high/medium/low；正式 high 路徑維持 `assets/ui/start-atmosphere-r79.png`。
4. 補來源 manifest、CREDITS、prompt、style board、色票、reference hash、雙層 SHA-256 與 postprocess 參數。
5. 中央 key art 加高優先 preload；加入 `ashes-start-focus-visible`／`ashes-start-interactive` performance marks。
6. 建立命令化安全裁切、文字對比、中央細節、品質檔一致性、解碼記憶體與 Fast 3G 閘門。
7. 執行 `npm test`、Chrome E2E、RWD、`evidence:r79`，R79.1 完成後先本地提交再進 R80。

## Wave 1 殘留清單

- production fallback 計數：R78 效能證據為 `fallback 0`；本輪仍會以全量測試重新確認。
- runtime manifest：R79 start manifest 存在但缺 C2PA master 與雙層雜湊，列為本輪 P0 修正。
- `docs/AUDIT_full.md` 的既有 P1/P2 遊戲性、storage、選單與平台債務不在本波範圍；依協定不新增關卡、數值或玩法，也不改角色動畫資產。

## Rollback

R79.1 先建立獨立本地 commit。若需回切，對該 commit 執行 `git revert <R79.1-commit>`；不得直接覆寫或刪除 git 歷史中的舊 runtime 與 manifest。
