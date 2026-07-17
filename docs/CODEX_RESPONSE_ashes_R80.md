# Ashes R80 拖車房間與四環境宣傳交付報告

## 結論

同一 session 已依序完成 R79.1 與 R80。R79.1 已先以 commit `fe13c69` 封存；R80 再以內建 imagegen 產出一張拖車房間 master 與陸／空／海／太空四張 promo master，五張均由 Python 驗出 C2PA `softwareAgent = gpt-image 2.0`。拖車房間已接入 high／medium／low 同源真素材與內容雜湊 URL；四張 promo 僅位於 `docs/promo/`，不進 runtime。

## 來源治理

| 項目 | 結果 |
| --- | --- |
| 生成路徑 | OpenAI built-in imagegen；未使用 API、CLI 或 `OPENAI_API_KEY`。 |
| model slug | `gpt-image-2`。 |
| C2PA | 五張 master 皆有 `caBX`／`c2pa.actions.v2`，`softwareAgent = gpt-image 2.0`；5/5 PASS。 |
| room master | `docs/evidence/R80/masters/trailer-room-r80-master.png`；SHA-256 `4f95a1734a7d55c91de2f82f36fd28da9cdf6c9df43a1dca12b1bbcbcab912d5`。 |
| room runtime | high `ad41b8f7…` 780×900；medium `757c8db7…` 650×750；low `027c13ed…` 520×600。 |
| promo runtime | 陸 `264e5415…`、空 `839594bf…`、海 `9ea536a0…`、太空 `8a67c657…`；皆 2048×1152、RGB。 |
| 確定性後製 | 中央安全裁切 → RGB → Pillow LANCZOS → optimized PNG、compress level 9；crop box、bytes、雙層 SHA-256 均入 evidence。 |

Room source manifest：`assets/shelter/trailer/room-art-manifest.json`。Promo source manifest：`docs/promo/manifest.json`。完整 prompt、style board、色票與 reference hash 位於 `docs/evidence/R80/`；CREDITS 已同步。

## R80 命令化美術閘門

| Gate | 實測 | 結果 |
| --- | --- | --- |
| 三視口安全裁切 | 1366×700 high、820×1180 medium、390×844 low；content rect 全落在 canvas，`characterCount = 1` | PASS |
| 文字對比 | computed style 疊合實測：primary 15.867:1、muted 8.811:1；要求 ≥4.5:1 | PASS |
| 中央玩法／管理可讀性 | 中央走道 edge mean：high 18.9841、medium 19.6024、low 19.3781；上限 20 | PASS |
| 品質一致性 | low／medium／high 共同尺寸 RMS 對 high 最大 0.7672，三者皆真 raster | PASS |
| 角色亮度／飽和度 | Xi 區 brightness 26.9646–27.0106；saturation 28.0071–28.0868；跨檔差 <1 | PASS |
| alpha | 三檔皆 opaque RGB，無意外 alpha | PASS |
| promo runtime 排除 | `index.html`、`src/`、`sw.js`、web manifest 對四張 promo basename 0 命中 | PASS |

證據：`after-desktop-1366x700.png`、`after-tablet-820x1180.png`、`after-phone-390x844.png`、`quality-proof.png`、`art-gates.json`、`after-layout.json`。

## 硬預算

| 檔位 | 同時解碼計算 | 實測估算 | 上限 |
| --- | --- | ---: | ---: |
| 桌機 high | R79 atmosphere 2048×1152×4 + startup focus 192×405×4 + room 780×900×4 | 11.975 MiB | 64 MiB |
| 行動 low | R79 atmosphere 1024×576×4 + startup focus 192×405×4 + room 520×600×4 | 3.737 MiB | 32 MiB |
| promo | 文件資產，不載入 runtime | 0 MiB runtime | N/A |

Fast 3G（150 ms RTT／1.6 Mbps down／750 Kbps up）＋4×CPU、Chrome、1366×700：當前 R80 focus p95 1297.8 ms（≤3000）；interactive p95 5165.7 ms，低於 before 14028.2 ms 的 +10% 上限 15431.0 ms。原始證據為 `docs/evidence/R80/start-fast3g-after.json`。

Frame p95 最終四情境 median 為 9.2／9.9／17.6／15.9 ms，均 ≤18 ms。這是本機併發量測，依協定標註「併發、不可信」；總稽核仍需淨機重測。原始證據為 `docs/evidence/R80/perf-p95.json`。

## Runtime、快取與行為邊界

- `src/version.js` 已為 `R80`／`ashes-convoy-r80-v1`；R79.1 階段要求的 `ashes-convoy-r79-v2` 已先在 `fe13c69` 完成。
- Room 三品質 runtime URL 皆使用 SHA-256 前八碼 query，SW offline 清單同步。
- 家具錨點維持 canonical 780×900 座標；medium／low 使用獨立 natural scale 但不讓家具錯位。
- `performanceMode=high` 選 high、`auto` 選 medium、`low` 選 low。
- 無新關卡、數值或玩法；未修改任何角色動畫資產。`src/game.js` 僅新增只讀 raster readiness test hook，沒有更動 update／damage／attack／hurt／death 流程。

## 全套回歸

| 命令 | 最終結果 |
| --- | --- |
| `npm test` | PASS |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS；含 aggregate controls |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:rwd` | PASS；30/30 |
| `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r79` | PASS |
| `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r80` | PASS |
| `npm run test:perf` | PASS；p95 ≤18 ms |
| `node scripts/measure-wave2-start.js` | PASS；focus ≤3 s、interactive 未退步 >10% |
| `git diff --check`／secret scan／promo runtime scan | PASS／0 命中／0 引用 |

併發與時序失敗、未放寬斷言的修正及最終隔離重跑完整記錄於 `docs/evidence/R80/test-run-log.md`。

## Wave 1 殘留清單

- production fallback 計數：最終 perf 四情境每次 `enemyFallbackDrawn = 0`；production fallback 為 0。E2E 的 fallback 僅為故障注入測試。
- R79.1 與 R80 新增素材的 manifest、master、C2PA、雙層 hash、prompt／style board／reference hash 已齊全；本波沒有新增來源缺件。
- `docs/AUDIT_full.md` 原有非本波 P1／P2 玩法、storage 與長局真機債務仍保留；依協定未擴張到 Wave 3。

## Rollback

R79.1 回切：`git revert fe13c69`。R80 回切：`git revert <R80-commit>`；舊 room、cache 與 manifest 均保留在 git 歷史，不直接刪除。Promo 亦會隨同一 revert 從 docs 移除。

## Grok 複審最低證據

- 報告：`docs/CODEX_RESPONSE_ashes_R80.md`
- 關鍵 diff：`assets/shelter/trailer/room-art-manifest.json`、`assets/shelter/trailer/base_escape_pod*.png`、`src/shelter-scene.js`、`src/ui.js`、`src/version.js`、`sw.js`、`docs/promo/manifest.json`、`scripts/audit-r80-art.py`、`scripts/test-r80-art.js`
- Before／after：`docs/evidence/R80/before-*.png`、`after-desktop-1366x700.png`、`after-tablet-820x1180.png`、`after-phone-390x844.png`
- Masters／來源：`docs/evidence/R80/masters/*.png`、`c2pa-validation.json`、`postprocess.json`、`prompt.md`、`style-board.md`
- 機器證據：`art-gates.json`、`memory-budget.json`、`quality-proof.png`、`after-layout.json`、`perf-p95.json`、`start-fast3g-after.json`、`test-run-log.md`
- Promo：`docs/promo/ashes-convoy-{land,air,sea,space}-r80.png` 與 `docs/promo/manifest.json`
