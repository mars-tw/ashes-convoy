# 灰燼護航（ashes-convoy）

手機直式優先的像素風末日喪屍護航射擊網頁遊戲。玩家選擇列車或飛船等載具出發，拖曳瞄準自動射擊，擊破增益門強化火力，撐過喪屍波次與 Boss，死亡後用廢土零件進行 meta 養成。

目前 repo 是製作規格與 Stage Gate 骨架，尚未開始遊戲程式與 sprite 實作。

## 技術約束

- vanilla HTML/CSS/JS + Canvas。
- 零執行期依賴。
- `devDependencies` 只允許 Playwright 供 E2E。
- 所有正式美術必須由 pixel matrix + palette 在 offscreen canvas 繪製。
- localStorage 存檔必須版本化遷移。
- GitHub Pages 部署。
- 遊戲內可見文字使用繁體中文。

## 主要文件

| 文件 | 用途 |
|---|---|
| `docs/gdd.md` | 遊戲設計文件。 |
| `docs/stage-plan.md` | Stage 1 到 Stage 3 的 Gate 與驗收清單。 |
| `docs/art-contract.md` | 美術與遊戲 Codex 的 sprite API 與檔案分工契約。 |
| `references/data-model.md` | 存檔、config、runtime state 與測試掛鉤資料模型骨架。 |

## 開發指令

Stage 1 實作後使用：

```bash
npm test
npm run test:e2e
npm start
```

本地預覽預計使用：

```bash
python -m http.server 8000
```

然後開啟：

```text
http://localhost:8000/
```

## Stage 1 範圍

- 1 台列車與 1 台飛船可選。
- 至少 3 種喪屍與 1 種 Boss。
- 增益門系統。
- 完整死亡結算與廢土零件。
- 車庫永久升級。
- 手機、平板、桌機可玩。
- Node 單元測試、Playwright E2E、GitHub Pages CI。

詳細驗收見 `docs/stage-plan.md`。

## 分工原則

- 美術 Codex 負責 `src/sprites.js` 與 `src/sprite-renderer.js`。
- 遊戲 Codex 負責 `src/config.js`、`src/rules.js`、`src/game.js`、`src/ui.js` 與測試。
- 製作人 Codex 維護 GDD、Stage Gate、art contract 與跨線規格。

任何正式 sprite 或 gameplay 實作前，先確認 `docs/art-contract.md` 與 `references/data-model.md`。
