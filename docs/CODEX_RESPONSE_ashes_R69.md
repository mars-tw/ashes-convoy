# 《灰燼護航》R69 修正回應

本輪完成四項總稽核修正，未改決定性規則、經濟或戰鬥平衡，未擴張 FX 粒子池，也保留 reduced / low 降級路徑。

## 壓縮回報

| 項目 | R69 結果 |
| --- | --- |
| 熹 | 採「熹＋砲座一體」兩幀 sprite sheet。512×384 透明 PNG，左右各 256×384，待機／開火；遊戲以每格原始比例縮到 28 邏輯像素寬並關閉 smoothing。紅外套、深紅馬尾、臉、雙手與槍身可辨，開火時切第二幀。 |
| 增益門 | 中央 modal 已從 DOM 與 UI renderer 移除。門由道路上方推進，載具穿越左右實體門時直接套用；前 3.8 秒只顯示極簡提示「← 選項 A｜選項 B →」，同時暫藏原增益摘要避免重疊。全程不暫停、不用點。 |
| 補給 | 改為 3 欄漂浮一鍵選項列，戰鬥不中斷；仍保留原五項、原效果、原溢出規則與鍵盤操作。 |
| 選單 | 之前首屏 7 顆操作按鈕；現在只顯示 64px 大「出勤」與「基地」。基地展開才顯示升級／載具／成就／拖車／任務設定／清存檔。開頁到開打：之前 1 點、現在仍是 1 點（符合 ≤2）。 |
| 桌面／平板 | 390:844 邏輯與 canvas 不變；桌面顯示高度固定為 96svh，平板／手機依可用高寬等比撐滿。1280×800 實頁量測約 355×768（96% 視高），HUD 同 app 等比放大。兩側使用現有 `assets/env/land.png` 做低亮模糊廢土氛圍、暗角與細紋邊框。 |

## 熹資產製程

- 最終檔：`assets/vehicles/xi_gunner.png`
- 內建 image generation 模式；以現有 `trailer.png`、`land.png`、舊 `xi_gunner.png` 作風格／比例參考。
- 先生成 1774×887 大圖，以純洋紅色鍵去背，再統一裁格並以 nearest-neighbor 縮成 512×384 兩幀；四角 alpha 為 0。
- renderer 依 `TRAILER_GUNNER.frames = 2` 切格，射擊後 0.14 秒顯示開火幀；沒有新增逐幀 canvas、filter 或粒子。

最終生成提示詞摘要：

```text
Use case: stylized-concept
Asset type: production top-down canvas shooter sprite sheet
Create exactly two equal cells: Xi idle and firing, identical anchor and scale.
Young wasteland gunner with dark auburn high ponytail, rust-red jacket,
charcoal gloves and trousers, both hands gripping a compact mounted gun.
Crisp 32-bit pixel art matching the referenced trailer/vehicle palette and
top-down perspective; strong silhouette readable at roughly 44×58 pixels.
Perfectly flat #ff00ff chroma-key background; no shadow, text, border,
watermark, extra person, blur, front-facing pose, or magenta in the subject.
```

## UX／層級守門

- `#gateChoiceOverlay` 不再存在；e2e 明確斷言 DOM count 為 0。
- 道路穿越測試把載具移入左門，確認 `paused === false`、門配對清除、射速增益立即生效。
- 補給拾取測試確認 `paused === false`、五個 44px+ 選項均可達並維持原 reward/overflow。
- 選單測試確認收合狀態只顯示 `sortieBtn`、`baseToggleBtn`，展開後管理按鈕才出現。
- RWD 加入 app 高度 ≥90% 與 390:844 比例誤差 <0.01 的永久守門。
- 熹測試確認 512×384 alpha PNG 合約與射擊時 `companionFrame === 1`。

## 免費 CC0 素材候選（下輪）

本輪僅研究，不整合：

- [Kenney — Top-Down Tanks](https://kenney.nl/assets/top-down-tanks)：頁面明示 CC0、85 檔；適合拆砲塔、履帶殘骸、路障與敵方裝甲單位。
- [Kenney — Top-down Tanks Remastered](https://www.kenney.nl/assets/top-down-tanks-remastered)：適合較乾淨的砲塔／履帶模組；整合前需先做本作鏽蝕調色。
- [Kenney — Racing Pack](https://kenney.nl/assets/racing-pack)：可作民用車殘骸或車潮障礙；比例與美術密度需二次像素化。
- [OpenGameArt — Free Top Down Car Sprites by Unlucky Studio](https://opengameart.org/content/free-top-down-car-sprites-by-unlucky-studio)：頁面明示 CC0；高解析 PNG，含警車、救護車、卡車、廂型車，適合末世車殼與道路殘骸。
- [OpenGameArt — Characters, Zombies, and Weapons. Oh My!](https://opengameart.org/content/characters-zombies-and-weapons-oh-my)：頁面明示 CC0；人物、殭屍與武器可組合，適合下輪做敵人方向幀／人類 NPC 原型。

## 驗證

- `npm test`：PASS。
- `npm run test:rwd`：PASS，27/27（9 視口 × 3 狀態），頁捲與橫溢全 0。
- `npm run test:e2e`：連續 3 輪 PASS；每輪含 4 視口、image/vehicle/zombie/environment fallback、音效、Service Worker 離線。
- 版本同步：`src`、`index.html`、`sw.js`、`manifest.webmanifest`、`scripts`、`README.md`、`references`、`package.json` 內舊版字串 grep 為 0；APP / cache / query / HTML boot guard 均為 R69。
- 未執行 git commit / push。
