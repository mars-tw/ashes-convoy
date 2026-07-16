# Ashes R78 優化計畫

- 輪次代號：ashes R78
- 依據：`C:\Users\digimkt\.claude\skills\game-optimization-round\SKILL.md`、`docs/AUDIT_full.md`、`AGENTS.md`、R73 raster action 規格與 R77 attack phase 管線
- 本輪目標：補齊所有具 raster walk atlas 的敵人／Boss，以及具有攻擊表現的席安之正式 attack atlas，讓 anticipation／impact／recovery 全程使用獨立繪製姿勢；傷害與投射物仍只在 impact 幀發生。

## 八大面向

| 面向 | R78 具體項 | 驗收 |
|---|---|---|
| 美術 | 9 組敵人／Boss 共用視覺與席安各新增 4 幀 painterly-pixel attack atlas；每組為 anticipation 2 幀、impact 1 幀、recovery 1 幀。 | 同 R73 單幀解析度、alpha PNG、無整圖變形假動作；證據圖逐組並排。 |
| 按鈕 | 本輪不改按鈕，但保留 R76 控制可達性與 44px 命中守門。 | `npm run test:e2e`、`npm run test:rwd`、R76 controls 全綠。 |
| 選單 | 本輪不改選單；驗證 atlas 增量不影響離線啟動、抽屜返回與短高視口。 | 既有 E2E／RWD 無回歸。 |
| 人物 | 席安砲座從 idle/fire 兩幀替代路徑升級為正式四幀 attack action atlas。 | anticipation、impact、recovery 各顯示指定幀，debug／E2E 可觀測。 |
| 地圖模型 | 本輪不改地圖；保留 R73/R77 戰場 painterly-pixel 色盤與離線 cache。 | runtime atlas 與證據圖無畫風／尺寸斷層。 |
| 技能 | 遠程敵人、Boss phase、接觸攻擊與席安支援射擊仍只在 impact 執行 projectile／hitbox。 | 攻擊前零傷／零投射物，impact 才生效，揮空仍播 recovery。 |
| 腳色樣子 | 新 attack 姿勢保持既有角色臉／頭部、裝備、三主色與辨識剪影。 | 縮圖證據可辨各敵種；不換角色、不換色盤。 |
| 動作流暢度 | R77 三段狀態機改讀正式 attack atlas；low/reduced 仍使用真姿勢，不退化成 walk 替代幀。 | 任兩 attack 幀 normalized mean alpha difference `> 0.08`；E2E 斷言時序與幀切換。 |

## 素材與程式清單

1. 敵人／Boss 九組：`shambler`、`runner`、`bloater`、`spore_spitter`、`shield_husk`、`swarm_mite`、`tar_brute`、`void_wraith`、`boss_hive_titan`。
2. 共用變體：`ash_screamer`、`chain_tether`、`mirror_husk`、`ember_tick` 沿用其基礎視覺組之 attack atlas 與 runtime tint/filter。
3. 席安：新增砲座四幀 attack atlas，保持既有 `xi_gunner.png` 介面比例與角色／砲座設計。
4. 產製：OpenAI built-in image generation 生成色鍵 master，使用 imagegen 技能內建去背工具，再由可重跑腳本封裝成 runtime atlas。
5. 接線：`spriteActions.attack` 與 `TRAILER_GUNNER.attackSprite` 優先讀正式素材；素材載入失敗才走既有 R77 replaceable fallback，debug 明確揭露 fallback。

## 固定閘門

- `npm test`
- `npm run test:e2e`
- `npm run test:rwd`
- R76 控制可達性守門全綠
- desktop/mobile p95 <= 18ms 三跑中位，證據放入 `docs/evidence/R78/`
- attack atlas 每一對幀 alpha 差 `> 0.08`
- 攻擊序列證據圖：每組 anticipation／impact／recovery 並排，放入 `docs/evidence/R78/`
- 版本 bump 至 R78，runtime/cache/query/README/測試同步，舊 release token 歸零
- 秘掃排除 `.git` 與 `node_modules` 後零命中
- 產出 `docs/CODEX_RESPONSE_ashes_R78.md`
- 本地繁中 commit，不 push

## 不假完成原則

若任何一組正式 atlas 未達畫風、透明邊緣、尺寸或 alpha 差守門，保留 R77 可替換 fallback 並在報告列為缺件，不把替代幀宣稱為正式攻擊動畫。
