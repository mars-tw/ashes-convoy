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

function settleWithin(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

async function closeHarness(browser, server) {
  await settleWithin(browser.close().catch(() => {}));
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await settleWithin(new Promise((resolve) => server.close(resolve)));
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
      const centerNode = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        hidden: node.hidden,
        complete: node.complete,
        naturalWidth: node.naturalWidth,
        naturalHeight: node.naturalHeight,
        width: rect.width,
        height: rect.height,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        centerNodeId: centerNode ? centerNode.id : "",
        src: node.getAttribute("src")
      };
    });
    assert(!image.hidden, "start key art should be visible when background mode is image");
    assert(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, "start key art should load successfully");
    assert(image.width > 0 && image.height > 0, "start key art should cover a visible area");
    assert(image.src && image.src.includes("assets/ui/start.png"), `meta background should use start.png, got ${image.src}`);
    assert.strictEqual(image.objectFit, "contain", "R79 start key art should remain fully visible");
    assert(image.objectPosition.includes("50%"), "start key art should stay centered");
    assert.strictEqual(image.display, "block", "R79 start key art should participate in painting");
    assert.strictEqual(image.visibility, "visible", "R79 start key art should not be visually hidden");
    assert(image.opacity >= 0.99, `R79 start key art should remain opaque, got ${image.opacity}`);
    assert.strictEqual(image.centerNodeId, "shelterImage", "R79 start key art should be the painted center layer");
  } else {
    await expectShelterCanvasHasPixels(page);
  }
}

async function checkMetaHotspotsFit(page) {
  const collapsed = await page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll(".hotspot-btn")).filter((button) => button.getClientRects().length > 0);
    return {
      ids: visible.map((button) => button.id),
      sortieHeight: document.getElementById("sortieBtn").getBoundingClientRect().height,
      baseExpanded: document.getElementById("baseToggleBtn").getAttribute("aria-expanded")
    };
  });
  assert.deepStrictEqual(collapsed.ids, ["sortieBtn", "baseToggleBtn"], "collapsed meta screen should show only sortie and base");
  assert(collapsed.sortieHeight >= 60, "sortie should be the dominant CTA");
  assert.strictEqual(collapsed.baseExpanded, "false", "base actions should start collapsed");
  await page.click("#baseToggleBtn");
  const result = await page.evaluate(() => {
    const app = document.getElementById("app").getBoundingClientRect();
    const layer = document.getElementById("hotspotLayer").getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll(".hotspot-btn")).filter((button) => button.getClientRects().length > 0).map((button) => {
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
  assert.strictEqual(result.buttons.length, 8, "expanded base should expose sortie, base, and six management actions");
  assert.deepStrictEqual(
    result.buttons.map((button) => button.id).sort(),
    ["baseToggleBtn", "opsHotspotBtn", "resetOverlayBtn", "seriesHotspotBtn", "sortieBtn", "trailerHotspotBtn", "upgradeHotspotBtn", "vehicleHotspotBtn"],
    "meta action buttons should match the key art controls"
  );
  assert(result.layer.left >= result.layer.appLeft - 1, "meta action layer should not overflow left");
  assert(result.layer.right <= result.layer.appRight + 1, "meta action layer should not overflow right");
  assert(result.layer.bottom <= result.layer.appBottom + 1, "meta action layer should stay within app bottom");
  assert(result.viewportOverflow <= 1, "meta overlay should not create horizontal page overflow");
  result.buttons.forEach((button) => {
    assert(button.width >= 44 && button.height >= 44, `${button.id} should be at least 44px in both touch dimensions`);
    assert(button.left >= button.appLeft - 1, `${button.id} should not overflow left`);
    assert(button.right <= button.appRight + 1, `${button.id} should not overflow right`);
    assert(button.scrollWidth <= button.clientWidth + 2, `${button.id} label should fit without horizontal overflow`);
  });
  await page.click("#baseToggleBtn");
}

async function expandBaseMenu(page) {
  const expanded = await page.locator("#baseToggleBtn").getAttribute("aria-expanded");
  if (expanded !== "true") await page.click("#baseToggleBtn");
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
    await expandBaseMenu(page);
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
    await expandBaseMenu(page);
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
      swCachesJs: swText.includes("src/version.js?v=R79") && swText.includes("src/ui.js?v=R79") && swText.includes("src/game.js?v=R79") && swText.includes("src/rules.js?v=R79"),
      swQuerySensitiveCache: swText.includes("cache.match(request);"),
      swHasOffline: swText.includes("offline.html"),
      htmlHasVersionedScripts: Array.from(document.querySelectorAll("script[src]")).every((node) => new URL(node.getAttribute("src"), location.href).searchParams.get("v") === "R79"),
      htmlHasVersionedLinks: Array.from(document.querySelectorAll('link[href][rel="manifest"], link[href][rel="apple-touch-icon"]')).every((node) => new URL(node.getAttribute("href"), location.href).searchParams.get("v") === "R79"),
      htmlBootGuard: document.documentElement.innerHTML.includes("ashes_convoy_html_boot_reload_R79"),
      uiHasControllerChange: uiText.includes("controllerchange"),
      uiHasAutoReloadWindow: uiText.includes("SW_AUTO_RELOAD_WINDOW_MS") && uiText.includes("15000"),
      uiHasSessionGuard: uiText.includes("SW_AUTO_RELOAD_SESSION_KEY") && uiText.includes("sessionStorage"),
      uiHasAutoReload: uiText.includes("root.location.reload()"),
      webdriver: navigator.webdriver,
      registrationCount: registrations.length
    };
  });
  assert.strictEqual(pwa.manifestHref, "manifest.webmanifest?v=R79", "page should link the versioned web manifest");
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
  await expandBaseMenu(page);
  for (const selector of ["#sortieBtn", "#baseToggleBtn", "#upgradeHotspotBtn", "#vehicleHotspotBtn", "#seriesHotspotBtn", "#opsHotspotBtn", "#resetOverlayBtn"]) {
    await assertControlReachable(page, selector, selector);
  }
  await page.click("#opsHotspotBtn");
  await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
  for (const selector of [
    "#aimAssistLevelSelect",
    "#screenShakeToggle",
    "#reducedFlashToggle",
    "#soundToggle",
    "#showRunTrailerToggle",
    "#showCompanionToggle",
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
  await expandBaseMenu(page);
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
  assert.strictEqual(bought.metrics.characterCount, 1, "R71 trailer room should contain exactly one Xi");
  assert.strictEqual(bought.metrics.characterEmbedded, true, "R71 Xi should be embedded in the sharp room master instead of layered twice");
  assert(Math.abs(bought.metrics.contentRect.w / bought.metrics.contentRect.h - 780 / 900) < 0.001, "R71 room must render at the source aspect ratio without stretching");
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
  await expandBaseMenu(page);
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
  assert.strictEqual(focusAfterEsc, "baseToggleBtn", "Escape should close the drawer and restore focus to the collapsed base control");
}

async function dragAim(page) {
  const box = await page.locator("#gameCanvas").boundingBox();
  assert(box, "canvas bounding box should exist");
  const previousAimAssist = await page.evaluate(() => {
    const meta = window.__test.getMeta();
    const previous = {
      aimAssistLevel: meta.settings.aimAssistLevel,
      aimAssist: meta.settings.aimAssist
    };
    meta.settings.aimAssistLevel = "off";
    meta.settings.aimAssist = false;
    window.__test.setMeta(meta);
    return previous;
  });
  const before = await page.evaluate(() => window.__test.getState().vehicle);
  await page.evaluate(({ box }) => {
    const canvas = document.getElementById("gameCanvas");
    canvas.setPointerCapture = () => {};
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y
    }));
    fire("pointerdown", box.x + box.width * 0.5, box.y + box.height * 0.78);
    fire("pointermove", box.x + box.width * 0.78, box.y + box.height * 0.24);
  }, { box });
  await page.evaluate(() => window.__test.step(180));
  const duringDrag = await page.evaluate(() => window.__test.getState().vehicle);
  await page.evaluate(({ box }) => {
    document.getElementById("gameCanvas").dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: "touch",
      isPrimary: true,
      clientX: box.x + box.width * 0.78,
      clientY: box.y + box.height * 0.24
    }));
  }, { box });
  await page.evaluate(() => {
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(120);
  });
  const after = await page.evaluate(() => {
    const state = window.__test.getState();
    return {
      vehicle: state.vehicle,
      projectile: state.projectiles.slice().reverse().find((projectile) => projectile.source !== "companion")
    };
  });
  await page.evaluate((previous) => {
    const meta = window.__test.getMeta();
    meta.settings.aimAssistLevel = previous.aimAssistLevel;
    meta.settings.aimAssist = previous.aimAssist;
    window.__test.setMeta(meta);
  }, previousAimAssist);
  assert(Math.abs(after.vehicle.aimX - before.aimX) > 20, "drag should change aimX");
  assert(after.vehicle.aimY < before.aimY - 80, "drag should move aim upward");
  assert(Math.abs(duringDrag.followX - duringDrag.aimX) < 0.01, "touch drag should synchronize vehicle followX with aimX");
  assert(duringDrag.x > before.x + 8, `touch drag should move the vehicle during the gesture, moved ${(duringDrag.x - before.x).toFixed(1)}`);
  const rawTouchY = ((box.y + box.height * 0.24 - box.y) / box.height) * 422;
  assert(duringDrag.aimY <= rawTouchY - 24, `touch aim should stay above the finger, got aimY ${duringDrag.aimY}`);
  assert(after.projectile, "auto fire should create a projectile after drag");
  if (Math.abs(duringDrag.aimX - duringDrag.x) > 2) {
    assert(Math.sign(after.projectile.vx) === Math.sign(duringDrag.aimX - duringDrag.x), "projectile should point toward the dragged aim direction");
  }
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
  await page.locator("#reducedFlashToggle").check();
  assert.strictEqual(await page.locator("#showRunTrailerToggle").isChecked(), true, "run trailer setting should default on");
  await page.locator("#showRunTrailerToggle").uncheck();
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.settings.showRunTrailer, false, "run trailer toggle off should persist");
  await page.locator("#showRunTrailerToggle").check();
  assert.strictEqual(await page.locator("#showCompanionToggle").isChecked(), true, "companion setting should default on");
  await page.locator("#showCompanionToggle").uncheck();
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.settings.showCompanion, false, "companion toggle off should persist");
  await page.locator("#showCompanionToggle").check();
  await page.selectOption("#damageTextDensitySelect", "large");
  await page.selectOption("#performanceModeSelect", "low");
  await page.selectOption("#fontSizeSelect", "large");
  await page.selectOption("#sfxVolumeSelect", "high");
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.settings.aimAssistLevel, "high", "aim assist level should persist from settings panel");
  assert.strictEqual(meta.settings.aimAssist, true, "high aim assist should keep compatibility boolean enabled");
  assert.strictEqual(meta.settings.screenShake, false, "screen shake toggle should persist");
  assert.strictEqual(meta.settings.reducedFlash, true, "reduced flash toggle should persist");
  assert.strictEqual(meta.settings.showRunTrailer, true, "run trailer toggle on should persist");
  assert.strictEqual(meta.settings.damageTextDensity, "large", "damage text density should persist");
  assert.strictEqual(meta.settings.performanceMode, "low", "performance mode should persist");
  assert.strictEqual(meta.settings.fontSize, "large", "font size setting should persist");
  assert.strictEqual(meta.settings.sfxVolume, "high", "sfx volume setting should persist");

  // 畫面特效三段（完整/精簡/關閉）切換持久化＋migrate 兼容（手機友善預設精簡）
  const fxDefault = await page.evaluate(() => window.DSRules.migrateMeta(null, { config: window.DSConfig }).settings.fxLevel);
  assert.strictEqual(fxDefault, "reduced", "fresh migrate should default fx level to reduced");
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
  assert(fontState.version.includes("R79"), `settings should show app version: ${fontState.version}`);

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
  await expandBaseMenu(page);
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
  await expandBaseMenu(page);
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
  const base = await page.evaluate(() => {
    window.__test.startRun("void_runner");
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(120);
    const state = window.__test.getState();
    return state.projectiles.map((projectile) => ({ damage: projectile.damage, pierce: projectile.pierce })).slice(0, 1);
  });
  assert.strictEqual(base.length, 1, "void runner should fire one precise base projectile");
  assert(Math.abs(base[0].damage - 8.5) < 0.01, `void runner base projectile should be full damage, got ${base[0].damage}`);
  assert.strictEqual(base[0].pierce, 2, "void runner should fire piercing shots");

  const boosted = await page.evaluate(() => {
    window.__test.grantGate("multishot_plus");
    window.__test.setState({ projectiles: [], vehicle: { weaponCooldown: 0 } });
    window.__test.step(120);
    return window.__test.getState().projectiles.map((projectile) => projectile.damage).slice(0, 3);
  });
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

async function checkR71CombatRefresh(page) {
  const road = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const cfg = window.DSConfig;
    const state = window.__test.getState();
    const half = cfg.VEHICLES.land_rig.visualHalfWidth;
    window.__test.setState({ vehicle: { followX: cfg.LOGIC.roadLeft - 80, weaponCooldown: 999 } });
    window.__test.step(900);
    const leftX = window.__test.getState().vehicle.x;
    window.__test.setState({ vehicle: { followX: cfg.LOGIC.roadRight + 80, weaponCooldown: 999 } });
    window.__test.step(1600);
    const rightX = window.__test.getState().vehicle.x;
    const gates = window.__test.spawnGatePair(["damage_plus", "repair"]);
    return {
      roadLeft: cfg.LOGIC.roadLeft,
      roadRight: cfg.LOGIC.roadRight,
      half,
      leftX,
      rightX,
      gateXs: gates.map((gate) => Math.round(gate.x))
    };
  });
  assert(road.leftX >= road.roadLeft + road.half - 0.5, "vehicle should clamp inside widened left road edge");
  assert(road.rightX <= road.roadRight - road.half + 0.5, "vehicle should clamp inside widened right road edge");
  assert.deepStrictEqual(road.gateXs, [56, 139], "widened road should place gate choices at x=56/139");

  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      runMods: Object.assign({}, state.runMods, { weaponMode: "homing", weaponLevel: 2 }),
      vehicle: {
        aimX: state.vehicle.x - 72,
        aimY: state.vehicle.y - 190,
        weaponCooldown: 0
      }
    });
    window.__test.spawnEnemy("runner", { x: state.vehicle.x + 54, y: state.vehicle.y - 170, hp: 12, speed: 0 });
    window.__test.step(120);
  });
  const homingStart = await page.evaluate(() => {
    const state = window.__test.getState();
    return {
      projectile: state.projectiles.find((projectile) => projectile.homing),
      hud: document.getElementById("hudMods").textContent
    };
  });
  assert(homingStart.projectile && homingStart.projectile.turnRate === 4.5, "homing mode should fire homing projectiles");
  assert(homingStart.hud.includes("Lv2"), `weapon HUD should show weapon level: ${homingStart.hud}`);
  await page.evaluate(() => window.__test.step(1200));
  const homingEnd = await page.evaluate(() => window.__test.getState().stats.kills);
  assert(homingEnd >= 1, "homing projectile should hit and kill the offset target");

  const fracture = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 },
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const target = window.__test.spawnEnemy("shambler", { id: "fracture_target", x: 100, y: 150, hp: 100, speed: 0, silent: true });
    const mode = window.DSConfig.WEAPON_POWERUPS.modes.fracture;
    window.__test.setState({
      projectiles: [
        {
          id: "fracture_probe",
          sprite: "bullet_pulse",
          x: target.x,
          y: target.y,
          vx: 0,
          vy: -1,
          damage: 12,
          damageSources: [{ key: "land_rig", ratio: 1 }],
          bonusProjectile: false,
          vehicleId: "land_rig",
          pierce: 0,
          hitIds: {},
          radius: 12,
          rotation: -Math.PI / 2,
          life: 1,
          splash: 0,
          scale: 1,
          shardCount: mode.shardCount,
          shardDamageMul: mode.shardDamageMul,
          shardSpread: mode.shardSpread,
          shardSpeedMul: mode.shardSpeedMul,
          shardLife: mode.shardLife
        }
      ]
    });
    window.__test.step(16);
    const state = window.__test.getState();
    return {
      shards: state.projectiles.filter((projectile) => projectile.fractureShard).length,
      targetHp: state.enemies.find((enemy) => enemy.id === "fracture_target").hp
    };
  });
  assert.strictEqual(fracture.shards, 2, "fracture hit should spawn two short shard projectiles");
  assert(fracture.targetHp < 100, "fracture primary hit should still damage the target");

  const ember = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 },
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const target = window.__test.spawnEnemy("shambler", { id: "ember_target", x: 100, y: 150, hp: 100, speed: 0, silent: true });
    const mode = window.DSConfig.WEAPON_POWERUPS.modes.ember;
    window.__test.setState({
      projectiles: [
        {
          id: "ember_probe",
          sprite: "bullet_pulse",
          x: target.x,
          y: target.y,
          vx: 0,
          vy: -1,
          damage: 20,
          damageSources: [{ key: "land_rig", ratio: 1 }],
          bonusProjectile: false,
          vehicleId: "land_rig",
          pierce: 0,
          hitIds: {},
          radius: 12,
          rotation: -Math.PI / 2,
          life: 1,
          splash: 0,
          scale: 1,
          burnTicks: mode.burnTicks,
          burnDamageMul: mode.burnDamageMul,
          burnInterval: mode.burnInterval
        }
      ]
    });
    window.__test.step(16);
    window.__test.step(1600);
    const state = window.__test.getState();
    const enemy = state.enemies.find((item) => item.id === "ember_target");
    return {
      hp: enemy && enemy.hp,
      burnDamage: state.stats.damageBySource.burn || 0
    };
  });
  assert(ember.burnDamage > 0, "ember hit should deal burn damage over time");
  assert(ember.hp < 80, `ember burn should reduce target hp after the direct hit, got ${ember.hp}`);

  const companionTiming = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { weaponCooldown: 999 },
      companionCooldown: 0
    });
    window.__test.spawnEnemy("shambler", { x: state.vehicle.x, y: state.vehicle.y - 115, hp: 999, speed: 0 });
    window.__test.step(16);
    const windupDebug = window.__test.getRenderDebug();
    const windup = {
      frame: windupDebug.companionFrame,
      phase: windupDebug.companionAttackPhase,
      atlas: windupDebug.companionAttackAtlasDrawn,
      damage: window.__test.getState().stats.damageBySource.companion || 0
    };
    window.__test.step(120);
    const activeDebug = window.__test.getRenderDebug();
    const active = {
      frame: activeDebug.companionFrame,
      phase: activeDebug.companionAttackPhase,
      atlas: activeDebug.companionAttackAtlasDrawn
    };
    window.__test.step(60);
    const recoveryDebug = window.__test.getRenderDebug();
    const recovery = {
      frame: recoveryDebug.companionFrame,
      phase: recoveryDebug.companionAttackPhase,
      atlas: recoveryDebug.companionAttackAtlasDrawn
    };
    window.__test.step(1404);
    const finalState = window.__test.getState();
    const finalDebug = window.__test.getRenderDebug();
    return {
      windup,
      active,
      recovery,
      final: {
        damage: finalState.stats.damageBySource.companion || 0,
        drawn: finalDebug.companionRasterDrawn || finalDebug.companionFallbackDrawn
      }
    };
  });
  assert.strictEqual(companionTiming.windup.frame, 0, "Xi should stay out of firing frame during anticipation");
  assert.strictEqual(companionTiming.windup.phase, "anticipation", "Xi companion should expose an anticipation phase");
  assert.strictEqual(companionTiming.windup.atlas, true, "Xi anticipation must draw the formal attack atlas");
  assert.strictEqual(companionTiming.windup.damage, 0, "Xi companion should not deal damage before the impact frame");
  assert.strictEqual(companionTiming.active.frame, 2, "Xi formal attack atlas should switch to frame 2 on impact");
  assert.strictEqual(companionTiming.active.phase, "active", "Xi companion should expose active impact phase");
  assert.strictEqual(companionTiming.active.atlas, true, "Xi impact must draw the formal attack atlas");
  assert.strictEqual(companionTiming.recovery.frame, 3, "Xi formal attack atlas should switch to frame 3 for recovery");
  assert.strictEqual(companionTiming.recovery.phase, "recovery", "Xi companion should expose recovery phase");
  assert.strictEqual(companionTiming.recovery.atlas, true, "Xi recovery must draw the formal attack atlas");
  const companionOn = companionTiming.final;
  assert(companionOn.damage > 0, "companion should deal damage by source");
  assert.strictEqual(companionOn.drawn, true, "companion should render when enabled");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.showCompanion = false;
    window.__test.setMeta(meta);
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { weaponCooldown: 999 },
      companionCooldown: 0
    });
    window.__test.spawnEnemy("shambler", { x: state.vehicle.x, y: state.vehicle.y - 115, hp: 999, speed: 0 });
    window.__test.step(1600);
  });
  const companionOff = await page.evaluate(() => {
    const state = window.__test.getState();
    const debug = window.__test.getRenderDebug();
    return {
      damage: state.stats.damageBySource.companion || 0,
      drawn: debug.companionRasterDrawn || debug.companionFallbackDrawn
    };
  });
  assert.strictEqual(companionOff.damage, 0, "disabled companion should not fire");
  assert.strictEqual(companionOff.drawn, false, "disabled companion should not render");
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.showCompanion = true;
    window.__test.setMeta(meta);
  });

  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      runMods: Object.assign({}, state.runMods, { damageAdd: 2.5 }),
      enemies: [],
      projectiles: [],
      gates: [],
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.spawnGatePair(["damage_plus", "repair"]);
  });
  await page.waitForSelector("#gateChoiceLayer:not([hidden])");
  assert.strictEqual(await page.locator("#gateChoiceOverlay").count(), 0, "gate choice must not create a central overlay");
  await page.evaluate(() => window.__test.chooseGate("damage_plus"));
  const overflowGateState = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(overflowGateState.runMods.overload, 1, "overflow gate should add overload");
  assert(overflowGateState.stats.scavengeGoods >= 6, "overflow gate should grant scavenge goods");

  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.setState({
      runMods: Object.assign({}, state.runMods, { damageAdd: 2.5 }),
      enemies: [],
      projectiles: [],
      gates: [],
      supplyDrops: [
        { id: "overflow_supply", x: state.vehicle.x, y: state.vehicle.y - 4, vx: 0, vy: 0, radius: 12, age: 0, ttl: 30, picked: false }
      ],
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(80);
  });
  await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) .supply-choice-btn[data-reward-id="damage_boost"] .choice-overflow-badge');
  const supplyOverflowText = await page.locator('#supplyChoiceOverlay .supply-choice-btn[data-reward-id="damage_boost"] .choice-overflow-badge').innerText();
  assert(supplyOverflowText.includes("已滿") && supplyOverflowText.includes("+6"), `supply overflow badge should describe goods overflow: ${supplyOverflowText}`);
  await page.click('#supplyChoiceOverlay .supply-choice-btn[data-reward-id="damage_boost"]');
  await page.waitForFunction(() => document.getElementById("supplyChoiceOverlay").hidden === true);
  const overflowSupplyState = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(overflowSupplyState.runMods.overload, 1, "overflow supply should add overload");
  assert(overflowSupplyState.stats.scavengeGoods >= 6, "overflow supply should grant scavenge goods");
}

async function checkR71DamageRegression(page) {
  const pierce = await page.evaluate(() => {
    window.__test.startRun("void_runner");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 },
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const target = window.__test.spawnEnemy("shambler", { id: "pierce_target", x: 100, y: 150, hp: 100, speed: 0, silent: true });
    window.__test.setState({
      projectiles: [
        {
          id: "pierce_probe",
          sprite: "bullet_pulse",
          x: target.x,
          y: target.y,
          vx: 0,
          vy: 0,
          damage: 10,
          damageSources: [{ key: "void_runner", ratio: 1 }],
          bonusProjectile: false,
          vehicleId: "void_runner",
          pierce: 2,
          hitIds: {},
          radius: 12,
          rotation: 0,
          life: 1,
          splash: 0,
          scale: 1
        }
      ]
    });
    for (let i = 0; i < 5; i += 1) window.__test.step(50);
    const state = window.__test.getState();
    const enemy = state.enemies.find((item) => item.id === "pierce_target");
    return {
      hp: enemy && enemy.hp,
      damageDealt: state.stats.damageDealt,
      projectilePierce: state.projectiles[0] && state.projectiles[0].pierce
    };
  });
  assert.strictEqual(pierce.hp, 90, "piercing projectile should damage the same enemy only once while overlapping");
  assert.strictEqual(pierce.damageDealt, 10, "repeated pierce overlap should only count one damage event");
  assert.strictEqual(pierce.projectilePierce, 1, "pierce should only decrement for a new target hit");

  const splash = await page.evaluate(() => {
    window.__test.startRun("sea_ark");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 },
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const anchor = window.__test.spawnEnemy("shambler", { id: "splash_anchor", x: 92, y: 150, hp: 999, speed: 0, silent: true });
    window.__test.spawnEnemy("shield_husk", { id: "splash_shield", x: 122, y: 150, hp: 100, shieldHp: 28, speed: 0, silent: true });
    window.__test.setState({
      projectiles: [
        {
          id: "splash_probe",
          sprite: "bullet_rocket",
          x: anchor.x,
          y: anchor.y,
          vx: 0,
          vy: -1,
          damage: 100,
          damageSources: [{ key: "sea_ark", ratio: 1 }],
          bonusProjectile: false,
          vehicleId: "sea_ark",
          pierce: 0,
          hitIds: {},
          radius: 12,
          rotation: -Math.PI / 2,
          life: 1,
          splash: 60,
          scale: 1
        }
      ]
    });
    window.__test.step(16);
    const shield = window.__test.getState().enemies.find((item) => item.id === "splash_shield");
    return { hp: shield && shield.hp, shieldHp: shield && shield.shieldHp };
  });
  assert.strictEqual(splash.shieldHp, 0, "splash damage should consume shield husk shield");
  assert(splash.hp > 86 && splash.hp < 91, `splash damage should apply shield mitigation to hp, got ${splash.hp}`);

  const burst = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 },
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const bloater = window.__test.spawnEnemy("bloater", { id: "burst_source", x: 92, y: 150, hp: 10, speed: 0, silent: true });
    window.__test.spawnEnemy("shield_husk", { id: "burst_shield", x: 116, y: 150, hp: 100, shieldHp: 28, speed: 0, silent: true });
    window.__test.setState({
      projectiles: [
        {
          id: "burst_probe",
          sprite: "bullet_machine",
          x: bloater.x,
          y: bloater.y,
          vx: 0,
          vy: -1,
          damage: 20,
          damageSources: [{ key: "land_rig", ratio: 1 }],
          bonusProjectile: false,
          vehicleId: "land_rig",
          pierce: 0,
          hitIds: {},
          radius: 12,
          rotation: -Math.PI / 2,
          life: 1,
          splash: 0,
          scale: 1
        }
      ]
    });
    window.__test.step(16);
    const shield = window.__test.getState().enemies.find((item) => item.id === "burst_shield");
    return { hp: shield && shield.hp, shieldHp: shield && shield.shieldHp };
  });
  assert.strictEqual(burst.shieldHp, 6, "death burst should consume shield before hp");
  assert(burst.hp > 92 && burst.hp < 94, `death burst should apply shield mitigation to hp, got ${burst.hp}`);

  const companionRearScreen = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 },
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0
    });
    const state = window.__test.getState();
    const shield = window.__test.spawnEnemy("shield_husk", {
      id: "companion_rear_screen_shield",
      x: state.vehicle.x,
      y: state.vehicle.y + 42,
      hp: 100,
      shieldHp: 28,
      speed: 0,
      silent: true
    });
    window.__test.setState({
      projectiles: [
        {
          id: "companion_rear_screen_probe",
          source: "companion",
          sprite: "bullet_machine",
          x: shield.x,
          y: shield.y,
          vx: 0,
          vy: 220,
          damage: 20,
          damageSources: [{ key: "companion", ratio: 1 }],
          bonusProjectile: false,
          vehicleId: "land_rig",
          pierce: 0,
          hitIds: {},
          radius: 12,
          rotation: Math.PI / 2,
          life: 1,
          splash: 0,
          scale: 1
        }
      ]
    });
    window.__test.step(16);
    const updated = window.__test.getState().enemies.find((item) => item.id === "companion_rear_screen_shield");
    return { hp: updated && updated.hp, shieldHp: updated && updated.shieldHp };
  });
  assert.strictEqual(companionRearScreen.shieldHp, 8, "downward companion shot from the trailer-facing side should consume shield");
  assert(companionRearScreen.hp > 93 && companionRearScreen.hp < 94, `companion shield hit should only leak mitigated hp damage, got ${companionRearScreen.hp}`);
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
    window.__test.samplePerformanceFrames([120], { reset: true, constrainedDevice: false });
  });
  let perf = await page.evaluate(() => window.__test.getState().performance);
  assert.strictEqual(perf.quality, "low", "locked low performance mode should force low quality");
  assert(perf.maxEffects < windowlessEffectHigh(), "low quality should reduce effect cap");
  const logicalEnemyCap = await page.evaluate(() => window.DSConfig.PERFORMANCE.maxEnemies);
  assert.strictEqual(perf.maxEnemies, logicalEnemyCap, "low quality should keep logical enemy cap unchanged");

  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    window.__test.setMeta(meta);
    window.__test.samplePerformanceFrames(Array(70).fill(90), { reset: true, constrainedDevice: false });
  });
  perf = await page.evaluate(() => window.__test.getState().performance);
  assert.strictEqual(perf.quality, "high", "locked high performance mode should resist auto downgrade");

  const transitions = await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "auto";
    window.__test.setMeta(meta);
    window.__test.samplePerformanceFrames(Array(70).fill(90), { reset: true, constrainedDevice: false });
    const downgraded = window.__test.getState().performance;
    const state = window.__test.getState();
    window.__test.setState({ wave: state.wave + 1 });
    window.__test.samplePerformanceFrames(Array(220).fill(10));
    return {
      downgraded,
      recovered: window.__test.getState().performance
    };
  });
  assert.strictEqual(transitions.downgraded.quality, "low", "synthetic slow frames should produce an auto downgrade");
  assert.strictEqual(transitions.downgraded.constrainedDevice, false, "performance transition test should bypass device preflight");
  assert.strictEqual(transitions.downgraded.history.length, 1, "downgrade should record exactly one performance event");
  assert(transitions.downgraded.history[0].reason.includes("FPS"), `downgrade history should include a reason, got ${JSON.stringify(transitions.downgraded.history)}`);
  assert.strictEqual(transitions.recovered.quality, "high", "synthetic fast frames should produce a recovery on the next wave");
  assert.strictEqual(transitions.recovered.history.length, 2, "recovery should append a second performance event");
  assert(transitions.recovered.history.every((entry) => entry.reason.includes("FPS")), `performance history should keep downgrade/recovery reasons, got ${JSON.stringify(transitions.recovered.history)}`);
  assert(transitions.recovered.history.length <= 5, "performance history should remain bounded");
  const fairness = await page.evaluate(() => {
    function capture(mode) {
      const meta = window.__test.getMeta();
      meta.settings.performanceMode = mode;
      window.__test.setMeta(meta);
      window.__test.samplePerformanceFrames([16], { reset: true, constrainedDevice: false });
      window.__test.startRun("land_rig");
      const state = window.__test.getState();
      window.__test.setState({
        enemies: [],
        projectiles: [],
        gates: [],
        hazards: [],
        supplyDrops: [],
        enemyProjectiles: [],
        companionCooldown: 999,
        vehicle: { x: state.vehicle.x, followX: state.vehicle.x, weaponCooldown: 999 }
      });
      for (let i = 0; i < 80; i += 1) {
        window.__test.spawnEnemy("shambler", { id: `${mode}_cap_${i}`, x: 80, y: 80 + i * 0.1, speed: 0, silent: true });
      }
      const count = window.__test.getState().enemies.length;
      window.__test.setState({ enemies: [], projectiles: [], gates: [], enemyProjectiles: [], vehicle: { weaponCooldown: 999 } });
      window.__test.spawnEnemy("runner", {
        id: `${mode}_runner`,
        x: 90,
        y: state.vehicle.y - 180,
        hp: 999,
        swayPhase: 1.2,
        swayAmp: 7,
        eventDriftAmp: 6,
        laneOffset: 0,
        attackCooldown: 999,
        silent: true
      });
      window.__test.step(1000);
      return {
        count,
        runnerX: window.__test.getState().enemies[0].x
      };
    }
    return { high: capture("high"), low: capture("low") };
  });
  assert.strictEqual(fairness.low.count, fairness.high.count, "quality must not change spawned logical enemy count");
  assert(Math.abs(fairness.low.runnerX - fairness.high.runnerX) < 0.0001, `quality must not change enemy AI trajectory: ${JSON.stringify(fairness)}`);
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

async function checkR78AttackAtlasTiming(page) {
  const ranged = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const base = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      enemyProjectiles: [],
      supplyDrops: [],
      companionCooldown: 999,
      vehicle: {
        x: base.vehicle.x,
        followX: base.vehicle.x,
        hp: base.vehicle.maxHp,
        weaponCooldown: 999
      }
    });
    window.__test.spawnEnemy("spore_spitter", {
      id: "r78_spitter",
      x: base.vehicle.x,
      y: base.vehicle.y - 120,
      speed: 0,
      attackCooldown: 0,
      silent: true
    });
    const capture = () => {
      const current = window.__test.getState();
      const debug = window.__test.getRenderDebug();
      return {
        shots: current.enemyProjectiles.length,
        phase: current.enemies[0] && current.enemies[0].attackPhase,
        frame: debug.enemyAttackAtlasFrames.spore_spitter,
        atlasDrawn: debug.enemyAttackAtlasDrawn
      };
    };
    window.__test.step(40);
    const anticipationA = capture();
    window.__test.step(180);
    const anticipationB = capture();
    window.__test.step(180);
    const impact = capture();
    window.__test.step(80);
    const recovery = capture();
    return {
      anticipationA,
      anticipationB,
      impact,
      recovery
    };
  });
  assert.deepStrictEqual(
    [ranged.anticipationA.phase, ranged.anticipationB.phase, ranged.impact.phase, ranged.recovery.phase],
    ["anticipation", "anticipation", "active", "recovery"],
    `ranged attack should expose all ordered phases: ${JSON.stringify(ranged)}`
  );
  assert.deepStrictEqual(
    [ranged.anticipationA.frame, ranged.anticipationB.frame, ranged.impact.frame, ranged.recovery.frame],
    [0, 1, 2, 3],
    `ranged formal attack atlas should switch 0/1/2/3 by phase: ${JSON.stringify(ranged)}`
  );
  assert.strictEqual(ranged.anticipationA.shots, 0, "ranged enemy must not spawn projectile during anticipation A");
  assert.strictEqual(ranged.anticipationB.shots, 0, "ranged enemy must not spawn projectile during anticipation B");
  assert(ranged.impact.shots >= 1, `ranged enemy should spawn projectile on impact frame 2: ${JSON.stringify(ranged)}`);
  assert(ranged.recovery.shots >= ranged.impact.shots, "ranged recovery must not retract the impact projectile");
  [ranged.anticipationA, ranged.anticipationB, ranged.impact, ranged.recovery].forEach((phase) => {
    assert(phase.atlasDrawn > 0, `ranged ${phase.phase} must draw the formal attack atlas`);
  });

  const contact = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const base = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      enemyProjectiles: [],
      supplyDrops: [],
      companionCooldown: 999,
      vehicle: { x: base.vehicle.x, followX: base.vehicle.x, hp: base.vehicle.maxHp, weaponCooldown: 999 }
    });
    window.__test.spawnEnemy("runner", {
      id: "r78_contact",
      x: base.vehicle.x,
      y: base.vehicle.y,
      speed: 0,
      hitCooldown: 0,
      silent: true
    });
    window.__test.step(40);
    const before = window.__test.getState();
    const beforeDebug = window.__test.getRenderDebug();
    window.__test.step(140);
    const impact = window.__test.getState();
    const impactDebug = window.__test.getRenderDebug();
    window.__test.step(100);
    const recovery = window.__test.getState();
    const recoveryDebug = window.__test.getRenderDebug();
    window.__test.step(220);
    const after = window.__test.getState();
    return {
      hpBefore: before.vehicle.hp,
      phaseBefore: before.enemies[0] && before.enemies[0].attackPhase,
      frameBefore: beforeDebug.enemyAttackAtlasFrames.runner,
      hpImpact: impact.vehicle.hp,
      phaseImpact: impact.enemies[0] && impact.enemies[0].attackPhase,
      frameImpact: impactDebug.enemyAttackAtlasFrames.runner,
      hpRecovery: recovery.vehicle.hp,
      phaseRecovery: recovery.enemies[0] && recovery.enemies[0].attackPhase,
      frameRecovery: recoveryDebug.enemyAttackAtlasFrames.runner,
      hpAfter: after.vehicle.hp,
      enemiesAfter: after.enemies.length,
      corpse: after.effects.some((effect) => effect.kind === "enemy_corpse")
    };
  });
  assert.strictEqual(contact.phaseBefore, "anticipation", "contact enemy should wind up before damage");
  assert.strictEqual(contact.frameBefore, 0, "contact anticipation must start on formal frame 0");
  assert.strictEqual(contact.phaseImpact, "active", "contact enemy should expose active impact before retirement");
  assert.strictEqual(contact.frameImpact, 2, "contact active impact must draw formal frame 2");
  assert(contact.hpImpact < contact.hpBefore, `contact enemy should damage only on impact: ${JSON.stringify(contact)}`);
  assert.strictEqual(contact.phaseRecovery, "recovery", "contact enemy should play recovery after impact");
  assert.strictEqual(contact.frameRecovery, 3, "contact recovery must draw formal frame 3");
  assert.strictEqual(contact.hpRecovery, contact.hpImpact, "contact recovery must not deal damage twice");
  assert.strictEqual(contact.hpAfter, contact.hpImpact, "contact retirement must not deal damage after recovery");
  assert.strictEqual(contact.enemiesAfter, 0, "contact enemy should retire only after recovery completes");
  assert.strictEqual(contact.corpse, true, "contact enemy should hand off to the death reaction after recovery");

  const boss = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const base = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      enemyProjectiles: [],
      supplyDrops: [],
      companionCooldown: 999,
      vehicle: { x: base.vehicle.x, followX: base.vehicle.x, weaponCooldown: 999 }
    });
    window.__test.spawnEnemy("boss_hive_titan", {
      id: "r78_boss",
      x: base.vehicle.x,
      y: 160,
      speed: 0,
      silent: true
    });
    window.__test.setState({
      enemies: window.__test.getState().enemies.map((enemy) =>
        enemy.id === "r78_boss" ? Object.assign({}, enemy, { hp: enemy.maxHp * 0.6 }) : enemy
      )
    });
    window.__test.step(500);
    const capture = () => {
      const current = window.__test.getState();
      const debug = window.__test.getRenderDebug();
      const titan = current.enemies.find((enemy) => enemy.id === "r78_boss");
      return {
        adds: current.enemies.filter((enemy) => enemy.enemyId === "shambler").length,
        phase: titan && titan.attackPhase,
        frame: debug.enemyAttackAtlasFrames.boss_hive_titan
      };
    };
    const anticipationA = capture();
    window.__test.step(300);
    const anticipationB = capture();
    window.__test.step(200);
    const impact = capture();
    window.__test.step(120);
    const recovery = capture();
    return { anticipationA, anticipationB, impact, recovery };
  });
  assert.deepStrictEqual(
    [boss.anticipationA.frame, boss.anticipationB.frame, boss.impact.frame, boss.recovery.frame],
    [0, 1, 2, 3],
    `Boss formal attack atlas should switch 0/1/2/3 by phase: ${JSON.stringify(boss)}`
  );
  assert.strictEqual(boss.anticipationA.adds, 0, "Boss summon must not happen during anticipation A");
  assert.strictEqual(boss.anticipationB.adds, 0, "Boss summon must not happen during anticipation B");
  assert(boss.impact.adds >= 3, `Boss summon should happen on impact frame 2: ${JSON.stringify(boss)}`);
  assert.strictEqual(boss.impact.phase, "active", "Boss should expose active phase on impact frame");
  assert.strictEqual(boss.recovery.phase, "recovery", "Boss should expose recovery after impact");
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

async function checkR71JuiceFx(page) {
  const full = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    meta.settings.screenShake = true;
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      supplyChoice: null,
      vehicle: { weaponCooldown: 999, aimX: state.vehicle.x, aimY: state.vehicle.y - 160 }
    });
    const a = window.__test.spawnEnemy("shambler", { id: "combo_a", x: 82, y: 150, hp: 1, speed: 0, silent: true });
    const b = window.__test.spawnEnemy("runner", { id: "combo_b", x: 112, y: 150, hp: 1, speed: 0, silent: true });
    window.__test.setState({
      projectiles: [
        { id: "R71_a", sprite: "bullet_cannon", x: a.x, y: a.y, vx: 0, vy: 0, damage: 20, damageSources: [{ key: "land_rig", ratio: 1 }], vehicleId: "land_rig", pierce: 0, hitIds: {}, radius: 8, rotation: 0, life: 1, scale: 1 },
        { id: "R71_b", sprite: "bullet_cannon", x: b.x, y: b.y, vx: 0, vy: 0, damage: 20, damageSources: [{ key: "land_rig", ratio: 1 }], vehicleId: "land_rig", pierce: 0, hitIds: {}, radius: 8, rotation: 0, life: 1, scale: 1 }
      ]
    });
    window.__test.step(16);
    const afterCombo = window.__test.getState();
    window.__test.setState({
      supplyChoice: { dropId: "R71_supply", x: 52, y: 120, openedAt: afterCombo.time, rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards) },
      paused: false
    });
    window.__test.chooseSupplyReward("parts_cache");
    const boss = window.__test.spawnEnemy("boss_hive_titan", { id: "R71_boss", x: 96, y: 116, hp: 1, speed: 0, silent: true });
    window.__test.setState({
      projectiles: [
        { id: "R71_boss_shot", sprite: "bullet_cannon", x: boss.x, y: boss.y, vx: 0, vy: 0, damage: 20, damageSources: [{ key: "land_rig", ratio: 1 }], vehicleId: "land_rig", pierce: 0, hitIds: {}, radius: 8, rotation: 0, life: 1, scale: 1 }
      ]
    });
    window.__test.step(16);
    window.__test.step(16);
    return {
      state: window.__test.getState(),
      debug: window.__test.getRenderDebug()
    };
  });
  assert(full.state.combo && full.state.combo.count >= 2, "R71 combo should count consecutive kills");
  assert(full.state.effects.some((effect) => effect.kind === "hud_fly" || effect.kind === "hud_pop"), "R71 pickup should create HUD fly/pop effects");
  assert(full.state.fxTimeScaleLeft > 0, "R71 boss kill should start render-only fx time scaling");
  assert.strictEqual(full.debug.comboDrawn, true, "R71 full fx should draw the combo counter");
  assert.strictEqual(full.debug.fxTextureStatus, "loaded", "R71 Kenney particle textures should load before combat verification");
  assert(full.debug.fxTextureTintCount >= 20, `R71 should pre-render texture tints, got ${full.debug.fxTextureTintCount}`);
  assert(full.debug.texturedParticlesDrawn > 0, "R71 kill/hit effects should draw Kenney texture layers");
  assert.strictEqual(full.debug.vehicleNavigationLightsDrawn, 2, "full FX should draw two vehicle navigation lights");
  assert.strictEqual(full.debug.depthLayerTier, "full", "full FX should draw all land depth layers");
  assert(full.debug.scorchMarksDrawn > 0, "land kills should leave a fading scorch mark");

  const visualLanguage = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    const modes = ["standard", "spread", "fracture", "ember", "laser"];
    window.__test.setState({
      runMods: { weaponMode: "ember", weaponLevel: 1 },
      enemies: [],
      projectiles: modes.map((weaponMode, index) => ({
        id: `r71_visual_${weaponMode}`,
        sprite: "bullet_pulse",
        weaponMode,
        x: 64 + index * 30,
        y: 180,
        vx: 0,
        vy: -120,
        damage: 1,
        damageSources: [{ key: "land_rig", ratio: 1 }],
        vehicleId: "land_rig",
        pierce: 0,
        hitIds: {},
        radius: 3,
        rotation: -Math.PI / 2,
        life: 1,
        scale: 1
      })),
      vehicle: { weaponCooldown: 999, hp: state.vehicle.maxHp }
    });
    window.__test.step(0);
    return {
      debug: window.__test.getRenderDebug(),
      hudMode: document.getElementById("hud").dataset.weaponMode
    };
  });
  ["standard", "scatter", "fracture", "ember", "laser"].forEach((id) => {
    assert(visualLanguage.debug.projectileVisualModes[id] > 0, `R71 should render ${id} projectile language`);
  });
  assert.strictEqual(visualLanguage.hudMode, "ember", "power-up mode should update the HUD weapon signature immediately");

  const overlays = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    window.__test.setMeta(meta);
    window.__test.pushWave(5);
    window.__test.step(120);
    const boss = window.__test.getRenderDebug();
    const state = window.__test.getState();
    window.__test.setState({ vehicle: { hp: state.vehicle.maxHp * 0.2, weaponCooldown: 999 } });
    window.__test.step(16);
    const lowHp = window.__test.getRenderDebug();
    const reducedMeta = window.__test.getMeta();
    reducedMeta.settings.reducedFlash = true;
    window.__test.setMeta(reducedMeta);
    window.__test.step(16);
    return { boss, lowHp, reduced: window.__test.getRenderDebug() };
  });
  assert.strictEqual(overlays.boss.bossArrivalVignetteDrawn, true, "R71 boss arrival should pulse the full-field vignette");
  assert.strictEqual(overlays.lowHp.lowHpPulseDrawn, true, "R71 low HP should draw the full-screen red pulse");
  assert.strictEqual(overlays.lowHp.vehicleDamageSmokeDrawn, 2, "full FX should draw two low-HP smoke puffs");
  assert.strictEqual(overlays.reduced.bossArrivalVignetteDrawn, false, "reduced settings should suppress boss vignette pulse");
  assert.strictEqual(overlays.reduced.lowHpPulseDrawn, false, "reduced settings should suppress low-HP pulse");

  const reduced = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const meta = window.__test.getMeta();
    meta.settings.fxLevel = "reduced";
    meta.settings.reducedFlash = true;
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      supplyChoice: { dropId: "R71_supply_reduced", x: 52, y: 120, openedAt: state.time, rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards) },
      vehicle: { weaponCooldown: 999, hp: state.vehicle.maxHp * 0.3 }
    });
    window.__test.chooseSupplyReward("parts_cache");
    const boss = window.__test.spawnEnemy("boss_hive_titan", { id: "R71_boss_reduced", x: 96, y: 116, hp: 1, speed: 0, silent: true });
    window.__test.setState({
      projectiles: [
        { id: "R71_boss_reduced_shot", sprite: "bullet_cannon", x: boss.x, y: boss.y, vx: 0, vy: 0, damage: 20, damageSources: [{ key: "land_rig", ratio: 1 }], vehicleId: "land_rig", pierce: 0, hitIds: {}, radius: 8, rotation: 0, life: 1, scale: 1 }
      ]
    });
    window.__test.step(16);
    window.__test.step(16);
    return {
      state: window.__test.getState(),
      debug: window.__test.getRenderDebug()
    };
  });
  assert(!reduced.state.effects.some((effect) => effect.kind === "hud_fly" || effect.kind === "hud_pop"), "reduced settings should suppress HUD fly/pop flourish");
  assert.strictEqual(reduced.state.fxTimeScaleLeft, 0, "reduced settings should suppress boss render time scaling");
  assert.strictEqual(reduced.debug.comboDrawn, false, "reduced settings should not draw the combo counter");
  assert.strictEqual(reduced.debug.vehicleNavigationLightsDrawn, 1, "reduced FX should keep one steady navigation light");
  assert.strictEqual(reduced.debug.vehicleDamageSmokeDrawn, 1, "reduced FX should keep one steady damage-smoke puff");
  assert.strictEqual(reduced.debug.vehicleDamageSparksDrawn, 0, "reduced FX should suppress critical-hull sparks");
  assert.strictEqual(reduced.debug.depthLayerTier, "low", "reduced FX should use the low land depth tier");

  const deterministic = await page.evaluate(() => {
    function runCase(fxLevel, reducedFlash) {
      window.__test.startRun("land_rig", null, "r71_fx_determinism");
      const meta = window.__test.getMeta();
      meta.settings.performanceMode = "high";
      meta.settings.fxLevel = fxLevel;
      meta.settings.reducedFlash = reducedFlash;
      meta.settings.screenShake = true;
      window.__test.setMeta(meta);
      const state = window.__test.getState();
      window.__test.setState({
        time: 0,
        waveElapsed: 0,
        spawnIndex: 0,
        gateIndex: 0,
        enemies: [],
        projectiles: [],
        gates: [],
        hazards: [],
        supplyDrops: [],
        weaponPowerups: [],
        effects: [],
        wavePlan: {
          wave: 99,
          duration: 4,
          boss: false,
          gates: [],
          spawns: [
            { time: 0.12, enemyId: "runner", x: 70, y: 95, speed: 0, hp: 40 },
            { time: 0.32, enemyId: "shambler", x: 118, y: 104, speed: 0, hp: 60 },
            { time: 0.52, enemyId: "runner", x: 96, y: 88, speed: 0, hp: 40 }
          ]
        },
        vehicle: { weaponCooldown: 999, aimX: state.vehicle.x, aimY: state.vehicle.y - 160 }
      });
      const boss = window.__test.spawnEnemy("boss_hive_titan", { id: "r71_determinism_boss", x: 96, y: 116, hp: 1, speed: 0, silent: true });
      window.__test.setState({
        projectiles: [
          { id: "r71_determinism_shot", sprite: "bullet_cannon", x: boss.x, y: boss.y, vx: 0, vy: 0, damage: 20, damageSources: [{ key: "land_rig", ratio: 1 }], vehicleId: "land_rig", pierce: 0, hitIds: {}, radius: 8, rotation: 0, life: 1, scale: 1 }
        ]
      });
      window.__test.step(16);
      window.__test.step(640);
      const result = window.__test.getState();
      return {
        time: Number(result.time.toFixed(6)),
        waveElapsed: Number(result.waveElapsed.toFixed(6)),
        remainingSpawns: result.wavePlan.remainingSpawns,
        enemies: result.enemies.map((enemy) => enemy.enemyId).sort(),
        projectiles: result.projectiles.length,
        fxTimeScaleLeft: Number(result.fxTimeScaleLeft.toFixed(6))
      };
    }
    return {
      full: runCase("full", false),
      reduced: runCase("reduced", true)
    };
  });
  assert.strictEqual(deterministic.full.time, deterministic.reduced.time, "boss fx must not change logic time across full/reduced settings");
  assert.strictEqual(deterministic.full.waveElapsed, deterministic.reduced.waveElapsed, "boss fx must not change wave timing across full/reduced settings");
  assert.strictEqual(deterministic.full.remainingSpawns, deterministic.reduced.remainingSpawns, "boss fx must not change spawn timing across full/reduced settings");
  assert.deepStrictEqual(deterministic.full.enemies, deterministic.reduced.enemies, "boss fx must spawn the same enemies with the same seed across settings");
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
    deltas.sort((a, b) => a - b);
    const middle = Math.floor(deltas.length / 2);
    const median = deltas.length % 2 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2;
    return 1000 / median;
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
  assert(enemyDebug.enemyAnimatedDrawn > 0, "moving enemies should draw multi-frame raster animation");
  const enemyKindCount = await page.evaluate(() => Object.keys(window.DSConfig.ENEMIES).length);
  assert(enemyDebug.enemyTintCacheCount >= enemyKindCount, "enemy wasteland tints should be shared from offscreen caches");
  assert(["reduced", "full", "low-two"].includes(enemyDebug.enemyAnimationTier), `enemy animation quality tier should be tracked, got ${enemyDebug.enemyAnimationTier}`);
  assert.strictEqual(enemyDebug.roadDebrisStatus, "loaded", "Kenney road debris atlas should load on land runs");
  assert(enemyDebug.roadDebrisDrawn > 0, "land runs should draw sparse Kenney road debris");
  assert(
    ["loaded", "loading", "failed"].includes(enemyDebug.enemyImageStatus.shambler),
    `shambler raster status should be tracked, got ${enemyDebug.enemyImageStatus.shambler}`
  );

  const floor = windowlessFpsFloor();
  const firstFps = await sampleFps(page);
  if (Math.round(firstFps) < floor) await page.waitForTimeout(1000);
  const fps = Math.round(firstFps) >= floor ? firstFps : await sampleFps(page);
  assert(Math.round(fps) >= floor, `rough FPS should stay above floor after one cooldown retry, got ${firstFps.toFixed(1)} then ${fps.toFixed(1)}`);

  await page.evaluate(() => window.__test.step(3000));
  const gateState = await page.evaluate(() => window.__test.getState());
  assert(
    gateState.gates.length + gateState.stats.gatesTaken >= 1,
    "a gate pair should appear or be collected within the opening 11 seconds"
  );

  const animationTiers = await page.evaluate(() => {
    const cfg = window.DSConfig;
    const meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    window.__test.setMeta(meta);
    const state = window.__test.getState();
    window.__test.setState({ enemies: [], projectiles: [], gates: [], vehicle: { weaponCooldown: 999 } });
    window.__test.spawnEnemy("runner", { x: cfg.LOGIC.roadRight - 6, y: state.vehicle.y - 170, speed: 42, animPhase: 0, silent: true });
    window.__test.step(0);
    const first = window.__test.getRenderDebug();
    window.__test.step(130);
    const second = window.__test.getRenderDebug();
    meta.settings.performanceMode = "low";
    window.__test.setMeta(meta);
    // 低模換幀 cadence=clamp(fps*0.5,2,4)；runner fps=9 → cadence=4 → 每 250ms 換一幀。
    // 前進「剛好一個換幀週期」讓 floor 參數精確 +1.0，保證跨幀邊界（不依賴 CI 機速）；
    // 重新確保 runner 在低模取樣期間仍在移動。
    window.__test.setState({ enemies: [], projectiles: [], gates: [], vehicle: { weaponCooldown: 999 } });
    window.__test.spawnEnemy("runner", { x: cfg.LOGIC.roadRight - 6, y: state.vehicle.y - 170, speed: 42, animPhase: 0, silent: true });
    window.__test.step(0);
    const lowFirst = window.__test.getRenderDebug();
    window.__test.step(250);
    const lowSecond = window.__test.getRenderDebug();
    const result = {
      firstFrame: first.enemyAnimationFrames.runner,
      secondFrame: second.enemyAnimationFrames.runner,
      fullTier: second.enemyAnimationTier,
      facingLeft: second.enemyFacingLeftDrawn,
      lowFirstFrame: lowFirst.enemyAnimationFrames.runner,
      lowSecondFrame: lowSecond.enemyAnimationFrames.runner,
      lowTier: lowSecond.enemyAnimationTier
    };
    meta.settings.performanceMode = "auto";
    meta.settings.fxLevel = "reduced";
    window.__test.setMeta(meta);
    return result;
  });
  assert.notStrictEqual(animationTiers.firstFrame, animationTiers.secondFrame, "full-quality moving runner should advance its walk frame");
  assert.strictEqual(animationTiers.fullTier, "full", "high/full mode should use all four walk frames");
  assert(animationTiers.facingLeft > 0, "enemy moving left should render with horizontal facing flip");
  assert([0, 2].includes(animationTiers.lowFirstFrame), "low performance mode should sample one of the two authored walk poses");
  assert([0, 2].includes(animationTiers.lowSecondFrame), "low performance mode should sample one of the two authored walk poses");
  assert.notStrictEqual(animationTiers.lowFirstFrame, animationTiers.lowSecondFrame, "low performance mode must alternate two real walk frames");
  assert.strictEqual(animationTiers.lowTier, "low-two", "low performance mode should expose the two-frame tier");

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
  const nonCore = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    const gate = window.__test.spawnGate("damage_plus", {
      x: state.vehicle.x,
      y: state.vehicle.y - 160,
      hp: 20,
      coreRadius: 10
    });
    window.__test.setState({
      enemies: [],
      gates: [],
      projectiles: [],
      gateChoice: null,
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 }
    });
    const probe = Object.assign({}, gate, { hp: 20, maxHp: 20, coreRadius: 10 });
    window.__test.setState({
      gates: [probe],
      projectiles: [
        {
          id: "gate_non_core_probe",
          x: probe.x + 24,
          y: probe.y,
          vx: 0,
          vy: 0,
          damage: 9,
          radius: 4,
          rotation: 0,
          life: 1,
          vehicleId: "land_rig",
          weaponMode: "standard"
        }
      ]
    });
    window.__test.step(16);
    return window.__test.getState();
  });
  assert.strictEqual(nonCore.gates[0].hp, 20, "non-core projectile overlap should not damage gate hp");
  assert.strictEqual(nonCore.stats.gatesTaken, 0, "non-core projectile overlap should not resolve a gate");

  const core = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    const gates = window.__test.spawnGatePair(["damage_plus", "repair"]);
    const target = gates.find((gate) => gate.gateId === "damage_plus");
    window.__test.setState({
      enemies: [],
      hazards: [],
      supplyDrops: [],
      weaponPowerups: [],
      gates: window.__test.getState().gates.map((gate) => Object.assign({}, gate, { hp: gate.id === target.id ? 1 : gate.hp })),
      projectiles: [
        {
          id: "gate_core_probe",
          x: target.x,
          y: target.y,
          vx: 0,
          vy: 0,
          damage: 4,
          radius: 5,
          rotation: -Math.PI / 2,
          life: 1,
          vehicleId: "land_rig",
          weaponMode: "standard"
        }
      ],
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999, x: state.vehicle.x, followX: state.vehicle.x }
    });
    window.__test.step(16);
    return window.__test.getState();
  });
  assert.strictEqual(core.stats.gatesTaken, 1, "shooting a gate core should choose that gate");
  assert(core.runMods.damageAdd > 0, "breaking damage gate core should apply the gate mod");
  assert.strictEqual(core.gateChoice, null, "breaking a gate core should clear gate choice");
  assert.strictEqual(core.gates.length, 0, "resolved gate pair should be removed after core break");
  const resolvedPair = Object.values(core.gatePairs).find((pair) => pair.selectedGateId === "damage_plus");
  assert(resolvedPair && resolvedPair.status === "resolved" && resolvedPair.resolvedBy === "projectile", `gate pair should resolve by projectile: ${JSON.stringify(core.gatePairs)}`);
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
  await page.waitForSelector("#gateChoiceLayer:not([hidden])");
  const opened = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(opened.paused, false, "road gate choice should not pause the run");
  assert(opened.gateChoice && opened.gateChoice.gateIds.includes("rate_plus"), "gate choice state should list the rate option");
  assert.strictEqual(await page.locator("#gateChoiceOverlay").count(), 0, "gate modal should be removed from the DOM");
  const hint = await page.locator("#gateChoiceLayer").innerText();
  assert(hint.includes("射速") && hint.includes("維修"), `top hint should summarize both road gates: ${hint}`);
  await page.evaluate(() => {
    const state = window.__test.getState();
    const leftX = state.gates.find((gate) => gate.gateId === "rate_plus").x;
    window.__test.setState({
      gates: state.gates.map((gate) => Object.assign({}, gate, { y: state.vehicle.y - 1 })),
      vehicle: { x: leftX, followX: leftX }
    });
    window.__test.step(100);
  });
  await page.waitForFunction(() => window.__test.getState().stats.gatesTaken >= 1);
  const state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.paused, false, "driving through a gate should keep play running");
  assert.strictEqual(state.gateChoice, null, "crossing a gate should clear gate choice state");
  assert(state.runMods.fireIntervalMul < 1, "driving through the rate lane should apply the rate mod immediately");
  assert.strictEqual(state.gates.length, 0, "crossing one gate should remove the pair");
  assert(state.lastGateChoice && state.lastGateChoice.gateId === "rate_plus", "chosen gate should be recorded for feedback");
}

async function checkGatePairExpiryAndSupply(page) {
  const expired = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    const gates = window.__test.spawnGatePair(["damage_plus", "repair"]);
    const pairId = gates[0].pairId;
    window.__test.setState({
      enemies: [],
      projectiles: [],
      supplyDrops: [],
      weaponPowerups: [],
      companionCooldown: 999,
      vehicle: { x: state.vehicle.x, followX: state.vehicle.x, weaponCooldown: 999 },
      gates: window.__test.getState().gates.map((gate) => Object.assign({}, gate, { y: window.DSConfig.LOGIC.height + 90 }))
    });
    window.__test.step(16);
    return { state: window.__test.getState(), pairId };
  });
  assert.strictEqual(expired.state.gateChoice, null, "missed gate pair should clear gateChoice");
  assert.strictEqual(expired.state.gatePairs[expired.pairId].status, "expired", "missed gate pair should be marked expired");

  const supply = await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      supplyDrops: [
        { id: "after_expired_gate_supply", x: state.vehicle.x, y: state.vehicle.y - 3, vx: 0, vy: 0, radius: 12, age: 0, ttl: 30, picked: false }
      ],
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(80);
    return window.__test.getState();
  });
  assert(supply.supplyChoice && supply.supplyChoice.dropId === "after_expired_gate_supply", "supply should open after expired gate pair clears");

  const nextPair = await page.evaluate(() => {
    window.__test.chooseSupplyReward("repair");
    window.__test.setState({ gates: [], gateChoice: null });
    const gates = window.__test.spawnGatePair(["rate_plus", "barrier"]);
    return { state: window.__test.getState(), pairId: gates[0].pairId };
  });
  assert(nextPair.state.gateChoice && nextPair.state.gateChoice.pairId === nextPair.pairId, "next gate pair should open a fresh choice after expiry");
  assert.deepStrictEqual(nextPair.state.gateChoice.gateIds, ["rate_plus", "barrier"], "fresh gate choice should list the new pair options");
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
  await expandBaseMenu(page);
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
  await expandBaseMenu(page);
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
  assert(state.eventBanner && state.eventBanner.title.includes("星渣雨"), "event start should show the named HUD banner");
  assert(state.eventBanner.body.includes("目標"), "event banner should include short objective copy");

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

  const blackout = await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({ rng: () => 0.35, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(4);
    window.__test.step(16);
    const stateNow = window.__test.getState();
    return {
      eventId: stateNow.wavePlan.environmentEvent && stateNow.wavePlan.environmentEvent.id,
      configuredLoss: stateNow.wavePlan.environmentEvent && stateNow.wavePlan.environmentEvent.visibilityLoss,
      debug: window.__test.getRenderDebug()
    };
  });
  assert.strictEqual(blackout.eventId, "land_blackout", "middle land event roll should start blackout");
  assert(blackout.configuredLoss > 0, "land_blackout should carry visibilityLoss tuning");
  assert.strictEqual(blackout.debug.environmentOverlayDrawn, true, "visibilityLoss event should draw an environment overlay");
  assert.strictEqual(
    blackout.debug.environmentVisibilityLoss,
    blackout.configuredLoss,
    "visibilityLoss should be consumed by the render overlay"
  );

  await page.evaluate(() => {
    window.__test.startRun("land_rig");
    window.__test.setState({ rng: () => 0, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(8);
    window.__test.step(1600);
  });
  state = await page.evaluate(() => window.__test.getState());
  assert(state.enemies.some((enemy) => enemy.variantId), "late wave generation should spawn tinted variants");
}

async function checkR71SandstormComfort(page) {
  const result = await page.evaluate(() => {
    window.__test.clearStorage();
    let meta = window.__test.getMeta();
    meta.settings.performanceMode = "high";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    window.__test.setMeta(meta);
    window.__test.startRun("land_rig");
    window.__test.setState({ rng: () => 0, enemies: [], projectiles: [], gates: [], hazards: [] });
    window.__test.pushWave(4);
    window.__test.step(16);
    const eventId = window.__test.getState().wavePlan.environmentEvent.id;
    const full = window.__test.getRenderDebug();
    window.__test.step(1200);
    const fullLater = window.__test.getRenderDebug();

    meta = window.__test.getMeta();
    meta.settings.fxLevel = "reduced";
    meta.settings.reducedFlash = true;
    window.__test.setMeta(meta);
    window.__test.step(16);
    const reduced = window.__test.getRenderDebug();

    meta = window.__test.getMeta();
    meta.settings.performanceMode = "low";
    meta.settings.fxLevel = "full";
    meta.settings.reducedFlash = false;
    window.__test.setMeta(meta);
    window.__test.step(16);
    const low = window.__test.getRenderDebug();

    meta.settings.performanceMode = "auto";
    meta.settings.fxLevel = "reduced";
    window.__test.setMeta(meta);
    return { eventId, full, fullLater, reduced, low };
  });

  assert.strictEqual(result.eventId, "sandstorm", "low land event roll should select sandstorm");
  assert.strictEqual(result.full.sandstormFlowTier, "full");
  assert.strictEqual(result.full.sandstormFlickerHz, 0, "sandstorm must not use contrast flicker");
  assert(result.full.sandstormSaturation <= 0.5, "sandstorm color veil must stay desaturated");
  assert.strictEqual(result.full.sandstormIntensity, result.fullLater.sandstormIntensity, "sandstorm opacity must remain stable during sustained viewing");
  assert.strictEqual(result.reduced.sandstormFlowTier, "reduced");
  assert(result.reduced.sandstormIntensity <= result.full.sandstormIntensity * 0.5, "reduced mode must halve sandstorm intensity");
  assert(result.reduced.sandstormFlowCount < result.full.sandstormFlowCount, "reduced mode must also lower flowing dust density");
  assert.strictEqual(result.low.sandstormFlowTier, "low");
  assert(result.low.sandstormIntensity <= result.full.sandstormIntensity * 0.65, "low quality must further soften the sandstorm veil");
  assert(result.low.sandstormFlowCount < result.full.sandstormFlowCount, "low quality must use fewer soft dust elements");
}

async function checkR71EnemyRosterBehaviors(page) {
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
    window.__test.spawnEnemy("ash_screamer", { x: 112, y: state.vehicle.y - 104, speed: 0, hp: 120, attackCooldown: 0, silent: true });
    window.__test.spawnEnemy("chain_tether", { x: state.vehicle.x + 16, y: state.vehicle.y - 44, speed: 0, hp: 150, silent: true });
    window.__test.spawnEnemy("mirror_husk", { x: 164, y: state.vehicle.y - 154, speed: 0, hp: 120, silent: true });
    window.__test.spawnEnemy("ember_tick", { x: 58, y: state.vehicle.y - 130, speed: 0, hp: 80, silent: true });
    // R77/R78 ranged attacks resolve only on their authored impact beat. Give
    // both the 0.22s screamer and 0.35s spitter windups time to reach impact.
    for (let i = 0; i < 5; i += 1) window.__test.step(100);
  });
  await page.waitForFunction(() => {
    const state = window.__test.getState();
    const debug = window.__test.getRenderDebug();
    const ids = ["spore_spitter", "shield_husk", "swarm_mite", "tar_brute", "void_wraith", "ash_screamer", "chain_tether", "mirror_husk", "ember_tick"];
    return state.enemyProjectiles.length > 0 && ids.every((id) => debug.enemyImageStatus[id] === "loaded");
  });
  const result = await page.evaluate(() => {
    const state = window.__test.getState();
    const debug = window.__test.getRenderDebug();
    const byId = Object.fromEntries(state.enemies.map((enemy) => [enemy.enemyId, enemy]));
    return {
      enemyIds: state.enemies.map((enemy) => enemy.enemyId).sort(),
      enemyProjectiles: state.enemyProjectiles.length,
      screamProjectile: state.enemyProjectiles.some((shot) => shot.enemyId === "ash_screamer" && shot.kind === "scream" && shot.damage <= 8),
      spitterCooldown: byId.spore_spitter && byId.spore_spitter.attackCooldown,
      screamerCooldown: byId.ash_screamer && byId.ash_screamer.attackCooldown,
      bruteSlow: state.vehicle.slowUntil > state.time && state.vehicle.slowMul < 1,
      voidPhase: byId.void_wraith && byId.void_wraith.phaseActive === true,
      tetherSlowMul: byId.chain_tether && byId.chain_tether.behavior && byId.chain_tether.behavior.slowMul,
      mirrorShieldHp: byId.mirror_husk && byId.mirror_husk.shieldHp,
      emberBehavior: byId.ember_tick && byId.ember_tick.behavior && byId.ember_tick.behavior.type,
      rasterDrawn: debug.enemyRasterDrawn,
      animatedDrawn: debug.enemyAnimatedDrawn,
      armoredDrawn: debug.enemyArmoredDrawn,
      statuses: debug.enemyImageStatus
    };
  });
  assert.deepStrictEqual(
    result.enemyIds,
    ["shield_husk", "spore_spitter", "swarm_mite", "tar_brute", "void_wraith", "ash_screamer", "chain_tether", "mirror_husk", "ember_tick"].sort(),
    "R71 enemy roster should be spawnable"
  );
  assert(result.enemyProjectiles >= 2, "spore spitter and ash screamer should fire enemy projectiles");
  assert.strictEqual(result.screamProjectile, true, "ash screamer should fire low-damage scream projectiles");
  assert(result.spitterCooldown > 0, "spore spitter should reset attack cooldown after firing");
  assert(result.screamerCooldown > 0, "ash screamer should reset attack cooldown after firing");
  assert.strictEqual(result.bruteSlow, true, "tar brute should apply movement slow aura near the vehicle");
  assert.strictEqual(result.voidPhase, true, "void wraith should enter phase state");
  assert(result.tetherSlowMul >= 0.78, "chain tether should use the guarded slow multiplier");
  assert(result.mirrorShieldHp >= 40, "mirror husk should spawn with a strong front shield");
  assert.strictEqual(result.emberBehavior, "swarm", "ember tick should reuse swarm behavior");
  assert(result.rasterDrawn >= 9, `R71 enemies should draw raster sprites, got ${result.rasterDrawn}`);
  assert(result.animatedDrawn >= 9, `R71 enemies should draw animated atlases, got ${result.animatedDrawn}`);
  assert.strictEqual(result.armoredDrawn, 0, `brute/tether must not draw the retired Kenney tank armor, got ${result.armoredDrawn}`);
}

async function checkR71RunBarks(page) {
  const triggered = await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0,
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(3100);
    window.__test.setState({
      supplyChoice: {
        dropId: "bark_supply",
        x: 96,
        y: 160,
        openedAt: window.__test.getState().time,
        rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards)
      },
      paused: false
    });
    window.__test.chooseSupplyReward("parts_cache");
    window.__test.spawnGatePair(["gate_focus", "repair"]);
    window.__test.chooseGate("gate_focus");
    window.__test.spawnEnemy("boss_hive_titan", { x: 96, y: 100, hp: 1, speed: 0, silent: false });
    window.__test.killAllEnemies();
    const afterBoss = window.__test.getState();
    window.__test.setState({ vehicle: { hp: afterBoss.vehicle.maxHp, shield: 0 } });
    window.__test.damageVehicle(afterBoss.vehicle.maxHp * 0.8, { type: "enemy", enemyId: "shambler" });
    window.__test.pushWave(10);
    const state = window.__test.getState();
    return {
      seen: state.runBarksSeen,
      stats: state.stats.runBarks,
      focusUntil: state.runMods.focusUntil,
      paused: state.paused,
      banner: state.eventBanner
    };
  });
  ["sortie_start", "first_supply", "first_gate", "boss_radio", "boss_down", "critical_hull", "deep_route"].forEach((id) => {
    assert.strictEqual(triggered.seen[id], true, `${id} run bark should trigger once`);
    assert.strictEqual(triggered.stats[id], 1, `${id} run bark should be counted once`);
  });
  assert(triggered.focusUntil > 0, "gate_focus should apply during the run bark gate choice flow");
  assert.strictEqual(triggered.paused, false, "run barks should not leave the game paused");
  assert(triggered.banner && triggered.banner.kind === "story", "latest run bark should use the non-blocking event banner");

  const naturalDeepRoute = await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.pushWave(9);
    const before = window.__test.getState();
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      wavePlan: { spawns: [], gates: [], duration: 0, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0,
      waveElapsed: 0,
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(16);
    const after = window.__test.getState();
    return {
      beforeWave: before.wave,
      beforeSeen: before.runBarksSeen.deep_route === true,
      afterWave: after.wave,
      afterSeen: after.runBarksSeen.deep_route === true,
      afterStats: after.stats.runBarks.deep_route || 0
    };
  });
  assert.strictEqual(naturalDeepRoute.beforeWave, 9, "natural deep_route test should start on wave 9");
  assert.strictEqual(naturalDeepRoute.beforeSeen, false, "deep_route should not be pre-triggered before natural wave completion");
  assert.strictEqual(naturalDeepRoute.afterWave, 10, "empty wave plan should naturally advance from wave 9 to 10");
  assert.strictEqual(naturalDeepRoute.afterSeen, true, "deep_route should trigger on natural wave progression");
  assert.strictEqual(naturalDeepRoute.afterStats, 1, "natural deep_route trigger should be counted once");

  const disabled = await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.settings.showCompanion = false;
    window.__test.setMeta(meta);
    window.__test.startRun("land_rig");
    window.__test.setState({
      enemies: [],
      projectiles: [],
      gates: [],
      hazards: [],
      supplyDrops: [],
      enemyProjectiles: [],
      wavePlan: { spawns: [], gates: [], duration: 30, boss: false, environmentEvent: null },
      spawnIndex: 0,
      gateIndex: 0,
      companionCooldown: 999,
      vehicle: { weaponCooldown: 999 }
    });
    window.__test.step(3300);
    return window.__test.getState();
  });
  assert.deepStrictEqual(disabled.runBarksSeen, {}, "showCompanion=false should disable run barks");
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
  await expandBaseMenu(page);
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
  assert.strictEqual(state.paused, false, "touching a supply cache should keep combat running");
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
  assert.strictEqual(state.paused, false, "choosing a supply reward should keep the run active");
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
  assert(
    !banner.hidden && (banner.text.includes("Boss 來襲") || banner.text.includes("大地雷")),
    `boss alert or boss_radio bark should be visible, got ${banner.text}`
  );

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

  await page.reload({ waitUntil: "domcontentloaded" });
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
    await checkR71SandstormComfort(page);
    await checkR71EnemyRosterBehaviors(page);
    await checkR71RunBarks(page);
    await checkEventCodexAndAchievements(page);
    await checkSupplyDropPickupAndSettlement(page);
    await unlockFleet(page);
    await checkFleetProjectileTraits(page);
    await checkR71CombatRefresh(page);
    await checkR71DamageRegression(page);
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
  await checkR78AttackAtlasTiming(page);
  await checkFxIntegration(page);
  await checkR71JuiceFx(page);
  await dragAim(page);
  await killEnemiesAndEarnPreviewParts(page);
  await shootGate(page);
  await tapGateChoice(page);
  await checkGatePairExpiryAndSupply(page);
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
  await page.route("**/assets/enemies/*.png", (route) => {
    route.fulfill({ status: 404, contentType: "text/plain", body: "missing test zombie" });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
  await page.reload({ waitUntil: "domcontentloaded" });
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
    await page.goto(`${baseUrl}?swtest=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
    await page.waitForFunction(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.ready;
      return !!registration.active;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    await page.waitForFunction(async () => (await caches.keys()).some((key) => key.includes("ashes-convoy-r79")));

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
    assert(offlineShell.cacheKeys.some((key) => key.includes("ashes-convoy-r79")), "R79 cache should exist offline");
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
  const browserChannel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  const browser = await chromium.launch({
    channel: browserChannel,
    args: browserChannel ? [] : ["--disable-gpu", "--disable-accelerated-2d-canvas"]
  });
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
    await closeHarness(browser, server);
  }
})().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
