# Ashes R76 控制可達性硬化回報

本輪完成 P0 控制可達性硬化，目標是短高桌機、一般非觸控桌機與手機 primary pointer coarse 都能正確顯示並點到關鍵控制。

## 變更摘要

- 桌機 UI：維持 `(pointer: fine)` rails，並提高桌機展開基地控制層高度，確保 1920x1080、1440x780、1366x600、1280x640 的 rails、出勤/基地與展開基地按鈕都在視口內可命中。
- 手機 UI：手機控制盤 CSS 改為只在 `(pointer: coarse)` 顯示；`src/ui.js` 也只在 primary pointer coarse 時套用 `.touch-controls.is-visible`，非觸控桌機不再誤顯搖桿/衝技彈。
- 快速升級輪盤：輪盤改用實際 DOM 尺寸量測後 clamp 到戰場可視範圍；關閉鈕提高到 44x44。
- 抽屜/modal：基地抽屜關閉列 sticky，設定控制加入 scroll margin，select 命中寬度補足；拖車 modal 關閉鈕維持可見。
- 版本同步：`R76` / `ashes-convoy-r76-v1` 已同步到 runtime、HTML query、SW cache、測試 guard 與 README。

## 新增守門

- 新增 `scripts/test-r76-controls.js`，併入 `npm run test:e2e`。
- 覆蓋視口：桌機 1920x1080、1440x780、1366x600、1280x640；手機 390x844。
- 檢查項：控制中心在 viewport 內、中心 hit-test 回自身、尺寸至少 44px、同組控制不重疊；桌機 run 內無手機控制盤；手機 run 內保留 R74 虛擬搖桿與衝/技/彈。

## 驗證

- `npm test` PASS
- `npm run test:rwd` PASS：30 組 state x viewport，頁捲 0、橫溢 0
- `npm run test:e2e` PASS：原 e2e + R76 controls 全綠
- secret scan PASS：排除 `.git` / `node_modules`，指定 key pattern 零命中

## 證據

- `docs/evidence/R76_controls/desktop-1920-start-rails.png`
- `docs/evidence/R76_controls/desktop-1366x600-quick-wheel.png`
- `docs/evidence/R76_controls/phone-390-touch-controls.png`
