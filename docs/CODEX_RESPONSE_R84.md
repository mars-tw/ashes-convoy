實作者：Codex（GPT-5）

# CODEX_RESPONSE R84

日期：2026-07-21（Asia/Taipei）。基線：R83.1／`f7e65a6`。範圍：真人試玩 `PLAYTEST-R1` 的 P1→P2 修正、R84 版本鏈、證據與永久回歸守門。

## 逐項修法與驗證

### 1. P1 R1-META-02：跑局 rail 設定被 pause panel 攔截

- `onState()` 在 `drawerReturnContext.returnToRun` 且 `metaDrawer` 可見時，把 drawer 視為合法 paused UI；和 quick wheel 一樣抑制 `showPause()`，並主動維持 `pausePanel.hidden=true`。
- `closeMetaDrawer()` 沿用 `resumeOnClose` 回到 `playing`，設定變更仍由既有 meta 儲存鏈保存。
- Playwright：跑局點 rail「設定」→戰局為 paused、pause panel 隱藏→真實點擊 `screenShakeToggle`→真實點擊關閉→drawer／garage 隱藏且回 `playing`。PASS。

### 2. P1 R1-SUPPLY-03：既有 fire click 誤選補給

- 新增兩層 pointer 隔離：補給開啟當下若已有 pointer 按住，該 pointer 的 release/click 必定被吃掉；沒有既有 pointer 時，choice pointer click 有 320ms debounce。
- 隔離只擋真實 pointer click；鍵盤 1–5、方向鍵、Enter 保持立即可用，fine-pointer guard 文案仍顯示 1–5。
- Playwright：真實 `mouse.down(canvas)`→補給覆疊出現→同一 pointer 移到 choice 並 `mouse.up`，choice 不得被選；隔離解除後真實 click 可選且只計一箱。PASS。

### 3. P1 R1-OUTCOME-04：撤離／陣亡共用護航結算

- `finishRun()` 在載具存活且無 death context 時寫入 `quit`（主動撤離）；敵人、Boss、爆裂、環境與敵方彈體保留死因 context。
- 結算新增 `evacuated`／`destroyed` outcome：
  - 撤離：綠色「撤離成功」，說明主動撤離波次與戰利品已安全帶回。
  - 陣亡：紅色「護航失敗」，列死因類型、敵人名稱、波次與最後傷害。
- Playwright 分別觸發存活撤離與 `shambler` 致死；標題、色彩 data outcome、原因與勝敗語意均分流。PASS。

### 4. P2 R1-SETTLE-05：againBtn focus 把標題捲走

- render 後先將 `settlementPanel.scrollTop=0`，下一個 frame 再以 `focus({ preventScroll:true })` 聚焦 `againBtn`；舊瀏覽器 fallback 會在 focus 後再次歸零。
- Playwright 在 390×844 產生長結算：`againBtn` 仍取得焦點、`scrollTop===0`、結算標題位於 panel 與 viewport 內。PASS。

### 5. P2 R1-WHEEL-07：快速升級入口不可發現

- 首玩戰局在車體上方持續顯示「點車體｜快速升級」，位置由 vehicle world position 映射到 DOM 百分比；第一次打開 quick wheel 後保存 `tutorial.seenQuickUpgrade=true` 並收起。
- 側欄「升級」改名「工坊」，提示明寫「戰局內快升；側欄工坊是完整整備」，避免兩個入口同義。
- Playwright：新存檔提示可見→真實點車體開輪盤→提示收起且已讀旗標保存。PASS。

### 6. P1 R1-LAND-01：844×390 仍是 portrait-native 窄戰場

- 本輪未非等比拉伸 Canvas 或只改 CSS 放大；844×390 顯示固定在左側安全區、`pointer-events:none` 的「旋轉回直向以獲得最佳體驗」，並說明橫向仍可操作。
- Playwright 驗證提示完整在 viewport 內、不攔截操作；既有 `test-r83-p0.js` 橫向真實 click、補給、日誌與 44px 可達性不退化。PASS。
- 真正 landscape-native scope 已寫入 [OPTIM_PLAN_R84.md](OPTIM_PLAN_R84.md)：camera／投影、HUD／rails、事件覆疊、觸控／快升與四尺寸多狀態驗收必須同批處理。

### 7. P2 R1-TRAILER-06：390 高家具卡過密

- `max-height:500px` 下家具目錄改雙欄，卡片壓至 44px，隱藏次要風格與長描述；家具效果仍保留在 `aria-label`，按鈕命中高度維持 44px。
- Playwright 驗證前兩卡同列、卡高 ≤58px、按鈕 ≥44px、長描述在低高模式收起。PASS。

## Gate 結果（final tree）

| Gate | 結果 |
|---|---|
| `npm test` | PASS；config、automation、visual、45 個 animation assets、rules、supply、economy、storage、36 sprites／218 frames、FX、audio 全綠 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS（560.5 秒）；主 4 視口、image/vehicle/zombie/environment fallback、audio、service-worker offline、R76 5 視口、`test-r83-p0.js`、R84 PLAYTEST-R1 全綠 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:rwd` | PASS（117.9 秒）；10 視口 × meta-shelter／ops drawer／trailer room 共 30 case，零裁切／頁級捲動／水平溢出紅燈 |
| `git diff --check` | PASS，零 whitespace error |
| 舊版號掃描 | `index.html sw.js src package*.json scripts` 內 `R83.1`／`0.83.1`／舊 cache 零命中 |
| 秘密掃描 | 高信心 OpenAI／GitHub／AWS token 與 private-key pattern 零命中；排除使用者未納管的 `docs/playtest/`／`docs/audit_openclose/` |

## 版本鏈

- npm/package lock：`0.84.0`
- `APP_VERSION`：`R84`
- `CACHE_VERSION`：`ashes-convoy-r84-v1`
- HTML manifest、icon、全部 runtime scripts、HTML boot reload key、SW app shell／版本化 assets：全為 `R84`
- 開始畫面 release mark 與設定版本顯示：`R84`

## Evidence

三尺寸同狀態 before／after：

- 390×844：[before run](evidence/r84/before-390x844-run.png)／[after run](evidence/r84/after-390x844-run.png)；另有 [撤離成功](evidence/r84/after-390x844-evacuation.png)。
- 844×390：[before run](evidence/r84/before-844x390-run.png)／[after run＋旋轉提示](evidence/r84/after-844x390-run.png)；另有 [低高家具雙欄](evidence/r84/after-844x390-trailer-compact.png)。
- 1366×768：[before run](evidence/r84/before-1366x768-run.png)／[after run](evidence/r84/after-1366x768-run.png)；另有 [跑局設定 drawer](evidence/r84/after-1366x768-settings-drawer.png)、[補給選擇](evidence/r84/after-1366x768-supply-choice.png)、[護航失敗／死因](evidence/r84/after-1366x768-defeat.png)。

所有檔案新增於 `docs/evidence/r84/`；既有歷史 evidence 未覆寫。

## 殘留

1. **真正 landscape-native 戰場重排仍是 backlog**：必須共同重做 camera transform、HUD/rails、事件 overlay、觸控配置與 screen-to-world 命中；本輪僅提供可玩且不攔截的旋轉引導。
2. 家具目錄目前在 390 高已可讀可點；若日後家具數量顯著增加，再做分類／分頁，現況不是 blocker。
3. 本輪未改角色 locomotion／attack／hurt／death assets 或 physics root；既有 frame animation 與 active-impact 守門持續由 `npm test` 驗證。
