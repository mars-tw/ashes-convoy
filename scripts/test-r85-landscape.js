"use strict";

/* R85 R1-LAND-01 永久回歸：844x390 原生 stage、等比旋轉相機／逆投影、
 * HUD／事件／觸控分區、快升真實點擊、無線電可達，以及直向／桌機不退化。 */

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
}

function intersects(a, b, tolerance = 0) {
  return a.left < b.right - tolerance && a.right > b.left + tolerance &&
    a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
}

async function startLandscapeFixture(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    const state = window.__test.getState();
    window.__test.spawnEnemy("shambler", { x: 60, y: 160, hp: 80 });
    window.__test.spawnEnemy("runner", { x: 100, y: 220, hp: 55 });
    window.__test.spawnEnemy("bloater", { x: 135, y: 110, hp: 120 });
    window.__test.setState({
      eventBanner: {
        title: "沙牆逼近",
        body: "擊破路障，保持護航線",
        kind: "event",
        priority: 60,
        time: state.time,
        ttl: 100
      }
    });
    window.__test.step(30);
  });
  await page.waitForFunction(() => {
    const canvas = document.getElementById("gameCanvas");
    return window.__test.getState().mode === "playing" && canvas.width === 844 && canvas.height === 390;
  }, null, { timeout: 30000 });
}

async function checkLandscapeNative(page) {
  await startLandscapeFixture(page);
  const metrics = await page.evaluate(() => {
    const box = (id) => {
      const node = document.getElementById(id);
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: getComputedStyle(node).display
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      stage: box("battleStage"),
      canvas: box("gameCanvas"),
      backing: { width: gameCanvas.width, height: gameCanvas.height },
      hud: box("hud"),
      banner: box("eventBanner"),
      joystick: box("virtualJoystick"),
      actions: [box("touchBoostBtn"), box("touchSkillBtn"), box("touchWeaponBtn")],
      hintDisplay: getComputedStyle(landscapeRotateHint).display,
      leftRailDisplay: getComputedStyle(document.querySelector(".rail-left")).display,
      cssPixelsPerWorldUnit: gameCanvas.getBoundingClientRect().height / window.DSConfig.LOGIC.width,
      enemies: window.__test.getState().enemies.length
    };
  });

  assert(metrics.stage.width >= 840 && metrics.canvas.width >= 840, `橫向戰場寬度應顯著大於 178px：${metrics.canvas.width}px`);
  assert(metrics.stage.height >= 388 && metrics.canvas.height >= 388, `橫向戰場應吃滿高度：${metrics.canvas.height}px`);
  assert.deepStrictEqual(metrics.backing, { width: 844, height: 390 }, "橫向 backing store 應交換為 844x390");
  assert(Math.abs(metrics.cssPixelsPerWorldUnit - 2) < 0.02, `旋轉相機應保留等比 2x sprite／彈道尺度：${metrics.cssPixelsPerWorldUnit}`);
  assert(metrics.enemies >= 3, "可辨識度 fixture 應保留三種敵人");
  assert.strictEqual(metrics.hintDisplay, "none", "原生橫向達標後旋轉提示應退場");
  assert.strictEqual(metrics.leftRailDisplay, "none", "觸控橫向不應用 rail 吃掉戰場寬度");
  assert(!intersects(metrics.hud, metrics.banner, 1), "橫向 HUD 與環境事件不得互疊");
  [metrics.joystick].concat(metrics.actions).forEach((control) => {
    assert(control.width >= 44 && control.height >= 44, `觸控熱區不得小於 44px：${control.width}x${control.height}`);
    assert(control.left >= -1 && control.top >= -1 && control.right <= 845 && control.bottom <= 391, "觸控熱區應完整位於視口內");
    assert(!intersects(metrics.hud, control, 1) && !intersects(metrics.banner, control, 1), "觸控熱區不得與 HUD／事件互疊");
  });

  // 逆投影：world(60,140) 在順時針相機中應落於 screen(1-y/H, x/W)。
  const target = await page.evaluate(() => {
    const logic = window.DSConfig.LOGIC;
    const rect = gameCanvas.getBoundingClientRect();
    return {
      x: rect.left + (1 - 140 / logic.height) * rect.width,
      y: rect.top + (60 / logic.width) * rect.height
    };
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(50);
  const aim = await page.evaluate(() => window.__test.getState().vehicle);
  await page.mouse.up();
  assert(Math.abs(aim.aimX - 60) < 2, `landscape screen-to-world aimX 應回到 60，實際 ${aim.aimX}`);
  assert(Math.abs(aim.aimY - 140) < 3, `landscape screen-to-world aimY 應回到 140，實際 ${aim.aimY}`);

  const gateHint = await page.evaluate(() => {
    const state = window.__test.getState();
    window.__test.setState({
      gateChoice: {
        gateIds: ["damage_plus", "repair"],
        options: [],
        openedAt: state.time
      }
    });
    window.__test.step(1);
    return gateChoiceLayer.textContent;
  });
  assert(gateHint.startsWith("↑") && gateHint.endsWith("↓"), `旋轉後門選擇應改用上下方向：${gateHint}`);
  await page.evaluate(() => window.__test.setState({ gateChoice: null }));

  const vehiclePoint = await page.evaluate(() => {
    const state = window.__test.getState();
    const logic = window.DSConfig.LOGIC;
    const rect = gameCanvas.getBoundingClientRect();
    return {
      x: rect.left + (1 - state.vehicle.y / logic.height) * rect.width,
      y: rect.top + (state.vehicle.x / logic.width) * rect.height
    };
  });
  await page.mouse.click(vehiclePoint.x, vehiclePoint.y);
  await page.waitForSelector("#quickUpgradeWheel:not([hidden])", { timeout: 8000 });
  await page.click("#quickUpgradeCloseBtn");
  await page.waitForFunction(() => document.getElementById("quickUpgradeWheel").hidden);

  await page.evaluate(() => {
    window.__test.showGarage();
    window.__test.openTrailerRoom();
    window.__test.openStoryLog();
  });
  await page.waitForSelector("#storyLogSection:not([hidden])");
  const radio = await page.evaluate(() => {
    const rect = storyLogSection.getBoundingClientRect();
    const list = storyLogList;
    const before = list.scrollTop;
    list.scrollTop = Math.min(list.scrollHeight, before + 80);
    return {
      height: rect.height,
      inViewport: rect.top >= -1 && rect.bottom <= innerHeight + 1,
      reachable: storyLogBtn.getBoundingClientRect().height >= 44,
      scrollable: list.scrollHeight <= list.clientHeight + 4 || list.scrollTop > before
    };
  });
  assert(radio.height >= 96 && radio.inViewport && radio.reachable && radio.scrollable, `橫向無線電日誌應可達可捲：${JSON.stringify(radio)}`);
  console.log(`PASS R85 landscape-native ${Math.round(metrics.canvas.width)}x${Math.round(metrics.canvas.height)}／HUD-event 分區／逆投影／無線電`);
}

async function checkRegressionViewport(browser, baseUrl, viewport, expectedWidth) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitReady(page);
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.step(30);
  });
  await page.waitForFunction(() => gameCanvas.width === 390 && gameCanvas.height === 844);
  const metrics = await page.evaluate(() => {
    const rect = gameCanvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, backing: [gameCanvas.width, gameCanvas.height] };
  });
  assert(Math.abs(metrics.width / metrics.height - 390 / 844) < 0.01, `${viewport.width}x${viewport.height} 應保留直向世界比例`);
  assert(metrics.width >= expectedWidth, `${viewport.width}x${viewport.height} stage 寬度退化：${metrics.width}`);
  assert.deepStrictEqual(metrics.backing, [390, 844], "非橫向觸控視口不得旋轉 backing store");
  assert.deepStrictEqual(errors, [], `${viewport.width}x${viewport.height} 不得有 page error：${errors.join(" | ")}`);
  await context.close();
}

(async () => {
  const { server, url } = await startServer();
  const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  const browser = await chromium.launch({
    channel,
    args: channel ? [] : ["--disable-gpu", "--disable-accelerated-2d-canvas"]
  });
  try {
    const landscapeContext = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block"
    });
    const landscapePage = await landscapeContext.newPage();
    const errors = [];
    landscapePage.on("pageerror", (error) => errors.push(error.message));
    await landscapePage.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitReady(landscapePage);
    await checkLandscapeNative(landscapePage);
    assert.deepStrictEqual(errors, [], `R85 landscape 不得有 page error：${errors.join(" | ")}`);
    await landscapeContext.close();

    await checkRegressionViewport(browser, url, { width: 390, height: 844 }, 388);
    await checkRegressionViewport(browser, url, { width: 1366, height: 768 }, 350);
    console.log("R85 R1-LAND-01 guard PASS");
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
