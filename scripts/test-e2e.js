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
  assert.strictEqual(result.buttons.length, 7, "meta screen should expose seven overlay action buttons");
  assert.deepStrictEqual(
    result.buttons.map((button) => button.id).sort(),
    ["opsHotspotBtn", "resetOverlayBtn", "seriesHotspotBtn", "sortieBtn", "trailerHotspotBtn", "upgradeHotspotBtn", "vehicleHotspotBtn"],
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
      swCachesJs: swText.includes("src/version.js?v=R57") && swText.includes("src/ui.js?v=R57") && swText.includes("src/game.js?v=R57") && swText.includes("src/rules.js?v=R57"),
      swQuerySensitiveCache: swText.includes("cache.match(request);"),
      swHasOffline: swText.includes("offline.html"),
      htmlHasVersionedScripts: Array.from(document.querySelectorAll("script[src]")).every((node) => new URL(node.getAttribute("src"), location.href).searchParams.get("v") === "R57"),
      htmlHasVersionedLinks: Array.from(document.querySelectorAll('link[href][rel="manifest"], link[href][rel="apple-touch-icon"]')).every((node) => new URL(node.getAttribute("href"), location.href).searchParams.get("v") === "R57"),
      htmlBootGuard: document.documentElement.innerHTML.includes("ashes_convoy_html_boot_reload_R57"),
      uiHasControllerChange: uiText.includes("controllerchange"),
      uiHasAutoReloadWindow: uiText.includes("SW_AUTO_RELOAD_WINDOW_MS") && uiText.includes("15000"),
      uiHasSessionGuard: uiText.includes("SW_AUTO_RELOAD_SESSION_KEY") && uiText.includes("sessionStorage"),
      uiHasAutoReload: uiText.includes("root.location.reload()"),
      webdriver: navigator.webdriver,
      registrationCount: registrations.length
    };
  });
  assert.strictEqual(pwa.manifestHref, "manifest.webmanifest?v=R57", "page should link the versioned web manifest");
  assert.strictEqual(pwa.name, "灰燼護航");
  assert.strictEqual(pwa.orientation, "portrait");
  assert.deepStrictEqual(pwa.icons, ["192x192", "512x512"], "manifest should expose 192 and 512 icons");
  assert(pwa.swHasVersion && pwa.swImportsVersion && pwa.swHasSkipWaiting && pwa.swHasClientsClaim && pwa.swHasNetworkFirst && pwa.swHasCacheFirst, "service worker should define versioned network/cache strategies and immediate activation");
  assert(pwa.swCachesJs && pwa.swQuerySensitiveCache && pwa.swHasOffline, "service worker should cache versioned JS app shell and match query-sensitive requests");
  assert(pwa.htmlHasVersionedScripts && pwa.htmlHasVersionedLinks && pwa.htmlBootGuard, "HTML should version local resources and include the pre-JS update guard");
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

async function assertControlReachable(page, selector, label) {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box, `${label} should have a bounding box`);
  const viewport = page.viewportSize();
  assert(viewport, "viewport should be available");
  assert(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${label} should be horizontally within viewport`);
  assert(box.y >= -1 && box.y + box.height <= viewport.height + 1, `${label} should be vertically within viewport after scrolling`);
}

async function checkShortDesktopReachability(page) {
  await page.waitForSelector("#garagePanel:not([hidden])");
  for (const selector of ["#sortieBtn", "#upgradeHotspotBtn", "#vehicleHotspotBtn", "#seriesHotspotBtn", "#opsHotspotBtn", "#resetOverlayBtn"]) {
    await assertControlReachable(page, selector, selector);
  }
  await page.click("#opsHotspotBtn");
  await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
  for (const selector of [
    "#aimAssistLevelSelect",
    "#screenShakeToggle",
    "#soundToggle",
    "#showRunTrailerToggle",
    "#fxLevelSelect",
    "#damageTextDensitySelect",
    "#performanceModeSelect",
    "#fontSizeSelect",
    "#checkUpdateBtn",
    "#exportSaveBtn",
    "#importSaveBtn"
  ]) {
    await assertControlReachable(page, selector, selector);
  }
  await page.click("#checkUpdateBtn");
  await assertControlReachable(page, "#checkUpdateBtn", "check update button after click");
  await page.click("#exportSaveBtn");
  await assertControlReachable(page, "#exportSaveBtn", "export save button after click");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("metaDrawer").hidden === true);
}

async function checkSupplyChoiceOverlayReachability(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      supplyDrops: [
        { id: "short_supply", x: state.vehicle.x, y: state.vehicle.y - 4, vx: 0, vy: 0, radius: 12, age: 0, ttl: 30, picked: false }
      ],
      supplyBuffs: [],
      supplyChoice: null,
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(80);
  });
  await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) .supply-choice-btn');
  const buttons = page.locator("#supplyChoiceOverlay .supply-choice-btn");
  await expectCanvasHasPixels(page);
  const count = await buttons.count();
  assert.strictEqual(count, 5, "short desktop supply choice should show five options");
  for (let i = 0; i < count; i += 1) {
    const box = await buttons.nth(i).boundingBox();
    const viewport = page.viewportSize();
    assert(box, `supply choice ${i} should have a bounding box`);
    assert(box.width >= 44 && box.height >= 44, `supply choice ${i} should remain touch sized`);
    assert(box.x >= -1 && box.x + box.width <= viewport.width + 1, `supply choice ${i} should fit horizontally`);
    assert(box.y >= -1 && box.y + box.height <= viewport.height + 1, `supply choice ${i} should fit vertically`);
  }
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("supplyChoiceOverlay").hidden === true);
  const state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.paused, false, "keyboard supply choice should resume play");
  assert.strictEqual(state.stats.supplyCratesCollected, 1, "keyboard supply choice should collect one cache");
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.showGarage();
  });
}

async function checkTrailerRoomSystem(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.showGarage();
  });
  await waitForMetaBackground(page);
  await page.click("#trailerHotspotBtn");
  await page.waitForSelector("#trailerOverlay:not([hidden])");
  await page.waitForFunction(() => {
    const metrics = window.__test.getTrailerRoomMetrics();
    return metrics && metrics.starterState === true && metrics.baseReady === true && metrics.renderMode === "raster";
  });
  const initial = await page.evaluate(() => ({
    text: document.getElementById("trailerStarterText").textContent,
    goods: document.getElementById("trailerGoodsText").textContent,
    state: window.__test.getTrailerRoomState(),
    metrics: window.__test.getTrailerRoomMetrics()
  }));
  assert(initial.text.includes("喂……有人嗎？這台車，後面的門是壞的。"), `initial trailer room should use Xi's first radio line: ${initial.text}`);
  assert(initial.goods.includes("拾荒物資 0"), `initial goods should be zero: ${initial.goods}`);
  assert.strictEqual(initial.state.items.filter((item) => item.owned).length, 0, "new save should not own trailer furniture");
  assert.strictEqual(initial.metrics.itemsDrawn, 0, "starter room should draw no purchased furniture");
  assert.strictEqual(initial.metrics.renderMode, "raster", "trailer room should render from raster assets");
  await page.click("#storyLogBtn");
  await page.waitForSelector('#storyLogSection:not([hidden]) [data-story-beat="b01"] .story-line');
  const storyLog = await page.evaluate(() => {
    const beat = document.querySelector('[data-story-beat="b01"]');
    const portrait = document.getElementById("xiPortrait");
    return {
      hidden: document.getElementById("storyLogSection").hidden,
      expanded: beat && beat.open === true,
      firstLine: beat && beat.textContent,
      portraitReady: portrait.complete && portrait.naturalWidth > 0,
      unread: window.DSRules.countUnreadStory(window.__test.getMeta(), window.DSConfig),
      badgeHidden: document.getElementById("trailerUnreadBadge").hidden
    };
  });
  assert.strictEqual(storyLog.hidden, false, "story log should open inside the trailer room");
  assert.strictEqual(storyLog.expanded, true, "unlocked story beat should be expanded for reading");
  assert(storyLog.firstLine.includes("無線電是撿來的"), `story log should render b01 dialogue: ${storyLog.firstLine}`);
  assert.strictEqual(storyLog.portraitReady, true, "Xi portrait should load in the story log");
  assert.strictEqual(storyLog.unread, 0, "opening story log should mark unlocked beats as seen");
  assert.strictEqual(storyLog.badgeHidden, true, "opening story log should clear the unread badge");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.trailerGoods = 20;
    window.__test.setMeta(meta);
  });
  await page.waitForFunction(() => document.getElementById("trailerGoodsText").textContent.includes("20"));
  const baseHp = await page.evaluate(() => {
    const fresh = window.DSRules.migrateMeta(null, { config: window.DSConfig });
    return window.DSRules.getVehicleStats("land_rig", fresh, window.DSConfig).maxHp;
  });
  await page.click('[data-trailer-buy="supply_shelf"]');
  await page.waitForFunction(() => {
    const state = window.__test.getTrailerRoomState();
    return state.room.owned.supply_shelf === true && state.room.slots.wall_left === "supply_shelf";
  });
  await page.waitForFunction(() => {
    const metrics = window.__test.getTrailerRoomMetrics();
    return metrics && metrics.itemsDrawn >= 1 && metrics.assetsReady === true;
  });
  const bought = await page.evaluate((base) => {
    const meta = window.__test.getMeta();
    const state = window.__test.getTrailerRoomState();
    const stats = window.DSRules.getVehicleStats("land_rig", meta, window.DSConfig);
    return {
      goods: meta.trailerGoods,
      slot: meta.trailerRoom.slots.wall_left,
      owned: meta.trailerRoom.owned.supply_shelf,
      maxHp: stats.maxHp,
      baseHp: base,
      bonusText: document.getElementById("trailerBonusText").textContent,
      metrics: window.__test.getTrailerRoomMetrics(),
      itemOwned: state.items.find((item) => item.id === "supply_shelf").owned
    };
  }, baseHp);
  assert.strictEqual(bought.goods, 12, "buying supply shelf should spend eight scavenge goods");
  assert.strictEqual(bought.slot, "supply_shelf", "purchased shelf should auto-equip into its slot");
  assert.strictEqual(bought.owned, true);
  assert.strictEqual(bought.itemOwned, true);
  assert(bought.maxHp > bought.baseHp, "trailer furniture HP bonus should affect vehicle stats");
  assert(bought.bonusText.includes("HP +0.6%"), `trailer bonus text should show the shelf effect: ${bought.bonusText}`);
  assert(bought.metrics && bought.metrics.itemsDrawn >= 1 && bought.metrics.assetsReady, "furnished room should draw purchased raster furniture");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("trailerOverlay").hidden === true);
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.showGarage();
  });
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

  let meta;
  await page.selectOption("#aimAssistLevelSelect", "high");
  await page.locator("#screenShakeToggle").uncheck();
  assert.strictEqual(await page.locator("#showRunTrailerToggle").isChecked(), true, "run trailer setting should default on");
  await page.locator("#showRunTrailerToggle").uncheck();
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.settings.showRunTrailer, false, "run trailer toggle off should persist");
  await page.locator("#showRunTrailerToggle").check();
  await page.selectOption("#damageTextDensitySelect", "large");
  await page.selectOption("#performanceModeSelect", "low");
  await page.selectOption("#fontSizeSelect", "large");
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.settings.aimAssistLevel, "high", "aim assist level should persist from settings panel");
  assert.strictEqual(meta.settings.aimAssist, true, "high aim assist should keep compatibility boolean enabled");
  assert.strictEqual(meta.settings.screenShake, false, "screen shake toggle should persist");
  assert.strictEqual(meta.settings.showRunTrailer, true, "run trailer toggle on should persist");
  assert.strictEqual(meta.settings.damageTextDensity, "large", "damage text density should persist");
  assert.strictEqual(meta.settings.performanceMode, "low", "performance mode should persist");
  assert.strictEqual(meta.settings.fontSize, "large", "font size setting should persist");

  // 畫面特效三段（完整/精簡/關閉）切換持久化＋migrate 兼容（預設完整）
  const fxDefault = await page.evaluate(() => window.DSRules.migrateMeta(null, { config: window.DSConfig }).settings.fxLevel);
  assert.strictEqual(fxDefault, "full", "fresh migrate should default fx level to full");
  for (const level of ["reduced", "off", "full"]) {
    await page.selectOption("#fxLevelSelect", level);
    meta = await page.evaluate(() => window.__test.getMeta());
    assert.strictEqual(meta.settings.fxLevel, level, `fx level ${level} should persist in meta settings`);
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem(window.DSConfig.STORAGE_KEY);
      return {
        stored: JSON.parse(raw).settings.fxLevel,
        migrated: window.DSRules.migrateMeta(raw, { config: window.DSConfig }).settings.fxLevel,
        ui: document.getElementById("fxLevelSelect").value
      };
    });
    assert.strictEqual(persisted.stored, level, `fx level ${level} should be written to localStorage`);
    assert.strictEqual(persisted.migrated, level, `fx level ${level} should survive migrateMeta`);
    assert.strictEqual(persisted.ui, level, `fx level select should render ${level}`);
  }

  const fontState = await page.evaluate(() => ({
    largeClass: document.body.classList.contains("font-large"),
    questFont: parseFloat(getComputedStyle(document.querySelector(".quest-card strong")).fontSize),
    diagnostics: document.getElementById("performanceDiagnosticText").textContent,
    version: document.getElementById("versionText").textContent
  }));
  assert.strictEqual(fontState.largeClass, true, "large font size should apply a body class");
  assert(fontState.questFont >= 14, `large font size should enlarge quest text, got ${fontState.questFont}`);
  assert(fontState.diagnostics.includes("FPS") && fontState.diagnostics.includes("品質") && fontState.diagnostics.includes("cap"), `performance diagnostics should show FPS/quality/cap: ${fontState.diagnostics}`);
  assert(fontState.version.includes("R57"), `settings should show app version: ${fontState.version}`);

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
  meta.settings.fxLevel = "full";
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
        visualWidth: window.DSConfig.VEHICLES[id].visualWidth,
        radius: window.DSConfig.VEHICLES[id].radius,
        visualHalfWidth: window.DSConfig.VEHICLES[id].visualHalfWidth,
        bulletRadii: state.projectiles.map((projectile) => projectile.radius),
        bulletScales: state.projectiles.map((projectile) => projectile.scale),
        enemyWidths: Object.fromEntries(Object.entries(window.DSConfig.ENEMIES).map(([enemyId, enemy]) => [enemyId, enemy.visualWidth]))
      };
    }, vehicleId);
    assert.strictEqual(result.vehicleId, vehicleId, `${vehicleId} should be the active vehicle`);
    assert.strictEqual(result.environment, result.expectedEnvironment, `${vehicleId} should draw its environment`);
    assert(result.raster || result.fallback, `${vehicleId} should draw raster vehicle or fallback sprite`);
    assert(result.backgroundRaster, `${vehicleId} should draw its raster environment background`);
    assert.strictEqual(result.backgroundStatus, "loaded", `${vehicleId} environment background should be loaded`);
    assert(result.backgroundPath.includes(`assets/env/${result.expectedEnvironment}.png`), `${vehicleId} should use environment background asset: ${result.backgroundPath}`);
    assert(result.visualWidth >= 24 && result.visualWidth <= 31, `${vehicleId} visual width should be reduced to 24-31 world px`);
    const hitRatio = result.radius / result.visualHalfWidth;
    assert(hitRatio >= 0.5 && hitRatio <= 0.65, `${vehicleId} hit radius should be 50-65% of visual half width, got ${hitRatio}`);
    assert(result.enemyWidths.runner < result.visualWidth, `${vehicleId} should remain larger than runner fodder`);
    assert(result.enemyWidths.bloater > result.visualWidth, `${vehicleId} should remain smaller than elite bloater`);
    assert(result.enemyWidths.boss_hive_titan > result.enemyWidths.bloater * 2, `${vehicleId} should keep boss scale dominance`);
    assert(result.bulletRadii.every((radius) => radius >= 6), `${vehicleId} bullets should stay readable after player scale reduction`);
    assert(result.bulletScales.every((scale) => scale >= 1.05), `${vehicleId} bullet sprite scale should not shrink`);
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
      gateChoice: null,
      paused: false,
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
      gateChoice: null,
      paused: false,
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
    window.__test.setState({ enemies: [], projectiles: [], gates: [], gateChoice: null, paused: false });
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
      rng: () => 0.99,
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      vehicle: { hp: state.vehicle.maxHp, weaponCooldown: 0 }
    });
    window.__test.step(16);
  });
}

async function checkRunTrailerRendering(page) {
  await page.waitForFunction(() => {
    const debug = window.__test.getRenderDebug();
    return debug.runTrailerImageStatus === "loaded" && debug.runTrailerRasterDrawn === true && debug.runTrailerPose;
  });
  const rendered = await page.evaluate(() => ({
    state: window.__test.getState(),
    debug: window.__test.getRenderDebug(),
    setting: window.__test.getMeta().settings.showRunTrailer
  }));
  assert.strictEqual(rendered.setting, true, "run trailer setting should be enabled by default");
  assert.strictEqual(rendered.debug.runTrailerRasterDrawn, true, "land run should draw the raster trailer sprite");
  assert(rendered.debug.runTrailerPose.y > rendered.state.vehicle.y + 20, `run trailer should render behind the vehicle: ${JSON.stringify(rendered.debug.runTrailerPose)}`);
  assert(rendered.debug.runTrailerPose.targetY > rendered.state.vehicle.y, "run trailer target should stay behind the vehicle");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.showRunTrailer = false;
    window.__test.setMeta(meta);
    window.__test.step(16);
  });
  const hidden = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(hidden.runTrailerRasterDrawn, false, "disabled run trailer setting should skip raster draw");
  assert.strictEqual(hidden.runTrailerFallbackDrawn, false, "disabled run trailer setting should skip fallback draw");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.showRunTrailer = true;
    window.__test.setMeta(meta);
    window.__test.step(16);
  });
}

function windowlessEffectHigh() {
  return 90;
}

async function checkFxIntegration(page) {
  const fxQuality = await page.evaluate(() => window.DSConfig.FX.quality);

  // 1) run 中 fx 粒子活躍數 > 0（環境層/排氣/曳光/擊殺爆發共同供給）
  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { hp: state.vehicle.maxHp, aimX: state.vehicle.x, aimY: state.vehicle.y - 170, weaponCooldown: 0 }
    });
    const aimed = window.__test.getState();
    window.__test.spawnEnemy("shambler", { x: aimed.vehicle.x, y: aimed.vehicle.y - 170, hp: 1, speed: 0 });
    window.__test.step(900);
  });
  let debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert(debug.fxActive > 0, `fx particles should be active during a run, got ${debug.fxActive}`);
  assert.strictEqual(debug.fxLevel, "full", "fx level should report full");
  assert.strictEqual(debug.fxQuality, "high", "locked high performance should use the high fx pool");
  assert.strictEqual(debug.fxMaxParticles, fxQuality.high.maxParticles, "high fx pool should use the configured particle cap");
  assert.strictEqual(debug.vignetteDrawn, true, "full fx on high quality should draw the environment vignette");

  // 2) 低效能模式：fx 池上限縮減（至少砍半）＋ vignette 關閉
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "low";
    window.__test.setMeta(meta);
    window.__test.step(300);
  });
  debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.fxQuality, "low", "locked low performance should switch to the low fx pool");
  assert.strictEqual(debug.fxMaxParticles, fxQuality.low.maxParticles, "low fx pool should use the reduced particle cap");
  assert(debug.fxMaxParticles <= fxQuality.high.maxParticles / 2, "low fx pool should be at most half of high");
  assert.strictEqual(debug.vignetteDrawn, false, "low quality should disable the vignette layer");

  // 3) 特效關閉：粒子池清空、不畫 vignette
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "off";
    window.__test.setMeta(meta);
    window.__test.step(300);
  });
  debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.fxLevel, "off", "fx level off should be reported");
  assert.strictEqual(debug.fxActive, 0, "fx off should keep the particle pool empty");
  assert.strictEqual(debug.vignetteDrawn, false, "fx off should not draw the vignette");

  // 4) 精簡：即使鎖高效能也改用縮減池，但仍會發射粒子
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.fxLevel = "reduced";
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      projectiles: [],
      vehicle: { aimX: state.vehicle.x, aimY: state.vehicle.y - 180, weaponCooldown: 0 }
    });
    window.__test.step(400);
  });
  debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.fxQuality, "low", "reduced fx level should use the low fx pool even when quality is high");
  assert(debug.fxActive > 0, "reduced fx level should still emit particles");

  // 5) 補給箱：像素木箱重繪、無舊青色線框
  const supply = await page.evaluate(async () => {
    const meta = window.__test.getMeta();
    meta.settings.fxLevel = "full";
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      supplyDrops: [
        { id: "fx_supply", x: state.vehicle.x - 40, y: state.vehicle.y - 160, vx: 0, vy: 0, radius: 12, age: 0, ttl: 30, picked: false }
      ],
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(60);
    const source = await fetch(`src/game.js?v=${window.DSConfig.APP_VERSION}`).then((response) => response.text());
    const start = source.indexOf("function drawSupplyDrop");
    const end = source.indexOf("function", start + 10);
    return {
      debug: window.__test.getRenderDebug(),
      crateFn: source.slice(start, end),
      cyanDom: !!document.querySelector(".supply-crate-wireframe, .supply-cyan-frame")
    };
  });
  assert(supply.debug.supplyCrateDrawn >= 1, "supply crate should be drawn while on screen");
  assert.strictEqual(supply.debug.supplyCrateStyle, "pixel_wood", "supply crate should use the pixel wood style");
  assert(supply.crateFn.length > 40, "drawSupplyDrop source should be inspectable");
  assert(!supply.crateFn.includes("#5ed4cb"), "supply crate draw should not use the legacy cyan wireframe color");
  assert(!supply.crateFn.includes("strokeStyle = \"#5ed4cb\""), "supply crate should not stroke a cyan frame");
  assert.strictEqual(supply.cyanDom, false, "no cyan wireframe class should exist in the DOM");

  // 6) 波次演出：pushWave 後應繪出開場橫幅
  await page.evaluate(() => {
    window.__test.setState({ enemies: [], projectiles: [], gates: [], supplyDrops: [] });
    window.__test.pushWave(3);
    window.__test.step(120);
  });
  debug = await page.evaluate(() => window.__test.getRenderDebug());
  assert.strictEqual(debug.waveBannerDrawn, true, "wave start should draw the wave banner");

  // 收尾還原，避免影響後續斷言
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      supplyChoice: null,
      vehicle: { hp: state.vehicle.maxHp, aimX: state.vehicle.x, aimY: 300, assistAimX: state.vehicle.x, assistAimY: 300, weaponCooldown: 0 }
    });
    window.__test.step(16);
  });
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
      gateChoice: null,
      paused: false,
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
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      projectiles: [],
      gates: [],
      gateChoice: null,
      paused: false,
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
  assert.strictEqual(state.stats.gatesTaken, 0, "shooting a gate core should no longer choose a gate");
  assert.strictEqual(state.runMods.damageAdd, 0, "projectile contact should not apply a gate mod");
  assert(state.gates.some((gate) => gate.gateId === "damage_plus" && gate.hp === 1), "projectile contact should not damage gate hp");
}

async function tapGateChoice(page) {
  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      gates: [],
      projectiles: [],
      enemies: [],
      gateChoice: null,
      paused: false,
      vehicle: { hp: state.vehicle.maxHp - 80, weaponCooldown: 999 }
    });
    window.__test.spawnGatePair(["rate_plus", "repair"]);
  });
  await page.waitForSelector('#gateChoiceOverlay:not([hidden]) .gate-option-btn[data-gate-id="rate_plus"]');
  const opened = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(opened.paused, true, "gate choice overlay should pause the run");
  assert(opened.gateChoice && opened.gateChoice.gateIds.includes("rate_plus"), "gate choice state should list the rate option");
  const buttons = await page.locator("#gateChoiceOverlay .gate-option-btn").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.gateId,
        text: node.innerText,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    })
  );
  assert.strictEqual(buttons.length, 2, "gate choice overlay should expose two choices");
  buttons.forEach((button) => {
    assert(button.width >= 44 && button.height >= 44, `${button.id} gate choice target should be at least 44px`);
    assert(button.left >= 0 && button.right <= button.viewportWidth, `${button.id} gate button should not overflow horizontally`);
    assert(button.top >= 0 && button.bottom <= button.viewportHeight, `${button.id} gate button should not overflow vertically`);
    assert(button.text.length > 0, `${button.id} gate button should show a label and effect`);
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.click('#gateChoiceOverlay .gate-option-btn[data-gate-id="rate_plus"]');
  await page.waitForFunction(() => document.getElementById("gateChoiceOverlay").hidden === true);
  await page.waitForFunction(() => window.__test.getState().stats.gatesTaken >= 1);
  const state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.paused, false, "choosing a gate should resume play");
  assert.strictEqual(state.gateChoice, null, "choosing a gate should clear gate choice state");
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

async function checkR57EnemyRosterBehaviors(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      enemyProjectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      spawnIndex: 0,
      gateIndex: 0,
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      vehicle: {
        x: window.DSConfig.LOGIC.width * 0.5,
        followX: window.DSConfig.LOGIC.width * 0.5,
        aimX: window.DSConfig.LOGIC.width * 0.5,
        weaponCooldown: 999
      }
    });
    window.__test.spawnEnemy("spore_spitter", { x: 72, y: state.vehicle.y - 112, speed: 0, hp: 120, attackCooldown: 0, silent: true });
    window.__test.spawnEnemy("shield_husk", { x: 99, y: state.vehicle.y - 160, speed: 0, hp: 120, silent: true });
    window.__test.spawnEnemy("swarm_mite", { x: 118, y: state.vehicle.y - 135, speed: 0, hp: 80, silent: true });
    window.__test.spawnEnemy("tar_brute", { x: state.vehicle.x, y: state.vehicle.y - 42, speed: 0, hp: 180, silent: true });
    window.__test.spawnEnemy("void_wraith", { x: 138, y: state.vehicle.y - 120, speed: 0, hp: 120, animPhase: 0, silent: true });
    for (let i = 0; i < 3; i += 1) window.__test.step(100);
  });
  await page.waitForFunction(() => {
    const state = window.__test.getState();
    const debug = window.__test.getRenderDebug();
    const ids = ["spore_spitter", "shield_husk", "swarm_mite", "tar_brute", "void_wraith"];
    return state.enemyProjectiles.length > 0 && ids.every((id) => debug.enemyImageStatus[id] === "loaded");
  });
  const result = await page.evaluate(() => {
    const state = window.__test.getState();
    const debug = window.__test.getRenderDebug();
    const byId = Object.fromEntries(state.enemies.map((enemy) => [enemy.enemyId, enemy]));
    return {
      enemyIds: state.enemies.map((enemy) => enemy.enemyId).sort(),
      enemyProjectiles: state.enemyProjectiles.length,
      spitterCooldown: byId.spore_spitter && byId.spore_spitter.attackCooldown,
      bruteSlow: state.vehicle.slowUntil > state.time && state.vehicle.slowMul < 1,
      voidPhase: byId.void_wraith && byId.void_wraith.phaseActive === true,
      rasterDrawn: debug.enemyRasterDrawn,
      statuses: debug.enemyImageStatus
    };
  });
  assert.deepStrictEqual(result.enemyIds, ["shield_husk", "spore_spitter", "swarm_mite", "tar_brute", "void_wraith"].sort(), "R57 enemy roster should be spawnable");
  assert(result.enemyProjectiles >= 1, "spore spitter should fire enemy projectiles");
  assert(result.spitterCooldown > 0, "spore spitter should reset attack cooldown after firing");
  assert.strictEqual(result.bruteSlow, true, "tar brute should apply movement slow aura near the vehicle");
  assert.strictEqual(result.voidPhase, true, "void wraith should enter phase state");
  assert(result.rasterDrawn >= 5, `new enemies should draw raster sprites, got ${result.rasterDrawn}`);
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
  for (const edgeX of [0, 195]) {
    await page.evaluate((x) => {
      window.__test.clearStorage();
      window.__test.startRun("land_rig");
      const state = window.__test.getState();
      window.__test.setState({
        enemies: [],
        projectiles: [],
        gates: [],
        supplyDrops: [
          { id: `edge_supply_${x}`, x, y: state.vehicle.y - 150, vx: 0, vy: window.DSConfig.SUPPLY_DROPS.crateSpeed, radius: 12, age: 0, ttl: window.DSConfig.SUPPLY_DROPS.ttl, picked: false }
        ],
        supplyBuffs: [],
        supplyChoice: null,
        vehicle: { weaponCooldown: 999 }
      });
      for (let i = 0; i < 220; i += 1) {
        const current = window.__test.getState();
        if (current.supplyChoice || current.supplyDrops.length === 0) break;
        window.__test.step(100);
      }
    }, edgeX);
    await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) .supply-choice-btn[data-reward-id="parts_cache"]');
    const edgeResult = await page.evaluate(() => ({
      state: window.__test.getState(),
      ttl: window.DSConfig.SUPPLY_DROPS.ttl
    }));
    assert(edgeResult.state.supplyChoice, `edge supply at x=${edgeX} should open the choice overlay before expiring`);
    assert(edgeResult.state.supplyChoice.openedAt < edgeResult.ttl, `edge supply at x=${edgeX} should be reached inside ttl`);
    await page.click('#supplyChoiceOverlay .supply-choice-btn[data-reward-id="parts_cache"]');
    await page.waitForFunction(() => document.getElementById("supplyChoiceOverlay").hidden === true);
  }

  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      supplyDrops: [
        { id: "choice_supply", x: state.vehicle.x, y: state.vehicle.y - 4, vx: 0, vy: 0, radius: 12, age: 0, ttl: 30, picked: false }
      ],
      supplyBuffs: [],
      supplyChoice: null,
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(80);
  });
  let state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.paused, true, "touching a supply cache should pause for a choice");
  assert(state.supplyChoice, "touching a supply cache should open supply choice state");
  assert.strictEqual(state.stats.supplyCratesCollected, 0, "touching a supply cache should not apply a random reward");
  await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) .supply-choice-btn[data-reward-id="damage_boost"]');
  const choices = await page.locator("#supplyChoiceOverlay .supply-choice-btn").evaluateAll((nodes) =>
    nodes.map((node) => ({
      rewardId: node.dataset.rewardId,
      box: node.getBoundingClientRect().toJSON()
    }))
  );
  assert.strictEqual(choices.length, 5, "supply choice overlay should show all five reward options");
  const viewport = page.viewportSize();
  choices.forEach((choice) => {
    assert(choice.box.width >= 44 && choice.box.height >= 44, `${choice.rewardId} should be a 44px+ touch target`);
    assert(choice.box.left >= -1 && choice.box.right <= viewport.width + 1, `${choice.rewardId} should be horizontally reachable`);
    assert(choice.box.top >= -1 && choice.box.bottom <= viewport.height + 1, `${choice.rewardId} should be vertically reachable`);
  });

  await page.click('#supplyChoiceOverlay .supply-choice-btn[data-reward-id="damage_boost"]');
  await page.waitForFunction(() => document.getElementById("supplyChoiceOverlay").hidden === true);
  state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.paused, false, "choosing a supply reward should resume the run");
  assert.strictEqual(state.supplyChoice, null, "choosing a supply reward should clear supply choice state");
  assert.strictEqual(state.supplyDrops.length, 0, "picked supply cache should disappear");
  assert.strictEqual(state.stats.supplyCratesCollected, 1, "chosen supply reward should count one collected cache");
  assert(state.supplyBuffs.some((buff) => buff.rewardId === "damage_boost"), "chosen damage reward should apply damage boost");
  assert(state.effectiveRunMods.damageAdd >= 0.2, "damage boost should increase effective damage");
  assert.strictEqual(state.stats.lastSupplyReward, "damage_boost", "pickup should record chosen reward");

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
  assert(settlementText.includes("181"), `settlement should show 181 total parts after achievement and milestone bonuses: ${settlementText}`);
  assert(settlementText.includes("新紀錄"), `settlement should call out new records: ${settlementText}`);
  const settlementRows = await page.locator("#settlementList .settlement-item").evaluateAll((nodes) =>
    nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim())
  );
  assert(settlementRows.some((row) => row.includes("+40") && row.includes("波次零件")), `settlement should show wave parts breakdown: ${settlementRows.join(" | ")}`);
  assert(settlementRows.some((row) => row.includes("+21") && row.includes("擊殺零件")), `settlement should show kill parts breakdown: ${settlementRows.join(" | ")}`);
  assert(settlementRows.some((row) => row.includes("+48") && row.includes("Boss 零件")), `settlement should show boss parts breakdown: ${settlementRows.join(" | ")}`);
  assert(settlementRows.some((row) => row.includes("+32") && row.includes("里程碑零件")), `settlement should show milestone parts breakdown: ${settlementRows.join(" | ")}`);
  const badges = await page.locator("#settlementBadges .settlement-badge").evaluateAll((nodes) => nodes.map((node) => node.innerText));
  assert(badges.some((text) => text.includes("首殺 Boss")), `settlement should show first boss achievement: ${badges.join(" | ")}`);
  assert(badges.some((text) => text.includes("突破第 8 波")), `settlement should show milestone claim badges: ${badges.join(" | ")}`);
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
  assert(meta.parts >= 181, "settlement should persist earned parts");
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
  await checkTrailerRoomSystem(page);
  if (viewport.width === 1366 && viewport.height === 700) {
    await checkShortDesktopReachability(page);
    await checkSupplyChoiceOverlayReachability(page);
  }
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
    await checkR57EnemyRosterBehaviors(page);
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
  await checkRunTrailerRendering(page);
  await checkInitialPromptAndMessages(page);
  await checkOpeningHordeGateAndFps(page);
  await checkAimAssistToggle(page);
  await checkAdaptivePerformance(page);
  await checkFxIntegration(page);
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

function audioCountersProbe(page) {
  return page.evaluate(() => ({
    contexts: window.__audioCounters.contexts,
    oscillators: window.__audioCounters.oscillators,
    gains: window.__audioCounters.gains,
    bufferSources: window.__audioCounters.bufferSources,
    resumes: window.__audioCounters.resumes,
    total: window.__audioCounters.oscillators + window.__audioCounters.gains + window.__audioCounters.bufferSources
  }));
}

async function shootOnceForAudio(page) {
  await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { hp: state.vehicle.maxHp, aimX: state.vehicle.x, aimY: state.vehicle.y - 170, weaponCooldown: 0 }
    });
    const aimed = window.__test.getState();
    window.__test.spawnEnemy("shambler", { x: aimed.vehicle.x, y: aimed.vehicle.y - 170, hp: 1, speed: 0 });
    window.__test.step(900);
  });
}

async function runAudioScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  // 注入 fake AudioContext：計數 createOscillator / createGain / createBufferSource / resume。
  await page.addInitScript(() => {
    window.__audioCounters = { contexts: 0, oscillators: 0, gains: 0, bufferSources: 0, filters: 0, resumes: 0 };
    function fakeParam(value) {
      return {
        value,
        setValueAtTime() { return this; },
        linearRampToValueAtTime() { return this; },
        exponentialRampToValueAtTime() { return this; },
        cancelScheduledValues() { return this; }
      };
    }
    function fakeNode(extra) {
      return Object.assign(
        {
          connect(target) { return target; },
          disconnect() {}
        },
        extra || {}
      );
    }
    class FakeAudioContext {
      constructor() {
        window.__audioCounters.contexts += 1;
        this.state = "suspended";
        this.sampleRate = 8000;
        this.destination = fakeNode();
      }
      get currentTime() {
        return performance.now() / 1000;
      }
      createGain() {
        window.__audioCounters.gains += 1;
        return fakeNode({ gain: fakeParam(1) });
      }
      createOscillator() {
        window.__audioCounters.oscillators += 1;
        return fakeNode({ type: "sine", frequency: fakeParam(440), detune: fakeParam(0), start() {}, stop() {} });
      }
      createBuffer(channels, length, rate) {
        return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        window.__audioCounters.bufferSources += 1;
        return fakeNode({ buffer: null, loop: false, playbackRate: fakeParam(1), start() {}, stop() {} });
      }
      createBiquadFilter() {
        window.__audioCounters.filters += 1;
        return fakeNode({ type: "lowpass", frequency: fakeParam(350), Q: fakeParam(1) });
      }
      resume() {
        window.__audioCounters.resumes += 1;
        this.state = "running";
        return Promise.resolve();
      }
      suspend() {
        this.state = "suspended";
        return Promise.resolve();
      }
      close() {
        this.state = "closed";
        return Promise.resolve();
      }
    }
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => window.__test.clearStorage());

  // 1) 預設音效開啟：出勤射擊後應建立 AudioContext 與合成節點（觸發數 > 0）。
  const defaults = await page.evaluate(() => ({
    sound: window.__test.getMeta().settings.sound,
    migrated: window.DSRules.migrateMeta(null, { config: window.DSConfig }).settings.sound
  }));
  assert.strictEqual(defaults.sound, true, "fresh meta should enable sound by default");
  assert.strictEqual(defaults.migrated, true, "migrateMeta should default sound to true");
  await page.evaluate(() => window.__test.startRun("land_rig"));
  await shootOnceForAudio(page);
  const afterShoot = await audioCountersProbe(page);
  assert(afterShoot.contexts >= 1, "sortie shooting should lazily create one AudioContext");
  assert(afterShoot.oscillators > 0, `shooting should create oscillator nodes, got ${afterShoot.oscillators}`);
  assert(afterShoot.gains > 0, `shooting should create gain nodes, got ${afterShoot.gains}`);
  assert(afterShoot.bufferSources > 0, `land shots should include noise buffer layers, got ${afterShoot.bufferSources}`);

  // 2) 首次使用者互動（pointerdown）應 resume 解鎖 AudioContext。
  const canvasBox = await page.locator("#gameCanvas").boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.6);
  await page.waitForFunction(() => window.__audioCounters.resumes >= 1);

  // 3) 設定關閉音效：立即靜音（不再建任何 node）且持久化。
  await page.evaluate(() => window.__test.showGarage());
  await waitForMetaBackground(page);
  await openOperationsPanel(page);
  await page.locator("#soundToggle").uncheck();
  const muted = await page.evaluate(() => ({
    sound: window.__test.getMeta().settings.sound,
    stored: JSON.parse(localStorage.getItem(window.DSConfig.STORAGE_KEY)).settings.sound,
    ui: document.getElementById("soundToggle").checked
  }));
  assert.strictEqual(muted.sound, false, "sound toggle off should persist in meta settings");
  assert.strictEqual(muted.stored, false, "sound=false should be written to localStorage");
  assert.strictEqual(muted.ui, false, "sound toggle UI should render off");
  await page.evaluate(() => window.__test.startRun("land_rig"));
  const beforeMuted = await audioCountersProbe(page);
  await shootOnceForAudio(page);
  await page.evaluate(() => {
    window.__test.grantGate("repair");
    window.__test.damageVehicle(5, { type: "enemy", enemyId: "shambler" });
    window.__test.pushWave(2);
    window.__test.step(600);
  });
  const afterMuted = await audioCountersProbe(page);
  assert.strictEqual(afterMuted.total, beforeMuted.total, "sound off must not create any audio nodes");

  // 4) reload 後音效關閉設定應保留；重新開啟後觸發數恢復增加。
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  const reloaded = await page.evaluate(() => window.__test.getMeta().settings.sound);
  assert.strictEqual(reloaded, false, "sound=false should survive reload");
  await waitForMetaBackground(page);
  await openOperationsPanel(page);
  const reloadedToggle = await page.locator("#soundToggle").isChecked();
  assert.strictEqual(reloadedToggle, false, "sound toggle should render persisted off state after reload");
  await page.locator("#soundToggle").check();
  const reEnabled = await page.evaluate(() => ({
    sound: window.__test.getMeta().settings.sound,
    stored: JSON.parse(localStorage.getItem(window.DSConfig.STORAGE_KEY)).settings.sound
  }));
  assert.strictEqual(reEnabled.sound, true, "sound toggle on should persist again");
  assert.strictEqual(reEnabled.stored, true, "sound=true should be written back to localStorage");
  await page.evaluate(() => window.__test.startRun("land_rig"));
  const beforeReEnabled = await audioCountersProbe(page);
  await shootOnceForAudio(page);
  const afterReEnabled = await audioCountersProbe(page);
  assert(afterReEnabled.total > beforeReEnabled.total, "re-enabled sound should create audio nodes again");

  assert.deepStrictEqual(errors, [], "console/page errors during audio scenario");
  await page.close();
  console.log("E2E audio synthesis PASS");
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
    await page.waitForFunction(async () => (await caches.keys()).some((key) => key.includes("ashes-convoy-r57")));

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
    assert(offlineShell.cacheKeys.some((key) => key.includes("ashes-convoy-r57")), "R57 cache should exist offline");
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
    await context.close().catch(() => {});
  }
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  const viewports = [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1280, height: 900 },
    { width: 1366, height: 700 }
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
    await runAudioScenario(browser, url);
    await runServiceWorkerOfflineScenario(browser, url);
    console.log("E2E tests PASS");
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
