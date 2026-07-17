"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const evidenceDir = path.join(rootDir, "docs", "evidence", "R79_start");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.normalize(path.join(rootDir, requestPath));
    if (!filePath.startsWith(rootDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
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

async function capture(browser, baseUrl, viewport, filename) {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width <= 390,
    isMobile: viewport.width <= 390,
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      if (!window.__test || !window.__test.getShelterState) return false;
      const state = window.__test.getShelterState();
      return state.backgroundMode === "image" && state.imageLoaded === true;
    }, null, { timeout: 60000 });
    await page.locator("#shelterImage").evaluate((image) => image.decode());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const audit = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      const image = document.getElementById("shelterImage");
      const imageBox = image.getBoundingClientRect();
      const centerNode = document.elementFromPoint(imageBox.left + imageBox.width / 2, imageBox.top + imageBox.height / 2);
      return {
        header: box("#garagePanel > .meta-summary"),
        art: box("#garagePanel > .start-art-stage"),
        actions: box("#garagePanel > .hotspot-layer"),
        imageHidden: image.hidden,
        imageComplete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        imageDisplay: getComputedStyle(image).display,
        imageOpacity: Number(getComputedStyle(image).opacity),
        objectFit: getComputedStyle(image).objectFit,
        centerNodeId: centerNode ? centerNode.id : "",
        baseActionsHidden: document.getElementById("baseActions").hidden,
        drawerHidden: document.getElementById("metaDrawer").hidden
      };
    });

    assert.strictEqual(audit.imageHidden, false, `${filename}: key art must be visible`);
    assert(audit.imageComplete && audit.naturalWidth > 0 && audit.naturalHeight > 0, `${filename}: key art must be decoded`);
    assert.strictEqual(audit.imageDisplay, "block", `${filename}: key art must participate in painting`);
    assert(audit.imageOpacity >= 0.99, `${filename}: key art must remain opaque`);
    assert.strictEqual(audit.objectFit, "contain", `${filename}: key art must remain fully visible`);
    assert.strictEqual(audit.centerNodeId, "shelterImage", `${filename}: key art must own the center focal layer`);
    assert(audit.header.bottom <= audit.art.top + 1, `${filename}: header must not overlap key art`);
    assert(audit.art.bottom <= audit.actions.top + 1, `${filename}: actions must not overlap key art`);
    assert.strictEqual(audit.baseActionsHidden, true, `${filename}: base action overlay must start collapsed`);
    assert.strictEqual(audit.drawerHidden, true, `${filename}: meta drawer must start closed`);

    const outputPath = path.join(evidenceDir, filename);
    await page.screenshot({ path: outputPath, animations: "disabled" });
    console.log(`R79 EVIDENCE PASS ${viewport.width}x${viewport.height} -> ${path.relative(rootDir, outputPath)}`);
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const { server, url } = await startServer();
  const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  const browser = await chromium.launch({
    channel,
    headless: true,
    args: ["--disable-gpu", "--disable-accelerated-2d-canvas"]
  });
  try {
    await capture(browser, url, { width: 1366, height: 700 }, "after-desktop-1366x700.png");
    await capture(browser, url, { width: 390, height: 844 }, "after-phone-390x844.png");
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
