# R88 上架可能性優化報告

2026-10-15。版本 **R88／0.88.0**，基線 `501c5be`（R87），僅本機修改及 commit。全程 headless；未派工、push、部署、操作 App Store Connect／Google Play 或發訊息。其他遊戲與 native-kit 只讀；原有 `docs/playtest/` 保留。

本機功能、回歸與素材草稿檢查為 VERIFIED；商店提交準備為 PREPARED，原生重包、專用攀附美術與真人 beta 為 BLOCKED。**Apple 4.3 風險：高。** 這輪讓車隊玩法更容易被看見、修正效能成本，不能自行解除帳號整批退件或證明重大改變已被 Apple 接受。

## 三項主要改進

1. **招牌玩法從首頁就能玩到。** 新增所有玩家可用的「首航：甩尾護車」：實際轉向才出現兩隻攀車敵人，真正甩飛兩隻才進入補給選擇。三步完成後立即寫入行車紀錄，再接回普通護航。沒有無敵或審查專用開關，不會因教學空場自動領取波次獎勵。
2. **完成紀錄與背景切換更可靠。** 首航完成不必等結算；儲存空間不足會顯示「尚未保存」，不誤報成功。網頁 visibilitychange／pagehide，以及既有原生宿主的 `mars-native-state` 離開事件會清除方向／甩尾輸入並暫停，回來由玩家手動繼續。正常結算的戰績與收藏仍保存，未結算戰局不跨重開接續。
3. **去除系列導流，降低繪製成本。** 移除三個姊妹作連結、英文出勤口號與可見效能除錯列，改為黃銅行車紀錄 UI。敵人高品質濾鏡改為每張圖集最多八種的有界快取，保留所有敵人、真幀與低品質動畫；沒有降低 18ms 門檻。

另完成逐款區隔、跨作來源與素材 SHA-256 稽核、隱私核對、繁中商店文案、英文審查備註及手機／平板真實截圖。所有變更與八大面向對照見 `OPTIM_PLAN_R88.md`。

## 驗證與證據

所有本輪文字 log 在 `docs/evidence/r88-store/`；除效能原始 JSON 外，證據皆在該目錄及 `docs/store/`。

| 驗證 | 結果與證據 |
| --- | --- |
| `npm test` | VERIFIED：原 15 支單元／資產／規則腳本全綠；只同步現行版本斷言，未刪除測試或放寬條件。`npm-test.log` |
| `npm run test:e2e` | VERIFIED：完整指令 exit 0；原 8 支控制／戰鬥／手機／平板／離線腳本，加本輪審查路徑與動畫管線，共 10 支全綠。`test-e2e.log` |
| 審查員路徑 | VERIFIED：10 個視口＋SW 離線冷重開＋儲存空間不足，共 **12／12**。從正常入口操舵、甩尾、領補給、完成、暫停／繼續、返回、重開保存；沒有注入戰場完成狀態。`reviewer-path.json`、`test-r88-reviewer.log` |
| 裝置範圍 | 375×667（SE 級）、390×844、430×932、440×956、844×390、768×1024、1024×768、1032×1376、1376×1032（13 吋級直橫）、1366×600。這是 headless 幾何與操作，不是實機認證 |
| RWD | VERIFIED：既有 10 視口 × 3 狀態＝30 案，頁捲／橫溢為零。`test-rwd.log` |
| 動畫與快取 | VERIFIED：可選攀附 action 支援高品質四幀／低品質兩真幀；attack 優先，原 hurt／death／命中幀回歸保留。十種濾鏡實體只佔八個 cache，十隻均仍繪製。夾具不當成正式攀附美術。`animation-pipeline.json` |
| 語法／差異／版本／秘密 | VERIFIED：49 支 JS 語法、git diff --check、執行期舊版號零命中、指定秘密 regex 零命中。掃描範圍及檔數見 `repository-gates.json`，未讀 `.secrets`；不碰既有未追蹤 playtest |
| 截圖 | VERIFIED：before 三張、after 25 張，其中商店 10 張，尺寸、SHA-256、現行來源雜湊均驗證。手機 430×932／DPR3 輸出1290×2796，平板1032×1376／DPR2 輸出2064×2752。`before-captures.json`、`after-captures.json`、`docs/store/SCREENSHOTS.md` |
| 共用來源／素材 | VERIFIED：本作106個來源／素材與13款作品共3732個候選檔的有界掃描，無完全相同檔或較長完整CSS規則命中。夜行列車另含現有原生web來源；不是全帳號語意／二進位審計。`shared-native-audit.json` |

完整回歸曾在清檔二次確認案例逾時，失敗保存在 `test-e2e-initial-failure.log`；原斷言未修改，後續完整重跑通過該案例。新測試延伸到普通路線橫幅時，曾漏選第二箱補給就點被隱藏的路線鍵，屬測試操作順序錯誤；已補上正常領取步驟，保留 `reviewer-test-sequence-failure.log`／`test-e2e-test-sequence-failure.log`。不以延長 timeout、強制點擊或放寬斷言掩蓋失敗。

## 效能

**並發載量測，僅供參考。** 本輪最終 `npm run test:perf` 通過原 p95 ≤18ms 門檻；三跑中位為 auto 桌機 **2.3ms**／手機 **2.8ms**、low 桌機 **2.1ms**／手機 **3.8ms**。每跑保有54隻raster敵人，攻擊圖集可見且fallback=0。

原始資料：`docs/evidence/R88/perf-p95.json`；指令輸出 `test-perf.log`。這是Chromium軟體Canvas的同步模擬＋繪製牆鐘時間，不是手機原生FPS。R87的29.7／28.9ms與本輪並非同一併發機況，不宣稱精確加速倍率。乾淨機況出貨效能仍為BLOCKED，待總稽核重測。

## 商店與隱私交付

- `docs/store/DIFFERENTIATION.md`：與13款同帳號作品逐一比較；特別承認Zombie Highway 2已有攀車機制，不能宣稱全球唯一。公開頁來源附連結。
- `docs/store/SHARED_ASSETS_AUDIT.md`：檔案、重複情形、處置、標準框架／系統字型與掃描邊界。
- `docs/store/PRIVACY_AUDIT.md`：程式與觀察路徑無資料上傳；同來源載入／SW用途逐項列出。iOS清單已有Tracking=false、空收集類型及UserDefaults CA92.1；Google只有2026-10-07已儲存截圖，不能稱目前正式宣告已核對。
- `docs/store/STORE_METADATA_ZH_TW.md`、`APP_REVIEW_NOTES_EN.md`：名稱9字、副標題16字，描述前三行直接寫甩尾、拖車與路線補給；依speak-human-tw mode 2附修改表，英文備註不捏造真人beta或權利人身分。
- `docs/store/screenshots/`：10張實際遊戲PNG，無合成、未接受素材或宣傳重畫。

## 未完成、缺件與風險

1. **BLOCKED：專用攀附美術。** 內建imagegen實際產出runner／shambler各四姿勢候選，但C2PA只標示ChatGPT／gpt-image，無法證明指定gpt-image-2。原驗證器未修改，兩組均未匯入正式遊戲。草圖留在ignored `tools/asset_sources/imagegen_r88_unverified/`；manifest、逐張雜湊、prompt與拒絕紀錄見 `ART_ASSET_STATUS.json`、`imagegen-prompts.md`、`latch-c2pa-rejected.log`。正式 `oga_runner_latch.png`／`oga_shambler_latch.png` 仍缺；目前沿用真walk／attack／hurt／death，不假稱完成攀附美術。
2. **BLOCKED：原生包仍為R85.1。** native-kit唯讀，未同步R88、重包或簽章；沒有本輪IPA／AAB、SDK合併隱私報告、實體iPhone／iPad／Android背景切換、離線冷啟動與聽感驗證。
3. **BLOCKED：真人beta及提交者證據。** 沒有本輪TestFlight受測者回饋；4.2.6的內容提供者／客戶關係／權利歸屬與是否合併，須由擁有者以真實資料回答。
4. **PREPARED：商店宣告與素材。** 沒有讀回目前Apple／Google正式宣告，也未上傳截圖／文案。Google資料安全須對最終所有版本／SDK重新核對。
5. **高風險：類型重疊仍存在。** 三分鐘教學、專屬UI與效能改善不等同重大原創性被Apple認可；[Apple 4.2.6／4.3](https://developer.apple.com/app-store/review/guidelines/)與既有整批退件仍需正式處理。本輪不建議直接重送。
