"use strict";

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
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(rootDir, requestPath));
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
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function isIgnorableConsoleError(text) {
  return /Failed to load resource/i.test(text);
}

async function expectCanvasHasPixels(page) {
  const result = await page.evaluate(() => {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0 && (data[i] || data[i + 1] || data[i + 2])) lit += 1;
      if (lit > 1000) break;
    }
    return { lit, width: canvas.width, height: canvas.height };
  });
  assert.strictEqual(result.width, 390);
  assert.strictEqual(result.height, 844);
  assert(result.lit > 1000, `canvas should contain non-empty pixels, got ${result.lit}`);
}

async function expectShelterCanvasHasPixels(page) {
  await page.waitForFunction(() => {
    if (!window.__test || !window.__test.getShelterState) return false;
    const state = window.__test.getShelterState();
    return state.sceneReady && state.active && state.lastDrawMs > 0;
  });
  const result = await page.evaluate(() => {
    const canvas = document.getElementById("shelterCanvas");
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0 && (data[i] || data[i + 1] || data[i + 2])) lit += 1;
      if (lit > 1000) break;
    }
    return { lit, width: canvas.width, height: canvas.height, hidden: canvas.hidden };
  });
  assert(!result.hidden, "shelter canvas should be visible on meta screen");
  assert(result.width > 0 && result.height > 0, "shelter canvas should have a drawable size");
  assert(result.lit > 1000, `shelter canvas should contain non-empty pixels, got ${result.lit}`);
}

async function expectMetaBackground(page) {
  await page.waitForFunction(() => {
    if (!window.__test || !window.__test.getShelterState) return false;
    const state = window.__test.getShelterState();
    // 等圖片真的載入完成（image 模式）或確定失敗後才判定；不要接受「圖片載入中的過渡 scene 態」，
    // 否則圖片載完隱藏 canvas 會與 canvas 斷言競態（CI 圖載較慢時必現）
    if (state.backgroundMode === "image" && state.imageLoaded) return true;
    if (state.imageFailed && state.backgroundMode === "scene" && state.lastDrawMs > 0) return true;
    return false;
  });
  const state = await page.evaluate(() => window.__test.getShelterState());
  if (state.backgroundMode === "image" && state.imageLoaded) {
    const image = await page.locator("#shelterImage").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        hidden: node.hidden,
        complete: node.complete,
        naturalWidth: node.naturalWidth,
        naturalHeight: node.naturalHeight,
        width: rect.width,
        height: rect.height,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        src: node.getAttribute("src")
      };
    });
    assert(!image.hidden, "start key art should be visible when background mode is image");
    assert(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, "start key art should load successfully");
    assert(image.width > 0 && image.height > 0, "start key art should cover a visible area");
    assert(image.src && image.src.includes("assets/ui/start.png"), `meta background should use start.png, got ${image.src}`);
    assert.strictEqual(image.objectFit, "cover", "start key art should use cover-fit");
    assert(image.objectPosition.includes("50%"), "start key art should stay centered");
  } else {
    await expectShelterCanvasHasPixels(page);
  }
}

async function checkMetaHotspotsFit(page) {
  const result = await page.evaluate(() => {
    const app = document.getElementById("app").getBoundingClientRect();
    const layer = document.getElementById("hotspotLayer").getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll(".hotspot-btn")).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.id,
        text: button.textContent.trim(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        appLeft: app.left,
        appRight: app.right,
        appTop: app.top,
        appBottom: app.bottom,
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth
      };
    });
    return {
      buttons,
      layer: {
        left: layer.left,
        right: layer.right,
        top: layer.top,
        bottom: layer.bottom,
        appLeft: app.left,
        appRight: app.right,
        appTop: app.top,
        appBottom: app.bottom
      },
      viewportOverflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
  assert.strictEqual(result.buttons.length, 6, "meta screen should expose six overlay action buttons");
  assert.deepStrictEqual(
    result.buttons.map((button) => button.id).sort(),
    ["opsHotspotBtn", "resetOverlayBtn", "seriesHotspotBtn", "sortieBtn", "upgradeHotspotBtn", "vehicleHotspotBtn"],
    "meta action buttons should match the key art controls"
  );
  assert(result.layer.left >= result.layer.appLeft - 1, "meta action layer should not overflow left");
  assert(result.layer.right <= result.layer.appRight + 1, "meta action layer should not overflow right");
  assert(result.layer.bottom <= result.layer.appBottom + 1, "meta action layer should stay within app bottom");
  assert(result.viewportOverflow <= 1, "meta overlay should not create horizontal page overflow");
  result.buttons.forEach((button) => {
    assert(button.width >= 44 && button.height >= 40, `${button.id} should be a touchable size`);
    assert(button.left >= button.appLeft - 1, `${button.id} should not overflow left`);
    assert(button.right <= button.appRight + 1, `${button.id} should not overflow right`);
    assert(button.top >= button.appTop - 1, `${button.id} should not overflow top`);
    assert(button.bottom <= button.appBottom + 1, `${button.id} should not overflow bottom`);
    assert(button.scrollWidth <= button.clientWidth + 2, `${button.id} label should fit without horizontal overflow`);
  });
}

async function waitForMetaBackground(page) {
  await page.waitForFunction(() => {
    const state = window.__test.getShelterState();
    return state.backgroundMode === "image" || state.backgroundMode === "scene" || state.backgroundMode === "none";
  });
}

async function openUpgradePanel(page) {
  const fullBackground = await page.evaluate(() => {
    const mode = window.__test.getShelterState().backgroundMode;
    return mode === "image" || mode === "scene";
  });
  if (fullBackground) {
    const alreadyOpen = await page.locator('#metaDrawer:not([hidden]) [data-meta-section="upgrades"]:not([hidden])').count();
    if (alreadyOpen) return;
    await page.click("#upgradeHotspotBtn");
    await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="upgrades"]:not([hidden])');
  }
}

async function openOperationsPanel(page) {
  const fullBackground = await page.evaluate(() => {
    const mode = window.__test.getShelterState().backgroundMode;
    return mode === "image" || mode === "scene";
  });
  if (fullBackground) {
    const alreadyOpen = await page.locator('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])').count();
    if (alreadyOpen) return;
    await page.click("#opsHotspotBtn");
    await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
  }
}

async function clickSortie(page) {
  const fullBackground = await page.evaluate(() => {
    const mode = window.__test.getShelterState().backgroundMode;
    return mode === "image" || mode === "scene";
  });
  if (fullBackground) {
    const drawerOpen = await page.locator("#metaDrawer:not([hidden])").count();
    if (drawerOpen) await page.click("#closeMetaDrawer");
  }
  await page.click("#sortieBtn");
  await page.waitForFunction(() => window.__test.getState().mode === "playing");
}

async function checkStartTitle(page) {
  const title = await page.locator("#garagePanel .meta-summary h1").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const app = document.getElementById("app").getBoundingClientRect();
    return {
      text: node.textContent.trim(),
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      appLeft: app.left,
      appRight: app.right,
      appTop: app.top,
      appBottom: app.bottom,
      visible: getComputedStyle(node).display !== "none"
    };
  });
  assert.strictEqual(title.text, "灰燼護航", "start screen should show the game title");
  assert(title.visible, "start title should be visible");
  assert(title.left >= title.appLeft - 1 && title.right <= title.appRight + 1, "start title should fit horizontally");
  assert(title.top >= title.appTop - 1 && title.bottom <= title.appBottom + 1, "start title should stay inside the app");
}

async function checkPwaFilesAndSkipRegistration(page) {
  const pwa = await page.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const manifestResponse = await fetch(manifestLink.getAttribute("href"));
    const manifest = await manifestResponse.json();
    const swText = await fetch("sw.js").then((response) => response.text());
    const uiText = await fetch("src/ui.js").then((response) => response.text());
    const registrations =
      "serviceWorker" in navigator && navigator.serviceWorker.getRegistrations
        ? await navigator.serviceWorker.getRegistrations()
        : [];
    return {
      manifestHref: manifestLink && manifestLink.getAttribute("href"),
      name: manifest.name,
      orientation: manifest.orientation,
      icons: manifest.icons.map((icon) => icon.sizes).sort(),
      swHasVersion: swText.includes("CACHE_VERSION"),
      swImportsVersion: swText.includes('importScripts("src/version.js")') && swText.includes("DSVersion.CACHE_VERSION"),
      swHasSkipWaiting: swText.includes("self.skipWaiting()"),
      swHasClientsClaim: swText.includes("self.clients.claim()"),
      swHasNetworkFirst: swText.includes("networkFirst"),
      swHasCacheFirst: swText.includes("cacheFirst"),
      swCachesJs: swText.includes("src/version.js") && swText.includes("src/ui.js") && swText.includes("src/game.js") && swText.includes("src/rules.js"),
      swHasOffline: swText.includes("offline.html"),
      uiHasControllerChange: uiText.includes("controllerchange"),
      uiHasAutoReloadWindow: uiText.includes("SW_AUTO_RELOAD_WINDOW_MS") && uiText.includes("15000"),
      uiHasSessionGuard: uiText.includes("SW_AUTO_RELOAD_SESSION_KEY") && uiText.includes("sessionStorage"),
      uiHasAutoReload: uiText.includes("root.location.reload()"),
      webdriver: navigator.webdriver,
      registrationCount: registrations.length
    };
  });
  assert.strictEqual(pwa.manifestHref, "manifest.webmanifest", "page should link the web manifest");
  assert.strictEqual(pwa.name, "灰燼護航");
  assert.strictEqual(pwa.orientation, "portrait");
  assert.deepStrictEqual(pwa.icons, ["192x192", "512x512"], "manifest should expose 192 and 512 icons");
  assert(pwa.swHasVersion && pwa.swImportsVersion && pwa.swHasSkipWaiting && pwa.swHasClientsClaim && pwa.swHasNetworkFirst && pwa.swHasCacheFirst, "service worker should define versioned network/cache strategies and immediate activation");
  assert(pwa.swCachesJs && pwa.swHasOffline, "service worker should cache JS app shell and offline fallback");
  assert(pwa.uiHasControllerChange && pwa.uiHasAutoReloadWindow && pwa.uiHasSessionGuard && pwa.uiHasAutoReload, "page should auto reload once after early service worker controllerchange");
  assert.strictEqual(pwa.webdriver, true, "E2E should run under webdriver");
  assert.strictEqual(pwa.registrationCount, 0, "webdriver sessions should skip service worker registration");
}

async function checkLiveRegionsAndKeyboard(page) {
  const live = await page.evaluate(() => ({
    eventBanner: document.getElementById("eventBanner").getAttribute("aria-live"),
    eventRole: document.getElementById("eventBanner").getAttribute("role"),
    garageStatus: document.getElementById("garageStatus").getAttribute("aria-live"),
    badges: document.getElementById("settlementBadges").getAttribute("aria-live")
  }));
  assert.strictEqual(live.eventBanner, "polite", "event banner should announce politely");
  assert.strictEqual(live.eventRole, "status", "event banner should use status role");
  assert.strictEqual(live.garageStatus, "polite", "garage toast/status should announce politely");
  assert.strictEqual(live.badges, "polite", "settlement badge updates should announce politely");

  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  const focusSeen = [];
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Tab");
    focusSeen.push(await page.evaluate(() => document.activeElement && document.activeElement.id));
  }
  assert(
    focusSeen.some((id) => ["sortieBtn", "upgradeHotspotBtn", "vehicleHotspotBtn", "seriesHotspotBtn", "opsHotspotBtn"].includes(id)),
    `keyboard Tab smoke should reach shelter controls, saw ${focusSeen.join(",")}`
  );
}

async function checkClearStorageButton(page) {
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.parts = 77;
    meta.selectedVehicle = "void_runner";
    window.__test.setMeta(meta);
  });
  await waitForMetaBackground(page);
  await page.click("#resetOverlayBtn");
  await page.waitForFunction(() => {
    const meta = window.__test.getMeta();
    return meta.parts === 0 && meta.selectedVehicle === "land_rig";
  });
}

async function checkShelterMeta(page) {
  await page.waitForSelector("#garagePanel:not([hidden])");
  await expectMetaBackground(page);
  await checkStartTitle(page);
  await checkPwaFilesAndSkipRegistration(page);
  await checkMetaHotspotsFit(page);
  await checkLiveRegionsAndKeyboard(page);
  await checkClearStorageButton(page);
  await expectMetaBackground(page);
  await openUpgradePanel(page);
  const drawer = await page.locator("#metaDrawer").evaluate((node) => ({
    hidden: node.hidden,
    title: document.getElementById("metaDrawerTitle").textContent,
    activeId: document.activeElement && document.activeElement.id
  }));
  assert(!drawer.hidden && drawer.title.includes("升級"), "upgrade hotspot should open the upgrade drawer");
  assert.strictEqual(drawer.activeId, "closeMetaDrawer", "opening a meta drawer should move focus to the close button");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("metaDrawer").hidden === true);
  const focusAfterEsc = await page.evaluate(() => document.activeElement && document.activeElement.id);
  assert.strictEqual(focusAfterEsc, "upgradeHotspotBtn", "Escape should close the drawer and restore focus");
}

async function dragAim(page) {
  const box = await page.locator("#gameCanvas").boundingBox();
  assert(box, "canvas bounding box should exist");
  const before = await page.evaluate(() => window.__test.getState().vehicle);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.78);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.24, { steps: 8 });
  await page.evaluate(() => window.__test.step(180));
  const duringDrag = await page.evaluate(() => window.__test.getState().vehicle);
  await page.mouse.up();
  await page.evaluate(() => {
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(120);
  });
  const after = await page.evaluate(() => {
    const state = window.__test.getState();
    return {
      vehicle: state.vehicle,
      projectile: state.projectiles[state.projectiles.length - 1]
    };
  });
  assert(Math.abs(after.vehicle.aimX - before.aimX) > 20, "drag should change aimX");
  assert(after.vehicle.aimY < before.aimY - 80, "drag should move aim upward");
  assert(
    Math.abs(duringDrag.x - before.x) < 8,
    `drag aim should not hard-pull vehicle horizontally, moved ${Math.abs(duringDrag.x - before.x).toFixed(1)}`
  );
  assert(after.projectile, "auto fire should create a projectile after drag");
  assert(after.projectile.vx > 10, "projectile should point toward the dragged aim direction");
  assert(after.projectile.vy < -40, "projectile should travel upward");
}

async function checkGarageUpgradeLines(page) {
  await openUpgradePanel(page);
  const tracks = await page.locator("[data-upgrade]").evaluateAll((nodes) => nodes.map((node) => node.dataset.upgrade));
  assert.deepStrictEqual(
    tracks.sort(),
    ["energy", "gate", "hull", "land_armor", "land_resist", "weapon"],
    "land garage should show common tracks plus two vehicle-specific nodes"
  );
}

async function checkSettingsAndQuestBoard(page) {
  await openOperationsPanel(page);
  const questCount = await page.locator("#questList .quest-card").count();
  assert.strictEqual(questCount, 2, "operations panel should show one daily and one weekly quest");

  await page.selectOption("#aimAssistLevelSelect", "high");
  await page.locator("#screenShakeToggle").uncheck();
  await page.selectOption("#damageTextDensitySelect", "large");
  await page.selectOption("#performanceModeSelect", "low");
  await page.selectOption("#fontSizeSelect", "large");
  let meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.settings.aimAssistLevel, "high", "aim assist level should persist from settings panel");
  assert.strictEqual(meta.settings.aimAssist, true, "high aim assist should keep compatibility boolean enabled");
  assert.strictEqual(meta.settings.screenShake, false, "screen shake toggle should persist");
  assert.strictEqual(meta.settings.damageTextDensity, "large", "damage text density should persist");
  assert.strictEqual(meta.settings.performanceMode, "low", "performance mode should persist");
  assert.strictEqual(meta.settings.fontSize, "large", "font size setting should persist");
  const fontState = await page.evaluate(() => ({
    largeClass: document.body.classList.contains("font-large"),
    questFont: parseFloat(getComputedStyle(document.querySelector(".quest-card strong")).fontSize),
    diagnostics: document.getElementById("performanceDiagnosticText").textContent,
    version: document.getElementById("versionText").textContent
  }));
  assert.strictEqual(fontState.largeClass, true, "large font size should apply a body class");
  assert(fontState.questFont >= 14, `large font size should enlarge quest text, got ${fontState.questFont}`);
  assert(fontState.diagnostics.includes("FPS") && fontState.diagnostics.includes("品質") && fontState.diagnostics.includes("cap"), `performance diagnostics should show FPS/quality/cap: ${fontState.diagnostics}`);
  assert(fontState.version.includes("R44"), `settings should show app version: ${fontState.version}`);

  await page.click("#exportSaveBtn");
  const exported = await page.locator("#saveCodeBox").inputValue();
  assert(exported.length > 20, "export should write a base64 save code");
  await page.fill("#saveCodeBox", "bad-save-code");
  await page.click("#importSaveBtn");
  const badStatus = await page.locator("#garageStatus").innerText();
  assert(badStatus.includes("匯入失敗"), `bad save code should be rejected: ${badStatus}`);
  const beforeImportMeta = await page.evaluate(() => window.__test.getMeta());
  const changedMeta = Object.assign({}, beforeImportMeta, { parts: beforeImportMeta.parts + 33 });
  const changedCode = await page.evaluate((nextMeta) => window.DSRules.encodeSaveMeta(nextMeta, { config: window.DSConfig }), changedMeta);
  await page.evaluate(() => { window.__test.skipImportReload = true; });
  await page.fill("#saveCodeBox", changedCode);
  await page.click("#importSaveBtn");
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.parts, changedMeta.parts, "valid import should replace meta");
  const backupExists = await page.evaluate(() => !!localStorage.getItem(`${window.DSConfig.STORAGE_KEY}_backup`));
  assert.strictEqual(backupExists, true, "import should keep a local backup before replacing the save");

  const dailyInstanceId = await page.evaluate(() => {
    const now = new Date().toISOString();
    const config = window.DSConfig;
    let nextMeta = window.DSRules.ensureQuestState(window.__test.getMeta(), { now, config });
    const daily = window.DSRules.getQuestBoard(nextMeta, { now, config }).find((quest) => quest.period === "daily");
    if (daily.metric === "variantKills") nextMeta.questStats.variantKills += daily.target;
    if (daily.metric === "eventCompletions") nextMeta.questStats.eventCompletions += daily.target;
    if (daily.metric === "supplyCrates") nextMeta.questStats.supplyCrates += daily.target;
    if (daily.metric === "environmentWins") nextMeta.questStats.environmentWins[daily.environment] += daily.target;
    window.__test.setMeta(nextMeta);
    return daily.instanceId;
  });
  await openOperationsPanel(page);
  const card = page.locator(`[data-quest-instance="${dailyInstanceId}"]`);
  const readyButton = await card.locator("[data-quest-claim]").evaluate((button) => ({
    disabled: button.disabled,
    text: button.textContent
  }));
  assert(!readyButton.disabled && readyButton.text.includes("領取"), `daily quest should be ready to claim: ${readyButton.text}`);
  const beforeParts = await page.evaluate(() => window.__test.getMeta().parts);
  await card.locator("[data-quest-claim]").click();
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.parts, beforeParts + 5, "daily quest claim should grant 5 parts");
  assert.strictEqual(meta.questClaims[dailyInstanceId], true, "quest claim should be stored by instance id");
  const claimedButton = await card.locator("[data-quest-claim]").innerText();
  assert(claimedButton.includes("已領取"), `claimed quest button should switch state: ${claimedButton}`);

  meta.settings.aimAssistLevel = "medium";
  meta.settings.aimAssist = true;
  meta.settings.screenShake = true;
  meta.settings.damageTextDensity = "all";
  meta.settings.performanceMode = "auto";
  meta.settings.fontSize = "medium";
  await page.evaluate((nextMeta) => window.__test.setMeta(nextMeta), meta);
}

async function unlockFleet(page) {
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    Object.keys(window.DSConfig.VEHICLES).forEach((vehicleId) => {
      meta.unlockedVehicles[vehicleId] = true;
      const required = window.DSRules.blueprintRequiredForVehicle(vehicleId, window.DSConfig);
      if (required > 0) meta.blueprints[vehicleId] = required;
    });
    window.__test.setMeta(meta);
  });
}

async function checkNewSaveVehicleLocks(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.showGarage();
  });
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.click("#vehicleHotspotBtn");
  await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="vehicle"]:not([hidden])');
  const meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.unlockedVehicles.land_rig, true, "new save should unlock land rig");
  assert.strictEqual(meta.unlockedVehicles.sky_barge, false, "new save should lock sky barge");
  assert.strictEqual(meta.unlockedVehicles.sea_ark, false, "new save should lock sea ark");
  assert.strictEqual(meta.unlockedVehicles.void_runner, false, "new save should lock void runner");
  const locked = await page.locator(".vehicle.is-locked").evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.innerText,
      disabled: node.querySelector("button").disabled
    }))
  );
  assert.strictEqual(locked.length, 3, "new save should show three locked vehicle cards");
  locked.forEach((card) => {
    assert(card.disabled, "locked vehicle buttons should be disabled");
    if (card.text.includes("0 / 3")) return;
    assert(card.text.includes("藍圖 0 / 3"), `locked vehicle should show blueprint progress: ${card.text}`);
  });
  await page.evaluate(() => window.__test.startRun("sky_barge"));
  const state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.vehicleId, "land_rig", "starting a locked vehicle should fall back to the unlocked land rig");
  await page.evaluate(() => window.__test.showGarage());
}

async function checkOldSaveRetention(page) {
  await page.evaluate(() => {
    window.__test.setMeta({
      version: 1,
      totalRuns: 1,
      selectedVehicle: "void_runner",
      unlockedVehicles: { land_rig: true, sky_barge: true, sea_ark: true, void_runner: true },
      vehicleLevels: { void_runner: { weapon: 1 } }
    });
  });
  const meta = await page.evaluate(() => window.__test.getMeta());
  assert.deepStrictEqual(
    ["land_rig", "sky_barge", "sea_ark", "void_runner"].map((vehicleId) => meta.unlockedVehicles[vehicleId]),
    [true, true, true, true],
    "old active saves should retain all four vehicles"
  );
  assert.strictEqual(meta.selectedVehicle, "void_runner", "old selected vehicle should be retained when unlocked");
  await page.evaluate(() => window.__test.clearStorage());
}

async function checkVehicleFleetSelectionAndCombat(page) {
  await page.evaluate(() => window.__test.showGarage());
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.click("#vehicleHotspotBtn");
  await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="vehicle"]:not([hidden])');
  const vehicles = await page.locator("[data-vehicle]").evaluateAll((nodes) => nodes.map((node) => node.dataset.vehicle).sort());
  assert.deepStrictEqual(vehicles, ["land_rig", "sea_ark", "sky_barge", "void_runner"], "garage should expose all four fleet vehicles");
  const thumbs = await page.locator(".vehicle-thumb").evaluateAll((nodes) =>
    nodes.map((node) => ({
      src: node.getAttribute("src"),
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight
    }))
  );
  assert.strictEqual(thumbs.length, 4, "vehicle garage should show four raster thumbnails");
  thumbs.forEach((thumb) => {
    assert(thumb.src && thumb.src.includes("assets/vehicles/"), `thumbnail should use vehicle asset path: ${thumb.src}`);
  });

  for (const vehicleId of vehicles) {
    await page.evaluate((id) => {
      window.__test.startRun(id);
      const state = window.__test.getState();
      window.__test.setState({
        enemies: [],
        projectiles: [],
        gates: [],
        stats: { kills: 0 },
        vehicle: { aimX: state.vehicle.x, aimY: state.vehicle.y - 180, weaponCooldown: 0 }
      });
      const aimed = window.__test.getState();
      window.__test.spawnEnemy("shambler", {
        x: aimed.vehicle.x,
        y: aimed.vehicle.y - 170,
        hp: 1,
        speed: 0
      });
      window.__test.step(2200);
    }, vehicleId);
    await page.waitForFunction(() => {
      const debug = window.__test.getRenderDebug();
      return debug.backgroundRasterDrawn === true && debug.backgroundImageStatus === "loaded";
    });
    const result = await page.evaluate((id) => {
      const state = window.__test.getState();
      const debug = window.__test.getRenderDebug();
      return {
        vehicleId: state.vehicleId,
        kills: state.stats.kills,
        environment: debug.environment,
        expectedEnvironment: window.DSConfig.VEHICLES[id].environment,
        raster: debug.vehicleRasterDrawn,
        fallback: debug.vehicleFallbackDrawn,
        imageStatus: debug.vehicleImageStatus,
        backgroundRaster: debug.backgroundRasterDrawn,
        backgroundFallback: debug.backgroundFallbackDrawn,
        backgroundStatus: debug.backgroundImageStatus,
        backgroundPath: debug.backgroundImagePath,
        visualWidth: window.DSConfig.VEHICLES[id].visualWidth
      };
    }, vehicleId);
    assert.strictEqual(result.vehicleId, vehicleId, `${vehicleId} should be the active vehicle`);
    assert.strictEqual(result.environment, result.expectedEnvironment, `${vehicleId} should draw its environment`);
    assert(result.raster || result.fallback, `${vehicleId} should draw raster vehicle or fallback sprite`);
    assert(result.backgroundRaster, `${vehicleId} should draw its raster environment background`);
    assert.strictEqual(result.backgroundStatus, "loaded", `${vehicleId} environment background should be loaded`);
    assert(result.backgroundPath.includes(`assets/env/${result.expectedEnvironment}.png`), `${vehicleId} should use environment background asset: ${result.backgroundPath}`);
    assert(result.visualWidth >= 56 && result.visualWidth <= 64, `${vehicleId} visual width should be reduced to 56-64 world px`);
    assert(result.kills >= 1, `${vehicleId} should be able to shoot and kill`);
  }
  await page.evaluate(() => window.__test.showGarage());
  await page.waitForSelector("#garagePanel:not([hidden])");
}

async function checkWaveProgressionRegression(page) {
  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const first = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      spawnIndex: 999,
      waveElapsed: 5,
      vehicle: { hp: first.vehicle.maxHp }
    });
    window.__test.step(2500);
  });
  let state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.wave, 2, "cleared wave 1 should advance to wave 2 without waiting full duration");

  await page.evaluate(() => {
    const second = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      spawnIndex: 999,
      waveElapsed: 5,
      vehicle: { hp: second.vehicle.maxHp }
    });
    window.__test.step(2500);
  });
  state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.wave, 3, "cleared wave 2 should continue advancing to wave 3");
}

async function checkFleetProjectileTraits(page) {
  await page.evaluate(() => {
    window.__test.startRun("void_runner");
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(120);
  });
  const base = await page.evaluate(() => {
    const state = window.__test.getState();
    return state.projectiles.map((projectile) => ({ damage: projectile.damage, pierce: projectile.pierce })).slice(0, 1);
  });
  assert.strictEqual(base.length, 1, "void runner should fire one precise base projectile");
  assert(Math.abs(base[0].damage - 8.5) < 0.01, `void runner base projectile should be full damage, got ${base[0].damage}`);
  assert.strictEqual(base[0].pierce, 2, "void runner should fire piercing shots");

  await page.evaluate(() => {
    window.__test.grantGate("multishot_plus");
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(120);
  });
  const boosted = await page.evaluate(() => window.__test.getState().projectiles.map((projectile) => projectile.damage).slice(0, 3));
  assert.strictEqual(boosted.length, 2, "multishot should add one projectile");
  const full = boosted.filter((damage) => Math.abs(damage - 8.5) < 0.01).length;
  const bonus = boosted.filter((damage) => Math.abs(damage - 8.5 * 0.55) < 0.01).length;
  assert.strictEqual(full, 1, "base projectile should remain full damage");
  assert.strictEqual(bonus, 1, "only the gate-added projectile should be discounted");

  await page.evaluate(() => {
    window.__test.startRun("sea_ark");
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(500);
  });
  const seaProjectile = await page.evaluate(() => window.__test.getState().projectiles[0]);
  assert(seaProjectile && seaProjectile.splash > 0, "sea ark should fire splash projectiles");
}

async function checkEmptySettlementCta(page) {
  await clickSortie(page);
  await page.evaluate(() => window.__test.finishRun({ wavesCleared: 0, kills: 0, bossesDefeated: 0, score: 0 }));
  await page.waitForSelector("#settlementPanel:not([hidden])");
  const summary = await page.locator("#settlementSummary").innerText();
  assert(summary.includes("0"), `empty settlement should grant 0 parts: ${summary}`);
  const again = await page.locator("#againBtn").evaluate((button) => ({ text: button.textContent, className: button.className }));
  const garage = await page.locator("#garageBtn").evaluate((button) => ({ text: button.textContent, className: button.className }));
  assert(again.text.includes("再拚一局") && again.className.includes("primary"), "empty settlement should make retry the primary CTA");
  assert(garage.className.includes("secondary"), "garage should not be primary when no upgrade is affordable");
  await page.click("#againBtn");
  await page.waitForFunction(() => window.__test.getState().mode === "playing");
}

async function checkInitialPromptAndMessages(page) {
  const debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert(debug.tutorialDrawn, "opening drag tutorial should be drawn");
  assert(debug.messagesDrawn > 0, "opening message should be drawn");
}

async function checkAimAssistToggle(page) {
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.aimAssistLevel = "high";
    meta.settings.aimAssist = true;
    window.__test.setMeta(meta);
    let state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: {
        aimX: state.vehicle.x,
        aimY: state.vehicle.y - 170,
        assistAimX: state.vehicle.x,
        assistAimY: state.vehicle.y - 170,
        weaponCooldown: 999
      }
    });
    state = window.__test.getState();
    window.__test.spawnEnemy("runner", {
      x: state.vehicle.x + 70,
      y: state.vehicle.y - 150,
      hp: 999,
      speed: 118
    });
    window.__test.step(120);
  });
  const enabled = await page.evaluate(() => window.__test.getState().vehicle);
  assert(enabled.aimAssistTarget && enabled.aimAssistTarget.reason === "fast", "aim assist should select the runner threat");
  assert(enabled.assistAimX > enabled.aimX + 6, "aim assist should gently pull aim toward the runner");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.aimAssistLevel = "off";
    meta.settings.aimAssist = false;
    window.__test.setMeta(meta);
    let state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: {
        aimX: state.vehicle.x,
        aimY: state.vehicle.y - 170,
        assistAimX: state.vehicle.x,
        assistAimY: state.vehicle.y - 170,
        aimAssistTarget: null,
        weaponCooldown: 999
      }
    });
    state = window.__test.getState();
    window.__test.spawnEnemy("runner", {
      x: state.vehicle.x + 70,
      y: state.vehicle.y - 150,
      hp: 999,
      speed: 118
    });
    window.__test.step(120);
    meta.settings.aimAssistLevel = "medium";
    meta.settings.aimAssist = true;
    window.__test.setMeta(meta);
    window.__test.setState({ enemies: [], projectiles: [], gates: [] });
  });
  const disabled = await page.evaluate(() => window.__test.getState().vehicle);
  assert(Math.abs(disabled.assistAimX - disabled.aimX) < 1, "disabled aim assist should leave aim untouched");
}

async function checkAdaptivePerformance(page) {
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "low";
    window.__test.setMeta(meta);
    window.__test.step(120);
  });
  let perf = await page.evaluate(() => window.__test.getState().performance);
  assert.strictEqual(perf.quality, "low", "locked low performance mode should force low quality");
  assert(perf.maxEffects < windowlessEffectHigh(), "low quality should reduce effect cap");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    window.__test.setMeta(meta);
    for (let i = 0; i < 70; i += 1) window.__test.step(90);
  });
  perf = await page.evaluate(() => window.__test.getState().performance);
  assert.strictEqual(perf.quality, "high", "locked high performance mode should resist auto downgrade");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "auto";
    window.__test.setMeta(meta);
    for (let i = 0; i < 70; i += 1) window.__test.step(90);
  });
  perf = await page.evaluate(() => window.__test.getState().performance);
  assert.strictEqual(perf.quality, "low", "auto performance mode should downgrade after sustained low FPS samples");
  assert(perf.history && perf.history.length >= 1 && perf.history.length <= 5, "performance history should keep recent downgrade/recovery events");
  assert(perf.history[0].reason.includes("FPS"), `performance history should include a reason, got ${JSON.stringify(perf.history)}`);
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      vehicle: { hp: state.vehicle.maxHp, weaponCooldown: 0 }
    });
    window.__test.step(16);
  });
}

function windowlessEffectHigh() {
  return 90;
}

async function sampleFps(page) {
  return page.evaluate(async () => {
    const stamps = [];
    await new Promise((resolve) => {
      function tick(ts) {
        stamps.push(ts);
        if (stamps.length >= 45) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const deltas = [];
    for (let i = 1; i < stamps.length; i += 1) deltas.push(stamps[i] - stamps[i - 1]);
    const avg = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    return 1000 / avg;
  });
}

async function checkOpeningHordeGateAndFps(page) {
  await page.evaluate(() => window.__test.step(3000));
  const firstKill = await page.evaluate(() => window.__test.getState().stats.kills);
  assert(firstKill >= 1, `first kill should happen within 3 seconds, got ${firstKill}`);

  await page.evaluate(() => window.__test.step(5000));
  const opening = await page.evaluate(() => window.__test.getState());
  assert(
    opening.enemies.length >= 8,
    `opening horde should have at least 8 enemies on screen, got ${opening.enemies.length}`
  );
  const enemyDebug = await page.evaluate(() => window.__test.getRenderDebug());
  assert(
    enemyDebug.enemyRasterDrawn + enemyDebug.enemyFallbackDrawn > 0,
    "zombie horde should draw raster zombies or code-sprite fallback"
  );
  assert(enemyDebug.enemyShadowDrawn > 0, "zombie movement rendering should draw ground shadows");
  assert(
    ["loaded", "loading", "failed"].includes(enemyDebug.enemyImageStatus.shambler),
    `shambler raster status should be tracked, got ${enemyDebug.enemyImageStatus.shambler}`
  );

  const fps = await sampleFps(page);
  assert(fps >= windowlessFpsFloor(), `rough FPS should stay above floor, got ${fps.toFixed(1)}`);

  await page.evaluate(() => window.__test.step(3000));
  const gateState = await page.evaluate(() => window.__test.getState());
  assert(
    gateState.gates.length + gateState.stats.gatesTaken >= 1,
    "a gate pair should appear or be collected within the opening 11 seconds"
  );

  await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { hp: state.vehicle.maxHp, shield: 0, weaponCooldown: 0 }
    });
  });
}

function windowlessFpsFloor() {
  return 30;
}

async function killEnemiesAndEarnPreviewParts(page) {
  const before = await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      projectiles: [],
      enemies: [],
      stats: { wavesCleared: 1, kills: 0, partsPreview: 3 },
      vehicle: { aimX: state.vehicle.x, aimY: state.vehicle.y - 170, weaponCooldown: 0 }
    });
    const aimedState = window.__test.getState();
    for (let i = 0; i < 8; i += 1) {
      window.__test.spawnEnemy("shambler", {
        x: aimedState.vehicle.x,
        y: aimedState.vehicle.y - 170 - i * 5,
        hp: 1,
        speed: 0
      });
    }
    return window.__test.getState().stats;
  });
  await page.evaluate(() => window.__test.step(2600));
  const after = await page.evaluate(() => window.__test.getState().stats);
  assert.strictEqual(before.kills, 0);
  assert(after.kills >= 1, "shooting should kill at least one spawned enemy");
  assert(after.partsPreview > before.partsPreview, "kill count should increase the run parts preview");
}

async function shootGate(page) {
  await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      projectiles: [],
      gates: [],
      vehicle: { aimX: state.vehicle.x, aimY: state.vehicle.y - 210, weaponCooldown: 0 }
    });
    window.__test.spawnGate("damage_plus", {
      x: state.vehicle.x,
      y: state.vehicle.y - 190,
      hp: 1
    });
    window.__test.step(850);
  });
  const state = await page.evaluate(() => window.__test.getState());
  assert(state.stats.gatesTaken >= 1, "shooting a gate core should count as taking a gate");
  assert(state.runMods.damageAdd > 0, "damage gate should apply immediately");
}

async function tapGateChoice(page) {
  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({ gates: [], projectiles: [], enemies: [], vehicle: { weaponCooldown: 999 } });
    window.__test.spawnGate("rate_plus", {
      id: "tap-left",
      pairId: "tap-pair",
      x: window.DSConfig.LOGIC.roadLeft + 29,
      y: 132,
      hp: 99
    });
    window.__test.spawnGate("repair", {
      id: "tap-right",
      pairId: "tap-pair",
      x: window.DSConfig.LOGIC.roadRight - 29,
      y: 132,
      hp: 99
    });
    window.__test.setState({ vehicle: { hp: state.vehicle.maxHp - 80 } });
  });
  await page.waitForSelector('#gateChoiceLayer:not([hidden]) .gate-choice-btn[data-gate-id="rate_plus"]');
  const buttons = await page.locator("#gateChoiceLayer .gate-choice-btn").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.gateId,
        text: node.innerText,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth
      };
    })
  );
  assert.strictEqual(buttons.length, 2, "gate choice layer should expose two direct tap choices");
  buttons.forEach((button) => {
    assert(button.width >= 44 && button.height >= 44, `${button.id} gate tap target should be at least 44px`);
    assert(button.left >= 0 && button.right <= button.viewportWidth, `${button.id} gate button should not overflow horizontally`);
    assert(button.text.includes("點選"), `${button.id} gate button should explain direct selection`);
  });
  const rateHandle = await page.$('#gateChoiceLayer .gate-choice-btn[data-gate-id="rate_plus"]');
  assert(rateHandle, "rate gate button should be available for stability check");
  const stable = await page.evaluate((node) => {
    const beforeTransform = getComputedStyle(node).transform;
    window.__gateChoiceStableNode = node;
    window.__test.step(2000);
    const after = document.querySelector('#gateChoiceLayer .gate-choice-btn[data-gate-id="rate_plus"]');
    return {
      connected: node.isConnected,
      sameNode: after === node && window.__gateChoiceStableNode === node,
      beforeTransform,
      afterTransform: getComputedStyle(node).transform
    };
  }, rateHandle);
  await rateHandle.dispose();
  assert(stable.connected && stable.sameNode, "gate button DOM node should stay attached and identical over 2 seconds");
  assert.notStrictEqual(stable.beforeTransform, stable.afterTransform, "gate button should move by transform without node replacement");
  await page.click('#gateChoiceLayer .gate-choice-btn[data-gate-id="rate_plus"]');
  await page.waitForFunction(() => window.__test.getState().stats.gatesTaken >= 1);
  const state = await page.evaluate(() => window.__test.getState());
  assert(state.runMods.fireIntervalMul < 1, "tapping a rate gate should apply the rate mod immediately");
  assert.strictEqual(state.gates.length, 0, "choosing one gate should remove the pair");
  assert(state.lastGateChoice && state.lastGateChoice.gateId === "rate_plus", "chosen gate should be recorded for feedback");
}

async function checkBlueprintAchievementsAndUnlock(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.setState({
      rng: () => 0,
      stats: {
        wavesCleared: 15,
        kills: 1,
        bossesDefeated: 3,
        score: 1500
      }
    });
    window.__test.damageVehicle(99999);
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  let meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.blueprints.sky_barge, 3, "three low-roll boss drops should grant three sky blueprints");
  assert.strictEqual(meta.unlockedVehicles.sky_barge, true, "three sky blueprints should unlock the sky barge");
  const badges = await page.locator("#settlementBadges .settlement-badge").evaluateAll((nodes) => nodes.map((node) => node.innerText));
  assert(badges.some((text) => text.includes("藍圖取得") && text.includes("晨光飛船")), `settlement should show sky blueprint drop: ${badges.join(" | ")}`);
  assert(badges.some((text) => text.includes("載具解鎖") && text.includes("晨光飛船")), `settlement should show sky unlock: ${badges.join(" | ")}`);
  assert(badges.some((text) => text.includes("首殺 Boss")), `settlement should show first boss achievement path: ${badges.join(" | ")}`);

  await page.click("#garageBtn");
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.click("#vehicleHotspotBtn");
  await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="vehicle"]:not([hidden])');
  const skyButton = await page.locator('[data-vehicle="sky_barge"]').evaluate((button) => ({
    disabled: button.disabled,
    text: button.textContent
  }));
  assert(!skyButton.disabled && !skyButton.text.includes("未解鎖"), "unlocked sky barge should become selectable in garage");
  await page.click('[data-vehicle="sky_barge"]');
  await clickSortie(page);
  await page.evaluate(() => {
    window.__test.setState({
      stats: {
        wavesCleared: 1,
        kills: 1,
        bossesDefeated: 0,
        score: 200
      }
    });
    window.__test.damageVehicle(99999);
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  const airBadges = await page.locator("#settlementBadges .settlement-badge").evaluateAll((nodes) => nodes.map((node) => node.innerText));
  assert(airBadges.some((text) => text.includes("天空出勤")), `settlement should show air sortie achievement path: ${airBadges.join(" | ")}`);
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.achievements.sortie_air, true, "air sortie achievement should be one-time recorded");
}

async function checkBlueprintWishlistDrop(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.showGarage();
  });
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.click("#vehicleHotspotBtn");
  await page.waitForSelector('[data-blueprint-wishlist="sea_ark"]');
  await page.click('[data-blueprint-wishlist="sea_ark"]');
  let meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.blueprintWishlist, "sea_ark", "garage should persist sea ark as blueprint wishlist");
  const activeWishlist = await page.locator('[data-blueprint-wishlist="sea_ark"]').innerText();
  assert(activeWishlist.includes("優先"), `wishlist button should show active state, got ${activeWishlist}`);

  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({
      rng: () => 0,
      stats: {
        wavesCleared: 10,
        kills: 1,
        bossesDefeated: 2,
        score: 1600
      }
    });
    window.__test.damageVehicle(99999);
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.blueprints.sea_ark, 2, "wishlist should route low-roll boss drops to sea ark");
  assert.strictEqual(meta.blueprints.sky_barge, 0, "wishlist should not spend drops on sky first");
  await page.evaluate(() => window.__test.clearStorage());
}

async function checkBossBlueprintDropAnimation(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      rng: () => 0,
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { aimX: state.vehicle.x, aimY: state.vehicle.y - 170, weaponCooldown: 0 }
    });
    const aimed = window.__test.getState();
    window.__test.spawnEnemy("boss_hive_titan", {
      x: aimed.vehicle.x,
      y: aimed.vehicle.y - 170,
      hp: 1,
      speed: 0
    });
    window.__test.step(520);
  });
  const state = await page.evaluate(() => window.__test.getState());
  assert(state.stats.bossesDefeated >= 1, "test boss should be killed");
  assert(
    state.effects.some((effect) => effect.kind === "blueprint_drop") ||
      (state.eventBanner && state.eventBanner.title.includes("藍圖碎片")),
    "boss kill should create a blueprint drop animation or banner"
  );
  assert.strictEqual(state.meta.blueprints.sky_barge, 0, "drop animation should not persist meta before settlement");
  await page.evaluate(() => window.__test.clearStorage());
}

async function checkEnvironmentEventsAndVariants(page) {
  await page.evaluate(() => {
    window.__test.startRun("void_runner");
    window.__test.setState({ rng: () => 0, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(2);
  });
  let state = await page.evaluate(() => window.__test.getState());
  assert(
    state.wavePlan.environmentEvent && state.wavePlan.environmentEvent.id === "meteor_shower",
    "space low event roll should start meteor shower"
  );
  assert(state.hazards.length >= 3, "meteor shower should spawn shootable hazards");
  assert(state.eventBanner && state.eventBanner.title.includes("環境事件"), "event start should show a HUD banner");

  await page.evaluate(() => {
    const stateNow = window.__test.getState();
    const first = stateNow.hazards[0];
    window.__test.setState({
      hazards: [
        Object.assign({}, first, {
          x: stateNow.vehicle.x,
          y: stateNow.vehicle.y - 170,
          hp: 1,
          vy: 0,
          vx: 0
        })
      ],
      projectiles: [],
      vehicle: { aimX: stateNow.vehicle.x, aimY: stateNow.vehicle.y - 170, weaponCooldown: 0 }
    });
    window.__test.step(850);
  });
  state = await page.evaluate(() => window.__test.getState());
  assert(state.stats.eventParts > 0, "shooting a meteor should add event parts");
  assert(state.stats.partsPreview > 0, "event parts should feed run parts preview");

  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({ rng: () => 0, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(8);
    window.__test.step(1600);
  });
  state = await page.evaluate(() => window.__test.getState());
  assert(state.enemies.some((enemy) => enemy.variantId), "late wave generation should spawn tinted variants");
}

async function checkEventCodexAndAchievements(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    const meta = window.__test.getMeta();
    Object.keys(window.DSConfig.VEHICLES).forEach((vehicleId) => {
      meta.unlockedVehicles[vehicleId] = true;
      const required = window.DSRules.blueprintRequiredForVehicle(vehicleId, window.DSConfig);
      if (required > 0) meta.blueprints[vehicleId] = required;
    });
    window.__test.setMeta(meta);
    window.__test.startRun("void_runner");
    window.__test.setState({ rng: () => 0, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(2);
    const eventWave = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      spawnIndex: 999,
      waveElapsed: eventWave.wavePlan.duration
    });
    window.__test.step(160);
    window.__test.damageVehicle(99999);
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  let result = await page.evaluate(() => ({
    meta: window.__test.getMeta(),
    reward: window.__test.getLastSettlement().reward
  }));
  assert(result.meta.eventStats.meteor_shower.encounters >= 1, "event codex should record meteor encounters");
  assert.strictEqual(result.meta.eventStats.meteor_shower.completions, 1, "event codex should record meteor completion");
  assert.strictEqual(result.meta.achievements.event_meteor_shower, true, "first completed meteor event should unlock achievement");
  assert(result.reward.achievements.includes("event_meteor_shower"), "event achievement should unlock in settlement");

  await page.click("#garageBtn");
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.click("#seriesHotspotBtn");
  await page.waitForSelector('[data-event-id="meteor_shower"]');
  const codexText = await page.locator('[data-event-id="meteor_shower"]').innerText();
  assert(codexText.includes("遭遇") && codexText.includes("完成 1"), `event codex should show counts: ${codexText}`);

  await page.evaluate(() => {
    window.__test.startRun("void_runner");
    window.__test.setState({ rng: () => 0, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(2);
    const eventWave = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      spawnIndex: 999,
      waveElapsed: eventWave.wavePlan.duration
    });
    window.__test.step(160);
    window.__test.damageVehicle(99999);
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  result = await page.evaluate(() => window.__test.getLastSettlement().reward);
  assert(!result.achievements.includes("event_meteor_shower"), "event achievement should be one-time only");
}

async function checkSupplyDropPickupAndSettlement(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      rng: () => 0,
      enemies: [],
      projectiles: [],
      gates: [],
      supplyDrops: [],
      supplyBuffs: [],
      vehicle: { aimX: state.vehicle.x, aimY: state.vehicle.y - 90, weaponCooldown: 0 }
    });
    const aimed = window.__test.getState();
    window.__test.spawnEnemy("shambler", {
      x: aimed.vehicle.x,
      y: aimed.vehicle.y - 90,
      hp: 1,
      speed: 0
    });
    window.__test.step(1200);
  });
  let state = await page.evaluate(() => window.__test.getState());
  assert(state.stats.supplyCratesDropped >= 1, "forced low roll kill should drop a supply cache");
  assert(
    state.stats.supplyCratesCollected >= 1 || state.supplyDrops.length >= 1,
    "supply cache should be visible or already collected"
  );

  await page.evaluate(() => window.__test.step(2600));
  state = await page.evaluate(() => window.__test.getState());
  assert(state.stats.supplyCratesCollected >= 1, "vehicle should pick up the supply cache");
  assert(state.supplyBuffs.some((buff) => buff.rewardId === "rate_boost"), "first supply reward should apply rate boost");
  assert(state.effectiveRunMods.fireIntervalMul < 1, "rate boost should reduce effective fire interval");
  assert.strictEqual(state.stats.lastSupplyReward, "rate_boost", "pickup should record feedback reward");

  await page.evaluate(() => {
    window.__test.damageVehicle(12, { type: "enemy", enemyId: "shambler" });
    window.__test.step(300);
    window.__test.damageVehicle(99999, { type: "boss", enemyId: "boss_hive_titan" });
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  const settlementRows = await page.locator("#settlementList .settlement-item").evaluateAll((nodes) =>
    nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim())
  );
  assert(settlementRows.some((row) => row.includes("補給箱")), `settlement should list supply cache source: ${settlementRows.join(" | ")}`);
  await page.click("#runAnalysisToggleBtn");
  const analysisSections = await page.locator("#runAnalysisPanel .run-analysis-section").evaluateAll((nodes) =>
    nodes.map((node) => ({
      title: node.querySelector("strong").textContent,
      body: node.querySelector("small").textContent
    }))
  );
  assert(analysisSections.some((section) => section.title === "事件"), "run analysis should include event section");
  assert(analysisSections.some((section) => section.title === "補給" && section.body.includes("補給箱")), "run analysis should include supply section");
  assert(analysisSections.some((section) => section.title === "變種"), "run analysis should include variant section");
  assert(analysisSections.some((section) => section.title === "死前5秒" && section.body.includes("主要來自")), "run analysis should include death-window summary");
  assert(analysisSections.some((section) => section.title === "受傷" && section.body.includes("Boss")), "run analysis should include incoming damage distribution");
  assert(analysisSections.some((section) => section.title === "傷害" && section.body.includes("平均") && section.body.includes("峰值")), "run analysis should include average and peak damage stats");
}

async function checkVehicleSpecificUpgradePurchase(page) {
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.parts = 200;
    meta.selectedVehicle = "sky_barge";
    Object.keys(window.DSConfig.VEHICLES).forEach((vehicleId) => {
      meta.unlockedVehicles[vehicleId] = true;
      const required = window.DSRules.blueprintRequiredForVehicle(vehicleId, window.DSConfig);
      if (required > 0) meta.blueprints[vehicleId] = required;
    });
    window.__test.setMeta(meta);
    window.__test.showGarage();
  });
  await page.waitForSelector("#garagePanel:not([hidden])");
  await openUpgradePanel(page);
  await page.waitForSelector('[data-upgrade="sky_overclock"]');
  const before = await page.evaluate(() =>
    window.DSRules.calculateShotStats({
      vehicleId: "sky_barge",
      meta: window.__test.getMeta(),
      runMods: window.DSRules.defaultRunMods(),
      config: window.DSConfig
    }).fireInterval
  );
  await page.click('[data-upgrade="sky_overclock"]');
  const result = await page.evaluate((beforeInterval) => {
    const meta = window.__test.getMeta();
    const after = window.DSRules.calculateShotStats({
      vehicleId: "sky_barge",
      meta,
      runMods: window.DSRules.defaultRunMods(),
      config: window.DSConfig
    }).fireInterval;
    return {
      level: meta.vehicleLevels.sky_barge.sky_overclock,
      before: beforeInterval,
      after,
      status: document.getElementById("garageStatus").textContent
    };
  }, before);
  assert.strictEqual(result.level, 1, "sky overclock level should be purchased");
  assert(result.after < result.before, `sky overclock should reduce fire interval from ${result.before} to ${result.after}`);
  assert(result.status.includes("DPS"), `specific upgrade feedback should show DPS delta: ${result.status}`);
}

async function spawnBoss(page) {
  await page.evaluate(() => {
    window.__test.setState({ enemies: [], projectiles: [], gates: [] });
    window.__test.pushWave(5);
    window.__test.step(1600);
  });
  const state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.wave, 5);
  assert(state.enemies.some((enemy) => enemy.enemyId === "boss_hive_titan" && enemy.boss), "wave 5 should spawn boss");
  const bossHud = await page.locator("#bossHud").evaluate((node) => ({
    visible: node.classList.contains("is-visible"),
    name: document.getElementById("bossName").textContent,
    hp: document.getElementById("bossHpText").textContent
  }));
  assert(bossHud.visible, "boss HUD should be visible when the boss enters");
  assert(bossHud.name.includes("母巢巨屍"), `boss HP bar should name the boss, got ${bossHud.name}`);
  assert(bossHud.hp.includes("%"), "boss HP bar should show remaining percent");
  const banner = await page.locator("#eventBanner").evaluate((node) => ({
    hidden: node.hidden,
    text: node.innerText
  }));
  assert(!banner.hidden && banner.text.includes("Boss 來襲"), `boss alert banner should be visible, got ${banner.text}`);

  await page.evaluate(() => {
    const stateNow = window.__test.getState();
    const enemies = stateNow.enemies.map((enemy) => {
      if (enemy.boss) return Object.assign({}, enemy, { hp: Math.floor(enemy.maxHp * 0.65) });
      return enemy;
    });
    window.__test.setState({ enemies });
    window.__test.step(120);
  });
  const telegraph = await page.locator("#bossTelegraph").innerText();
  assert(telegraph.includes("召喚"), `boss phase telegraph should announce summon, got ${telegraph}`);
}

async function deathSettlementUpgradeAndReload(page) {
  await page.evaluate(() => {
    window.__test.setState({
      stats: {
        wavesCleared: 10,
        kills: 130,
        bossesDefeated: 2,
        score: 9000
      }
    });
    window.__test.damageVehicle(99999);
  });
  await page.waitForSelector("#settlementPanel:not([hidden])");
  const settlementText = await page.locator("#settlementSummary").innerText();
  assert(settlementText.includes("149"), `settlement should show 149 total parts after achievement bonuses: ${settlementText}`);
  assert(settlementText.includes("新紀錄"), `settlement should call out new records: ${settlementText}`);
  const settlementRows = await page.locator("#settlementList .settlement-item").evaluateAll((nodes) =>
    nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim())
  );
  assert(settlementRows.some((row) => row.includes("+40") && row.includes("波次零件")), `settlement should show wave parts breakdown: ${settlementRows.join(" | ")}`);
  assert(settlementRows.some((row) => row.includes("+21") && row.includes("擊殺零件")), `settlement should show kill parts breakdown: ${settlementRows.join(" | ")}`);
  assert(settlementRows.some((row) => row.includes("+48") && row.includes("Boss 零件")), `settlement should show boss parts breakdown: ${settlementRows.join(" | ")}`);
  const badges = await page.locator("#settlementBadges .settlement-badge").evaluateAll((nodes) => nodes.map((node) => node.innerText));
  assert(badges.some((text) => text.includes("首殺 Boss")), `settlement should show first boss achievement: ${badges.join(" | ")}`);
  const recommendation = await page.locator("#settlementRecommendation").evaluate((node) => ({
    hidden: node.hidden,
    text: node.innerText
  }));
  assert(!recommendation.hidden && recommendation.text.includes("建議升級"), `settlement should show recommended upgrade CTA: ${recommendation.text}`);
  assert(
    recommendation.text.includes("高波段") || recommendation.text.includes("Boss") || recommendation.text.includes("小怪"),
    `settlement recommendation should include a reason: ${recommendation.text}`
  );
  let meta = await page.evaluate(() => window.__test.getMeta());
  assert(meta.parts >= 109, "settlement should persist earned parts");
  const garageCta = await page.locator("#garageBtn").evaluate((button) => ({ text: button.textContent, className: button.className }));
  assert(garageCta.text.includes("進車庫升級") && garageCta.className.includes("primary"), "affordable settlement should make garage the primary CTA");

  await page.click("#garageBtn");
  await page.waitForSelector("#garagePanel:not([hidden])");
  await openUpgradePanel(page);
  await page.click('[data-upgrade="hull"]');
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.vehicleLevels.land_rig.hull, 1, "hull upgrade should be bought");
  const upgradeStatus = await page.locator("#garageStatus").innerText();
  assert(upgradeStatus.includes("HP 520 → 562"), `upgrade feedback should show stat delta, got ${upgradeStatus}`);

  await clickSortie(page);
  const upgradedRun = await page.evaluate(() => ({
    state: window.__test.getState(),
    baseHp: window.DSConfig.VEHICLES.land_rig.hp
  }));
  assert(upgradedRun.state.vehicle.maxHp > upgradedRun.baseHp, "new run should use upgraded hp");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.vehicleLevels.land_rig.hull, 1, "reload should preserve upgrade level");
}

async function runScenario(browser, baseUrl, viewport, full) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => window.__test.clearStorage());
  await checkShelterMeta(page, full);
  await checkNewSaveVehicleLocks(page);
  await checkOldSaveRetention(page);
  await checkGarageUpgradeLines(page);
  await checkSettingsAndQuestBoard(page);
  await checkWaveProgressionRegression(page);
  await page.evaluate(() => window.__test.clearStorage());
  await checkShelterMeta(page, false);
  await checkGarageUpgradeLines(page);
  if (full) {
    await checkBlueprintWishlistDrop(page);
    await checkBossBlueprintDropAnimation(page);
    await unlockFleet(page);
    await checkEnvironmentEventsAndVariants(page);
    await checkEventCodexAndAchievements(page);
    await checkSupplyDropPickupAndSettlement(page);
    await unlockFleet(page);
    await checkFleetProjectileTraits(page);
    await checkVehicleFleetSelectionAndCombat(page);
    await checkBlueprintAchievementsAndUnlock(page);
    await checkVehicleSpecificUpgradePurchase(page);
    await page.evaluate(() => window.__test.clearStorage());
    await checkShelterMeta(page, false);
    await checkGarageUpgradeLines(page);
    await checkEmptySettlementCta(page);
  } else {
    await clickSortie(page);
  }
  await page.evaluate(() => window.__test.step(180));
  await expectCanvasHasPixels(page);
  await checkInitialPromptAndMessages(page);
  await checkOpeningHordeGateAndFps(page);
  await checkAimAssistToggle(page);
  await checkAdaptivePerformance(page);
  await dragAim(page);
  await killEnemiesAndEarnPreviewParts(page);
  await shootGate(page);
  await tapGateChoice(page);
  await spawnBoss(page);

  if (full) {
    await deathSettlementUpgradeAndReload(page);
  } else {
    await page.evaluate(() => window.__test.damageVehicle(99999));
    await page.waitForSelector("#settlementPanel:not([hidden])");
  }

  assert.deepStrictEqual(errors, [], `console/page errors at ${viewport.width}x${viewport.height}`);
  await page.close();
}

async function runImageFallbackScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/ui/start.png", (route) => {
    route.fulfill({ status: 404, contentType: "text/plain", body: "missing test image" });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => window.__test.clearStorage());
  await page.waitForFunction(() => {
    const state = window.__test.getShelterState();
    return state.backgroundMode === "scene" && state.imageFailed && state.lastDrawMs > 0;
  });
  await expectShelterCanvasHasPixels(page);
  await checkMetaHotspotsFit(page);
  await clickSortie(page);
  assert.deepStrictEqual(errors, [], "console/page errors during missing-image fallback");
  await page.close();
  console.log("E2E image fallback PASS");
}

async function runVehicleImageFallbackScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/vehicles/*.png", (route) => {
    route.fulfill({ status: 404, contentType: "text/plain", body: "missing test vehicle" });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.step(220);
  });
  await expectCanvasHasPixels(page);
  const debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.environment, "land", "vehicle fallback run should still draw land environment");
  assert.strictEqual(debug.vehicleFallbackDrawn, true, "missing vehicle image should draw sprite fallback");
  assert.notStrictEqual(debug.vehicleRasterDrawn, true, "missing vehicle image should not report raster draw");
  assert.deepStrictEqual(errors, [], "console/page errors during missing-vehicle fallback");
  await page.close();
  console.log("E2E vehicle image fallback PASS");
}

async function runZombieImageFallbackScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/zombies/*.png", (route) => {
    route.fulfill({ status: 404, contentType: "text/plain", body: "missing test zombie" });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.setState({ enemies: [], projectiles: [], gates: [] });
    window.__test.spawnEnemy("shambler", { x: 92, y: 110, speed: 0, hp: 30 });
    window.__test.spawnEnemy("runner", { x: 112, y: 128, speed: 0, hp: 18 });
    window.__test.spawnEnemy("bloater", { x: 78, y: 146, speed: 0, hp: 95 });
    window.__test.step(220);
  });
  await expectCanvasHasPixels(page);
  await page.waitForFunction(() => window.__test.getRenderDebug().enemyImageStatus.shambler === "failed");
  const debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.enemyRasterDrawn, 0, "missing zombie images should not report raster draw");
  assert(debug.enemyFallbackDrawn >= 3, "missing zombie images should draw code sprite fallback");
  assert(debug.enemyShadowDrawn >= 3, "fallback zombies should still draw animated shadows");
  assert.strictEqual(debug.enemyImageStatus.shambler, "failed", "missing shambler image should be marked failed");
  assert.deepStrictEqual(errors, [], "console/page errors during missing-zombie fallback");
  await page.close();
  console.log("E2E zombie image fallback PASS");
}

async function runEnvironmentBackgroundFallbackScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/env/*.png", (route) => {
    route.fulfill({ status: 404, contentType: "text/plain", body: "missing test background" });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.setState({ enemies: [], projectiles: [], gates: [] });
    window.__test.step(220);
  });
  await page.waitForFunction(() => {
    const debug = window.__test.getRenderDebug();
    return debug.backgroundImageStatus === "failed" && debug.backgroundFallbackDrawn === true;
  });
  await expectCanvasHasPixels(page);
  const debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.environment, "land", "background fallback should keep land environment");
  assert.strictEqual(debug.backgroundRasterDrawn, false, "missing environment image should not report raster draw");
  assert.strictEqual(debug.backgroundFallbackDrawn, true, "missing environment image should draw fallback background");
  assert.deepStrictEqual(errors, [], "console/page errors during missing-environment-background fallback");
  await page.close();
  console.log("E2E environment background fallback PASS");
}

async function runServiceWorkerOfflineScenario(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(`${baseUrl}?swtest=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
    await page.waitForFunction(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.ready;
      return !!registration.active;
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    await page.waitForFunction(async () => (await caches.keys()).some((key) => key.includes("ashes-convoy-r44")));

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
    await page.waitForSelector("#garagePanel:not([hidden])");
    const offlineShell = await page.evaluate(async () => {
      const keys = await caches.keys();
      return {
        title: document.querySelector("#garagePanel .meta-summary h1").textContent.trim(),
        sortieVisible: !document.getElementById("sortieBtn").hidden,
        hasController: !!navigator.serviceWorker.controller,
        cacheKeys: keys
      };
    });
    assert.strictEqual(offlineShell.title, "灰燼護航", "offline reload should render the meta screen");
    assert.strictEqual(offlineShell.sortieVisible, true, "offline meta screen should keep sortie available");
    assert.strictEqual(offlineShell.hasController, true, "offline page should be controlled by the service worker");
    assert(offlineShell.cacheKeys.some((key) => key.includes("ashes-convoy-r44")), "R44 cache should exist offline");
    await clickSortie(page);
    await page.waitForFunction(() => window.__test.getState().mode === "playing");
    const runState = await page.evaluate(() => window.__test.getState());
    assert.strictEqual(runState.vehicleId, "land_rig", "offline sortie should start with the default vehicle");
    assert.deepStrictEqual(errors, [], "console/page errors during service worker offline scenario");
    console.log("E2E service worker offline PASS");
  } finally {
    await context.setOffline(false).catch(() => {});
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    }).catch(() => {});
    await context.close();
  }
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  const viewports = [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1280, height: 900 }
  ];

  try {
    for (let i = 0; i < viewports.length; i += 1) {
      await runScenario(browser, url, viewports[i], i === 0);
      console.log(`E2E viewport PASS ${viewports[i].width}x${viewports[i].height}`);
    }
    await runImageFallbackScenario(browser, url);
    await runVehicleImageFallbackScenario(browser, url);
    await runZombieImageFallbackScenario(browser, url);
    await runEnvironmentBackgroundFallbackScenario(browser, url);
    await runServiceWorkerOfflineScenario(browser, url);
    console.log("E2E tests PASS");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
