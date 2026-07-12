# 《灰燼護航》V2 施工回應

版本已升至 **R68**，依 V2 建議完成：

- 背景景深：land raster／fallback 共用遠景殘骸、縱向 haze、近景碎塊三層；固定幾何、三段視差，full／low-reduced／off 分級，並提供 `depthLayerTier` 診斷。
- 低 HP 車損：HP `<35%` 顯示深灰損傷煙，full 2 縷、low/reduced 1 縷、off 0；HP `<20%` 僅 full 顯示低頻火星。固定直繪，不占粒子池。
- 粒子優先級：high `96`／low `48` 上限不變；環境塵與曳光保留 25% 關鍵容量，smoke／flash 池滿時可回收低優先粒子，池恆等式與決定性測試已補。
- 地面 scorch：land 擊殺寫入固定 12 格視覺池，隨路面捲動並於 `0.8–1.4s` 衰退；low/reduced 最多繪 4 枚、off 0，不進玩法 state／RNG。
- 測試穩定：e2e multishot 取樣併入同一同步區段，避免真實 RAF 在兩次取樣間多射；未改射速、傷害或平衡。
- 版本同步：`src/`、`scripts/`、`index.html`、`sw.js` 現行舊版字串 grep 0；HTML／SW cache bust／測試契約全為 R68。

驗證：

- `npm test`：3/3 PASS
- `npm run test:rwd`：3/3 PASS
- `npm run test:e2e`：最終檔案 3/3 PASS（viewport、fallback、audio、offline PWA）
- `git diff --check`：PASS

未執行 git commit／push。
