# Ashes R79.1 素材來源合規重生報告

## 結論

R79.1 已依 Wave 2 協定重生 `assets/ui/start-atmosphere-r79.png`：內建 imagegen 原始 master 已保存在 evidence，Python 直接解析 PNG C2PA `caBX`／CBOR 並驗出 `softwareAgent = gpt-image 2.0`；high runtime 維持原檔名與 2048×1152，medium／low 為同一 master 的確定性衍生。1366×700 合成保留中央直式 key art 為唯一焦點，兩側遠景不再和中央車隊爭焦。

## 來源治理

| 項目 | 結果 |
| --- | --- |
| 生成路徑 | OpenAI built-in imagegen；未使用 CLI、API 或 `OPENAI_API_KEY`。 |
| model slug | `gpt-image-2`。 |
| master | `docs/evidence/R79_start/masters/start-atmosphere-r79-master.png`，1752×898。 |
| master SHA-256 | `9c22011fe2ca7f0d096dfa520b66718f66d14306155120bc5602d3143bbdb28c`。 |
| C2PA | `c2pa.actions.v2`；`softwareAgent = gpt-image 2.0`；PASS。 |
| runtime SHA-256 | high `31cbd67f48bfe23e246b138b2cb4d5f3bd5399c5d12c90cb39d2fbbea26c9f9c`；medium `115410f57f2387aaad844245c8ebcda6c60b2e52b069ffb1f82f5cbe1fc0f0fe`；low `b58b835bc8f5f4d35cadfd9b1116774b8bde876ed4f1bdd251152d07952cdbe9`。 |
| 後製 | crop `[78,0,1674,898]` → RGB → Pillow LANCZOS 單次重採樣 → optimized PNG；無合成、重畫或換色。 |
| runtime URL | 三檔均使用各自 SHA-256 前八碼 query；SW cache R79.1 階段為 `ashes-convoy-r79-v2`。 |

完整 manifest：`assets/ui/start-art-manifest.json`；C2PA：`docs/evidence/R79_start/c2pa-validation.json`；後製：`postprocess.json`；prompt／style board／色票／reference hash 均在同一 evidence 目錄。

## 構圖與量化閘門

中央 32% 的 mean luma 28.2081、luma stddev 4.0698、edge mean 1.8165；兩側依序為 47.3034、23.9307、6.6499。中央對比與邊緣密度只有兩側約 17%／27%，通過 45% 上限，且無文字、UI、車輛、前景角色或浮水印。

| Gate | Result |
| --- | --- |
| 1366×700／820×1180／390×844 焦點 bbox 安全裁切 | PASS。 |
| 新場景上 rail label 自動背景取樣對比 | PASS；最低 8.894:1，要求 4.5:1。 |
| low／medium／high 同源一致性 | PASS；縮放到共同尺寸後 RMS 對 high 最大 0.506。 |
| opaque alpha gate | PASS；RGB、無 alpha／`tRNS`。 |
| 角色亮度／飽和度 gate | N/A；素材無角色。 |

## 硬預算

| 同時載入檔位 | 計算 | 解碼記憶體 | 上限 |
| --- | --- | ---: | ---: |
| high atmosphere | 2048×1152×4 | 9.000MiB | 桌機 64MiB |
| medium atmosphere | 1536×864×4 | 5.062MiB | 桌機 64MiB |
| low atmosphere | 1024×576×4 | 2.250MiB | 行動 32MiB |
| startup focus derivative | 192×405×4 | 0.297MiB | 與選中檔合計 |

實際同時選一個 atmosphere：桌機最大 9.297MiB、行動 2.547MiB，均 PASS。首焦 derivative 是現行 key art 的 64 色確定性低頻寬衍生，不是純色或換畫風。

## 首屏效能

Fast 3G（150ms RTT／1.6Mbps down／750Kbps up）＋4× CPU throttle，Chrome channel；本機併發量測不可信，總稽核需淨機重測。

| Metric | Before | After p95 | Gate |
| --- | ---: | ---: | --- |
| 主焦點完成渲染 | 13999.2ms | 1186.9ms | `<=3000ms` PASS |
| 首屏可互動 | 14028.2ms | 5010.9ms | 不得退步 >10%（上限 15431.0ms）PASS；實際改善約 64% |
| 戰鬥 p95 frame | 既有 18ms contract | 最大 14.1ms | PASS |

performance marks：`ashes-start-focus-visible`、`ashes-start-interactive`。Before／after 原始 JSON 位於 `docs/evidence/R80/start-fast3g-before.json` 與 `start-fast3g-after-r79.1.json`。

## 全套回歸

| Command | Result |
| --- | --- |
| `npm test` | PASS |
| `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r79` | PASS |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:rwd` | PASS（30 組） |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS（aggregate command） |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:perf` | PASS |
| `git diff --check` | PASS |
| 實密鑰 regex | PASS，0 命中 |

早期併發／競態失敗與最終重跑均記在 `docs/evidence/R79_start/test-run-log.md`。本輪未修改任何角色 locomotion、attack、hurt 或 death 資產／狀態機；R78 三段攻擊與 impact-frame 傷害守門保持通過。

## Wave 1 殘留清單

- production fallback：效能測試仍為 fallback 0；缺圖 fallback 路徑僅由 E2E 故障注入觸發。
- R79 來源治理缺口已在本輪關閉。
- `docs/AUDIT_full.md` 既有玩法、storage、選單與平台 P1/P2 債務不在本波範圍；依協定未新增關卡、數值或玩法。

## Rollback

R79.1 使用獨立本地 commit。回切用 `git revert <R79.1-commit>`；舊 asset／manifest 仍保留在 git 歷史，不直接刪除或覆寫歷史。

## Grok 複審最低證據

- 報告：`docs/CODEX_RESPONSE_ashes_R79_1.md`
- 關鍵 diff：`assets/ui/start-art-manifest.json`、`assets/ui/start-atmosphere-r79.png`、`index.html`、`src/ui.js`、`src/config.js`、`src/version.js`、`sw.js`、`scripts/verify-c2pa.py`、`scripts/audit-r79-art.py`
- 證據圖：`before-r79.1-desktop-1366x700.png`、`after-desktop-1366x700.png`、`after-tablet-820x1180.png`、`after-phone-390x844.png`、`quality-proof.png`
- 機器證據：`c2pa-validation.json`、`postprocess.json`、`art-gates.json`、`decoded-memory-budget.json`、`layout-audit.json`、`perf-p95.json`、`start-fast3g-*.json`
