# 《灰燼護航》V1 施工回應

版本已升至 **R67**，依 V1 建議完成：

- 友敵彈分色：scatter 改為琥珀褐（`#d39a4a`），homing 改為白青（`#d8fbff`）；敵彈保留既有毒綠，拖尾與 tint cache 同步。
- 敵人受擊：完整特效下 hitFlash `0.16s → 0.20s`，染色取命中彈種 core，並依彈道方向做 2–3 幀 squash；Boss 強度降半。reduced 維持原 `0.12s` 且不啟用染色／squash。
- 車頭燈：land 暖光、其餘環境冷光；完整特效 2 顆 soft circle 微脈動，reduced 1 顆恆亮，off 不繪製。
- 雜兵爆炸：zombie／mech 改為 `0.025–0.11s` 的爆心→碎屑→煙錯峰；Boss 規格不動。
- 池與玩法：粒子池仍為 high `96`／low `48`；未改傷害、射速、掉落、敵人行為、模擬時鐘或 RNG。

驗證：

- `npm test`：PASS
- `npm run test:rwd`：3/3 PASS
- `npm run test:e2e`：3/3 PASS（含 viewport、fallback、audio、offline PWA）
- 本機畫面抽查：R67 正常載入；land 暖色雙燈可見；console 0 error。
- `src/`、`scripts/`、`index.html`、`sw.js` 舊版字串 grep：0。

未執行 git commit／push。
