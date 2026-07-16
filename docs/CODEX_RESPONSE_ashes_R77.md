# Ashes R77 Codex 報告

## 摘要

R77 已處理 audit Top 5，並保留 R73 動畫與 R74-R76 控制基線守門。本輪重點是讓增益門決策可操作、攻擊傷害落在 impact 幀、戰鬥中 rail 能回原局、效能品質不改難度，以及補上輕量程序化音效。

## 已完成

- F-01：增益門核心新增 projectile hitbox、HP、受擊回饋與破門流程；射爆核心會套用選到的 gate 並清除該 pair。
- F-02：gate pair 改為 `active` / `resolved` / `expired` 狀態；漏門會清 stale `gateChoice`，補給與下一組門不再被阻塞。
- F-05：敵人、Boss phase、接觸傷害、席安支援射擊都改為 anticipation / active impact / recovery；傷害與投射物只在 active impact 發生。
- F-15：戰鬥中開桌機 rail 會保留 return context，關閉抽屜後回到原 run。
- F-11：low performance 不再改敵人 cap 或 AI 動畫路徑；只降低 FX/effects 等畫面成本。
- 音效：WebAudio 程序化 SFX 擴充到射擊、命中、破門、Boss cue、警報、拾取/UI 回饋，並新增可持久化的 SFX 音量設定。
- 版本：app/cache/query/README/測試守門同步 bump 到 R77。

## 驗收結果

- `npm test`：PASS。
- `npm run test:e2e`：PASS。
- `npm run test:rwd`：PASS。
- R76 控制守門：PASS，已包含在 E2E 與 `scripts/test-r76-controls.js`。
- 效能證據：`docs/evidence/R77/perf-p95.json` PASS。
  - default auto/reduced desktop median p95：10.1ms。
  - default auto/reduced phone median p95：4.5ms。
  - low/reduced desktop median p95：4.3ms。
  - low/reduced phone median p95：12.2ms。
- 秘掃：排除 `.git` 與 `node_modules` 後零命中。
- R77 release token 檢查：舊版 `ashes-convoy-r76` / `v=R76` / `release-R76` / boot reload token 零殘留；`R76` 只保留歷史 README 條目與 R76 控制守門腳本名稱。

## 證據

- 計畫：`docs/OPTIM_PLAN_R77.md`。
- Before/after 索引：`docs/evidence/R77/before-after.md`。
- 截圖：
  - `docs/evidence/R77/after-tablet-820x1180-gate-core.png`
  - `docs/evidence/R77/after-desktop-1366x700-attack-impact.png`
  - `docs/evidence/R77/after-desktop-1366x600-rail-return.png`
  - `docs/evidence/R77/after-phone-390x844-touch-run.png`
- 效能 JSON：`docs/evidence/R77/perf-p95.json`。

## 素材缺口

R77 沒有假裝正式 attack atlas 已完成。狀態機與可替換動畫管線已補上，但 common/ranged enemies、Boss summon/charge/impact、席安 anticipation/active/recovery 的正式 attack atlas 仍缺。Runtime fallback 只把 phase 映射到既有 frame-based walk/firing assets，同時保證 damage timing 在 impact 幀。
