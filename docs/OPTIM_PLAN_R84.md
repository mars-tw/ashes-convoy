# OPTIM_PLAN R84（PLAYTEST-R1 修正與 landscape-native backlog）

## 本輪交付

- 修復跑局 rail drawer 與 pause panel 的 paused UI 競態。
- 補給選擇加入既有 pointer release 隔離與 320ms pointer debounce；鍵盤 1–5／方向鍵／Enter 不延遲。
- 結算依主動撤離與載具遭摧毀顯示成功／失敗色彩、原因與結果。
- 結算焦點改用 `preventScroll`，render 後固定回到標題頂端。
- 首玩車體顯示「點車體｜快速升級」，並把側欄入口命名為「工坊」。
- 844×390 顯示不攔截操作的旋轉提示；390 高拖車家具改雙欄壓縮並保留 44px 按鈕。

## Backlog：真正的 landscape-native 戰場重排

本輪不放大或拉伸 390×844 portrait-native Canvas。真正橫向支援需獨立批次處理下列相依範圍，避免只改 CSS 尺寸而破壞瞄準、碰撞與事件命中：

1. **Camera／投影**
   - 定義橫向 viewport 與既有 390×844 logical world 的 camera crop／zoom／letterbox 策略。
   - 把 world-to-screen、screen-to-world 與 pointer aim 統一走 camera transform；physics root／collider 維持 world space，不跟視覺縮放耦合。
   - 驗證敵人出生／離場、彈道、補給追蹤、Boss telegraph 與拖車跟隨在橫向可視範圍內。
2. **HUD／rails**
   - 將 HP、wave、kills、parts、Boss bar 重排到橫向 safe-area，而非壓進 178px 直柱。
   - 定義左／右 rail 與戰場的佔寬規則；暫停、drawer、結算需共用正式 layer token 與 focus trap。
3. **事件與選擇覆疊**
   - 重新配置 event banner、gate choice、補給五選、Boss 到場與傷害警示；不得依賴目前 `position: fixed` 逃出 portrait stage 的補丁。
   - 建立 overlay × HUD × touch controls 的命中／z-index 矩陣，並驗證不遮住關鍵戰場讀取區。
4. **觸控與快速升級**
   - 為橫向重新定位 joystick、衝／技／彈按鈕與車體快升提示，保留 safe-area、44px 命中與左右手可及性。
   - 重新校正車體 hit target、拖曳瞄準、pointer capture 與 camera transform，防止視覺位置和 world hitbox 分離。
5. **驗收矩陣**
   - 至少涵蓋 640×360、844×390、896×414、932×430；每尺寸測 playing、pause、rail settings、quick wheel、gate、supply、settlement、trailer。
   - 必須通過真實 pointer/touch、screen-to-world 座標、44px reachability、無水平／頁級溢出與既有 `test-r83-p0.js`。

完成條件：橫向戰場寬度顯著高於目前 178px，且不是把 portrait 畫面非等比拉伸；camera/HUD/事件/觸控四條鏈須同一批交付與回歸。

## 低高拖車後續觀察

R84 已把 390 高家具目錄壓成雙欄、隱藏次要風格／長描述，按鈕仍為 44px。若家具數量日後超過目前目錄，另開分頁／分類需求；本輪無需再留功能性 blocker。
