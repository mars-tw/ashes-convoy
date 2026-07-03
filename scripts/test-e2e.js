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
  ".json": "application/json; charset=utf-8"
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
  await page.evaluate(() => window.__test.step(8000));
  const opening = await page.evaluate(() => window.__test.getState());
  assert(
    opening.enemies.length >= 8,
    `opening horde should have at least 8 enemies on screen, got ${opening.enemies.length}`
  );

  const fps = await sampleFps(page);
  assert(fps >= windowlessFpsFloor(), `rough FPS should stay above floor, got ${fps.toFixed(1)}`);

  await page.evaluate(() => window.__test.step(18000));
  const gateState = await page.evaluate(() => window.__test.getState());
  assert(
    gateState.gates.length + gateState.stats.gatesTaken >= 1,
    "a gate pair should appear or be collected within the opening 30 seconds"
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
  assert(settlementText.includes("70"), `settlement should show 70 earned parts: ${settlementText}`);
  let meta = await page.evaluate(() => window.__test.getMeta());
  assert(meta.parts >= 70, "settlement should persist earned parts");

  await page.click("#garageBtn");
  await page.waitForSelector("#garagePanel:not([hidden])");
  await page.click('[data-upgrade="hull"]');
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.vehicleLevels.iron_crow.hull, 1, "hull upgrade should be bought");

  await page.click("#startBtn");
  const upgradedRun = await page.evaluate(() => ({
    state: window.__test.getState(),
    baseHp: window.DSConfig.VEHICLES.iron_crow.hp
  }));
  assert(upgradedRun.state.vehicle.maxHp > upgradedRun.baseHp, "new run should use upgraded hp");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  meta = await page.evaluate(() => window.__test.getMeta());
  assert.strictEqual(meta.vehicleLevels.iron_crow.hull, 1, "reload should preserve upgrade level");
}

async function runScenario(browser, baseUrl, viewport, full) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady());
  await page.evaluate(() => window.__test.clearStorage());
  await page.click("#startBtn");
  await page.waitForFunction(() => window.__test.getState().mode === "playing");
  await page.evaluate(() => window.__test.step(180));
  await expectCanvasHasPixels(page);
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
    console.log("E2E tests PASS");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
