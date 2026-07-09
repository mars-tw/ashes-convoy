# Codex Response - Grok R2

## 本輪結論

採納並修正 R2-1：盾殼不再用 `projectile.vy < 0` 當正面唯一判定。runtime 會把拖車/玩家載具位置傳入 rules，盾殼以前向半平面判定「是否從面向拖車的一側來襲」；AoE 維持吃盾。這修掉拖車機槍手對螢幕下方/側向盾殼開火時整包繞盾的問題，同時保留真正從非面向拖車側命中的弱側行為。

也採納 R2-5 的測試缺口：`pickWeighted` 在 `total <= 0` 時新增 3000 次均勻回退測試，明確鎖住不除以 0。

版本由 on-disk `R59` bump 到當輪目標版，並同步 `src/version.js`、`src/config.js` fallback、`index.html ?v=`、`sw.js` cache list、`scripts/test-config.js`、`scripts/test-automation-guards.js`、`scripts/test-e2e.js` 斷言。

## Grok R2 逐條回應

| 項目 | 結論 | 處理 |
|---|---|---|
| `hitIds` 主路徑 PASS | 同意 | 不重開；R59 測試已鎖同一顆穿透彈跨幀不重複傷害。 |
| 缺 `enemy.id` 時 hit-set 失效 P2 | 延後 | 生產 `spawnEnemy` 必有 id；畸形 `__test.setState` 才會觸發。若未來強化測試注入，再加 index fallback。 |
| 穿透 + splash 次要目標可重複吃 splash P2 | 延後 | 現有武器配置 pierce/splash 分家；若新增貫穿榴彈，再補 per-projectile splash hit-set。 |
| `pickWeighted` fractional PASS | 同意 | 保留 R59 修正。 |
| `pickWeighted` 全 0 無單測 P2 | 採納，已修 | `scripts/test-rules.js` 新增 all-zero pool 3000 次精確三等分，鎖 `total <= 0` 均勻 fallback。 |
| 空 pool 呼叫端 NPE P2 | 延後 | 正常 config wave pool 不空；屬資料完整性防呆，非本輪 P1。 |
| 傷害源走 `resolveEnemyIncomingDamage` PASS | 同意 | 主彈道、splash、deathBurst、broadside echo 保持統一結算。 |
| 主彈道未共用 helper P2 | 延後 | 功能等價；若之後加元素/破甲共通效果，再收斂到 helper，避免本輪混入重構。 |
| R2-1 `frontHit = vy < 0` P1 | 採納，已修 | 改成拖車相對方位前向半平面；runtime 傳 `shieldFacing: state.vehicle`。 |
| `sourceKind: "aoe"` 未讀取 P2 | 已改善 | `sourceKind === "aoe"` 現在明確讓 AoE 吃盾，符合 R59 splash/deathBurst 行為。 |
| 道路/機槍手大致 PASS | 同意 | 不調道路與機槍數值。 |
| 機槍 `targetRange` 近全域 P2 | 延後 | 屬平衡決策；本輪只修正盾語意破洞。 |
| loop vs `step()` 時步 | 延後 | 會觸及主循環 accumulator、e2e 時序與效能統計；無本輪失敗信號。 |
| Boss summon cap | 延後 | 需要召喚佇列/替換策略，會改 Boss 難度；應獨立補 cap 情境測試。 |
| migrate 祖父條款 | 延後 | 本輪未 bump `META_VERSION`、未改 storage schema；遷移政策另開 storage matrix 較安全。 |
| 每幀 `emitState` deepClone | 延後 | 需改 UI 訂閱契約/測試 API；效能專版處理。 |

## 盾修正語意

盾殼正面現在定義為「盾殼面向拖車/玩家載具的半平面」：

- 有 `enemy.x/y`、`shieldFacing.x/y` 與彈速時，取 `enemy -> shieldFacing` 為盾正面，取 `-projectile.vx/vy` 為來襲來源方向，dot >= 0 即吃盾。
- 缺位置資料時，保留舊 `vy < 0` fallback，避免破壞舊測試與畸形注入。
- `sourceKind: "aoe"` 一律吃盾，延續 R59 splash/deathBurst 語意。

最小情境：

- 盾殼在拖車上方，玩家彈 `vy < 0`：吃盾，28 -> 8，HP 只漏 6.4。
- 盾殼在拖車下方，機槍/下射彈 `vy > 0`：仍吃盾，28 -> 8，HP 只漏 6.4，不再整包繞盾。
- 盾殼在拖車側邊，側向彈 `vx > 0` 且來自拖車面向側：吃盾。
- 盾殼在拖車上方，但彈從非拖車面向側往下打 `vy > 0`：不吃盾，維持弱側全額 HP 行為，避免把所有玩家機槍彈反向誤判成盾擊。

## 驗證

- `npm test` PASS。
- `npm run test:e2e` PASS，連跑 3 輪。
- headless 殘留檢查：未見測試殘留 Chrome/Chromium headless；僅有常駐 Playwright MCP node 行程。
- 產品/測試路徑 `rg -n "R59|r59" src index.html sw.js scripts` 為 0。
- rules 新增邏輯只用傳入資料、`Number` 與 `Math.hypot`；未引入 DOM、`Date.now` 或非注入式 `Math.random`。本輪未改 storage schema，`META_VERSION` 維持 3。

## 與 Grok 不同處

Grok R2 判定 R2-1 為 P1 且「本輪只審不改」；本輪已採納並落地。其餘 P2 我同意多數風險描述，但未在該輪版本混入：它們分別屬測試注入防呆、未來武器組合、平衡、主循環、Boss AI、storage policy 或 UI snapshot 契約，沒有必要與盾正面語意修正綁在同一版。
