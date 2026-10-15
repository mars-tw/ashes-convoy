"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { harness } = require("./mobile-r87-harness");
harness(async (browser, url) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  // Test fixture only: existing walk frames exercise optional action loading.
  // This is never a production declaration or accepted cling artwork.
  await page.route("**/src/config.js*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.DSConfig.ENEMIES.runner.spriteActions.latch = { image: "assets/enemies/oga_runner_walk.png", frames: 4, frameWidth: 40, frameHeight: 40, fps: 5 };' });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__test && window.__test.rasterAssetsReady());
  const result = await page.evaluate(() => {
    const t = window.__test;
    t.startRun("land_rig");
    const m = t.getMeta(); m.settings.performanceMode = "high"; t.setMeta(m);
    const s = t.getState();
    t.setState({ enemies: [], projectiles: [], wavePlan: { spawns: [], gates: [], duration: 999, boss: false }, vehicle: { weaponCooldown: 999 } });
    t.spawnEnemy("runner", { x: s.vehicle.x - 6, y: s.vehicle.y - 2, hp: 9999 });
    t.step(50);
    const enemies = t.getState().enemies;
    enemies[0].latched.nextBiteAt = 999;
    t.setState({ enemies });
    const high = new Set(), low = new Set();
    for (let i = 0; i < 12; i++) { t.step(160); const d = t.getRenderDebug(); if (d.enemyLatchAtlasDrawn) high.add(d.enemyAnimationFrames.runner); }
    m.settings.performanceMode = "low"; t.setMeta(m);
    for (let i = 0; i < 12; i++) { t.step(160); const d = t.getRenderDebug(); if (d.enemyLatchAtlasDrawn) low.add(d.enemyAnimationFrames.runner); }
    // Attack must override the cling action, with damage only on its hit frame.
    const e = t.getState().enemies; e[0].latched.nextBiteAt = 0; t.setState({ enemies: e });
    let attack = false;
    for (let i = 0; i < 24; i++) { t.step(16); if (t.getRenderDebug().enemyAttackAtlasDrawn) attack = true; }
    return { high: [...high], low: [...low], attack, fallback: t.getRenderDebug().enemyFallbackDrawn };
  });
  assert.equal(result.high.length, 4, "high uses four independent fixture poses");
  assert.equal(result.low.length, 2, "low still uses two real poses");
  assert(result.attack, "bite anticipation/impact/recovery overrides idle cling poses");
  assert.equal(result.fallback, 0);
  await context.close();
  const normal = await browser.newContext({ serviceWorkers: "block" });
  const p = await normal.newPage(); await p.goto(url);
  await p.waitForFunction(() => window.__test && window.__test.rasterAssetsReady());
  const cache = await p.evaluate(() => {
    const t = window.__test; t.startRun("land_rig");
    const m = t.getMeta(); m.settings.performanceMode = "high"; t.setMeta(m);
    t.setState({ enemies: [], projectiles: [], wavePlan: { spawns: [], gates: [], duration: 999, boss: false }, vehicle: { weaponCooldown: 999 } });
    for (let i = 0; i < 10; i++) t.spawnEnemy("runner", { x: 45 + i * 9, y: 75, hp: 9999, speed: 0, filter: `brightness(${1 + i / 20})`, noLatch: true });
    // Diagnostics snapshot cache counts at draw start; allow one full bake draw.
    t.step(16); t.step(16); const first = t.getRenderDebug().enemyFilterCacheCount;
    for (let i = 0; i < 30; i++) t.step(16);
    return { first, last: t.getRenderDebug().enemyFilterCacheCount, drawn: t.getRenderDebug().enemyRasterDrawn, cling: t.getRenderDebug().enemyLatchAtlasDrawn };
  });
  assert.equal(cache.first, 8, "per-atlas filter cache is bounded");
  assert.equal(cache.last, 8, "frames reuse the bounded atlas cache");
  assert.equal(cache.drawn, 10, "cache limit does not drop enemies");
  assert.equal(cache.cling, 0, "production has no unverified cling asset enabled");
  await normal.close();
  const out = path.resolve(__dirname, "../docs/evidence/r88-store/animation-pipeline.json");
  fs.writeFileSync(out, JSON.stringify({ status: "VERIFIED", fixtureOnly: true, productionClingArt: "BLOCKED", result, cache }, null, 2));
  console.log("R88 animation pipeline + bounded filter cache VERIFIED");
}).catch(e => { console.error(e); process.exitCode = 1; });
