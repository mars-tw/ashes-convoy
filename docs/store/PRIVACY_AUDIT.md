# 隱私與政策核對

2026-10-15／R88。程式與本機來源核對 VERIFIED；商店宣告草稿 PREPARED；新包體驗證 BLOCKED。沒有操作商店，也沒有修改 native-kit。

## 實際行為與請求

| 行為 | 用途／資料 | 本輪證據與限制 |
| --- | --- | --- |
| 同來源 HTML、JS、PNG、manifest、SW 請求 | 載入遊戲及離線快取；未帶玩家檔案或追蹤識別碼 | `shared-native-audit.json` 的 runtimePatterns；`reviewer-path.json` 正常路徑外部網域請求為零 |
| Service Worker `fetch(request)` | 網頁版 HTML 更新與同來源資源快取 | `sw.js`；網頁第一次載入需要主機回應，主機可能有一般存取紀錄，不能推論伺服器零日誌。原生包應使用內附 web 素材 |
| 檢查更新按鈕 | 呼叫現有 SW registration.update，檢查同來源程式更新 | 沒有傳送進度；原生宿主是否啟用 SW 仍以正式包實測為準 |
| OG／canonical 的 GitHub Pages 網址 | 分享與搜尋的靜態 metadata | 不是遊戲自動遙測；不是個資回傳端點 |
| `localStorage` | 戰績、零件、藍圖、設定、路線收藏、首航完成旗標與單份復原備份 | 僅留裝置；無姓名、Email、定位、通訊錄或廣告識別碼。匯出碼由玩家手動複製，不自動上傳 |
| `sessionStorage`／Cache API | 一次性版本重載守門、離線程式與圖片 | 技術快取，不用於跨 App 追蹤 |
| Web Audio | 裝置內合成音效 | 無麥克風錄音、遠端音訊或分析 SDK |
| 姊妹作連結 | R87 曾提供三個外部遊戲入口 | 本輪已移除，正常產品 UI 無外連；不把網址文字的存在誤認為網路追蹤 |

執行程式沒有帳號、廣告、分析、遠端存檔、付款或評分 SDK；來源掃描未見 sendBeacon／WebSocket／XMLHttpRequest 遙測。這是本 repo 的來源及有界運行觀察，不是所有舊包與第三方 SDK 的完整封包認證。

## iOS 唯讀核對

檔案：`C:/Users/digimkt/Desktop/遊戲/game-store-publisher/native-kit/apps/ashes-convoy/ios/App/App/PrivacyInfo.xcprivacy`。

- `NSPrivacyTracking=false`、`NSPrivacyCollectedDataTypes=[]`，與本 repo 未追蹤／未傳送玩家資料的行為一致。
- `NSPrivacyAccessedAPICategoryUserDefaults` 原因 `CA92.1` 已存在；Apple 官方將此原因用於 App 自身可存取資料的讀寫，與本機偏好設定用途相符。見 [Apple Required Reason API 說明](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)。
- `Info.plist` 已列 iPhone 直向／左右橫向及 iPad 四方向。瀏覽器矩陣不等同原生旋轉實機驗收。
- Capacitor 標準套件見 `SHARED_ASSETS_AUDIT.md`。未檢查新 R88 IPA 的 SDK 合併隱私報告、簽章或 archive，不能稱原生隱私驗收完成。

## Android／Google 資料安全

唯讀 `android/app/src/main/AndroidManifest.xml` 沒有危險權限或 INTERNET 宣告，`allowBackup=false`；`capacitor.config.json` 沒有遠端 server.url，Android WebView debugging 為 false。沒有廣告／分析套件列入該專案 package.json。

歷史證據 `game-store-publisher/output/google-ashes-data-saved.png`（2026-10-07）可見「聲明不會收集資料」「不會與第三方分享資料」，以及「變更已儲存」對話。**這不是本輪的目前正式發布宣告讀回。** 與本輪來源方向一致，但仍須發布線對新包重新核對，不能拿舊截圖當正式完成。

建議資料安全草稿：不收集使用者資料、不與第三方分享；無帳號，玩家可用遊戲內「清除存檔」重設目前進度，單份復原備份仍留本機；連備份一併移除須清除網站或 App 資料。最後答案須涵蓋實際發布的所有 SDK 與版本，依 [Google 資料安全填寫說明](https://support.google.com/googleplay/android-developer/answer/10787469) 核對。

## 缺件與狀態

- BLOCKED：原生 `web/src/version.js` 目前為 **R85.1**，不是本輪 R88，未同步、重包、簽章或送審；依工作單不得修改此路徑。
- BLOCKED：新 IPA／AAB 的完整隱私聚合報告、實機無外部請求及離線冷啟動、背景／返回驗證。
- PREPARED：目前 Google 正式資料安全頁、Apple App Privacy、隱私政策公開頁和新包體的一致性讀回待發布線處理；本輪只留草稿。
- 本作為虛構末世戰鬥遊戲，未定位為兒童教育。不能套用交通學院／小小列車長的 Kids Category 標籤；年齡分級問卷須按實際暴力內容填寫。
