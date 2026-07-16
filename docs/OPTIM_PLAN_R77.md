# Ashes R77 優化計畫

- 輪次代號：ashes R77
- 依據：`C:\Users\digimkt\.claude\skills\game-optimization-round\SKILL.md`、`docs/AUDIT_full.md`、`AGENTS.md`
- 本輪原則：先補 audit Top 5 的 P1 斷點，再驗證 R73 動畫與 R74-R76 控制不回歸；角色攻擊不得用整張圖平移、旋轉、縮放或 bob 假裝完成。

## 八大面向

| 面向 | 現況 | R77 具體項 | 驗收 |
|---|---|---|---|
| 美術 | R73 walk/hurt/death raster 已有，attack atlas 仍缺正式素材。 | 不宣稱 attack atlas 完成；新增可替換的 attack phase 管線與 fallback phase mapping。 | 動畫守門保留；報告列出缺少的 attack 素材。 |
| UI | R76 桌機/手機控制可達性已達標，但戰鬥中開 rail 後回局失效。 | 修正 drawer return context，戰鬥中開 rail 關閉後回原局。 | E2E 與 R76 控制守門覆蓋 rail return。 |
| UX | 漏過 gate pair 後狀態會卡住，補給和後續門提示被阻塞。 | gate pair 明確 active/resolved/expired，過期時清 `gateChoice`。 | E2E 驗證漏門後補給可開、下一組門可正常提示。 |
| 人物/角色樣子 | 角色外觀已有 R73/R76 守門；攻擊階段缺清楚呈現。 | 敵人、Boss、席安暴露 attack phase，fallback 只作替換管線，不假裝正式素材完成。 | `renderDebug` 與 E2E 驗證 phase；報告列素材缺口。 |
| 選單/按鈕 | 操作抽屜已有短高視口守門；音效音量缺可調選項。 | 新增 SFX 音量設定並持久化，UI 操作給輕量回饋音。 | 設定 E2E、audio test、RWD 全綠。 |
| 技能/玩法 | README/GDD 承諾可射爆增益門核心，但 projectile 未能操作主決策。 | 增益門核心補 hitbox、HP、受擊、破門套用效果與 pair 清除。 | E2E 驗證非核心不傷門、核心破門可選增益。 |
| 動作流暢度 | 敵人/Boss/席安攻擊傷害與發射時機沒有嚴格 impact frame。 | 攻擊改為 anticipation / active impact / recovery；傷害和投射物只在 active impact 發生。 | E2E 驗證 ranged/contact/Boss/Xi timing。 |
| 效能/公平性 | low performance 會降低敵人上限與 AI 動畫軌跡，造成跨裝置難度差。 | low/high 敵人 cap 同為 72，`enemyAnimScale` 固定 1；只降 FX/effects/render 成本。 | config/E2E/perf 證據驗證邏輯上限不變，p95 過閘。 |

## Top 5 實作項

1. F-01：在 projectile update 補 gate core collision；核心才吃傷害，HP 歸零立即套用對應增益並清 pair。
2. F-02：新增 gate pair 狀態，漏過畫面後標記 expired 並解除 `gateChoice`。
3. F-15：桌機 rail 在戰鬥中開啟時保留 return context；關抽屜後回到原 run 或 pause panel。
4. F-11：效能檔位只改畫面成本，不改敵人上限、AI 路徑或低階動畫邏輯。
5. F-05：敵人、Boss、席安補 anticipation / active impact / recovery 狀態機，hit/damage/projectile 僅在 impact frame。

## 音效項

- 擴充現有 `src/audio.js` WebAudio 程序化音效。
- 覆蓋 shoot、hit、gate break、Boss cue、alarm、pickup/UI。
- 新增 SFX 音量設定：low / medium / high。

## 不回歸項

- R73 walk/hurt/death frame-based animation 守門不降低。
- R74-R76 桌機 rails、手機控制盤、短高視口可達性守門不降低。
- 不用整張 sprite bob/scale/rotate 假裝走路、攻擊、受傷或死亡。

## 固定閘門

- `npm test`
- `npm run test:e2e`
- `npm run test:rwd`
- R76 控制守門全綠
- desktop/mobile p95 <= 18ms，證據放入 `docs/evidence/R77/`
- 版本 bump 至 R77，runtime/cache/query/README 同步，release token grep 無舊版殘留
- 秘掃零命中，排除 `.git` 與 `node_modules`
- before/after 證據放入 `docs/evidence/R77/`
- 產出 `docs/CODEX_RESPONSE_ashes_R77.md`
- 本地 commit，不 push
