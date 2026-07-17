# R80 拖車房間與四環境宣傳交付計畫

## 開工基線

| 項目 | Before | After 上限／契約 |
| --- | --- | --- |
| 拖車房間底圖 | `base_escape_pod.png` 780×900；既有暖色房間與家具插槽可運作，但來源治理沿用舊制。 | 內建 imagegen 新 master＋Python C2PA 證據；保持 780×900 high 介面與既有插槽／玩法，另有 medium/low 同源真素材。 |
| 管理抽屜視覺 | 房間與目錄是上下兩區，場景缺少來源／品質狀態可見診斷。 | 提升房間材質與世界觀一致性；不改家具價格、效果、插槽數、故事進度或互動語意。 |
| 四環境宣傳 | 無 R80 專用 land/air/sea/space 宣傳組。 | `docs/promo/` 四張 16:9 宣傳圖；不得被 runtime、PWA 或 SW 引用。每張有 master、C2PA、雙層 SHA-256 與 prompt。 |
| 新增 runtime 解碼預算 | 尚未新增。 | atmosphere＋拖車當下實際載入合計：桌機 `<=64MiB`、低檔 `<=32MiB`；promo 排除於 runtime 並由守門證明零引用。 |
| 房間安全裁切／對比 | 既有 E2E 只驗 raster 已載入與 furniture 狀態。 | 桌機／平板／手機三視口 bbox 安全區、文字對比 `>=4.5:1`、low/medium/high 真素材一致性皆輸出 pass/fail。 |
| 版本／cache | R79.1 階段 `R79`／`ashes-convoy-r79-v2`。 | 最終 `R80`／`ashes-convoy-r80-v1`；舊 active 版號 grep 為 0，歷史 docs 保留。 |

## 可驗收工作

1. 先完成、驗證並提交 R79.1，再開始 R80。
2. 內建 imagegen 生成拖車房間 master 與 land/air/sea/space 四張 promo master；每次生成前做 `>=2GB` 記憶體閘門。
3. deterministic crop/resample 產 runtime high/medium/low 與 `docs/promo` final；不直接改 master。
4. 對 runtime 及 promo 建 source manifest、C2PA 驗證、style board、prompt、色票、reference hash、雙層 SHA-256。
5. 拖車 renderer 依 low/medium/high 選同源 raster，URL 全帶 content hash；保留 physics/gameplay 與角色動畫完全不變。
6. 產 before/after、三視口、品質檔並排與自動稽核 JSON；量測局部雜訊、文字對比、解碼記憶體與首屏效能。
7. 依序執行 `npm test`、`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`、`npm run test:rwd`、`PLAYWRIGHT_CHANNEL=chrome npm run evidence:r79`，以及 R80 新增守門；瀏覽器測試前皆檢查可用實體記憶體。

## 設計方向

- 主題：移動中的灰燼避難艙，而不是乾淨科幻臥室。
- 色票：焦褐 `#8b4b24`、爐火琥珀 `#d88a42`、冷窗藍灰 `#607485`、煤黑 `#111014`、舊布米棕 `#8b7256`。
- 材質：鉚釘鋼板、補丁帆布、刮傷地板、冷凝窗、節制暖光；家具插槽周邊保持足夠空間。
- 獨特記憶點：窗外灰燼公路的冷色縱深與室內補丁燈帶形成單一冷暖切口。
- 自我檢核：不採 generic neon sci-fi 或乾淨 cozy room；宣傳圖沿用同一磨損材質與低彩輪廓，不把四環境做成互不相干風格。

## Rollback

R80 使用獨立本地 commit。需要回切時以 `git revert <R80-commit>` 回復 R79.1；promo 只存在 docs，不會污染 runtime cache。
