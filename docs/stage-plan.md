# Stage Gate 計畫

本專案採 Stage Gate：每一階段都必須可玩、可測、可部署到 GitHub Pages。沒有通過驗收的內容不得宣稱進入下一階段。

## 共通技術門檻

- 純 vanilla HTML/CSS/JS + Canvas。
- 零執行期依賴；`devDependencies` 只允許 Playwright。
- 核心規則純函式化，rng/now 由外部注入，無 DOM 依賴。
- localStorage 存檔需版本化遷移與資料清洗。
- `window.__test` 提供 E2E 必要掛鉤。
- Node 單元測試涵蓋 config shape、規則函式、經濟結算、存檔遷移。
- Playwright E2E 覆蓋手機 390 x 844、平板 820 x 1180、桌機。
- CI 包含 test、e2e、deploy Pages，`actions/deploy-pages` timeout 為 1800000。

## Stage 1：可玩 MVP

目標：完成一局從選載具、戰鬥、吃增益門、Boss、死亡結算到 meta 升級的最小閉環。

### 遊戲內容

- 可選載具 2 台：
  - 列車：`iron_crow` 鐵鴉號。
  - 飛船：`dawn_skiff` 晨星艇。
- 喪屍至少 3 種：
  - `shambler` 遊蕩屍。
  - `runner` 疾奔屍。
  - `bloater` 腫囊屍。
- Boss 至少 1 種：
  - `boss_hive_titan` 母巢巨屍。
- 增益門至少 4 種：
  - 火力提升、射速提升、彈道 +1、維修或護盾。
- 波次：
  - 一般波可生成多種敵人。
  - 第 5 波出 Boss。
  - Boss 前保證出現防禦型增益選項。
- 死亡結算：
  - 顯示波次、擊殺、Boss、獲得廢土零件、最佳紀錄。
  - 寫入 localStorage。
  - 可回車庫升級並再次開始。
- meta：
  - 廢土零件。
  - 載具選擇。
  - 至少車體強化與武器調校兩種永久升級。

### 操作與平台

- 手機直式 390 x 844 可完整遊玩，不需要鍵盤。
- 平板 820 x 1180 可完整遊玩，UI 不重疊。
- 桌機可用滑鼠拖曳與鍵盤輔助。
- Canvas 與 UI 設定 `touch-action: none` 或必要的局部規則，避免拖曳時頁面捲動。
- 不依賴 hover 顯示重要資訊。

### 美術門檻

- 所有 Stage 1 sprite 由 `src/sprites.js` 的 pixel matrix + palette 定義。
- 至少包含：
  - 2 台載具 idle/move/damage 幀。
  - 3 種一般喪屍 walk/hit/death 幀。
  - 1 種 Boss walk/attack/hit/death 幀。
  - 3 種子彈、2 種爆炸或命中特效。
  - 2 層背景或地面 tile。
- 不使用外部圖片、SVG 插圖、emoji 當正式美術。

### 單元測試驗收

至少建立並通過：

- `scripts/test-config.js`
  - config 表都有必要欄位。
  - Stage 1 所需載具、敵人、Boss、增益門存在。
- `scripts/test-rules.js`
  - 波次生成 deterministic。
  - 敵人 HP/速度隨波次成長。
  - 傷害與死亡判定正確。
- `scripts/test-economy.js`
  - `settleRunRewards` 不突變輸入。
  - 廢土零件獎勵符合公式。
  - 成就與首次獎勵不可重複領取。
  - 付費或隨機內容不回吐主貨幣。
- `scripts/test-storage.js`
  - `migrateMeta` 可處理空值、舊版、NaN、Infinity、未知載具。
- `scripts/test-sprites-contract.js`
  - pixel matrix 尺寸一致。
  - palette key 完整。
  - 動畫幀命名符合契約。

### E2E 驗收清單

- 390 x 844 進入遊戲後可選鐵鴉號與晨星艇。
- 手機觸控拖曳會改變準星與射擊方向。
- 至少能擊殺遊蕩屍、疾奔屍、腫囊屍。
- 第 5 波會生成 Boss，Boss 有血條與階段行為。
- 射破增益門後本局火力或維修效果立即生效。
- 載具死亡後進入結算畫面。
- 結算會增加廢土零件並寫入 localStorage。
- 回車庫後可購買至少一個永久升級。
- 重新開局升級效果生效。
- 平板與桌機沒有水平溢出、主要文字不重疊。
- console 沒有 error 或 pageerror。

### Stage 1 完成定義

- `npm test` 通過。
- `npm run test:e2e` 通過。
- GitHub Actions test、e2e、deploy jobs 通過。
- GitHub Pages 可玩。
- README 已更新目前玩法與測試方式。

## Stage 2：內容擴充與平衡

目標：把 MVP 擴成有明顯重玩價值的內容版。

### 範圍

- 補齊 4 台載具：
  - `rift_hauler` 裂軌號。
  - `frost_wing` 霜翼號。
- 補齊至少 6 種一般敵人：
  - 加入鐵皮屍、攀附屍、嚎叫者。
- 新增元素增益門：
  - 燃燒彈、連鎖電、低溫彈。
- 新增載具解鎖：
  - 廢土零件直購。
  - Boss 藍圖與保底。
- 新增成就與里程碑。
- 平衡模擬：
  - 每分鐘收益。
  - 第 5、10、15 波預期勝率。
  - 不同載具 DPS 與生存差異。

### Stage 2 驗收

- 4 台載具皆可選、可升級、差異明確。
- 6 種一般敵人與 1 種 Boss 都可在波次中出現。
- 藍圖保底 deterministic 且可測。
- 模擬腳本輸出收益與通關曲線，無明顯正收益漏洞。
- E2E 覆蓋載具解鎖、藍圖保底、元素門。

## Stage 3：製作品質與上線打磨

目標：完成廣告素材感、手機體驗與長期可維護性。

### 範圍

- 像素動畫完整化：
  - Boss 階段變化。
  - 載具受損狀態。
  - 爆炸、命中、護盾、酸霧、電弧。
- UI 完整化：
  - 車庫、結算、成就、圖鑑、設定。
  - 手機安全區與不同瀏覽器高度處理。
- 音效：
  - 若加入音效，只能用 Web Audio 程式生成，不使用外部音檔。
- 效能：
  - 390 x 844 手機目標 60 FPS，低階裝置至少穩定 30 FPS。
  - sprite 預渲染快取。
  - 粒子上限與物件池。
- GitHub Pages 上線清單：
  - 無外部資源。
  - 無 manifest/service worker。
  - viewport、touch-action、localStorage 皆符合 PWA-friendly 但不封裝 APP。

### Stage 3 驗收

- 連續 20 分鐘 E2E soak test 無記憶體暴增或 console error。
- 390 x 844、820 x 1180、1280 x 900 截圖檢查無 UI 重疊。
- 所有可見文字為繁中。
- 所有正式美術來自 pixel matrix。
- GitHub Pages 上的版本可完整從新存檔玩到第 10 波以上。
