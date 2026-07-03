"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
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
    if (state.backgroundMode === "image") return true;
    // 圖片仍在載入時不要過早接受 scene fallback（避免 CI 上時序誤判）
    const img = document.getElementById("shelterImage");
    if (img && !img.hidden && !img.complete) return false;
    return state.backgroundMode === "scene" && state.lastDrawMs > 0;
  });
  const state = await page.evaluate(() => window.__test.getShelterState());
  if (state.backgroundMode === "image") {
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
        objectPosition: style.objectPosition
      };
    });
    assert(!image.hidden, "shelter image should be visible when background mode is image");
    assert(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, "shelter image should load successfully");
    assert(image.width > 0 && image.height > 0, "shelter image should cover a visible area");
    assert.strictEqual(image.objectFit, "cover", "shelter image should use cover-fit");
    assert(image.objectPosition.includes("50%"), "shelter image should stay centered");
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

async function checkThemeSwitch(page, persistReload) {
  const ids = await page.evaluate(() => Object.keys(window.DSConfig.SHELTER_THEMES));
  assert.deepStrictEqual(ids.sort(), ["bunker", "greenhouse", "snow", "workshop"], "all four shelter themes should exist");
  const seen = new Set([await page.evaluate(() => window.__test.getMeta().shelterTheme)]);
  for (let i = 1; i < ids.length; i += 1) {
    const before = await page.evaluate(() => window.__test.getMeta().shelterTheme);
    await page.click("#themeCycleBtn");
    await page.waitForFunction((previous) => window.__test.getMeta().shelterTheme !== previous, before);
    await waitForMetaBackground(page);
    seen.add(await page.evaluate(() => window.__test.getMeta().shelterTheme));
  }
  ids.forEach((id) => assert(seen.has(id), `theme cycle should reach ${id}`));

  const invalid = await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.shelterTheme = "not_a_theme";
    return window.__test.setMeta(meta).shelterTheme;
  });
  assert.strictEqual(invalid, "snow", "invalid shelter theme should migrate back to snow");
  await waitForMetaBackground(page);

  await page.evaluate(() => window.__test.setShelterTheme("greenhouse"));
  await waitForMetaBackground(page);
  if (persistReload) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
    await waitForMetaBackground(page);
    const reloaded = await page.evaluate(() => window.__test.getMeta().shelterTheme);
    assert.strictEqual(reloaded, "greenhouse", "selected shelter theme should persist after reload");
  }
}

async function checkClearStorageButton(page) {
  await page.evaluate(() => {
    const meta = window.__test.getMeta();
    meta.parts = 77;
    meta.shelterTheme = "workshop";
    window.__test.setMeta(meta);
  });
  await waitForMetaBackground(page);
  await page.click("#resetOverlayBtn");
  await page.waitForFunction(() => {
    const meta = window.__test.getMeta();
    return meta.parts === 0 && meta.shelterTheme === "snow";
  });
}

async function checkShelterMeta(page, persistThemeReload) {
  await page.waitForSelector("#garagePanel:not([hidden])");
  await expectMetaBackground(page);
  await checkMetaHotspotsFit(page);
  await checkThemeSwitch(page, persistThemeReload);
  await checkClearStorageButton(page);
  await expectMetaBackground(page);
  await openUpgradePanel(page);
  const drawer = await page.locator("#metaDrawer").evaluate((node) => ({
    hidden: node.hidden,
    title: document.getElementById("metaDrawerTitle").textContent
  }));
  assert(!drawer.hidden && drawer.title.includes("升級"), "upgrade hotspot should open the upgrade drawer");
}

async function dragAim(page) {
  const box = await page.locator("#gameCanvas").boundingBox();
  assert(box, "canvas bounding box should exist");
  const before = await page.evaluate(() => window.__test.getState().vehicle);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.78);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.24, { steps: 8 });
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
  assert(after.projectile, "auto fire should create a projectile after drag");
  assert(after.projectile.vx > 10, "projectile should point toward the dragged aim direction");
  assert(after.projectile.vy < -40, "projectile should travel upward");
}

async function checkGarageUpgradeLines(page) {
  await openUpgradePanel(page);
  const tracks = await page.locator("[data-upgrade]").evaluateAll((nodes) => nodes.map((node) => node.dataset.upgrade));
  assert.deepStrictEqual(tracks.sort(), ["energy", "gate", "hull", "weapon"], "garage should show all four upgrade tracks");
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
        imageStatus: debug.vehicleImageStatus
      };
    }, vehicleId);
    assert.strictEqual(result.vehicleId, vehicleId, `${vehicleId} should be the active vehicle`);
    assert.strictEqual(result.environment, result.expectedEnvironment, `${vehicleId} should draw its environment`);
    assert(result.raster || result.fallback, `${vehicleId} should draw raster vehicle or fallback sprite`);
    assert(result.kills >= 1, `${vehicleId} should be able to shoot and kill`);
  }
  await page.evaluate(() => window.__test.showGarage());
  await page.waitForSelector("#garagePanel:not([hidden])");
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

async function spawnBoss(page) {
  await page.evaluate(() => {
    window.__test.setState({ enemies: [], projectiles: [], gates: [] });
    window.__test.pushWave(5);
    window.__test.step(1600);
  });
  const state = await page.evaluate(() => window.__test.getState());
  assert.strictEqual(state.wave, 5);
  assert(state.enemies.some((enemy) => enemy.enemyId === "boss_hive_titan" && enemy.boss), "wave 5 should spawn boss");
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
  assert(settlementText.includes("109"), `settlement should show 109 earned parts: ${settlementText}`);
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
  await checkGarageUpgradeLines(page);
  if (full) {
    await checkFleetProjectileTraits(page);
    await checkVehicleFleetSelectionAndCombat(page);
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
  await dragAim(page);
  await killEnemiesAndEarnPreviewParts(page);
  await shootGate(page);
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
  await page.route("**/assets/shelter/*.png", (route) => {
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
    console.log("E2E tests PASS");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
