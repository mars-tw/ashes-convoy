# 共用素材與模板痕跡稽核

R88，2026-10-15，VERIFIED（本機有界來源比對）。原始紀錄：`../evidence/r88-store/shared-native-audit.json`；重跑 `npm run audit:store`。

## 方法與邊界

比對本 repo 的執行程式／HTML／CSS／影像／聲音／字型與 13 個同帳號目錄；先比檔案大小，再計算 SHA-256。排除 `.git`、node_modules、Unity Library／Temp、建置輸出、歷史文件及工具目錄。不以修改雜湊來假造獨立性，也不把「沒有逐位元重複」當成「沒有相似玩法」。JSON 列出檔數、來源及每筆命中。另比對首頁較長的完整 CSS 規則；短的標準 reset 不當成自製設計。

其他線路可在同時改檔，這份結果是當次快照。Godot／Unity 二進位、套件依賴傳遞、帳號內所有舊版及語意近似程式不在完整覆蓋範圍。夜行列車重製資料不是完整執行原始碼，另讀既有原生 web 包補查；不能據此宣稱全帳號二進位獨立。

## 逐項結果與處置

| 本作檔案／項目 | 與哪款重複或相似 | 處理方式 |
| --- | --- | --- |
| `src/game.js`、`src/rules.js`、`src/config.js` | 掃描對象未發現完全相同檔；仍與 Crackveil／暴風有敵潮、成長題材相似 | 保留專用車隊引擎；本輪新增實戰首航與可選攀附動畫接線。詳細玩法風險見 DIFFERENTIATION |
| `src/ui.js`、`index.html` 首頁／選單 | 未發現同檔；原有「阿軒的小遊戲系列」與跨作導流，帶有系列模板印象 | 改為「車隊行車紀錄」，移除三個姊妹作外連；新增直角黃銅行車紀錄入口與三階段目標 |
| `index.html` 出勤按鈕 | 舊有 `IGNITE THE CONVOY` 英文口號 | 改為「甩掉攀車屍・護送拖車」；ASHES CONVOY 為本作專名保留 |
| `index.html#performanceDiagnostics` | 開發者 FPS／cap 診斷列 | 正式 UI 隱藏，內部測試保留文字斷言；不放寬原測試 |
| `assets/ui/start*.png`、`assets/cover.png` | 未發現與掃描作品完全相同素材 | 保留本作卡車／灰燼道路識別；原 manifest 的來源資料維持原樣 |
| `assets/vehicles/*`、`assets/env/*`、`assets/shelter/*`、`assets/story/*` | 未發現完全相同素材 | 保留卡車、拖車、熹及基地；不宣稱本輪重新創作 |
| `assets/enemies/*`、`assets/zombies/*` | 未發現目前檔案完全相同；部分走路底材具有標準第三方 CC0 來源 | 依 `CREDITS.md` 保留逐批來源；walk／attack／hurt／death 真幀不移除。攀附專用幀仍缺指定模型來源可驗證版本 |
| `src/audio.js` | 未發現同檔；使用 Web Audio 合成，沒有共用音訊檔命中 | 保留車輛、甩尾、攀附回饋；未新增音效或冒稱實機聽感驗收 |
| `index.html` 字型組合 | system-ui／Apple 系統字／Segoe UI／sans-serif 為標準作業系統字型，可與其他作品一致 | 不下載外部字型、不換名假裝原創；本作使用車隊儀表、黃銅和冷鋼的版面區隔 |
| `assets/icons/icon-192.png`、`icon-512.png` | 未發現同檔 | 保留本作圖示，未使用瀏覽器或框架預設圖示 |
| `sw.js`、PWA manifest | 未發現同檔；Service Worker／Cache API 是標準平台機制 | 版本改 R88，共用技術如實列出；不宣稱 PWA 殼本身有創作區隔 |
| 原生外部包裝（本 repo 未修改） | Capacitor core／iOS／Android 8.5.2、App 8.1.2、Preferences 8.0.1，其他遊戲也可用相同標準套件 | 標準第三方框架，不藉改包名掩飾；正式二進位審查仍待發布線覆核 |
| `node_modules/playwright` | 標準開發測試工具 | 非遊戲執行時 SDK，未納入素材獨立性判定 |

執行程式中 `Lorem`、`TODO`、`Sample`／coming soon／敬請期待等可見佔位文字須為零；抽樣不把 sampling、samplePerformanceFrames 等程式識別字或測試資料誤當 UI 殘留。完整運行頁面與所有既有 E2E／RWD 結果保存在本輪證據目錄。

## 未接受的新圖像

本輪使用內建 imagegen、各自參考 runner／shambler 原圖，產出兩組四姿勢草圖。C2PA 實測只回傳 `name=ChatGPT, version=gpt-image`，原 `verify-c2pa.py` 拒絕認定為 gpt-image 2.x；驗證器未修改。草圖隔離在 gitignored `tools/asset_sources/imagegen_r88_unverified/`，未啟用、未進 SW／正式素材或商店截圖。缺件、SHA-256 與 prompt 規格見 `ART_ASSET_STATUS.json`。

程式已增加可替換的 `spriteActions.latch` 支援：一般攀附可循環四幀，低品質仍輪替兩個真姿勢，attack／hurt 有更高優先權，死亡仍走原 death。測試使用現有 walk atlas 作為**測試夾具**檢查管線，不能當成專用攀附素材完成證據。
