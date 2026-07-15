# oss-audit：開源版全面檢查與更新報告

- 日期：2026-07-15
- 專案：灰燼護航 Ashes Convoy
- 本地資料夾：`doomsday-shooter`
- GitHub repo：`mars-tw/ashes-convoy`
- 稽核版本：R72

## 結論

本輪完成開源文件、授權、來源標註、repository 衛生、分享 metadata、版本一致性與功能 sanity 檢查。指定的 `npm test` 全綠，Markdown 相對連結零缺漏，主要外部連結均回應 HTTP 200，秘密掃描在工作樹與 Git 歷史皆零命中。

變更只涉及文件、忽略規則與 `index.html` 的社群分享 metadata；`src/`、`scripts/`、`assets/` 均未修改，沒有更動遊戲邏輯或素材。

## 逐項結果

| 項目 | 結果 | 處理內容 |
|---|---|---|
| 1. README 全面翻新 | PASS | 重寫遊戲簡介、正確線上網址、R71–R72 素材重製、熹的拖車房間、波次護送、基地系統、操作、技術棧、本地開發、npm scripts 與 CI badge；加入 R72 的 3 張 evidence 截圖。 |
| 2. LICENSE | PASS | 原 repo 缺少根目錄授權檔；新增標準 MIT License，copyright 為 `2026 mars-tw`。 |
| 3. CREDITS / art contract | PASS | 新增 `image_gen` 批次標註規則，補列 R71 前自製圖像、R71／R72 產出、Kenney、OpenGameArt、Playwright、Pillow 與修改方式；`docs/art-contract.md` 補齊資產類別、來源入口與不推測 provenance 的規則。 |
| 4. repo 衛生 | PASS | 擴充 `.gitignore` 的測試輸出、coverage、cache、暫存、log、環境檔、editor 與 OS 規則；清理盤點見下節。 |
| 5. OG metadata | PASS | 原 `og:image` 已是正確的 `ashes-convoy`；另補 `og:url`、canonical 與 `twitter:image`，全部指向 `https://mars-tw.github.io/ashes-convoy/`。 |
| 6. 版本一致性 | PASS | `README.md` 標示 R72，與 `src/version.js` 的 `APP_VERSION = "R72"` 一致。 |
| 7. 功能 sanity | PASS | `npm test` 全部通過；未修改遊戲程式邏輯。 |

## README 截圖

從 `docs/evidence/R72/` 選用：

- `phone-start.png`
- `phone-battle.png`
- `desktop-battle.png`

六張 R72 evidence 原檔全部保留，沒有重新壓縮或改動素材。

## 暫存檔清理盤點

刪除前先依 `.tmp`、`.temp`、`.bak`、`.orig`、`.rej`、`.log`、OS metadata、`tmp/`、`temp/`、`playwright-report/`、`test-results/`、`coverage/` 與未追蹤檔案進行盤點。

| 清單 | 數量 | 處置 |
|---|---:|---|
| tracked／未忽略範圍的暫存候選 | 0 | 無檔可刪 |
| 未追蹤且未忽略檔案 | 0 | 無檔可刪 |
| `node_modules/` | 1 目錄 | 本機依賴且已忽略，保留供測試 |
| `tools/asset_sources/` 與其他 `tools/` 內容 | 1 目錄樹 | provenance／重建來源且已忽略，依素材契約保留 |

本輪實際刪除暫存檔：**0**。沒有把依賴或 provenance archive 誤當暫存資料刪除。

## 連結驗證

- 掃描 33 份 Markdown：相對連結缺漏 **0**。
- 線上遊玩、OG 封面、GitHub Actions workflow／badge、shields badges、Kenney、OpenGameArt、CC0、Playwright、Pillow 等共 19 個外部 URL：非 2xx **0**。
- 修正歷史 review 文件中殘留的舊 `doomsday-shooter` Pages 路徑，改為正確的 `https://mars-tw.github.io/ashes-convoy/`。
- `git remote -v` 已確認 fetch／push 均為 `https://github.com/mars-tw/ashes-convoy.git`。

## 安全與秘密掃描

因環境未安裝 `gitleaks`／`trufflehog`，改以兩層 regex 基線掃描：

1. 工作樹強特徵：AWS、Google、GitHub、OpenAI、Slack token 與 private-key header。
2. 工作樹一般 credential assignment：API key、client secret、access/auth token、password 的長值指派。
3. `git log -p --all -- .` 的完整可讀歷史強特徵掃描。

結果：

| 掃描 | 命中 |
|---|---:|
| 工作樹強特徵 | 0 |
| 工作樹 credential assignment | 0 |
| Git 歷史強特徵 | 0 |

工作樹掃描排除 `.git/`、`node_modules/` 與 gitignored `tools/`；Git 歷史掃描覆蓋所有 tracked patch。掃描沒有輸出任何秘密值。

## 驗證紀錄

```text
npm test
  Config tests PASS
  Automation guard tests PASS
  Visual guard tests PASS
  Animation asset guards PASS (17 files, 539659 bytes)
  Rules tests PASS
  Supply choice tests PASS
  Economy tests PASS
  Storage tests PASS
  Sprite contract PASS (36 sprites, 218 frames, 10 Stage 3 sprites)
  FX tests PASS
  Audio tests PASS

git diff --check
  PASS
```

## 變更檔案

- `.gitignore`
- `README.md`
- `LICENSE`
- `CREDITS.md`
- `index.html`（metadata only）
- `docs/art-contract.md`
- `docs/GROK_REVIEW_ashes_mobile.md`（舊網址修正）
- `docs/CODEX_RESPONSE_oss_audit.md`

## Provenance 限制

R71／R72 已有可追溯的 `image_gen` 工具、prompt 摘要、母圖位置與後製紀錄；更早的專案自製圖像在 repo 歷史只記為 AI 生成／圖生圖，沒有完整保存逐批工具與 prompt。本輪在 `CREDITS.md` 明確標示此缺口並列出目前檔案範圍，沒有虛構缺失的來源資訊。

## Git 交付

本報告與上述變更已納入繁中本地 commit；依任務要求未執行 push。
