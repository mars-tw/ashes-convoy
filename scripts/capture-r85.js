"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const evidenceDir = path.join(rootDir, "docs", "evidence", "r85");
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

async function prepareRun(page, landscape) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    const meta = window.__test.getMeta();
    meta.tutorial = Object.assign({}, meta.tutorial, { seenQuickUpgrade: true });
    window.__test.setMeta(meta);
    window.__test.startRun("land_rig");
    window.__test.step(2200);
    window.__test.setState({
      enemies: [],
      enemyProjectiles: [],
      projectiles: [],
      messages: [],
      waveBannerKind: null
    });
    const state = window.__test.getState();
    window.__test.spawnEnemy("shambler", { x: 52, y: 175, hp: 160 });
    window.__test.spawnEnemy("runner", { x: 96, y: 225, hp: 120 });
    window.__test.spawnEnemy("bloater", { x: 138, y: 125, hp: 240 });
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
    window.__test.step(80);
  });
  await page.waitForFunction((expectLandscape) => {
    const canvas = document.getElementById("gameCanvas");
    return window.__test.getState().mode === "playing" &&
      (expectLandscape ? canvas.width === 844 && canvas.height === 390 : canvas.width === 390 && canvas.height === 844);
  }, landscape, { timeout: 30000 });

  // Produce a real player projectile while preserving the deterministic enemy fixture.
  const target = await page.evaluate(() => {
    const state = window.__test.getState();
    const logic = window.DSConfig.LOGIC;
    const rect = gameCanvas.getBoundingClientRect();
    const world = { x: state.vehicle.x, y: 120 };
    if (rect.width > rect.height) {
      return {
        x: rect.left + (1 - world.y / logic.height) * rect.width,
        y: rect.top + (world.x / logic.width) * rect.height
      };
    }
    return {
      x: rect.left + (world.x / logic.width) * rect.width,
      y: rect.top + (world.y / logic.height) * rect.height
    };
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const box = (id) => {
      const node = document.getElementById(id);
      const rect = node.getBoundingClientRect();
      return {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        display: getComputedStyle(node).display
      };
    };
    const overlap = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
    const hud = box("hud");
    const banner = box("eventBanner");
    const controls = [box("virtualJoystick"), box("touchBoostBtn"), box("touchSkillBtn"), box("touchWeaponBtn")];
    const state = window.__test.getState();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      stage: box("battleStage"),
      canvas: box("gameCanvas"),
      backingStore: { width: gameCanvas.width, height: gameCanvas.height },
      hud,
      eventBanner: banner,
      controls,
      hudEventOverlap: overlap(hud, banner),
      controlInformationOverlaps: controls.map((control) => overlap(control, hud) || overlap(control, banner)),
      landscapeRotateHintDisplay: getComputedStyle(landscapeRotateHint).display,
      cssPixelsPerWorldUnit: Number((gameCanvas.getBoundingClientRect().height / window.DSConfig.LOGIC.width).toFixed(3)),
      enemyCount: state.enemies.length,
      projectileCount: state.projectiles.length,
      appVersion: window.DSConfig.APP_VERSION
    };
  });
}

async function captureViewport(browser, baseUrl, viewport) {
  const touch = viewport.width <= 844;
  const landscape = touch && viewport.width > viewport.height;
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitReady(page);
  await prepareRun(page, landscape);
  const tag = `${viewport.width}x${viewport.height}`;
  await page.screenshot({ path: path.join(evidenceDir, `after-${tag}-run.png`) });
  const metrics = await collectMetrics(page);
  metrics.pageErrors = errors;

  if (landscape) {
    await page.evaluate(() => {
      window.__test.showGarage();
      window.__test.openTrailerRoom();
      window.__test.openStoryLog();
    });
    await page.waitForSelector("#storyLogSection:not([hidden])");
    await page.screenshot({ path: path.join(evidenceDir, "after-844x390-radio-log.png") });
    const radio = await page.evaluate(() => {
      const section = storyLogSection.getBoundingClientRect();
      const button = storyLogBtn.getBoundingClientRect();
      return {
        section: { x: section.x, y: section.y, width: section.width, height: section.height, bottom: section.bottom },
        button: { width: button.width, height: button.height },
        inViewport: section.top >= -1 && section.bottom <= innerHeight + 1,
        scrollHeight: storyLogList.scrollHeight,
        clientHeight: storyLogList.clientHeight
      };
    });
    metrics.radioLog = radio;
  }
  await context.close();
  console.log(`CAPTURED R85 ${tag}`);
  return metrics;
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const beforePath = path.join(evidenceDir, "before-844x390-run.png");
  if (!fs.existsSync(beforePath)) throw new Error("R85 before screenshot is missing; capture the R84 baseline first.");
  const { server, url } = await startServer();
  const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  const browser = await chromium.launch({
    channel,
    args: channel ? [] : ["--disable-gpu", "--disable-accelerated-2d-canvas"]
  });
  try {
    const results = [];
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1366, height: 768 }
    ]) {
      results.push(await captureViewport(browser, url, viewport));
    }
    fs.writeFileSync(
      path.join(evidenceDir, "viewport-metrics.json"),
      `${JSON.stringify({ release: "R85", capturedAt: new Date().toISOString(), results }, null, 2)}\n`,
      "utf8"
    );
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
