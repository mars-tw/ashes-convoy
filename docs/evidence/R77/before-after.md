# Ashes R77 Before/After 證據

## Before

- `docs/AUDIT_full.md` Top 5 記錄 R77 起點缺陷：F-01、F-02、F-05、F-11、F-15。
- F-01 before：增益門核心沒有 projectile collision 與 HP 流程。
- F-02 before：漏過 gate pair 後會留下 stale `gateChoice`。
- F-05 before：敵人、Boss、席安攻擊沒有嚴格 anticipation / active impact / recovery，傷害不保證落在 impact 幀。
- F-11 before：low performance 會改變敵人 cap 與 AI/動畫軌跡。
- F-15 before：戰鬥中開桌機 rail 後會回基地，再出勤可能覆蓋原局。
- R74-R76 控制基線證據保留於 `docs/evidence/R76_controls/`。

## After

- `after-tablet-820x1180-gate-core.png`：增益門核心 HP 與 projectile 破門流程。
- `after-desktop-1366x700-attack-impact.png`：攻擊 impact timing 情境。
- `after-desktop-1366x600-rail-return.png`：戰鬥中 rail 關閉後回原局。
- `after-phone-390x844-touch-run.png`：手機控制基線不回歸。
- `perf-p95.json`：Playwright p95 效能證據；敵人 cap 固定 72，品質降階只降畫面成本。

## Automated Gates

- `npm test`：PASS。
- `npm run test:e2e`：PASS，含 R76 控制守門與 R77 gate/attack/performance checks。
- `npm run test:rwd`：PASS。
- 秘掃：排除 `.git` 與 `node_modules` 後零命中。
