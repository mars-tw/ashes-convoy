# Ashes R79 起始畫面重設計收尾報告

## 結論

R79 起始畫面已完成收尾。中央直式 `assets/ui/start.png` 護航車隊 key art 現在於桌機 1366×700 與手機 390×844 都完整可見，不再出現只剩暗色 atmosphere 的黑洞；標題、主圖、CTA 維持三列獨立版面，手機沒有互相覆蓋，基地選單與管理抽屜預設收合。

權威版本已升為 `R79`，service worker cache、HTML query version、README、測試與離線資產清單同步更新。

## 中央 key art 根因與修正

- 素材本體正常：`assets/ui/start.png` 為 800×1638 的完整直式護航車隊圖，並非黑圖或錯誤素材。
- 路徑正常：runtime `START_SCREEN.image`、`#shelterImage` 與 E2E 均指向 `assets/ui/start.png`。
- 黑洞是載入過渡空窗：stage 已進入可見狀態，但 `<img>` 尚未完成 `onload` 時，只會露出刻意壓暗中央的 R79 atmosphere。
- 修正方式：`.start-art-stage` 先以同一張 `start.png` 的 `center / contain no-repeat` 作為載入保底，再疊入寬幅 atmosphere；正式 `<img>` decode 完成後仍以 `object-fit: contain` 接手。
- 新增真瀏覽器守門：確認圖片非 hidden、decode 完成、自然尺寸大於零、display/opacity 正常、中央 hit layer 為 `#shelterImage`，且 stage 的保底 background 同時存在。

## 視覺與 RWD

- 起始畫面改為「品牌標題／中央 key art／操作列」三列，避免舊版標題卡與 CTA 壓住主圖。
- 桌機加入寬幅灰燼廢墟 atmosphere 與貼近直式 stage 的功能 rails；中央仍保留既有直式 key art 作為唯一主焦點。
- 手機 390×844 保留完整車隊構圖，標題列、主圖、出勤與基地 CTA 互不重疊。
- 基地次操作收進預設關閉的浮層；管理抽屜與拖車房間沿用既有可捲動、可關閉結構。
- 本輪未改動角色 locomotion、攻擊、受擊或死亡動畫；R78 的 authored frame atlas 與 impact-frame 傷害規則保持原樣，沒有以整張圖片位移或 bobbing 冒充角色動畫。

## 圖像資產與來源

- 新資產：`assets/ui/start-atmosphere-r79.png`，2048×1152、24-bit RGB PNG、無 alpha / `tRNS`。
- 角色：桌機 viewport atmosphere extension；中央 32% 刻意低細節，讓既有 `assets/ui/start.png` 成為前景主圖。
- SHA-256：`9754d2a8a6ce563e6a07e969e8643132722e4b3fcb72053c4794e3bc8cab022a`。
- 生成與後製紀錄：`assets/ui/start-art-manifest.json`；來源、prompt 摘要與 alpha 政策同步記錄於 `CREDITS.md`。

## Before / After 證據

| Viewport | Before | After | 稽核結果 |
| --- | --- | --- | --- |
| 1366×700 | [before-desktop-1366x700.png](evidence/R79_start/before-desktop-1366x700.png) | [after-desktop-1366x700.png](evidence/R79_start/after-desktop-1366x700.png) | 車隊主圖完整可見；寬幅 atmosphere、rails、logo 與 CTA 無遮擋 |
| 390×844 | [before-phone-390x844.png](evidence/R79_start/before-phone-390x844.png) | [after-phone-390x844.png](evidence/R79_start/after-phone-390x844.png) | 車隊主圖完整可見；標題／主圖／操作列無疊層；基地浮層與抽屜預設關閉 |

After 截圖由 `npm run evidence:r79` 產生；腳本會等待 `#shelterImage` decode、兩個 animation frame，完成中央層與去疊層斷言後才截圖，避免再把載入過渡畫面當成最終證據。

## 守門結果

- `npm test`：PASS。含 config、automation、visual、R79 asset/alpha、animation assets、rules、economy、storage、sprites、FX、audio。
- `PLAYWRIGHT_CHANNEL=chrome npm run evidence:r79`：PASS。1366×700 與 390×844 皆完成 key art decode、中央層與三列去疊層稽核。
- `npm run test:rwd`：PASS。3 種狀態 × 10 視口共 30 組；所有情境頁捲 0、橫溢 0，包含 390×844。
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`：PASS。4 viewport、圖片降級、音訊、service worker 離線與 R76 控制守門全綠。
- `git diff --check`：PASS。
- 秘密掃描：零命中。

## 測試穩定性補強

- Playwright browser/server teardown 增加有限等待，避免 Windows `browser.close()` 無限卡住。
- RWD 狀態準備使用確定性 DOM click；仍等待目標抽屜或房間真正可見後才稽核。
- 觸控拖曳彈道測試隔離瞄準輔助，並排除 `source: "companion"` 的熹射擊，確實驗證玩家彈。
- 粗略 rAF FPS 使用 frame delta 中位數並以畫面診斷相同的整數 FPS 比較 30；正式 Chrome channel 不強制關閉 GPU，預設 CI Chromium 設定不變。
- R76 快速升級輪在同一頁面 task 內取得最新載具中心並 dispatch pointerdown/up，避免跨程序延遲導致點擊過期座標。

## 版本與提交範圍

- `src/version.js`：`R79`。
- cache：`ashes-convoy-r79-v1`。
- HTML、manifest/icon query、service worker app shell 與離線素材同步 R79。
- 本地提交，不 push。
