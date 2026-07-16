# Ashes R78 美術實作報告

## 結論

R77 明列的「正式 attack atlas 素材仍缺」已在 R78 清償。九組 raster 敵人視覺、蜂巢泰坦 Boss 與席安砲手均使用正式四幀 attack action atlas；兩幀 anticipation、單幀 impact、單幀 recovery 都是各自繪製的肢體／輪廓姿勢，不以整張角色平移、旋轉、縮放或 bob 冒充動作。

R77 三段狀態機仍是唯一攻擊時序來源。R78 renderer 把狀態映射為 `0 → 1 → 2 → 3`；敵方投射物、接觸傷害、Boss 召喚與席安子彈仍只在 impact beat 結算。接觸型敵人命中後會完成 impact 與 recovery，再銜接受擊／死亡反應，不會在命中瞬間跳掉收勢，也不會重複傷害。

**缺件清單：無。** 本輪要求的 9 組 raster 視覺、Boss 與席安全部有 runtime 素材、量測與序列證據。

## 素材涵蓋

| runtime 敵種／角色 | 正式 atlas | 單格尺寸 | alpha 任兩幀最小差 |
|---|---|---:|---:|
| shambler | `oga_shambler_attack.png` | 40×40 | 0.145 |
| runner | `oga_runner_attack.png` | 40×40 | 0.167 |
| bloater | `bloater_attack.png` | 52×52 | 0.159 |
| spore_spitter、ash_screamer | `oga_spitter_attack.png` | 40×40 | 0.159 |
| shield_husk、mirror_husk | `shield_husk_attack.png` | 48×64 | 0.148 |
| swarm_mite、ember_tick | `swarm_mite_attack.png` | 44×44 | 0.105 |
| tar_brute、chain_tether | `tar_brute_attack.png` | 56×68 | 0.128 |
| void_wraith | `void_wraith_attack.png` | 48×64 | 0.160 |
| boss_hive_titan | `titan_attack.png` | 88×80 | 0.119 |
| 席安／Xi gunner | `xi_gunner_attack.png` | 256×384 | 0.101 |

ash_screamer、mirror_husk、ember_tick、chain_tether 原本就與基礎敵種共用同一組 walk rig，故沿用對應正式 attack rig，再保留既有 runtime tint/filter；不是缺少或 fallback。

## image_gen 製作與可重建管線

- 工具：OpenAI built-in image generation（imagegen skill）。
- 共通提示骨架：`single horizontal four-frame character attack sprite sheet; preserve the supplied character identity, painterly pixel-art rendering, camera, proportions and warm ash-wasteland palette; frame 0 lean/back-load anticipation, frame 1 deeper crouch/wind-up with visibly changed limbs, frame 2 forceful forward lunge/swing/spit/shield-bash/fire impact, frame 3 distinct recovery and settle; one full character per cell; flat chroma background; no text, labels, shadows, motion blur, duplicated pose, whole-sprite translation, rotation, scaling, squashing or bobbing`。
- 每組再加入既有 walk atlas 的物種輪廓、武器／盾牌／砲座與攻擊方式限制；Boss 使用重砸／召喚 impact，席安使用肩、手臂與砲管的蓄力、後座與復位。
- 生成母圖與透明中間檔存於 `tools/asset_sources/imagegen_r78/`：`{shambler,runner,bloater,spore_spitter,shield_husk,swarm_mite,tar_brute,void_wraith,boss_hive_titan,xi_gunner}_attack_{key,rgba}.png`。此 provenance 目錄依既有規則 gitignored，不進遊戲包。
- `remove_chroma_key.py` 以 border auto-key、soft matte、despill 去背；`scripts/build-r78-attack-atlases.py` 再以共同基線、共同縮放與單次 Lanczos 下採樣，決定性輸出 runtime atlas。

來源與製作聲明已補入 `CREDITS.md`；正式 runtime PNG 與重建腳本納入版本控制。

## 狀態機接線

- `src/config.js` 為每組 action atlas 與 `TRAILER_GUNNER` 宣告 `anticipationFrames: [0, 1]`、`impactFrame: 2`、`recoveryFrame: 3`。
- `src/game.js` 的 `phasedAttackFrame()` 依 attack phase 與 phase progress 選幀；enemy 與 companion renderer 均優先正式 attack atlas，僅在資產實際載入失敗時保留可替換 fallback。
- debug contract 提供 `enemyAttackAtlasDrawn`、`enemyAttackAtlasFrames`、`companionAttackAtlasDrawn` 與 `companionAttackAtlasFrame`，讓 E2E 驗證「畫到了哪一格」，而不是只驗證狀態名稱。
- 非 Boss 接觸攻擊以 `contactRetirePending` 延後死亡交接到 recovery 結束；damage gate 仍在 impact，沒有改成 input-press 即傷害。
- `sw.js` 已快取全部 10 張正式 attack atlas，HTML、service worker、測試與 README 同步升為 R78／`ashes-convoy-r78-v1`。

## 守門結果

| 閘門 | 結果 |
|---|---|
| `npm test` | PASS；含 45 個動畫資產、1,386,517 bytes，10 張 attack atlas 的四幀介面與 6 組 pair alpha 差 |
| `npm run test:e2e` | PASS；390×844、820×1180、1280×900、1366×700，加上 fallback、音訊、離線與 R76 六組控制尺寸 |
| 攻擊時序 E2E | PASS；spitter `0→1→2→3` 且只在 2 生成投射物；runner 只在 2 傷害並完成 3 後死亡；Boss `0→1→2→3` 且只在 2 召喚；席安 `0→2→3` 且只在 2 開火 |
| `npm run test:rwd` | PASS；3 個 UI 狀態 × 10 個 viewport，頁面捲動與水平溢位皆 0 |
| `npm run test:perf` | PASS；54 隻 raster 敵人、每情境 3 輪、220 samples；attack atlas observed、raster drawn 54、fallback 0 |
| p95 budget | PASS；auto/reduced desktop 3.7ms、phone 3.2ms；low/reduced desktop 3.3ms、phone 3.6ms，皆低於 18ms |
| alpha gate | PASS；10 張 atlas、每張任兩幀皆 `> 0.08`，全域最小 0.100571（席安 frame 0/1） |
| 秘密掃描 | PASS；`rg` 掃描 `sk-proj-...` 與 `sk-...`，排除 `.git`／`node_modules`，0 命中 |
| `git diff --check` | PASS |

效能原始結果：[R78 perf-p95.json](evidence/R78/perf-p95.json)。alpha 原始逐 pair 結果：[R78 attack-alpha-metrics.json](evidence/R78/attack-alpha-metrics.json)。

## 證據

- [Before / after 與證據索引](evidence/R78/before-after.md)
- [10 組四階段並排證據頁](evidence/R78/attack-sequence-proof.html)
- 分段 PNG：[01](evidence/R78/attack-sequence-proof-01.png)、[02](evidence/R78/attack-sequence-proof-02.png)、[03](evidence/R78/attack-sequence-proof-03.png)、[04](evidence/R78/attack-sequence-proof-04.png)、[05](evidence/R78/attack-sequence-proof-05.png)
- 實機 viewport：[desktop 1366×700](evidence/R78/desktop-1366x700-run.png)、[tablet 820×1180](evidence/R78/tablet-820x1180-run.png)、[phone 390×844](evidence/R78/phone-390x844-run.png)

版本權威值為 `R78`。本輪依要求只建立本地 commit，不 push。
