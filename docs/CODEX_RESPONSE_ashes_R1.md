# Codex Response - Grok R1

## 本輪結論

本輪採納並修正：1.1 穿透彈 hit-set、1.2 fractional `poolWeight`、1.3 splash/deathBurst 統一受傷結算，並順手把 broadside echo runtime 套用同一結算；1.8 車損熱路徑避免每擊 clone 整車。

本輪不調 weapon config。修正後既有 economy/balance 守門全綠；穿透武器的「跨多個新目標」吞吐仍保留，只有同一敵人跨幀重疊的錯誤倍傷被移除。

## P0/P1 逐點回應

| 項目 | 結論 | 技術理由與處理 |
|---|---|---|
| 1.1 穿透彈重複扣血 | 採納，已修 | `projectile.hitIds` 記錄已命中的 enemy id；已命中目標跳過，pierce 只在新目標命中時遞減。新增 e2e：同一顆 pierce=2 彈重疊 5 幀只扣 10 傷、pierce 只降到 1。 |
| 1.2 `pickWeighted` 夾成 1 | 採納，已修 | 改為允許 `Math.max(0, weight)`，total 為 0 時均勻回退。新增 rules 直方圖測試，驗證 wave 8 pool 的 fractional share 接近 config，且 `tar_brute` 不再接近 `runner` 頻率。 |
| 1.3 splash/deathBurst 繞過受傷結算 | 採納，已修 | 新增 runtime helper 統一呼叫 `resolveEnemyIncomingDamage`；splash、deathBurst、broadside echo 都會吃 shield/phase。deathBurst 維持不計入玩家 `damageDealt`，避免改動結算統計語意。 |
| 1.4 shield 正面判定幾乎恆真 | 部分採納，延後 | 問題成立，但這是敵人機制/操作語意重設，不適合混入本輪 bugfix。若改成角度或側背判定，需要圖鑑/UI/平衡一起改。 |
| 1.5 loop 與 `step()` 固定步長不一致 | 部分採納，延後 | 風險在 determinism，但改 accumulator 會觸碰整個主循環、效能統計與 e2e 時序。這輪先不改，避免和傷害修正混雜。 |
| 1.6 Boss summon cap 靜默失敗 | 採納為 backlog，延後 | 問題可成立；修法需要召喚佇列或替換策略，會改 Boss 難度。建議獨立小改並加 cap 情境 e2e。 |
| 1.7 migrate 祖父條款過寬 | 採納為 backlog，延後 | 風險真實，但存檔政策改動高風險；本輪沒有 bump `META_VERSION`，不觸發新遷移。需另開 storage matrix。 |
| 1.8 車損每擊 deepClone | 採納，已修 | 保留 `applyVehicleDamage`/`resolveSlipstreamDamage` 的 pure clone API 給 tests；新增 `resolveVehicleDamageFields`/`resolveSlipstreamDamageFields` 給 runtime 局部更新 hp/shield/slipstreamReadyAt。 |
| 1.9 `saveMeta` quota 錯誤 | 採納為 backlog，延後 | 正確性風險成立；需 UI recovery/匯出碼流程設計，本輪不混入。 |
| 2.1 每幀 `emitState/getState` deepClone | 採納為 backlog，延後 | 這是效能大項，但會改 UI 訂閱契約與測試 API；應獨立處理 dirty HUD/snapshot API。 |
| 2.2 碰撞 O(projectiles x enemies) | 採納為 backlog | 穿透倍傷已先修；空間分割屬效能優化，需壓測避免引入漏碰撞。 |
| 2.3 `fireProjectiles` 每幀算 shot stats | 採納為 backlog | 可 cache，但要掛 gate/buff/weapon powerup/upgrade invalidation；本輪不動。 |
| 2.4 每幀 `updatePartsPreview` | 採納為 backlog | 可事件化，低風險但非本輪必修。 |
| 2.5 渲染 filter/拖影/gradient 成本 | 採納為 backlog | 需要視覺契約與截圖比較，適合性能專版。 |
| 2.6 熱路徑 `filter`/`forEach` 分配 | 採納為 backlog | 可做雙指標壓縮，但改動面廣；延後到效能批次。 |
| 2.7 FX pool 全掃 | 部分採納，延後 | 現 cap 小，沒有目前失敗信號；等粒子 cap 上調再做 active list。 |
| 2.8 fallback 背景每幀 gradient | 採納為 backlog | 只影響資源載入失敗/弱網路徑；不影響本輪正確性。 |
| 3.1 `game.js` 過肥 | 採納為架構 backlog | 方向正確，但大拆不應和 bugfix 混跑。 |
| 3.2 行為仍散落 switch | 採納為架構 backlog | 新 behavior/Boss phase 可逐步 handler map 化；非本輪。 |
| 3.4 rules API 部分過重 | 部分採納 | 本輪已用 fields helper 降低車損 runtime clone；`resolveBroadsideEcho` 本身仍保持 pure clone API，未拆。 |
| 4.1 穿透平衡 | 採納，已驗 | hit-set 修正後重跑全測試，未需要調整 `void_lance` 或 laser 數值。 |
| 4.2 生成權重平衡 | 採納，已驗 | fractional `poolWeight` 已修，新增直方圖守門；全測試綠。 |
| 4.3 家具數值過薄 | 部分採納，延後 | 屬養成設計決策，沒有本輪 bug 證據。 |
| 4.4 idle 射速懲罰未說明 | 部分採納，延後 | 體驗問題成立，但改動會影響新手與自動瞄準節奏；需獨立決策。 |

## 被總稽核點名但報告列為 P2 的項目

| 項目 | 結論 | 理由 |
|---|---|---|
| 1.11 `runMods.burn/shock/slow` 死欄位 | 延後 | 資料模型債，未造成現行錯誤。刪除或實作都會碰 UI/存檔/供應設計。 |
| 1.12 input listener 無 dispose | 延後 | 單頁產品路徑目前可接受；HMR/多實例才會爆。建議獨立加 `dispose()` 與測試。 |

## 修正清單

- `src/game.js`: projectile 增加 `hitIds`，穿透彈不再重複命中同一敵人。
- `src/rules.js`: `pickWeighted` 支援 0 到 1 的分數權重。
- `src/game.js`: splash、deathBurst、broadside echo 改走 `resolveEnemyIncomingDamage`。
- `src/rules.js` + `src/game.js`: 車損 runtime 改用 fields helper，避免每擊整車 deepClone。
- 版本同步到 R59：`version.js`、config fallback、HTML query、SW cache list、測試字面、boot guard。

## 平衡回歸

- `void_runner` base: 8.5 damage / 0.105s，單目標 DPS 80.95；穿透三個不同目標總吞吐 242.86 DPS。
- `void_runner` laser Lv3: 單目標 DPS 90.34；六個不同目標總吞吐 542.06 DPS。
- `land_rig` laser Lv3: 單目標 DPS 93.00；四個不同目標總吞吐 372.00 DPS。
- 修正前貼身重疊會把「不同目標吞吐」錯套到同一敵人；修正後只移除這個錯誤倍傷，不降低穿透對新目標的設計價值。
- `npm test` 的 economy/balance 相關守門全綠，因此本輪不調 `void_lance` / laser 傷害或射速。

## 驗證

- `npm test` PASS。
- `node scripts/test-e2e.js` PASS，連跑 3 輪。
- `node scripts/test-rwd-matrix.js` PASS。
- 產品與測試路徑舊版字串已歸零；原始 Grok 報告保留歷史版本字樣，不改原文。
