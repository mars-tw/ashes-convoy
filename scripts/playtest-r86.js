"use strict";

// R86 真人輸入試玩錄影器：清空存檔→從開始畫面真實點擊出勤→以真實滑鼠／觸控持續操作，
// 依時間點截圖並記錄波次、擊殺、HP、零件、畫面事件。用法：
//   node scripts/playtest-r86.js <before|after> [baseUrl]
// 不注入傷害／不改 state 冒充遊玩；唯一例外是 --skip-boot-tutorial 不存在，全程照新玩家流程。

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const tag = process.argv[2] || "before";
const baseUrl = process.argv[3] || "http://127.0.0.1:5102/";
const outDir = path.resolve(__dirname, "..", "docs", "evidence", "r86", tag);
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: "desktop-1366x768", width: 1366, height: 768, touch: false },
  { name: "laptop-1366x600", width: 1366, height: 600, touch: false },
  { name: "phone-390x844", width: 390, height: 844, touch: true },
  { name: "phone-land-844x390", width: 844, height: 390, touch: true }
];
const only = process.env.PT_VIEWPORT;
const SHOTS_AT = [0.6, 3, 8, 15, 30, 45, 60];
const DURATION = Number(process.env.PT_SECONDS || 62);
const REACT = process.env.PT_REACT !== "0";

async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.__test && window.__test.getState ? window.__test.getState() : null;
    if (!s) return { mode: "none" };
    const visible = (id) => {
      const n = document.getElementById(id);
      if (!n || n.hidden) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== "hidden";
    };
    return {
      mode: s.mode,
      time: Number((s.time || 0).toFixed(2)),
      wave: s.wave,
      kills: s.stats ? s.stats.kills : null,
      latched: s.latch ? s.latch.latched : null,
      flung: s.stats ? s.stats.flung || 0 : 0,
      latchesTaken: s.stats ? s.stats.latchesTaken || 0 : 0,
      hp: s.vehicle ? Math.round(s.vehicle.hp) : null,
      maxHp: s.vehicle ? Math.round(s.vehicle.maxHp) : null,
      parts: s.partsEarned != null ? s.partsEarned : s.parts,
      enemies: (s.enemies || []).length,
      gates: (s.gates || []).length,
      supply: visible("supplyChoiceOverlay"),
      banner: s.eventBanner ? s.eventBanner.title : null,
      combo: s.combo || s.comboCount || null,
      over: !!s.over
    };
  });
}

async function playViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.touch,
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { timeout: 120000 });
  await page.evaluate(() => window.__test.clearStorage());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__test && window.__test.spritesReady && window.__test.spritesReady(), null, { timeout: 120000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, `${vp.name}-00-start.png`) });

  // 真實點擊出勤（可能有二段或教學）。
  const t0 = Date.now();
  for (let i = 0; i < 4; i += 1) {
    const mode = await page.evaluate(() => (window.__test.getState() || {}).mode);
    if (mode === "playing") break;
    const btn = await page.$("#sortieBtn:visible, #startBtn:visible");
    if (!btn) break;
    if (vp.touch) await btn.tap().catch(() => btn.click()); else await btn.click();
    await page.waitForTimeout(600);
  }
  const timeline = [];
  const shots = SHOTS_AT.slice();
  const canvasBox = await page.evaluate(() => {
    const r = document.getElementById("gameCanvas").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const startWall = Date.now();
  let phase = 0;
  let mouseDown = false;
  while ((Date.now() - startWall) / 1000 < DURATION) {
    const elapsed = (Date.now() - startWall) / 1000;
    const snap = await snapshot(page);
    snap.wall = Number(elapsed.toFixed(1));
    timeline.push(snap);
    if (snap.over || snap.mode === "settlement" || snap.mode === "over") break;
    if (shots.length && elapsed >= shots[0]) {
      const at = shots.shift();
      await page.screenshot({ path: path.join(outDir, `${vp.name}-t${String(at).padStart(2, "0")}.png`) });
    }
    // 補給或門選擇：用鍵盤 1 選（桌機）或點第一個選項（觸控）。
    const choice = await page.$("#supplyChoiceOverlay:not([hidden]) #supplyChoiceList button:visible");
    if (choice) {
      if (mouseDown) { await page.mouse.up(); mouseDown = false; }
      await page.waitForTimeout(450);
      if (vp.touch) await choice.tap().catch(() => {}); else await page.keyboard.press("Digit1");
      await page.waitForTimeout(250);
      continue;
    }
    // 看到「攀車屍」提示的玩家反應：桌機左右急甩滑鼠；觸控按「甩」。PT_REACT=0 模擬不理會的新手。
    if (REACT && snap.latched > 0) {
      if (vp.touch) {
        const boost = await page.$("#touchBoostBtn:visible");
        if (boost) await boost.tap().catch(() => {});
      } else {
        const sy = canvasBox.y + canvasBox.h * 0.62;
        for (let k = 0; k < 4; k += 1) {
          await page.mouse.move(canvasBox.x + canvasBox.w * (k % 2 ? 0.82 : 0.18), sy, { steps: 2 });
          await page.waitForTimeout(90);
        }
      }
      await page.waitForTimeout(120);
      continue;
    }
    // 掃射：在戰場下半段左右移動並持續按住（拖曳＝移動＋瞄準）。
    phase += 0.35;
    const landscape = canvasBox.w > canvasBox.h;
    const cx = canvasBox.x + canvasBox.w * (landscape ? 0.6 + 0.2 * Math.sin(phase) : 0.5 + 0.32 * Math.sin(phase));
    const cy = canvasBox.y + canvasBox.h * (canvasBox.w > canvasBox.h ? 0.5 : 0.62);
    if (vp.touch) {
      await page.touchscreen.tap(cx, cy).catch(() => {});
    } else {
      await page.mouse.move(cx, cy);
      if (!mouseDown) { await page.mouse.down(); mouseDown = true; }
    }
    await page.waitForTimeout(160);
  }
  if (mouseDown) await page.mouse.up();
  await page.screenshot({ path: path.join(outDir, `${vp.name}-end.png`) });
  await context.close();
  const firstKill = timeline.find((s) => s.kills > 0);
  const summary = {
    viewport: vp.name,
    sortieClickToPlayingMs: null,
    firstKillAt: firstKill ? firstKill.wall : null,
    final: timeline[timeline.length - 1],
    latchesTaken: timeline.length ? timeline[timeline.length - 1].latchesTaken : 0,
    flung: timeline.length ? timeline[timeline.length - 1].flung : 0,
    firstLatchAt: (timeline.find((s) => s.latchesTaken > 0) || {}).wall || null,
    minHp: Math.min(...timeline.filter((s) => s.hp != null).map((s) => s.hp)),
    banners: [...new Set(timeline.map((s) => s.banner).filter(Boolean))],
    errors,
    startedAfterMs: Date.now() - t0
  };
  fs.writeFileSync(path.join(outDir, `${vp.name}-timeline.json`), JSON.stringify({ summary, timeline }, null, 2));
  return summary;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const vp of VIEWPORTS) {
    if (only && only !== vp.name) continue;
    results.push(await playViewport(browser, vp));
    console.log(JSON.stringify(results[results.length - 1]));
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(results, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
