# 《灰燼護航》ashes R73 清償報告

## 結論

R73 已清償本輪三項動畫稽核：所有具 raster walk atlas 的敵人都有同介面、同 painterly-pixel 畫風的 raster hurt／death action atlas；受擊與死亡不再切回 code-sprite；low 品質仍播放兩個真實 walk 姿勢，且移除了用單張圖位移、旋轉、擠壓冒充走路的路徑。

缺件清單：**無**。九組獨立敵人視覺、十三個敵人設定均已覆蓋。

## 逐敵人覆蓋

十三個設定對應九組共用視覺如下；變體沿用原本 walk atlas 的 tint／filter，也沿用完全相同的 action atlas，因此三種狀態不會換角色或換畫風。

| 敵人設定 | action 視覺組 | hurt | death |
|---|---|---:|---:|
| `shambler` | shambler | 2 幀 | 3 幀 |
| `runner` | runner | 2 幀 | 3 幀 |
| `bloater` | bloater | 2 幀 | 3 幀 |
| `spore_spitter` | spore_spitter | 2 幀 | 3 幀 |
| `shield_husk` | shield_husk | 2 幀 | 3 幀 |
| `swarm_mite` | swarm_mite | 2 幀 | 3 幀 |
| `tar_brute` | tar_brute | 2 幀 | 3 幀 |
| `void_wraith` | void_wraith | 2 幀 | 3 幀 |
| `ash_screamer` | spore_spitter | 2 幀 | 3 幀 |
| `chain_tether` | tar_brute | 2 幀 | 3 幀 |
| `mirror_husk` | shield_husk | 2 幀 | 3 幀 |
| `ember_tick` | swarm_mite | 2 幀 | 3 幀 |
| `boss_hive_titan` | boss_hive_titan | 2 幀 | 3 幀 |

## Atlas 規格與量測

量測採每個 action atlas 內「任兩幀」的 normalized mean alpha difference；守門門檻為 `> 0.08`。表中列出每組最小值，全部通過。hurt 為受衝擊與後仰兩個姿勢；death 為失衡、側倒、落地／碎裂三階段。

| 視覺組 | 單幀尺寸 | hurt 最小 alpha 差 | death 最小 alpha 差 | hurt 檔案 | death 檔案 |
|---|---:|---:|---:|---:|---:|
| shambler | 40×40 | 0.293 | 0.241 | 5,479 B | 7,065 B |
| runner | 40×40 | 0.296 | 0.239 | 5,297 B | 7,174 B |
| bloater | 52×52 | 0.205 | 0.155 | 10,383 B | 11,382 B |
| spore_spitter | 40×40 | 0.240 | 0.230 | 5,908 B | 7,044 B |
| shield_husk | 48×64 | 0.251 | 0.166 | 9,980 B | 10,491 B |
| swarm_mite | 44×44 | 0.315 | **0.102** | 6,047 B | 6,015 B |
| tar_brute | 56×68 | 0.268 | 0.150 | 10,482 B | 10,546 B |
| void_wraith | 48×64 | 0.254 | 0.209 | 9,566 B | 8,511 B |
| boss_hive_titan | 88×80 | 0.319 | 0.211 | 23,716 B | 27,773 B |

整批最低值為 `0.102`，高於 `0.08` 門檻 27.5%。測試同時核對 atlas 像素尺寸、幀數、fps、設定引用與 Service Worker cache。

## Low 品質走路

low／reduced 路徑固定從既有四幀 walk atlas 取第 0 與第 2 幀交替，只降低到 2–4 fps，不再凍結 frame 0。以下為兩個實際使用姿勢的 alpha 差：

| 視覺組 | walk frame 0 ↔ 2 alpha 差 |
|---|---:|
| shambler | 0.142 |
| runner | 0.137 |
| bloater | 0.087 |
| spore_spitter | 0.147 |
| shield_husk | 0.137 |
| swarm_mite | 0.210 |
| tar_brute | 0.091 |
| void_wraith | 0.163 |
| boss_hive_titan | 0.136 |

九組最低 `0.087`，均高於同一個 `0.08` 真姿勢門檻。`drawEnemyEntity` 已移除 `lift`、`wobble`、`squashX`、`squashY`、`ctx.rotate` 與 `ctx.scale`；物理 root／collider 未被視覺動畫改寫，命中造成的 `knockX`／`knockY` 擊退仍保留。

## 前後對照

| 稽核點 | R72 | R73 |
|---|---|---|
| 敵人死亡 | `drawEnemyCorpse` 呼叫 `drawSprite(effect.sprite)`，高解析 raster 瞬間切成小型 code-sprite | 只讀 `spriteActions.death` 並以 `drawImage` 播放 3 幀；0.5 秒播完後才進入淡出與移除 |
| 敵人受擊 | hit flash 期間用 `drawSprite(enemy.sprite, hit)` 覆蓋 raster | 優先播放 2 幀 raster hurt；素材尚未 ready 時仍保留 raster walk 並疊白，不會切 code-sprite |
| low 走路 | frame 0 加 lift／wobble／squash／rotate 假動態 | frame 0／2 真姿勢交替，只降 fps，不降至單幀 |

`killEnemy` 會把 death atlas 播放長度寫入 corpse effect；目前 death 為 3 幀、6 fps，完整播放 0.5 秒，再保留約 0.2 秒淡出。受擊為 2 幀、10 fps。visual action 與敵人物理 root 分離。

## 守門測試

`scripts/test-animation-assets.js` 新增下列檢查：

- 以 Node 直接解碼 PNG alpha，hurt／death atlas 每一對幀的差都必須 `> 0.08`。
- low 實際使用的 walk frame 0／2 alpha 差必須 `> 0.08`。
- 每個具 raster walk atlas 的敵人必須有有效的 hurt／death 設定與檔案。
- 掃描 `drawEnemyCorpse`，禁止 `drawSprite`、`effect.sprite` 與 code-sprite 死亡欄位。
- 掃描 `drawEnemyEntity`，禁止 code-sprite hit 覆蓋，以及 walk bob／rotate／scale／squash 假動畫。

執行結果：

- `npm test`：PASS（animation asset guards 共核對 35 個圖檔、722,518 bytes）。
- `npm run test:e2e`：PASS（四視口、low 兩幀切換、fallback、audio、Service Worker offline）。
- `npm run test:rwd`：PASS（全矩陣 0 horizontal overflow）。

## 視覺證據

| 證據 | 視口／尺寸 | 內容 |
|---|---:|---|
| [`docs/evidence/R73/desktop-low-death.png`](evidence/R73/desktop-low-death.png) | 1440×900 | 桌機 low 實機戰鬥 |
| [`docs/evidence/R73/tablet-low-death.png`](evidence/R73/tablet-low-death.png) | 1024×1366 | 平板 low 實機戰鬥 |
| [`docs/evidence/R73/phone-low-death.png`](evidence/R73/phone-low-death.png) | 390×843 | 手機 low 實機戰鬥與受擊姿勢 |
| [`docs/evidence/R73/action-atlas-proof.png`](evidence/R73/action-atlas-proof.png) | 1424×2608 | 九組 walk 0／2、hurt 2 幀與 death 3 幀並排證據 |

可重開的證據頁為 [`docs/evidence/R73/action-atlas-proof.html`](evidence/R73/action-atlas-proof.html)，直接讀取正式 runtime PNG，沒有另畫示意圖。

## 產製與可替換架構

正式素材以 OpenAI built-in `image_gen` 產出。每組 prompt 明確要求：沿用既有 walk atlas 的角色設計、鏡位、光源、painterly-pixel 筆觸與輪廓解析度；一列六個互不重疊的真姿勢（兩個 hurt、四個 death 候選），透明鍵色背景、無文字、無 UI、無陰影地板。九張原始產出保留在 Codex generated-images 保存區，工作副本位於 gitignored 的 `tools/asset_sources/imagegen_r73/`。

後製先使用 imagegen skill 內建 `remove_chroma_key.py` 做 border auto-key、soft matte 與 despill，再由 [`scripts/build-r73-action-atlases.py`](../scripts/build-r73-action-atlases.py) 以每個 action 的共同縮放、共同地面基線及單次 Lanczos 下採樣封裝。未來若要替換美術，只需置換 keyed source 並重跑腳本，runtime config／播放介面無須重寫。完整來源標註亦已寫入 [`CREDITS.md`](../CREDITS.md)。

## 版本

遊戲、HTML query cache、Service Worker cache 與測試期望值均已升至 **R73**。

## 秘密掃描

已依指定規則執行 `grep -rniE "sk-proj-[A-Za-z0-9_-]{20}|sk-[a-z0-9]{40}"`（排除 `.git`），結果為 **0 命中**。
