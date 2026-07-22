"use strict";

/* R46 RWD 矩陣守門測試（永久回歸守門）
 *
 * 以 9 視口矩陣稽核 index.html 的互動元素可達性與版面溢出：
 *   1. 所有可互動元素（button/select/input/textarea/a[href]/[role=button]/[onclick]）
 *      必須「完整在視口內」，或位於一個「自身完整可見、overflow-y 可捲」的容器內。
 *   2. 頁級捲動歸零：documentElement.scrollHeight <= innerHeight + 8（app-shell：body 不捲、區域內捲）。
 *   3. 水平溢出 <= 2px。
 *
 * 稽核狀態：
 *   - meta-shelter：避難所主畫面（與 R46 基準稽核相同的狀態）。
 *   - meta-ops-drawer：任務/設定抽屜開啟（設定/存檔控件須可達，抽屜本身可內捲）。
 *
 * 教學/導覽 overlay 的前置關閉步驟寫在 closeTutorialOverlays()：本作教學為
 * canvas 內繪製（無 DOM overlay），此處防禦性地標記教學旗標為已讀、收合事件橫幅，
 * 未來若新增 DOM 教學/導覽疊層，請在該函式內先行關閉再稽核。
 *
 * 零違規才 exit 0；任何 CLIPPED / PAGE_SCROLL / 頁捲超標 / 橫溢超標立即紅燈。
 */

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
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

const VIEWPORTS = [
  { w: 1920, h: 1080, kind: "desktop" },
  { w: 1440, h: 780, kind: "desktop" },
  { w: 1366, h: 600, kind: "desktop" },
  { w: 1280, h: 640, kind: "desktop" },
  { w: 1024, h: 768, kind: "desktop" },
  { w: 820, h: 1180, kind: "tablet" },
  { w: 768, h: 1024, kind: "tablet" },
  { w: 390, h: 844, kind: "mobile" },
  { w: 360, h: 640, kind: "mobile" },
  { w: 844, h: 390, kind: "landscape" }
].filter((viewport) => !process.env.RWD_VIEWPORT || process.env.RWD_VIEWPORT === `${viewport.w}x${viewport.h}`);

const PAGE_SCROLL_TOLERANCE = 8;
const OVERFLOW_X_TOLERANCE = 2;
const MIN_INTERACTIVE_TOTAL = 10;
const META_SETTLE_TIMEOUT_MS = 180000;

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

async function waitForMetaSettled(page) {
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { timeout: META_SETTLE_TIMEOUT_MS });
  await page.waitForSelector("#garagePanel:not([hidden])", { timeout: META_SETTLE_TIMEOUT_MS });
  await page.waitForFunction(() => {
    if (!window.__test || !window.__test.getShelterState) return false;
    const state = window.__test.getShelterState();
    const image = document.getElementById("shelterImage");
    if (state.backgroundMode !== "image" || state.imageLoaded !== true || !image) return false;
    const style = getComputedStyle(image);
    return image.hidden === false && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 &&
      style.display === "block" && style.visibility === "visible" && Number(style.opacity) >= 0.99;
  }, null, { timeout: META_SETTLE_TIMEOUT_MS });
}

async function closeTutorialOverlays(page) {
  // 教學/導覽 overlay 前置關閉：先標記教學旗標為已讀，再收合可能開啟的瞬態疊層。
  await page.evaluate(() => {
    try {
      if (window.__test && window.__test.getMeta && window.__test.setMeta) {
        const meta = window.__test.getMeta();
        if (meta && meta.tutorial && typeof meta.tutorial === "object") {
          let changed = false;
          Object.keys(meta.tutorial).forEach((key) => {
            if (meta.tutorial[key] !== true) {
              meta.tutorial[key] = true;
              changed = true;
            }
          });
          if (changed) window.__test.setMeta(meta);
        }
      }
    } catch (error) {
      // 教學旗標僅為防禦性關閉；失敗不影響版面稽核本身
    }
    const banner = document.getElementById("eventBanner");
    if (banner && !banner.hidden) banner.hidden = true;
    const drawer = document.getElementById("metaDrawer");
    const closeDrawerBtn = document.getElementById("closeMetaDrawer");
    if (drawer && !drawer.hidden && closeDrawerBtn) closeDrawerBtn.click();
  });
}

const STATES = [
  {
    name: "meta-shelter",
    prepare: async () => {
      // 預設避難所主畫面，無需額外操作
    }
  },
  {
    name: "meta-ops-drawer",
    prepare: async (page) => {
      await page.evaluate(() => window.__test.openMetaPanel("operations"));
      await page.waitForSelector('#metaDrawer:not([hidden]) [data-meta-section="operations"]:not([hidden])');
    }
  },
  {
    name: "meta-trailer-room",
    prepare: async (page) => {
      await page.evaluate(() => {
        const meta = window.__test.getMeta();
        meta.trailerGoods = 200;
        window.__test.setMeta(meta);
      });
      await page.evaluate(() => window.__test.openTrailerRoom());
      await page.waitForSelector("#trailerOverlay:not([hidden]) #trailerFurnitureList");
    }
  }
].filter((state) => !process.env.RWD_STATE || process.env.RWD_STATE === state.name);

async function auditViewport(page) {
  return page.evaluate(() => {
    const tol = 2;
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const els = [...document.querySelectorAll('button, select, input, textarea, a[href], [role="button"], [onclick]')];
    const results = [];
    const seen = new Set();
    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (+cs.opacity === 0) continue;
      let anc = el.parentElement;
      let hidden = false;
      let scrollHost = null;
      while (anc && anc !== document.body) {
        const acs = getComputedStyle(anc);
        if (acs.display === "none" || acs.visibility === "hidden" || +acs.opacity === 0) {
          hidden = true;
          break;
        }
        if (!scrollHost && /(auto|scroll)/.test(acs.overflowY) && anc.scrollHeight > anc.clientHeight + 4) scrollHost = anc;
        anc = anc.parentElement;
      }
      if (hidden) continue;
      const inVp = r.top >= -tol && r.left >= -tol && r.bottom <= ih + tol && r.right <= iw + tol;
      const label = (el.id ? "#" + el.id : "") ||
        (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).toString().trim().slice(0, 28);
      let status;
      if (inVp) status = "OK";
      else if (scrollHost) {
        const hr = scrollHost.getBoundingClientRect();
        const hostVisible = hr.top >= -tol && hr.bottom <= ih + tol && hr.left >= -tol && hr.right <= iw + tol;
        status = hostVisible ? "SCROLLABLE_OK" : "PAGE_SCROLL";
      } else {
        status = r.top >= ih || r.bottom <= 0 ? "PAGE_SCROLL" : "CLIPPED";
      }
      if (status !== "OK" && status !== "SCROLLABLE_OK") {
        results.push({
          label,
          status,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right)
        });
      }
    }
    return {
      violations: results,
      pageScrollY: Math.max(0, document.documentElement.scrollHeight - ih),
      overflowX: Math.max(0, document.documentElement.scrollWidth - iw),
      total: seen.size
    };
  });
}

async function runMatrix(browser, baseUrl) {
  for (const state of STATES) {
    for (const vp of VIEWPORTS) {
      const isTouch = vp.kind === "mobile" || vp.kind === "landscape";
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        hasTouch: isTouch,
        isMobile: isTouch,
        serviceWorkers: "block"
      });
      const page = await context.newPage();
      const label = `${state.name} ${vp.w}x${vp.h} (${vp.kind})`;
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: META_SETTLE_TIMEOUT_MS });
        await waitForMetaSettled(page);
        await closeTutorialOverlays(page);
        await waitForMetaSettled(page);
        await state.prepare(page);
        await page.waitForTimeout(300);
        const res = await auditViewport(page);
        const appBox = await page.locator("#app").boundingBox();
        const stageBox = await page.locator("#battleStage").boundingBox();
        assert(appBox, `${label} app shell 應可見`);
        assert(stageBox, `${label} battle stage 應可見`);
        assert(appBox.height >= vp.h * 0.9, `${label} app 高度 ${appBox.height}px 應至少佔視口 90%`);
        assert(stageBox.height >= vp.h * (vp.kind === "desktop" ? 0.82 : 0.9), `${label} battle stage 高度 ${stageBox.height}px 應吃滿主要高度`);
        if (vp.kind === "landscape") {
          assert(stageBox.width >= vp.w * 0.95, `${label} R85 battle stage 應吃滿橫向寬度，實際 ${stageBox.width}px`);
          assert(Math.abs(stageBox.width / stageBox.height - vp.w / vp.h) < 0.03, `${label} R85 battle stage 應採原生橫向比例，實際 ${stageBox.width}x${stageBox.height}`);
        } else {
          assert(Math.abs(stageBox.width / stageBox.height - 390 / 844) < 0.01, `${label} battle stage 應維持 390:844 等比，實際 ${stageBox.width}x${stageBox.height}`);
        }
        if (state.name === "meta-shelter") {
          const startLayout = await page.evaluate(() => {
            const box = (selector) => {
              const rect = document.querySelector(selector).getBoundingClientRect();
              return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
            };
            const artImage = document.getElementById("shelterImage");
            const artImageRect = artImage.getBoundingClientRect();
            const centerNode = document.elementFromPoint(
              artImageRect.left + artImageRect.width / 2,
              artImageRect.top + artImageRect.height / 2
            );
            const artImageStyle = getComputedStyle(artImage);
            return {
              header: box("#garagePanel > .meta-summary"),
              art: box("#garagePanel > .start-art-stage"),
              actions: box("#garagePanel > .hotspot-layer"),
              sortie: box("#sortieBtn"),
              base: box("#baseToggleBtn"),
              objectFit: artImageStyle.objectFit,
              imageHidden: artImage.hidden,
              imageComplete: artImage.complete,
              imageNaturalWidth: artImage.naturalWidth,
              imageNaturalHeight: artImage.naturalHeight,
              imageDisplay: artImageStyle.display,
              imageOpacity: Number(artImageStyle.opacity),
              centerNodeId: centerNode ? centerNode.id : "",
              panelRows: getComputedStyle(document.getElementById("garagePanel")).gridTemplateRows,
              atmosphere: getComputedStyle(document.body, "::before").backgroundImage,
              artFallback: getComputedStyle(document.querySelector(".start-art-stage")).backgroundImage
            };
          });
          assert(startLayout.header.bottom <= startLayout.art.top + 1, `${label} R79 title row must not overlap key art`);
          assert(startLayout.art.bottom <= startLayout.actions.top + 1, `${label} R79 action row must not overlap key art`);
          assert(startLayout.art.height >= 120, `${label} R79 key art row must retain a visible focal area`);
          assert(startLayout.sortie.top >= startLayout.actions.top - 1 && startLayout.sortie.bottom <= startLayout.actions.bottom + 1, `${label} sortie CTA must stay inside the action row`);
          assert(startLayout.base.top >= startLayout.actions.top - 1 && startLayout.base.bottom <= startLayout.actions.bottom + 1, `${label} base CTA must stay inside the action row`);
          assert(startLayout.sortie.height >= 44 && startLayout.base.height >= 44, `${label} R79 start controls must preserve 44px reachability`);
          assert.strictEqual(startLayout.objectFit, "contain", `${label} R79 key art must use object-fit contain`);
          assert.strictEqual(startLayout.imageHidden, false, `${label} R79 key art must not remain hidden`);
          assert(startLayout.imageComplete && startLayout.imageNaturalWidth > 0 && startLayout.imageNaturalHeight > 0, `${label} R79 key art must finish loading`);
          assert.strictEqual(startLayout.imageDisplay, "block", `${label} R79 key art must participate in painting`);
          assert(startLayout.imageOpacity >= 0.99, `${label} R79 key art must remain opaque`);
          assert.strictEqual(startLayout.centerNodeId, "shelterImage", `${label} R79 key art must own the central focal layer`);
          assert(startLayout.panelRows.split(" ").length >= 3, `${label} R79 start panel must resolve to three grid rows`);
          assert(startLayout.atmosphere.includes("start-atmosphere-r79"), `${label} R79 viewport must resolve a real ash atmosphere quality asset`);
          assert(startLayout.artFallback.includes("start-focus-low.png"), `${label} R79 key art stage must keep a real low-bandwidth loading fallback`);
        }
        if (vp.kind === "desktop") {
          const leftRailBox = await page.locator(".rail-left .rail-cluster").boundingBox();
          const rightRailBox = await page.locator(".rail-right .rail-cluster").boundingBox();
          assert(leftRailBox && rightRailBox, `${label} desktop rails 應可見`);
          assert(stageBox.height >= vp.h * 0.97, `${label} R76 desktop stage 應接近滿高，實際 ${stageBox.height}px`);
          assert(stageBox.width >= (vp.h * 390 / 844) - 3, `${label} R76 desktop stage 寬度應由滿高等比推出，實際 ${stageBox.width}px`);
          const leftGap = stageBox.x - (leftRailBox.x + leftRailBox.width);
          const rightGap = rightRailBox.x - (stageBox.x + stageBox.width);
          assert(leftGap >= -1 && leftGap <= 24, `${label} left rail 應貼近 stage，gap ${leftGap}px`);
          assert(rightGap >= -1 && rightGap <= 24, `${label} right rail 應貼近 stage，gap ${rightGap}px`);
          assert(appBox.width >= vp.w * 0.96, `${label} desktop shell 應填滿寬螢幕，實際 ${appBox.width}px`);
        }
        assert.strictEqual(
          res.violations.length,
          0,
          `${label} 有 ${res.violations.length} 項互動元素違規: ${JSON.stringify(res.violations)}`
        );
        assert(
          res.pageScrollY <= PAGE_SCROLL_TOLERANCE,
          `${label} 頁級垂直捲動 ${res.pageScrollY}px 應 <= ${PAGE_SCROLL_TOLERANCE}px`
        );
        assert(
          res.overflowX <= OVERFLOW_X_TOLERANCE,
          `${label} 水平溢出 ${res.overflowX}px 應 <= ${OVERFLOW_X_TOLERANCE}px`
        );
        assert(
          res.total >= MIN_INTERACTIVE_TOTAL,
          `${label} 互動元素僅 ${res.total} 個，頁面可能未正確載入`
        );
        console.log(`RWD PASS ${label} 元素 ${res.total} 頁捲 ${res.pageScrollY} 橫溢 ${res.overflowX}`);
      } finally {
        await context.close();
      }
    }
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
    await runMatrix(browser, url);
    console.log("RWD matrix tests PASS");
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
