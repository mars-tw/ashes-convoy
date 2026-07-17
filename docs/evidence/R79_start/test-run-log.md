# R79.1 test run log

## Final green runs

| Command | Result |
| --- | --- |
| `npm test` | PASS；含 R79.1 C2PA／雙層 SHA／alpha／content-hash 守門及既有動畫、命中幀、規則、storage、sprite、FX、audio。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r79` | PASS；1366×700、820×1180、390×844 安全裁切與畫面證據，文字對比最低 8.894:1。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:rwd` | PASS；3 states × 10 viewports。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS；主 E2E、fallback、離線及 R76 controls 同一 aggregate command EXIT 0。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:perf` | PASS；p95 最大 14.1ms，低於 18ms。 |
| `PLAYWRIGHT_CHANNEL=chrome node scripts/measure-wave2-start.js ...` | PASS；Fast 3G／4× CPU 三次，首焦 p95 1186.9ms。 |
| `git diff --check` | PASS。 |
| 實密鑰 regex（排除 `.git`／`node_modules`） | PASS，0 命中。 |

## Preserved failed attempts

未刪除或改寫失敗事實；下列均在相同斷言下修正／隔離重跑：

1. 現行 R79 before：首焦 13999.2ms、可互動 14028.2ms，硬閘門 FAIL。
2. 初版 R79.1 仍把 mark 綁在正式 `<img>`，首焦 15000ms timeout；改為真實低頻寬 key-art decode＋stage next-paint mark。
3. RWD 首次命中舊 `start.png`／舊 atmosphere 字串；更新守門到 content-hash quality asset，並移除把 `backgroundMode=none` 誤認 settled 的競態。
4. E2E start fallback 未攔到 query URL；route 改為 `start.png*` 後通過。
5. aggregate E2E 後段曾因機台併發關閉 Chrome；加入兩段瀏覽器之間 `>=2GiB`／60 秒重試閘門後，同一 aggregate command 最終 PASS。

所有瀏覽器測試均線內序列；本機測值標註為併發、不可信，正式出貨仍由總稽核淨機重測。
