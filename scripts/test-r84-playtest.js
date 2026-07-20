"use strict";

/* R84 PLAYTEST-R1 永久回歸：rail drawer、補給輸入隔離、結算語意／焦點、
 * 快升可發現性、橫向旋轉提示與低高拖車壓縮。 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(rootDir, decodeURIComponent(requestPath)));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function waitReady(page) {
  await page.waitForFunction(
    () => window.__test && window.__test.spritesReady && window.__test.spritesReady(),
    null,
    { polling: 120, timeout: 180000 }
  );
  await page.waitForFunction(() => {
    const state = window.__test.getShelterState();
    const image = document.getElementById("shelterImage");
    return state.backgroundMode === "image" && state.imageLoaded && image && image.complete && image.naturalWidth > 0;
  }, null, { polling: 120, timeout: 180000 });
}

async function startFreshRun(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.step(30);
  });
  await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { timeout: 30000 });
}

async function checkRunSettingsDrawer(page) {
  await startFreshRun(page);
  await page.click("#railSettingsBtn");
  await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
  const opened = await page.evaluate(() => ({
    mode: window.__test.getState().mode,
    paused: window.__test.getState().paused,
    pauseHidden: document.getElementById("pausePanel").hidden,
    drawerHidden: document.getElementById("metaDrawer").hidden,
    checked: document.getElementById("screenShakeToggle").checked
  }));
  assert.strictEqual(opened.mode, "paused", "跑局 rail 設定應暫停戰局");
  assert.strictEqual(opened.pauseHidden, true, "rail 設定開啟時暫停面板不得重現搶命中");
  assert.strictEqual(opened.drawerHidden, false, "rail 設定 drawer 應保持前景可操作");

  const checkbox = page.locator("#screenShakeToggle");
  await checkbox.click();
  assert.strictEqual(await checkbox.isChecked(), !opened.checked, "設定 checkbox 應可真實點擊");
  await page.click("#closeMetaDrawer");
  await page.waitForFunction(() => window.__test.getState().mode === "playing" && document.getElementById("garagePanel").hidden);
  const closed = await page.evaluate(() => ({
    pauseHidden: document.getElementById("pausePanel").hidden,
    drawerHidden: document.getElementById("metaDrawer").hidden,
    checked: window.__test.getMeta().settings.screenShake
  }));
  assert.strictEqual(closed.pauseHidden, true, "關閉 drawer 後不應殘留暫停面板");
  assert.strictEqual(closed.drawerHidden, true, "設定 drawer 應可關閉");
  assert.strictEqual(closed.checked, !opened.checked, "checkbox 變更應保存");
  console.log("PASS R1-META-02 跑局設定可點、可關、關後回 playing");
}

async function checkSupplyInputGuard(page) {
  const canvasBox = await page.locator("#gameCanvas").boundingBox();
  assert(canvasBox, "fire isolation 前戰場 canvas 應可見");
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.down();
  await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      supplyChoice: {
        dropId: "R84_fire_isolation",
        x: state.vehicle.x,
        y: state.vehicle.y - 20,
        openedAt: state.time,
        rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards)
      },
      paused: false
    });
    window.__test.step(1);
  });
  await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) .supply-choice-btn[data-reward-id="damage_boost"]');
  const choiceButton = page.locator('#supplyChoiceOverlay .supply-choice-btn[data-reward-id="damage_boost"]');
  assert.strictEqual(await choiceButton.getAttribute("data-input-guarded"), "true", "補給剛出現時 choice 應進入 pointer 隔離");
  const choiceBox = await choiceButton.boundingBox();
  assert(choiceBox, "補給 choice 應可見");
  await page.mouse.move(choiceBox.x + choiceBox.width / 2, choiceBox.y + choiceBox.height / 2);
  await page.mouse.up();
  assert(await page.evaluate(() => !!window.__test.getState().supplyChoice), "既有 fire click 不得立即選中補給");
  await page.waitForFunction(() => {
    const button = document.querySelector('#supplyChoiceOverlay .supply-choice-btn[data-reward-id="damage_boost"]');
    return button && button.dataset.inputGuarded !== "true";
  }, null, { timeout: 2000 });
  await choiceButton.click();
  await page.waitForFunction(() => !window.__test.getState().supplyChoice);
  assert.strictEqual((await page.evaluate(() => window.__test.getState().stats.supplyCratesCollected)), 1, "隔離結束後補給應可選中一次");
  console.log("PASS R1-SUPPLY-03 既有射擊 click 不誤選、短暫後可選");
}

async function checkSettlementOutcomesAndFocus(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__test.finishRun({
    wavesCleared: 12,
    kills: 160,
    bossesDefeated: 2,
    score: 8200
  }));
  await page.waitForSelector('#settlementPanel:not([hidden])[data-outcome="evacuated"]');
  await page.waitForTimeout(50);
  const evacuation = await page.evaluate(() => {
    const panel = document.getElementById("settlementPanel");
    const title = document.getElementById("settlementTitle");
    const panelRect = panel.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      title: title.textContent,
      outcome: document.getElementById("settlementOutcomeText").textContent,
      scrollTop: panel.scrollTop,
      activeId: document.activeElement && document.activeElement.id,
      titleVisible: titleRect.top >= panelRect.top - 1 && titleRect.bottom <= panelRect.bottom + 1 && titleRect.top >= -1
    };
  });
  assert(evacuation.title.includes("撤離成功"), `主動撤離應為成功語意：${evacuation.title}`);
  assert(evacuation.outcome.includes("主動撤離") && evacuation.outcome.includes("安全帶回"), `撤離原因／結果應明確：${evacuation.outcome}`);
  assert.strictEqual(evacuation.scrollTop, 0, "結算 render 後應停在標題頂端");
  assert.strictEqual(evacuation.activeId, "againBtn", "結算仍應提供鍵盤焦點");
  assert(evacuation.titleVisible, "againBtn focus 不得把結算標題捲出可視區");

  await page.evaluate(() => {
    window.__test.showGarage();
    window.__test.startRun("land_rig");
    window.__test.damageVehicle(999999, { type: "enemy", enemyId: "shambler" });
  });
  await page.waitForSelector('#settlementPanel:not([hidden])[data-outcome="destroyed"]');
  const defeat = await page.evaluate(() => ({
    title: document.getElementById("settlementTitle").textContent,
    outcome: document.getElementById("settlementOutcomeText").textContent,
    enemyName: window.DSConfig.ENEMIES.shambler.name
  }));
  assert(defeat.title.includes("護航失敗"), `敵人擊毀應為失敗語意：${defeat.title}`);
  assert(defeat.outcome.includes("死因") && defeat.outcome.includes(defeat.enemyName), `陣亡應列出死因與敵人：${defeat.outcome}`);
  console.log("PASS R1-OUTCOME-04 / R1-SETTLE-05 撤離／陣亡語意與 preventScroll");
}

async function vehicleClientPoint(page) {
  return page.evaluate(() => {
    const state = window.__test.getState();
    const rect = document.getElementById("gameCanvas").getBoundingClientRect();
    return {
      x: rect.left + (state.vehicle.x / window.DSConfig.LOGIC.width) * rect.width,
      y: rect.top + (state.vehicle.y / window.DSConfig.LOGIC.height) * rect.height
    };
  });
}

async function checkQuickUpgradeAffordance(page) {
  await startFreshRun(page);
  await page.waitForSelector("#quickUpgradeHint:not([hidden])");
  const copy = await page.locator("#quickUpgradeHint").innerText();
  assert(copy.includes("點車體") && copy.includes("工坊"), `首玩提示應區分快升與 rail 工坊：${copy}`);
  assert.strictEqual((await page.locator("#railUpgradeBtn span").innerText()), "工坊", "rail 升級語意應改為完整工坊");
  const point = await vehicleClientPoint(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector("#quickUpgradeWheel:not([hidden])");
  const seen = await page.evaluate(() => ({
    hintHidden: document.getElementById("quickUpgradeHint").hidden,
    seen: window.__test.getMeta().tutorial.seenQuickUpgrade
  }));
  assert.strictEqual(seen.hintHidden, true, "第一次開輪盤後 affordance 應收起");
  assert.strictEqual(seen.seen, true, "第一次開輪盤後應保存已讀狀態");
  console.log("PASS R1-WHEEL-07 首玩車體快升 affordance 與工坊語意區隔");
}

async function checkLandscapeGuidanceAndTrailer(page) {
  await startFreshRun(page);
  await page.waitForSelector("#landscapeRotateHint");
  const hint = await page.locator("#landscapeRotateHint").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      text: node.innerText,
      display: style.display,
      pointerEvents: style.pointerEvents,
      box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    };
  });
  assert.notStrictEqual(hint.display, "none", "844x390 應顯示旋轉提示");
  assert(hint.text.includes("旋轉回直向") && hint.text.includes("橫向仍可操作"), `旋轉提示需說明最佳體驗與可玩性：${hint.text}`);
  assert.strictEqual(hint.pointerEvents, "none", "旋轉提示不得攔截戰場操作");
  assert(hint.box.left >= -1 && hint.box.top >= -1 && hint.box.right <= 845 && hint.box.bottom <= 391, "旋轉提示應完整位於視口內");

  await page.evaluate(() => {
    window.__test.showGarage();
    const meta = window.__test.getMeta();
    meta.trailerGoods = 300;
    window.__test.setMeta(meta);
    window.__test.openTrailerRoom();
  });
  await page.waitForSelector("#trailerOverlay:not([hidden]) .trailer-furniture");
  const compact = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#trailerFurnitureList .trailer-furniture"));
    const first = cards[0].getBoundingClientRect();
    const second = cards[1].getBoundingClientRect();
    const button = cards[0].querySelector("button").getBoundingClientRect();
    const desc = cards[0].querySelector("small");
    return {
      twoColumns: Math.abs(first.top - second.top) <= 2 && second.left > first.left,
      cardHeight: first.height,
      buttonHeight: button.height,
      descriptionDisplay: getComputedStyle(desc).display
    };
  });
  assert(compact.twoColumns, "390 高拖車家具應壓成雙欄目錄");
  assert(compact.cardHeight <= 58, `390 高家具卡應壓縮（實際 ${compact.cardHeight}px）`);
  assert(compact.buttonHeight >= 44, "壓縮後家具按鈕仍須保留 44px 命中高度");
  assert.strictEqual(compact.descriptionDisplay, "none", "低高模式應收起次要長描述");
  console.log("PASS R1-LAND-01 / R1-TRAILER-06 橫向旋轉提示與家具雙欄壓縮");
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  try {
    const desktopContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: "block" });
    const desktopPage = await desktopContext.newPage();
    const desktopErrors = [];
    desktopPage.on("pageerror", (error) => desktopErrors.push(error.message));
    await desktopPage.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitReady(desktopPage);
    await checkRunSettingsDrawer(desktopPage);
    await checkSupplyInputGuard(desktopPage);
    await checkSettlementOutcomesAndFocus(desktopPage);
    await checkQuickUpgradeAffordance(desktopPage);
    assert.deepStrictEqual(desktopErrors, [], `R84 desktop 不得有 page error：${desktopErrors.join(" | ")}`);
    await desktopContext.close();

    const landscapeContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block"
    });
    const landscapePage = await landscapeContext.newPage();
    const landscapeErrors = [];
    landscapePage.on("pageerror", (error) => landscapeErrors.push(error.message));
    await landscapePage.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitReady(landscapePage);
    await checkLandscapeGuidanceAndTrailer(landscapePage);
    assert.deepStrictEqual(landscapeErrors, [], `R84 landscape 不得有 page error：${landscapeErrors.join(" | ")}`);
    await landscapeContext.close();
    console.log("R84 PLAYTEST-R1 guard PASS");
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
})().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
