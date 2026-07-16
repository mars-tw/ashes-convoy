# Ashes R78 before / after

## Before（R77）

- 敵人、Boss 與席安已有 anticipation／impact／recovery 狀態與 impact-only 傷害時點。
- attack renderer 仍由 walk／idle 替代幀承接；正式 attack atlas 是明列缺件。
- R73 守門只涵蓋 walk／hurt／death，未量測 attack 任兩幀的 alpha 差異，也沒有逐階段 atlas frame 的 E2E 斷言。

## After（R78）

- 九組敵人視覺、Boss 與席安都有正式四幀透明 attack atlas：anticipation `0,1`、impact `2`、recovery `3`。
- runtime 依 R77 狀態機選正式幀；傷害、投射物與 Boss 召喚仍只在 impact beat 觸發。
- 10 張 atlas、每張 6 組 frame pair 全部通過 normalized mean alpha difference `> 0.08`；全域最小值 `0.100571`。
- E2E 驗證 spore spitter、runner 接觸攻擊、Boss 與席安的時序，並驗證 anticipation 無提前傷害／投射物、recovery 無重複結算。

## 視覺證據

- [完整序列證據頁](attack-sequence-proof.html)
- [序列 01：shambler / runner](attack-sequence-proof-01.png)
- [序列 02：bloater / spore spitter](attack-sequence-proof-02.png)
- [序列 03：shield husk / swarm mite](attack-sequence-proof-03.png)
- [序列 04：tar brute / void wraith](attack-sequence-proof-04.png)
- [序列 05：hive titan / Xi gunner](attack-sequence-proof-05.png)
- [桌機 1366×700 實機畫面](desktop-1366x700-run.png)
- [平板 820×1180 實機畫面](tablet-820x1180-run.png)
- [手機 390×844 實機畫面](phone-390x844-run.png)

量測原始資料見 [attack-alpha-metrics.json](attack-alpha-metrics.json)，三輪 p95 原始資料見 [perf-p95.json](perf-p95.json)。
