# 《灰燼護航》ashes R72：素材 P0 清償報告

R72 已清償 `GROK_ASSET_AUDIT.md` 的 P0 全項，並完成使用者本輪指定的 P1-2 環境景深。戰鬥數值、敵人碰撞半徑、波次與掉落未改；本輪只做素材、視覺管線、離線快取、守門測試與版本同步。因同機有 Blender 工作，本文不使用 wall-time 做效能結論。

## P0 對照驗收

| Audit 項目 | 規格 | R72 交付與證據 | 結論 |
|---|---|---|---|
| P0-1 熹 canonical | 以 R71 房間為準：短深棕髮、棕圍巾／披肩、深褲靴；`512×384` 雙幀；透明；≤250 KiB | `assets/vehicles/xi_gunner.png` 為左右 `256×384` idle／開火後座兩個獨立姿勢，保留黑色護甲與白色 V 胸徽；四角 alpha 0、chroma bleed 0、244.3 KiB。桌機戰鬥證據可見砲座角色。 | PASS |
| P0-2 首屏 | `820×1728`；land_rig 語言；暖褐中景；上 18%／下 22% 低資訊安全區；≤500 KiB | `assets/ui/start.png` 改為 painterly-pixel 廢土護航，land_rig／trailer 為視覺錨點，圖內無字；六張實機證據的三個首屏均未與標題／CTA 衝突；297.3 KiB。 | PASS |
| P0-3 封面 | `1280×640`；像素／插畫像素；land_rig ± trailer；R71 敵語言；禁止擬真 3D 軍卡 | `assets/cover.png` 重製為同色管線的 land_rig＋拖車護航與殭屍包圍場景，無烘焙字／logo；678.3 KiB（≤700 KiB audit budget）。 | PASS |
| P0-4a tar brute | `190×190`；停用 Kenney 坦克；新 4 幀半人形 walk；暖橙 visor | 靜態 `assets/zombies/tar_brute.png`、`assets/enemies/tar_brute_walk.png`（4×`56×68`）重製；`tar_brute` 與 `chain_tether` config／SW 均切到新 atlas，`armored` 路徑移除。 | PASS |
| P0-4b shield husk | `160×240`；4×`48×64`；盾面積清楚、非 debug 方塊 | 腐軀配大面積骨金屬盾，四格含左右承重、盾前壓與恢復姿勢。 | PASS |
| P0-4c swarm mite | `140×170`；4×`44×44`；32px 可見群與亮眼 | 改為三蟲群聚尖足剪影，四格有不同落足／伏低／前探姿勢與琥珀眼。 | PASS |

## P1-2 環境捲軸

四張基底維持 `780×1560` 與上下捲動接口，採 2× crisp palette finish 壓到各 ≤350 KiB；`src/game.js` 再依環境疊遠／中／近三個不同 scroll rate，物件為固定幾何，不消耗玩法 RNG。

| 環境 | R72 補強 | 檔案 |
|---|---|---|
| land | 保留原有中線 seamless，既有遠景路肩、明暗、路障／前景剪影層繼續使用 | 306.2 KiB |
| air | 天空 glaze、遠雲帶、中景氣流、近景航標，弱化「柏油在天上」 | 262.5 KiB |
| sea | 深水邊緣明暗、遠景油膜、中景順 scroll 浪紋、近景浮標 | 273.4 KiB |
| space | 稀疏星雲帶、中景軌道殘骸、近景桁架剪影 | 261.1 KiB |

`renderDebug.depthLayerEnvironment` 與 `depthLayerTier` 可驗證環境及 off／low／full 分級；reduced／low 會減少層數，不影響碰撞 root。

## 動畫鐵律

- 三種新敵人的 walk atlas 都來自四個分別生成、分別裁切的身體姿勢，再以同一比例打包；沒有從單張圖製造位移、旋轉、縮放或 bob 假動畫。
- `scripts/build-cc0-assets.py` 已停止用 legacy whole-sprite transform 覆寫 shield／swarm；`scripts/build-r72-assets.py` 鎖住獨立姿勢打包規則。
- 新 atlas 目前只有 locomotion；**尚缺專用 raster hurt／death action atlas**。為保留真反應，命中後才切到現有 code-sprite `hit` 姿勢，死亡 effect 依 `effect.age` 播放既有 `die` 逐幀序列；不再把 walk 圖旋轉／壓扁冒充死亡。此為可直接替換成專用 raster action atlas 的管線，不宣稱缺少的 raster 幀已繪完。
- 視覺動畫與 enemy 物理 root／collider 分離；傷害仍由 projectile／contact hitbox 成立後結算，沒有改成按下攻擊立即傷害。

## 同款 Pillow 技術量測

執行：`python scripts/audit-r72-assets.py`

定義沿用 R71 audit 的量測族：四角 alpha；不透明像素中的洋紅／綠幕殘色比例；靜態與 atlas 不透明像素 mean RGB 的歐氏距離；alpha bbox 縮到 32px 高後用 `FIND_EDGES` 計算 edge density。另加四格 atlas 任兩格 alpha 差平均，守住真姿勢差異。

### 透明與去背

| 素材 | 四角 alpha | chroma bleed |
|---|---:|---:|
| `xi_gunner.png` | `(0,0,0,0)` | 0.000 |
| `tar_brute.png` / atlas | 各 `(0,0,0,0)` | 各 0.000 |
| `shield_husk.png` / atlas | 各 `(0,0,0,0)` | 各 0.000 |
| `swarm_mite.png` / atlas | 各 `(0,0,0,0)` | 各 0.000 |

### 色管線、剪影與真姿勢

| 敵人 | mean RGB Δ（<8） | 32px edge density | pose alpha difference（>0.08） |
|---|---:|---:|---:|
| tar brute | 2.858 | 0.327 | 0.186 |
| shield husk | 2.503 | 0.299 | 0.162 |
| swarm mite | 2.000 | 0.243 | 0.190 |

R71 指出的舊 tar edge density 0.17 已升到 0.327；shield 與 mite 也進入 R71 主體約 0.24–0.32 的可讀帶。完整命令輸出為 `R72 asset audit PASS`。

### 接口與體積

| 素材 | 尺寸 | 實際 | 門檻 |
|---|---:|---:|---:|
| xi gunner | 512×384 | 244.3 KiB | ≤250 KiB |
| start | 820×1728 | 297.3 KiB | ≤500 KiB |
| cover | 1280×640 | 678.3 KiB | ≤700 KiB |
| land / air / sea / space | 各 780×1560 | 306.2 / 262.5 / 273.4 / 261.1 KiB | 各 ≤350 KiB |

## 三視口證據

| 視口 | 首屏 | 戰鬥 |
|---|---|---|
| 桌機 1440×900 | `docs/evidence/R72/desktop-start.png` | `docs/evidence/R72/desktop-battle.png` |
| 平板 1024×1366 | `docs/evidence/R72/tablet-start.png` | `docs/evidence/R72/tablet-battle.png` |
| 手機 390×844 | `docs/evidence/R72/phone-start.png` | `docs/evidence/R72/phone-battle.png` |

## 產圖與 bake provenance

使用 OpenAI built-in image generation（`image_gen`），不是外部搜尋素材。Prompt set：

1. 共通：以 R71 shambler／runner／spore spitter／titan 的 painterly crisp pixel-art、暖灰燼低彩、硬輪廓與體積光為 style reference；無字、無 logo、無浮水印。
2. Tar master：一格靜態＋四格獨立重步姿勢的厚重半人形瀝青甲、暖橙 visor，平坦洋紅鍵色底。
3. Shield master：一格靜態＋四格獨立盾步姿勢的腐軀與骨金屬大盾，盾面積至少軀幹 40%，平坦洋紅鍵色底。
4. Swarm master：一格靜態＋四格獨立爬行姿勢的三蟲群聚、尖足、琥珀亮眼，平坦洋紅鍵色底。
5. Xi master：兩欄獨立 idle／開火後座，短深棕髮、棕圍巾、深褲靴、黑色工作護甲、白色 V 胸徽，3/4 頂視，平坦洋紅鍵色底。
6. Start master：直式 land_rig＋trailer 暖褐護航場景，上 18%／下 22% 低資訊、無字。
7. Cover master：1280:640 橫式 land_rig＋trailer 對抗 R71 語言屍潮的插畫像素 pack shot，無字。

透明母圖皆先經 imagegen skill 的 `remove_chroma_key.py`（auto-key border、soft matte、despill），再由 `scripts/build-r72-assets.py` 單次 Lanczos 下採樣、固定接口打包與 palette 優化。生成／鍵色母圖保存在 gitignored `tools/asset_sources/imagegen_r72/`，不進 runtime cache。

## 測試、版本與安全

- `npm test`：config、automation、visual、animation assets、rules、supply、economy、storage、sprite contract、FX、audio 全 PASS；17 個動畫／重製守門檔共 539659 bytes。
- `npm run test:rwd`：shelter、ops drawer、trailer room；桌機／平板／手機／橫向共 27 組場景視口全 PASS，頁捲與橫溢皆 0。
- `npm run test:e2e`：390×844、820×1180、1280×900、1366×700，以及 image／vehicle／zombie／environment fallback、音訊、service-worker offline 全 PASS。
- `src/version.js`、config fallback、HTML query／boot key、SW shell/cache 與 release guards 同步為 `R72` / `ashes-convoy-r72-v1`；active runtime `src index.html sw.js manifest.webmanifest` 的 `R71|r71` grep 為 0。歷史 R71 audit／回應保留原始版本文字。
- `git diff --check` PASS。
- `grep -rniE "sk-proj-[A-Za-z0-9_-]{20}|sk-[a-z0-9]{40}" --exclude-dir=.git .`：0 命中。
- 依要求只做本地 commit，不 push；既有未提交的 `AGENTS.md`、`docs/GROK_ASSET_AUDIT.md` 與 `docs/CODEX_RESPONSE_ashes_R71.md` 不納入 R72 commit。
