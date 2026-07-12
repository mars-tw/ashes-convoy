"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const config = require("../src/config.js");
const version = require("../src/version.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const gameSource = read("src/game.js");
const uiSource = read("src/ui.js");
const htmlSource = read("index.html");
const credits = read("CREDITS.md");

assert.strictEqual(version.APP_VERSION, "R66", "visual release guard must target R66");

const textureEntries = Object.entries(config.FX.textures || {});
assert.strictEqual(textureEntries.length, 4, "R66 must ship smoke/fire/debris/flash texture layers");
textureEntries.forEach(([name, relativePath]) => {
  const file = path.join(root, relativePath);
  assert(fs.existsSync(file), `missing Kenney texture: ${relativePath}`);
  const png = fs.readFileSync(file);
  assert.strictEqual(png.toString("ascii", 1, 4), "PNG", `${relativePath} must be PNG`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  assert(width > 0 && width <= 96 && height > 0 && height <= 96, `${relativePath} must remain a compact cropped texture`);
  assert(colorType === 4 || colorType === 6, `${relativePath} must preserve transparency for canvas composition`);
  assert(credits.includes(path.basename(relativePath)), `${relativePath} must be credited`);
  assert(config.FX.textureTints.length >= 6, `${name} must have pre-render tint coverage`);
});
assert(credits.includes("Creative Commons Zero") && credits.includes("kenney.nl/assets/particle-pack"), "Kenney CC0 provenance must be documented");

["zombie", "mech", "boss"].forEach((kind) => {
  const textures = new Set(config.FX.killBurst[kind].map((spec) => spec.texture).filter(Boolean));
  ["flash", "debris", "smoke"].forEach((texture) => assert(textures.has(texture), `${kind} kill burst must compose ${texture}`));
});
const hitTextures = new Set(config.FX.hitSpark.layers.map((spec) => spec.texture).filter(Boolean));
assert(hitTextures.has("flash") && hitTextures.has("debris"), "hit effects must compose flash and debris textures");
assert(gameSource.includes("buildFxTextureTint") && gameSource.includes("prepareFxTextureTints"), "textures must be pre-tinted in offscreen canvases");
assert(gameSource.includes("texturedParticlesDrawn"), "runtime must expose textured-particle visual diagnostics");

const modes = config.WEAPON_POWERUPS.modes;
const requiredVisualIds = ["standard", "scatter", "fracture", "ember", "laser"];
const visuals = Object.values(modes).map((mode) => mode.visual).filter(Boolean);
requiredVisualIds.forEach((id) => assert(visuals.some((visual) => visual.id === id), `missing projectile visual language: ${id}`));
const requiredVisuals = visuals.filter((visual) => requiredVisualIds.includes(visual.id));
assert.strictEqual(new Set(requiredVisuals.map((visual) => visual.core)).size, requiredVisuals.length, "core colors must be distinct per requested ammo type");
assert.strictEqual(new Set(requiredVisuals.map((visual) => visual.shape)).size, requiredVisuals.length, "shapes must be distinct per requested ammo type");
requiredVisuals.forEach((visual) => {
  assert(visual.trail !== visual.core && visual.trailLife > 0 && visual.trailStretch > 0, `${visual.id} must define a distinct trail`);
});
assert(gameSource.includes("state.projectiles.forEach(drawProjectile)"), "projectiles must use the dedicated ammo renderer");
assert(uiSource.includes("hud.dataset.weaponMode"), "HUD must switch its weapon signature immediately");

assert(gameSource.includes("drawRoadDetailOverlay") && gameSource.includes("roadDetailTier"), "road cracks/tracks must expose quality-tier diagnostics");
assert(gameSource.includes("drawBossArrivalVignette") && config.FX.bossArrival.strength > 0, "boss arrival vignette pulse must exist");
assert(gameSource.includes("drawLowHpPulse") && config.FX.lowHpPulse.threshold === 0.25, "low-HP full-screen pulse must exist");
assert(gameSource.includes('event.id === "sandstorm"') && gameSource.includes('event.id === "undertow"'), "event color filters must cover sandstorm and undertow");
assert(htmlSource.includes("hud-number-pop") && uiSource.includes("setAnimatedHudValue"), "HUD numbers must have pop animation wiring");

assert(config.FX.quality.low.maxParticles <= config.FX.quality.high.maxParticles / 2, "low tier must cap particles at half of high");
assert(config.FX.quality.low.emitRateMul <= 0.5, "low tier must reduce effect layers");
assert(gameSource.includes('p.texture === "flash" && meta.settings && meta.settings.reducedFlash'), "reduced mode must suppress texture flashes");
assert(gameSource.includes("drawBossArrivalVignette") && gameSource.includes("meta.settings.reducedFlash"), "reduced mode must cover full-screen pulses");
assert(htmlSource.includes("prefers-reduced-motion: reduce") && htmlSource.includes(".hud.is-reduced"), "HUD motion must respect both OS and game reduced settings");

console.log("Visual guard tests PASS");
