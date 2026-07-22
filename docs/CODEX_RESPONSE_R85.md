實作者：OpenAI Codex（GPT-5）

# CODEX_RESPONSE R85

日期：2026-07-22（Asia/Taipei）。基線：R84／`dba3623`。範圍：真人試玩 `PLAYTEST-R1` 唯一未解 P1 `R1-LAND-01`，以及 R85 版本鏈、永久回歸與證據；未 push。

## 根因

1. `index.html` 的通用 `.app`／`.battle-stage` 固定 `390:844`；coarse landscape 又以 `--stage-w = --stage-h * 390 / 844` 明確保留同一比例。844×390 實測因此只得到 `180.20×390` stage/canvas。
2. R83 的橫向分支只讓大型 panel／overlay 以 `position: fixed` 逃出窄柱；核心 Canvas、HUD 與世界投影仍是直向。
3. 遊戲物理固定在 `195×422`，直接把 Canvas 拉成寬畫面會非等比扭曲 sprite／hitbox，直接改世界寬度則會牽動道路、生成、碰撞與平衡。
4. `manifest.webmanifest` 仍鎖 `orientation: portrait`，安裝版 PWA 無法採用已完成的橫向模式。

## 修法

- 橫向觸控版 `.app/.battle-stage` 改為真正 `100vw×100svh`，隱藏會吃寬度的桌機 rail；暫停仍由 HUD 的 44px 按鈕可達。
- 保留 `195×422` 世界、碰撞器、道路、生成點、傷害與動畫狀態；僅把最終 Canvas 相機順時針 90° 等比投影為 `844×390`。sprite 與彈道維持 2 CSS px／world unit，不做非等比拉伸。
- pointer/tap 使用相機的精確逆矩陣；快速升級提示改用 world-to-screen 投影；虛擬搖桿向量也反旋回世界座標。橫向門選擇由 `←/→` 改為與畫面一致的 `↑/↓`。
- Canvas 內波次、傷害、教學等世界文字反旋 90° 保持正向閱讀；角色／敵人／彈道與既有 frame-based 動畫仍跟隨世界相機。
- HUD 在頂端三欄橫排；環境事件獨立置於 y=64 以下；觸控縮為左下 84px 搖桿與右下三個 48px 按鈕，容器不攔截其餘戰場。
- R84 旋轉提示 DOM 保留；在已達原生品質的 844×390 分支改為不顯示。PWA orientation 改為 `any`。
- 新增 `test-r85-landscape.js`，永久守住 stage 寬度、backing、2x 尺度、HUD/event 不重疊、44px 控制、逆投影、上下門提示、快升真實點擊、無線電，以及 390×844／1366×768 backing 回歸。`test-r83-p0.js` 的車體真實點擊座標同步支援旋轉相機。

## 三視口實測

| 視口 | stage / canvas CSS | backing store | 重點 |
|---|---:|---:|---|
| 844×390 before（R84） | `180.20×390` | `390×844` | 直向窄柱 |
| 844×390 after（R85） | `844×390` | `844×390` | 寬度增加 4.68 倍；2 px/world unit；3 敵＋實彈道 fixture 可辨 |
| 390×844 after | `390×844` | `390×844` | 直向投影未改 |
| 1366×768 after | stage `354.88×768`；canvas `352.88×766` | `390×844` | 桌機 rail／直向舞台未改 |

844×390 的 HUD 為 `824×44`（y=8–52），事件為 `440×55`（y=64–119），實測 overlap=false。搖桿 `84×84`，三個動作鍵各 `48×48`，與 HUD／事件 overlap 均為 false。無線電 section `496.81×150`、按鈕 `70×44`、清單 `scrollHeight/clientHeight = 641/136`，完整位於視口且可捲。

## Gate

| Gate | 結果 |
|---|---|
| `npm test` | PASS；config／automation／visual／animation assets／rules／economy／storage／sprites／FX／audio 全綠 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS；主 E2E、fallback、audio、SW offline、R76、`test-r83-p0.js`、R84、R85 全綠 |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:rwd` | PASS；30 case，全數頁捲 0、橫溢 0，含 844×390 三狀態 |
| `git diff --check` | PASS |
| 版本鏈 | `0.85.0`／`R85`／`ashes-convoy-r85-v1`／HTML-SW query 一致 |
| 舊版號 | active runtime／guard 掃描 `0.84.0`、`ashes-convoy-r84`、舊 query 零命中；歷史 R84 專屬腳本／文件保留 |
| 秘密掃描 | PASS；私鑰、AWS、GitHub、OpenAI/Anthropic、Slack、Google API token 規則 0 命中 |
| 歷史 evidence | PASS；`docs/evidence/r85/` 以外無變更 |

原始 log：[npm test](evidence/r85/npm-test.log)、[完整 e2e](evidence/r85/test-e2e.log)、[RWD](evidence/r85/test-rwd.log)、[秘密掃描](evidence/r85/secret-scan.log)、[舊版號掃描](evidence/r85/version-scan.log)、[repository gates](evidence/r85/repository-gates.log)、[視口數據](evidence/r85/viewport-metrics.json)。

## 截圖

- 844×390：[before](evidence/r85/before-844x390-run.png)／[after 戰場＋HUD＋事件](evidence/r85/after-844x390-run.png)／[無線電日誌](evidence/r85/after-844x390-radio-log.png)
- 390×844：[after](evidence/r85/after-390x844-run.png)
- 1366×768：[after](evidence/r85/after-1366x768-run.png)

## 殘留風險

- R85 採「旋轉相機」而非重寫世界：橫向時護航方向改為由右向左的長軸戰場，lane 操作映為畫面上下。這保住既有平衡，但不是擴寫成更寬的多 lane 世界。
- Chrome 自動化已涵蓋觸控模擬、旋轉投影與真實座標 click；仍建議總稽核在一台實體 iOS／Android 裝置做 5–10 分鐘真人手感複測，特別觀察拇指遮擋與安全區。
