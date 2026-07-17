# R80 test run log

日期：2026-07-17（Asia/Taipei）

## 最終綠燈

| 命令／閘門 | 最終結果 |
| --- | --- |
| `npm test` | PASS；含 R79.1 provenance、R80 五 master C2PA、動畫／規則／命中幀／sprite／FX／audio。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS；390×844、820×1180、1280×900、1366×700、四種缺圖故障注入、audio、SW offline。 |
| 同一 aggregate 內 `scripts/test-r76-controls.js` | PASS；1920×1080、1440×780、1366×600、1280×640、390×844。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:rwd` | PASS；3 states × 10 viewports = 30；所有案例 page scroll 0、horizontal overflow 0。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r79` | PASS；三視窗＋中央低細節、對比、品質與記憶體閘門。 |
| `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r80` | PASS；三視窗＋safe crop、computed-style contrast、中央走道雜訊、角色亮度／飽和度、alpha、品質與記憶體。 |
| `npm run test:perf` | PASS；四情境 median p95 9.2／9.9／17.6／15.9 ms，均 ≤18 ms。輸出 `docs/evidence/R80/perf-p95.json`。 |
| `node scripts/measure-wave2-start.js` | PASS；Fast 3G＋4×CPU，focus p95 1297.8 ms ≤3000 ms，interactive p95 5165.7 ms。 |
| `git diff --check` | PASS。 |
| secret regex scan | PASS；`sk-proj`／`sk-`／`xai-` 實 token pattern 0 命中，排除 `.git`／`node_modules`。 |
| promo runtime exclusion | PASS；四張 `docs/promo/*-r80.png` 在 `index.html`／`src/`／`sw.js`／manifest 0 引用。 |

所有 imagegen 與瀏覽器批次前的實體記憶體閘門均 ≥2 GiB；瀏覽器逐批、單併發，完成後關閉。

## 原始失敗與修正／隔離重跑

1. RWD 第一輪在手機 operations drawer 等待 30 秒逾時；前 17 案例通過。RWD state setup 改用既有 `__test.openMetaPanel`／`openTrailerRoom`，避免 UI 點擊準備競態；沒有放寬版面斷言。
2. RWD 第二輪在 1440×780 把暫時 Canvas fallback 誤判為首屏 settled，導致 `shelterImage.hidden`。settled gate 改為實際 image loaded、complete、natural size、display／visibility／opacity 可見；三個 state 隔離各 10 尺寸全綠後，原始 aggregate 30 案例全綠。
3. 一次 RWD 外層 600 秒逾時且無案例輸出；保留為本機併發／長批次紀錄。後續 aggregate 完整結束並全綠，未跳過尺寸。
4. 效能第一輪在 companion attack atlas 30 秒等待逾時。新增只讀 `rasterAssetsReady` test hook，要求敵人 walk／attack／hurt／death、載具、環境、拖車、角色與 FX 真素材全部 loaded 後才量測。
5. 效能 Chrome 嘗試受本機併發影響，auto p95 110.8／116.4 ms，另有首輪 enemy fallback；依協定不放寬 18 ms，改回原契約的無 GPU Chromium、完整 raster readiness 隔離重跑，最終全綠。本機值仍標註「併發、不可信」，總稽核需淨機重測。
6. 最終 E2E 複跑曾在 async raster wait 後錯過 void wraith 的短 phase window；測試改在確定性的五次 100 ms authored steps 當下取樣，未改玩法。下一輪在 CPU 81–96% 時 FPS 18.5→18.6 未達既有 floor；CPU 回落至 41.8% 後原 aggregate 命令全綠，門檻未放寬。

## 動畫契約

R80 未修改任何角色或敵人動畫圖檔、atlas 規格、攻擊三段、impact-frame 傷害、hurt／death 回收邏輯。最終 `Animation asset guards PASS (45 files)`、`Sprite contract PASS (36 sprites / 218 frames)` 與完整 E2E 均通過。
