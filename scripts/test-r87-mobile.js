"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { harness, boot, outDir } = require("./mobile-r87-harness");
let passed = 0;
const outcomes = [];
async function check(name, run) { await run(); passed++; console.log(`PASS R87 ${name}`); }
const intersects = (a, b) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
async function state(page) { return page.evaluate(() => window.__test.getState()); }
async function fresh(page, url) { await boot(page, url); }
async function accept(page, id) {
  await page.locator("#routeHudBtn").click();
  await page.locator(`[data-route-id="${id}"]`).click();
  await page.evaluate(() => window.__test.step(80));
}
async function supply(page, id) {
  await page.waitForSelector(`#supplyChoiceOverlay:not([hidden]) [data-reward-id="${id}"]`);
  await page.waitForTimeout(350);
  await page.locator(`[data-reward-id="${id}"]`).tap();
}
async function point(page, x, y) {
  return page.evaluate(([x, y]) => {
    const r = gameCanvas.getBoundingClientRect();
    return r.width > r.height ? { x: r.x + (1 - y / 422) * r.width, y: r.y + x / 195 * r.height } : { x: r.x + x / 195 * r.width, y: r.y + y / 422 * r.height };
  }, [x, y]);
}
async function touchDrift(page, mode = "tap") {
  const r = await page.locator("#touchBoostBtn").boundingBox();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  if (mode === "outside") await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 100, y: y - 100, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: mode === "cancel" ? "touchCancel" : "touchEnd", touchPoints: [] });
  await cdp.detach();
}
harness(async (browser, url) => {
  const geometries = [];
  for (const [width, height] of [[390, 844], [844, 390], [360, 640], [1366, 600], [1280, 640]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000, serviceWorkers: "block" });
    const page = await context.newPage();
    await fresh(page, url);
    await check(`${width}x${height} 控制、路線與返回可達`, async () => {
      const metrics = await page.evaluate(() => {
        const ids = ["routeHudBtn", "pauseBtn", ...(matchMedia("(pointer: coarse)").matches ? ["virtualJoystick", "touchBoostBtn", "touchSkillBtn", "touchWeaponBtn", "touchPauseBtn"] : [])];
        return ids.map(id => { const el = document.getElementById(id), r = el.getBoundingClientRect(); return { id, x: r.x, y: r.y, width: r.width, height: r.height, hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; });
      });
      for (const r of metrics) {
        assert(r.width >= 44 && r.height >= 44, `${r.id} >=44px`);
        assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1, `${r.id} inside viewport`);
        assert(r.hit, `${r.id} not obscured`);
        for (const other of metrics) if (r.id !== other.id) assert(!intersects(r, other), `${r.id}/${other.id} overlap`);
      }
      geometries.push({ width, height, metrics });
      await page.locator("#routeHudBtn").click();
      assert.equal((await state(page)).paused, true);
      assert(await page.locator("#pausePanel").isHidden());
      const time = (await state(page)).time;
      await page.waitForTimeout(150);
      assert.equal((await state(page)).time, time, "route board freezes combat");
      for (const button of await page.locator("#routeBoard button").all()) {
        const r = await button.boundingBox();
        assert(r.height >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height, "cards and return visible");
      }
      await page.locator("#routeBoardCloseBtn").click();
      assert.equal((await state(page)).paused, false);
    });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await check("救援原生補給、搭配與完成收益", async () => {
    await fresh(page, url);
    await page.evaluate(() => { const s = window.__test.getState(); window.__test.setState({ vehicle: { hp: s.vehicle.maxHp / 2 } }); });
    const before = (await state(page)).vehicle.hp;
    await accept(page, "rescue");
    assert(await page.locator('[data-reward-id="repair_small"] .route-supply-note').isVisible());
    await page.locator("#touchSkillBtn").tap();
    assert((await state(page)).supplyChoice, "utility key must not bypass explicit supply choice or its input guard");
    assert.equal((await state(page)).stats.supplyCratesCollected, 0);
    await supply(page, "repair_small");
    const s = await state(page);
    assert.equal(s.routeContract.status, "completed");
    assert(s.routeContract.bonusUsed && s.vehicle.hp >= before + s.vehicle.maxHp * 0.13);
    assert(s.vehicle.shield > 0 && s.stats.eventParts === 2);
    assert.equal(s.stats.routeCompletions.rescue, 1);
    outcomes.push({ id: "rescue", route: s.routeContract, hpBefore: before, hpAfter: s.vehicle.hp, shield: s.vehicle.shield, parts: s.stats.eventParts });
    await page.screenshot({ path: path.join(outDir, "verified-rescue-completed.png") });
    await page.evaluate(() => window.__test.acceptRouteContract("salvage"));
    assert.equal((await state(page)).routeContract.id, "rescue", "same-wave repeat rejected");
  });
  await check("廢車場真攀附、真觸控甩飛、零件搭配", async () => {
    await fresh(page, url);
    await accept(page, "salvage");
    await supply(page, "parts_cache");
    assert.equal((await state(page)).stats.supplyParts, 4);
    assert((await state(page)).latch.latched >= 2);
    await touchDrift(page);
    await page.evaluate(() => window.__test.step(50));
    const s = await state(page);
    assert.equal(s.routeContract.status, "completed"); assert.equal(s.stats.routeCompletions.salvage, 1);
    assert(s.stats.flung >= 2 && s.stats.eventParts >= 4);
    outcomes.push({ id: "salvage", route: s.routeContract, flung: s.stats.flung, supplyParts: s.stats.supplyParts, eventParts: s.stats.eventParts });
    await page.screenshot({ path: path.join(outDir, "verified-salvage-completed.png") });
    const drifts = s.stats.drifts;
    await touchDrift(page); assert.equal((await state(page)).stats.drifts, drifts, "cooldown does not retrigger");
    assert(/甩尾 [0-9.]+ 秒/.test(await page.locator("#touchFeedback").innerText()));
  });
  await check("火線真射擊擊殺與延長火力", async () => {
    await fresh(page, url); await accept(page, "frontline");
    await supply(page, "damage_boost");
    const first = await state(page);
    assert(first.supplyBuffs.some(b => b.rewardId === "damage_boost" && b.until - first.time > 16));
    for (let i = 0; i < 140; i++) {
      const s = await state(page);
      if (s.routeContract.status !== "active") break;
      const enemy = s.enemies.find(e => !e.dead);
      if (enemy) {
        const p = await point(page, enemy.x, enemy.y);
        await page.mouse.move(p.x, p.y); if (i === 0) await page.mouse.down();
      }
      await page.evaluate(() => window.__test.step(160));
    }
    await page.mouse.up();
    const s = await state(page);
    assert.equal(s.routeContract.status, "completed", JSON.stringify({ route: s.routeContract, kills: s.stats.kills }));
    assert(s.stats.kills >= 6 && s.stats.routeCompletions.frontline === 1);
    assert(s.supplyBuffs.some(b => b.damageAdd === 0.15));
    outcomes.push({ id: "frontline", route: s.routeContract, kills: s.stats.kills, buffs: s.supplyBuffs });
    await page.screenshot({ path: path.join(outDir, "verified-frontline-completed.png") });
  });
  await check("逾時不發獎與不重複計失敗", async () => {
    await fresh(page, url); await accept(page, "rescue");
    await page.evaluate(() => { window.__test.setState({ supplyChoice: null, supplyDrops: [], enemies: [] }); window.__test.step(26000); });
    const s = await state(page);
    assert.equal(s.routeContract.status, "expired"); assert.equal(s.stats.eventParts, 0); assert.equal(s.stats.routeFailures, 1);
    await page.evaluate(() => window.__test.step(100)); assert.equal((await state(page)).stats.routeFailures, 1);
  });
  await check("取消、拖出、暫停鍵與返回", async () => {
    await fresh(page, url);
    await touchDrift(page, "outside"); await touchDrift(page, "cancel");
    assert.equal((await state(page)).stats.drifts || 0, 0);
    await page.locator("#touchPauseBtn").tap(); assert.equal((await state(page)).paused, true);
    await page.locator("#resumeBtn").click(); assert.equal((await state(page)).paused, false);
  });
  await check("路線永久收藏、結算與重載", async () => {
    await fresh(page, url); await accept(page, "rescue"); await supply(page, "overshield");
    await page.evaluate(() => window.__test.finishRun());
    assert.equal((await page.evaluate(() => window.__test.getMeta())).routeCompletions.rescue, 1);
    await page.locator("#runAnalysisToggleBtn").click();
    assert(/救援支線 1 次/.test(await page.locator("#runAnalysisPanel").innerText()));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__test && window.__test.getMeta);
    assert.equal((await page.evaluate(() => window.__test.getMeta())).routeCompletions.rescue, 1);
  });
  await check("路線鍵盤焦點與 Escape 返回原局", async () => {
    await fresh(page, url);
    await page.locator("#routeHudBtn").click();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      assert(await page.evaluate(() => routeBoard.contains(document.activeElement)), "focus remains in the modal");
    }
    await page.keyboard.press("Escape");
    assert(await page.locator("#routeBoard").isHidden());
    assert.equal((await state(page)).mode, "playing");
  });
  await check("直橫與短手機五張補給卡完整可點", async () => {
    for (const [width, height] of [[390, 844], [844, 390], [360, 640]]) {
      await page.setViewportSize({ width, height }); await fresh(page, url); await accept(page, "rescue");
      const boxes = await page.locator("#supplyChoiceList button").evaluateAll(nodes => nodes.map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height - 2)) };
      }));
      assert.equal(boxes.length, 5);
      for (const r of boxes) assert(r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height && r.hit, `${width}x${height}: ${JSON.stringify(r)}`);
      const scroll = await page.locator("#supplyChoiceOverlay").evaluate(el => ({ need: el.scrollHeight, available: el.clientHeight }));
      assert(scroll.need <= scroll.available + 1, `all five cards should fit without scrolling at ${width}x${height}`);
      const separation = await page.evaluate(() => ({ panel: supplyChoiceOverlay.getBoundingClientRect().toJSON(), banner: eventBanner.hidden ? null : eventBanner.getBoundingClientRect().toJSON() }));
      if (separation.banner) assert(!intersects(separation.panel, separation.banner), "supply header must not overlap the event banner");
    }
  });
  await check("橫向多指搖桿甩尾方向與旋轉清除", async () => {
    await page.setViewportSize({ width: 844, height: 390 }); await fresh(page, url);
    const jr = await page.locator("#virtualJoystick").boundingBox(), dr = await page.locator("#touchBoostBtn").boundingBox();
    const cdp = await context.newCDPSession(page);
    const stick = { x: jr.x + 5, y: jr.y + jr.height - 5, id: 1 }, drift = { x: dr.x + dr.width / 2, y: dr.y + dr.height / 2, id: 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [stick] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [stick, drift] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [stick] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal((await state(page)).stats.drifts, 1);
    assert.equal((await state(page)).latch.lastDriftDir, 1, "landscape screen-down is world-right; screen-left must not reverse drift");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);
    assert.equal((await state(page)).input.dragging, false);
    await cdp.detach();
  });
  assert.deepEqual(errors, []);
  await context.close();
  fs.writeFileSync(path.join(outDir, "control-metrics.json"), JSON.stringify(geometries, null, 2));
  fs.writeFileSync(path.join(outDir, "route-outcomes.json"), JSON.stringify(outcomes, null, 2));
  console.log(`R87 mobile VERIFIED ${passed}/${passed}`);
}).catch(error => { console.error(error); process.exitCode = 1; });
