"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const MIN_HIT_SIZE = 44;
const READY_TIMEOUT_MS = 60000;

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

const DESKTOP_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 780 },
  { width: 1366, height: 600 },
  { width: 1280, height: 640 }
];

const MOBILE_VIEWPORT = { width: 390, height: 844 };

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

async function waitForGarageReady(page) {
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { timeout: READY_TIMEOUT_MS });
  await page.waitForSelector("#garagePanel:not([hidden])", { timeout: READY_TIMEOUT_MS });
  await page.waitForSelector("#hotspotLayer:not([hidden])", { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const state = window.__test.getShelterState();
    if (state.backgroundMode === "image") return state.imageLoaded === true;
    if (state.backgroundMode === "scene") return state.lastDrawMs > 0;
    return false;
  }, null, { timeout: READY_TIMEOUT_MS });
}

async function resetGarage(page) {
  await page.evaluate(() => window.__test.clearStorage());
  await waitForGarageReady(page);
}

function accessSpecs(selectors) {
  return selectors.map((selector) => ({ selector }));
}

async function assertControlsAccessible(page, specs, label, options = {}) {
  const result = await page.evaluate(({ specs: inputSpecs, minHitSize, noOverlap }) => {
    const failures = [];
    const controls = [];
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const tolerance = 0.5;

    function isVisible(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      let node = element;
      while (node && node.nodeType === 1) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        node = node.parentElement;
      }
      return true;
    }

    function nameFor(element, selector, index) {
      return element.id ? `#${element.id}` : `${selector}[${index}]`;
    }

    for (const spec of inputSpecs) {
      const nodes = Array.from(document.querySelectorAll(spec.selector));
      if (!nodes.length && spec.required !== false) {
        failures.push(`${spec.selector} missing`);
        continue;
      }
      nodes.forEach((element, index) => {
        const name = nameFor(element, spec.selector, index);
        if (!isVisible(element)) {
          if (spec.required !== false) failures.push(`${name} not visible`);
          return;
        }
        const rect = element.getBoundingClientRect();
        const center = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
        const sampleX = Math.max(0, Math.min(viewport.width - 1, center.x));
        const sampleY = Math.max(0, Math.min(viewport.height - 1, center.y));
        const hit = document.elementFromPoint(sampleX, sampleY);
        const hitOwn = !!(hit && (hit === element || element.contains(hit)));
        const fullyInside =
          rect.left >= -tolerance &&
          rect.top >= -tolerance &&
          rect.right <= viewport.width + tolerance &&
          rect.bottom <= viewport.height + tolerance;
        const centerInside =
          center.x >= 0 &&
          center.x <= viewport.width &&
          center.y >= 0 &&
          center.y <= viewport.height;

        if (!fullyInside) failures.push(`${name} clipped ${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}`);
        if (!centerInside) failures.push(`${name} center outside viewport`);
        if (!hitOwn) failures.push(`${name} center hit ${hit ? (hit.id ? `#${hit.id}` : hit.tagName) : "null"}`);
        if (rect.width + tolerance < minHitSize || rect.height + tolerance < minHitSize) {
          failures.push(`${name} hit size ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
        controls.push({
          name,
          rect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          }
        });
      });
    }

    if (noOverlap !== false) {
      for (let i = 0; i < controls.length; i += 1) {
        for (let j = i + 1; j < controls.length; j += 1) {
          const a = controls[i].rect;
          const b = controls[j].rect;
          const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (x > 1 && y > 1) failures.push(`${controls[i].name} overlaps ${controls[j].name}`);
        }
      }
    }

    return { failures, controls };
  }, { specs, minHitSize: MIN_HIT_SIZE, noOverlap: options.noOverlap });

  assert.deepStrictEqual(result.failures, [], `${label} accessibility failures`);
  return result.controls;
}

async function assertScrolledControl(page, selector, label) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  await assertControlsAccessible(page, accessSpecs([selector]), label, { noOverlap: false });
  await assertControlsAccessible(page, accessSpecs(["#closeMetaDrawer"]), `${label} close button`, { noOverlap: false });
}

async function assertDesktopTouchControlsAbsent(page, label) {
  const result = await page.evaluate(() => {
    function visible(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      let node = element;
      while (node && node.nodeType === 1) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        node = node.parentElement;
      }
      return true;
    }
    const touchControls = document.getElementById("touchControls");
    return {
      primaryCoarse: window.matchMedia("(pointer: coarse)").matches,
      touchClass: touchControls.classList.contains("is-visible"),
      touchVisible: visible(touchControls),
      joystickVisible: visible(document.getElementById("virtualJoystick")),
      boostVisible: visible(document.getElementById("touchBoostBtn")),
      skillVisible: visible(document.getElementById("touchSkillBtn")),
      weaponVisible: visible(document.getElementById("touchWeaponBtn"))
    };
  });
  assert.strictEqual(result.primaryCoarse, false, `${label} should emulate a fine primary pointer`);
  assert.strictEqual(result.touchClass, false, `${label} should not set touch-controls is-visible`);
  assert.strictEqual(result.touchVisible, false, `${label} should not show touch controls`);
  assert.strictEqual(result.joystickVisible, false, `${label} should not show joystick`);
  assert.strictEqual(result.boostVisible || result.skillVisible || result.weaponVisible, false, `${label} should not show touch action buttons`);
}

async function checkDesktopViewport(browser, baseUrl, viewport) {
  const label = `desktop ${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({
    viewport,
    hasTouch: false,
    isMobile: false,
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS });
    await waitForGarageReady(page);
    await resetGarage(page);

    await assertControlsAccessible(
      page,
      accessSpecs([
        "#railUpgradeBtn",
        "#railVehicleBtn",
        "#railOpsBtn",
        "#railAchievementsBtn",
        "#railSettingsBtn",
        "#sortieBtn",
        "#baseToggleBtn"
      ]),
      `${label} rails and primary CTAs`
    );

    await page.click("#baseToggleBtn");
    await page.waitForSelector("#baseActions:not([hidden])");
    await assertControlsAccessible(
      page,
      accessSpecs([
        "#sortieBtn",
        "#baseToggleBtn",
        "#upgradeHotspotBtn",
        "#vehicleHotspotBtn",
        "#seriesHotspotBtn",
        "#trailerHotspotBtn",
        "#opsHotspotBtn",
        "#resetOverlayBtn"
      ]),
      `${label} expanded base actions`
    );

    await page.click("#railSettingsBtn");
    await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
    for (const selector of [
      "#aimAssistLevelSelect",
      "#screenShakeToggle",
      "#reducedFlashToggle",
      "#soundToggle",
      "#sfxVolumeSelect",
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
      await assertScrolledControl(page, selector, `${label} settings ${selector}`);
    }

    await page.click("#railVehicleBtn");
    await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="vehicle"]:not([hidden])');
    await assertControlsAccessible(
      page,
      accessSpecs(["#closeMetaDrawer", "#resetBtn", "#selectSkiffBtn"]),
      `${label} base drawer key actions`
    );

    await page.click("#closeMetaDrawer");
    await page.waitForFunction(() => document.getElementById("metaDrawer").hidden === true);
    await page.click("#baseToggleBtn");
    await page.waitForSelector("#baseActions:not([hidden])");
    await page.click("#trailerHotspotBtn");
    await page.waitForSelector("#trailerOverlay:not([hidden])");
    await assertControlsAccessible(
      page,
      accessSpecs(["#storyLogBtn", "#closeTrailerRoomBtn"]),
      `${label} trailer modal close`
    );
    await page.click("#closeTrailerRoomBtn");

    await page.evaluate(() => {
      const meta = window.__test.getMeta();
      meta.parts = 10000;
      window.__test.setMeta(meta);
      window.__test.startRun("land_rig");
    });
    await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { timeout: READY_TIMEOUT_MS });
    await assertDesktopTouchControlsAbsent(page, `${label} in-run`);
    const runBeforeRail = await page.evaluate(() => {
      const state = window.__test.getState();
      return { seed: state.seed, wave: state.wave, time: state.time };
    });
    await page.click("#railSettingsBtn");
    await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
    const drawerRunState = await page.evaluate(() => window.__test.getState());
    assert.strictEqual(drawerRunState.mode, "paused", `${label} rail drawer should pause the existing run`);
    await page.click("#closeMetaDrawer");
    await page.waitForFunction(() => document.getElementById("metaDrawer").hidden === true && window.__test.getState().mode === "playing");
    const runAfterRail = await page.evaluate(() => {
      const state = window.__test.getState();
      return {
        seed: state.seed,
        wave: state.wave,
        paused: state.paused,
        garageHidden: document.getElementById("garagePanel").hidden,
        pauseHidden: document.getElementById("pausePanel").hidden
      };
    });
    assert.strictEqual(runAfterRail.seed, runBeforeRail.seed, `${label} closing rail drawer should keep the same run seed`);
    assert.strictEqual(runAfterRail.wave, runBeforeRail.wave, `${label} closing rail drawer should keep the same run wave`);
    assert.strictEqual(runAfterRail.paused, false, `${label} closing rail drawer should resume the original run`);
    assert.strictEqual(runAfterRail.garageHidden, true, `${label} closing rail drawer should leave garage hidden`);
    assert.strictEqual(runAfterRail.pauseHidden, true, `${label} closing rail drawer should leave pause panel hidden`);
    await page.evaluate(() => {
      const state = window.__test.getState();
      const canvas = document.getElementById("gameCanvas");
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + (state.vehicle.x / window.DSConfig.LOGIC.width) * rect.width;
      const clientY = rect.top + (state.vehicle.y / window.DSConfig.LOGIC.height) * rect.height;
      const fire = (type) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 91,
        pointerType: "mouse",
        isPrimary: true,
        clientX,
        clientY
      }));
      fire("pointerdown");
      fire("pointerup");
    });
    await page.waitForSelector("#quickUpgradeWheel:not([hidden])");
    await assertControlsAccessible(page, accessSpecs(["#quickUpgradeWheel"]), `${label} quick wheel frame`, { noOverlap: false });
    await assertControlsAccessible(
      page,
      [{ selector: "#quickUpgradeCloseBtn" }, { selector: ".quick-upgrade-option" }],
      `${label} quick wheel buttons`
    );

    console.log(`R76 controls PASS ${label}`);
  } finally {
    await context.close();
  }
}

async function checkMobileViewport(browser, baseUrl) {
  const label = `mobile ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}`;
  const context = await browser.newContext({
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS });
    await waitForGarageReady(page);
    await resetGarage(page);
    await page.evaluate(() => window.__test.startRun("land_rig"));
    await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { timeout: READY_TIMEOUT_MS });
    await page.waitForSelector(".touch-controls.is-visible");
    const state = await page.evaluate(() => ({
      primaryCoarse: window.matchMedia("(pointer: coarse)").matches,
      leftRailVisible: getComputedStyle(document.querySelector(".rail-left")).display !== "none",
      rightRailVisible: getComputedStyle(document.querySelector(".rail-right")).display !== "none"
    }));
    assert.strictEqual(state.primaryCoarse, true, `${label} should use a coarse primary pointer`);
    assert.strictEqual(state.leftRailVisible || state.rightRailVisible, false, `${label} should not show desktop rails`);
    await assertControlsAccessible(
      page,
      accessSpecs(["#virtualJoystick", "#touchBoostBtn", "#touchSkillBtn", "#touchWeaponBtn"]),
      `${label} touch controls`
    );
    console.log(`R76 controls PASS ${label}`);
  } finally {
    await context.close();
  }
}

(async () => {
  const { server, url } = await startServer();
  const browserChannel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  const browser = await chromium.launch({
    channel: browserChannel,
    args: browserChannel ? [] : ["--disable-gpu", "--disable-accelerated-2d-canvas"]
  });
  try {
    for (const viewport of DESKTOP_VIEWPORTS) {
      await checkDesktopViewport(browser, url, viewport);
    }
    await checkMobileViewport(browser, url);
    console.log("R76 controls tests PASS");
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
