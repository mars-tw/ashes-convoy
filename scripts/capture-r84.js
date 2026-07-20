"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const phase = process.argv[2];
const evidenceDir = path.join(rootDir, "docs", "evidence", "r84");

if (phase !== "before" && phase !== "after") {
  throw new Error("Usage: node scripts/capture-r84.js <before|after>");
}

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
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function waitReady(page) {
  await page.waitForFunction(
    () => window.__test && window.__test.spritesReady && window.__test.spritesReady(),
    null,
    { polling: 120, timeout: 180000 }
  );
  await page.waitForFunction(
    () => {
      const image = document.getElementById("shelterImage");
      const state = window.__test.getShelterState();
      return state.backgroundMode === "image" && image && image.complete && image.naturalWidth > 0;
    },
    null,
    { polling: 120, timeout: 180000 }
  );
}

async function prepareRun(page) {
  await page.evaluate(() => {
    window.__test.clearStorage();
    window.__test.startRun("land_rig");
    window.__test.step(1800);
  });
  await page.waitForFunction(() => window.__test.getState().mode === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(250);
}

async function captureRun(browser, baseUrl, viewport) {
  const touch = viewport.width <= 844;
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitReady(page);
  await prepareRun(page);
  const tag = `${viewport.width}x${viewport.height}`;
  await page.screenshot({ path: path.join(evidenceDir, `${phase}-${tag}-run.png`) });
  if (phase === "after" && tag === "390x844") {
    await page.evaluate(() => window.__test.finishRun({ wavesCleared: 8, kills: 76, bossesDefeated: 1, score: 3900 }));
    await page.waitForSelector('#settlementPanel:not([hidden])[data-outcome="evacuated"]');
    await page.screenshot({ path: path.join(evidenceDir, "after-390x844-evacuation.png") });
  }
  if (phase === "after" && tag === "844x390") {
    await page.evaluate(() => {
      window.__test.showGarage();
      const meta = window.__test.getMeta();
      meta.trailerGoods = 300;
      window.__test.setMeta(meta);
      window.__test.openTrailerRoom();
    });
    await page.waitForSelector("#trailerOverlay:not([hidden]) .trailer-furniture");
    await page.screenshot({ path: path.join(evidenceDir, "after-844x390-trailer-compact.png") });
  }
  if (phase === "after" && tag === "1366x768") {
    await page.click("#railSettingsBtn");
    await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
    await page.screenshot({ path: path.join(evidenceDir, "after-1366x768-settings-drawer.png") });
    await page.click("#closeMetaDrawer");
    await page.waitForFunction(() => window.__test.getState().mode === "playing");
    await page.evaluate(() => {
      const state = window.__test.getState();
      window.__test.setState({
        supplyChoice: {
          dropId: "R84_evidence_supply",
          x: state.vehicle.x,
          y: state.vehicle.y - 20,
          openedAt: state.time,
          rewardIds: Object.keys(window.DSConfig.SUPPLY_DROPS.rewards)
        },
        paused: false
      });
      window.__test.step(1);
    });
    await page.waitForSelector("#supplyChoiceOverlay:not([hidden]) .supply-choice-btn");
    await page.screenshot({ path: path.join(evidenceDir, "after-1366x768-supply-choice.png") });
    await page.keyboard.press("Digit1");
    await page.waitForFunction(() => document.getElementById("supplyChoiceOverlay").hidden);
    await page.evaluate(() => window.__test.damageVehicle(999999, { type: "enemy", enemyId: "shambler" }));
    await page.waitForSelector('#settlementPanel:not([hidden])[data-outcome="destroyed"]');
    await page.screenshot({ path: path.join(evidenceDir, "after-1366x768-defeat.png") });
  }
  await context.close();
  console.log(`CAPTURED ${phase} ${tag}`);
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const { server, url } = await startServer();
  const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-accelerated-2d-canvas"] });
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1366, height: 768 }
    ]) {
      await captureRun(browser, url, viewport);
    }
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
