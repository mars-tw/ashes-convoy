"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { harness } = require("./mobile-r87-harness");
const out = path.resolve(__dirname, "../docs/evidence/r88-store");
fs.mkdirSync(out, { recursive: true });
const results = [];
const errors = [];
const external = [];
async function boot(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__test && window.__test.rasterAssetsReady(), null, { timeout: 180000 });
}
async function read(page) { return page.evaluate(() => window.__test.getState()); }
async function reachable(page, selector) {
  const result = await page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, inside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
  });
  assert(result.inside && result.hit && result.height >= 44, `${selector} reachable: ${JSON.stringify(result)}`);
  return result;
}
async function steer(page, touch) {
  if (touch) {
    const r = await page.locator("#virtualJoystick").boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    // Screen horizontal maps to world x only in portrait; in landscape use y.
    const landscape = await page.evaluate(() => gameCanvas.getBoundingClientRect().width > gameCanvas.getBoundingClientRect().height);
    await page.mouse.move(r.x + r.width / 2 + (landscape ? 0 : 32), r.y + r.height / 2 + (landscape ? 32 : 0));
  } else {
    const p = await page.evaluate(() => {
      const r = gameCanvas.getBoundingClientRect();
      return r.width > r.height ? { x: r.x + r.width * .55, y: r.y + r.height * .78 } : { x: r.x + r.width * .78, y: r.y + r.height * .5 };
    });
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
  }
  await page.waitForFunction(() => window.__test.getState().convoyTrial.stage === "shed", null, { timeout: 15000 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__test.getState().latch.latched >= 2, null, { timeout: 20000 });
}
harness(async (browser, url) => {
  for (const [width, height, touch] of [[375, 667, true], [390, 844, true], [430, 932, true], [440, 956, true], [844, 390, true], [768, 1024, true], [1024, 768, true], [1032, 1376, true], [1376, 1032, true], [1366, 600, false]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, serviceWorkers: "block" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", req => { if (new URL(req.url()).origin !== new URL(url).origin) external.push(req.url()); });
    await boot(page, url);
    const began = Date.now();
    const entry = await reachable(page, "#convoyTrialBtn");
    await page.locator("#convoyTrialBtn").click();
    assert.equal((await read(page)).wave, 1);
    await page.waitForTimeout(250);
    assert.equal((await read(page)).wave, 1, "idle first lesson cannot auto-complete an empty wave");
    assert(await page.locator("#convoyTrialHud").isVisible());
    assert(await page.locator("#routeHudBtn").isHidden(), "route missions start after the lesson");
    await steer(page, touch);
    const before = await read(page);
    assert.equal(before.stats.wavesCleared, 0, "lesson does not award free waves");
    assert(before.enemies.filter(e => e.latched).every(e => !e.dead), "climbers are active enemies");
    if (touch) { await reachable(page, "#touchBoostBtn"); await page.locator("#touchBoostBtn").click(); }
    else await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__test.getState().convoyTrial.stage === "supply");
    const flung = await read(page);
    assert(flung.stats.flung >= 2 && flung.stats.drifts >= 1, "normal UI drift must fling actual climbers");
    await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) [data-reward-id="repair_small"]');
    await page.waitForTimeout(400);
    for (const card of await page.locator("#supplyChoiceList button").all()) {
      const r = await card.boundingBox();
      assert(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1, "all supply choices fit");
    }
    await page.locator('[data-reward-id="repair_small"]').click();
    await page.waitForFunction(() => window.__test.getState().convoyTrial.stage === "complete");
    const complete = await read(page);
    assert.equal(complete.stats.supplyCratesCollected, 1);
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem(DSConfig.STORAGE_KEY)).tutorial.completedConvoyTrial), "saved before settlement");
    const seconds = (Date.now() - began) / 1000;
    assert(seconds < 180, "signature objective within three minutes");
    await reachable(page, "#pauseBtn");
    await page.locator("#pauseBtn").click();
    const frozen = (await read(page)).time;
    await page.waitForTimeout(150);
    assert.equal((await read(page)).time, frozen);
    await reachable(page, "#resumeBtn");
    await page.locator("#resumeBtn").click();
    assert.equal((await read(page)).paused, false);
    // Lifecycle event, not a claim of physical iOS background verification.
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    assert.equal((await read(page)).paused, true);
    assert.equal((await read(page)).input.dragging, false);
    await page.locator("#resumeBtn").click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("mars-native-state", { detail: { isActive: false } })));
    assert.equal((await read(page)).paused, true, "packager lifecycle signal pauses the game");
    await page.locator("#resumeBtn").click();
    if (width === 390) {
      await page.waitForFunction(() => document.getElementById("convoyTrialHud").hidden, null, { timeout: 15000 });
      await page.locator("#routeHudBtn").click();
      await page.locator('[data-route-id="salvage"]').click();
      await page.waitForFunction(() => !document.getElementById("eventBanner").hidden);
      assert((await page.locator("#eventBannerTitle").textContent()).includes("廢車場"), "normal route banners return after the lesson");
      await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) [data-reward-id="parts_cache"]');
      await page.waitForTimeout(400);
      await page.locator('[data-reward-id="parts_cache"]').click();
    }
    await page.locator("#routeHudBtn").click();
    await reachable(page, "#routeBoardCloseBtn");
    await page.locator("#routeBoardCloseBtn").click();
    await page.locator("#pauseBtn").click();
    await page.locator("#quitBtn").click();
    await page.locator("#garageBtn").click();
    const parts = await page.evaluate(() => window.__test.getMeta().parts);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__test && window.__test.getMeta().tutorial.completedConvoyTrial);
    assert((await page.locator("#convoyTrialBtn").textContent()).includes("已完成"));
    assert.equal(await page.evaluate(() => window.__test.getMeta().parts), parts);
    results.push({ viewport: [width, height], status: "VERIFIED", seconds, note: "並發載量測，僅供參考", entry, completedAt: complete.convoyTrial.completedAt, flung: complete.stats.flung, parts });
    console.log(`PASS R88 reviewer ${width}x${height} ${seconds.toFixed(1)}s`);
    await context.close();
  }
  // Real SW cold-reload offline path; no test state injection.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", req => { if (new URL(req.url()).origin !== new URL(url).origin) external.push(req.url()); });
  await boot(page, `${url}?swtest=1`);
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()), null, { timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 120000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__test && window.__test.rasterAssetsReady(), null, { timeout: 120000 });
  await page.locator("#convoyTrialBtn").click();
  await steer(page, true);
  await page.locator("#touchBoostBtn").click();
  await page.waitForSelector('#supplyChoiceOverlay:not([hidden]) [data-reward-id="repair_small"]');
  await page.waitForTimeout(400);
  await page.locator('[data-reward-id="repair_small"]').click();
  await page.waitForFunction(() => window.__test.getState().convoyTrial.stage === "complete");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__test && window.__test.getMeta().tutorial.completedConvoyTrial);
  results.push({ scenario: "offline-cold-reload-complete-and-reload", status: "VERIFIED" });
  console.log("PASS R88 offline review and persistence");
  await context.close();
  const limited = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await limited.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException("Simulated quota", "QuotaExceededError"); }; });
  const limitedPage = await limited.newPage();
  limitedPage.on("pageerror", e => errors.push(e.message));
  await boot(limitedPage, url);
  await limitedPage.locator("#convoyTrialBtn").click();
  await steer(limitedPage, true);
  await limitedPage.locator("#touchBoostBtn").click();
  await limitedPage.waitForSelector('#supplyChoiceOverlay:not([hidden]) [data-reward-id="repair_small"]');
  await limitedPage.waitForTimeout(400);
  await limitedPage.locator('[data-reward-id="repair_small"]').click();
  await limitedPage.waitForFunction(() => window.__test.getState().convoyTrial.stage === "complete");
  assert.equal((await read(limitedPage)).convoyTrial.persisted, false);
  assert((await limitedPage.locator("#convoyTrialHud").textContent()).includes("尚未保存"), "storage failure cannot claim saved");
  await limitedPage.reload({ waitUntil: "domcontentloaded" });
  await limitedPage.waitForFunction(() => window.__test);
  assert.equal(await limitedPage.evaluate(() => window.__test.getMeta().tutorial.completedConvoyTrial), false);
  await limited.close();
  results.push({ scenario: "storage-quota-no-crash-no-false-save", status: "VERIFIED" });
  console.log("PASS R88 storage quota does not claim a saved checkpoint");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(path.join(out, "reviewer-path.json"), JSON.stringify({ status: "VERIFIED", version: require("../src/version").APP_VERSION, results, errors, externalRequests: external, limitations: ["Headless Chromium; not physical iOS/Android lifecycle or human beta", "Existing npm regression covers legacy controls and attack impact/hurt/death", "Live unfinished runs restart; completed trial and settled progression persist"] }, null, 2));
  console.log(`R88 reviewer VERIFIED ${results.length}/${results.length}`);
}).catch(error => { fs.writeFileSync(path.join(out, "reviewer-failure.txt"), String(error.stack)); console.error(error); process.exitCode = 1; });
