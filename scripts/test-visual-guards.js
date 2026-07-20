"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const config = require("../src/config.js");
const version = require("../src/version.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const gameSource = read("src/game.js");
const shelterSource = read("src/shelter-scene.js");
const uiSource = read("src/ui.js");
const htmlSource = read("index.html");
const credits = read("CREDITS.md");

assert.strictEqual(version.APP_VERSION, "R84", "visual release guard must target R84");
assert(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/.test(htmlSource), "global hidden safety net must override later overlay display rules");

const textureEntries = Object.entries(config.FX.textures || {});
assert.strictEqual(textureEntries.length, 4, "R71 must preserve smoke/fire/debris/flash texture layers");
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
assert.strictEqual(modes.spread.visual.core, "#d39a4a", "scatter must move to the amber-brown band");
assert.strictEqual(modes.homing.visual.core, "#d8fbff", "homing must move to the white-cyan band");
const requiredVisualIds = ["standard", "scatter", "fracture", "ember", "laser"];
const visuals = Object.values(modes).map((mode) => mode.visual).filter(Boolean);
requiredVisualIds.forEach((id) => assert(visuals.some((visual) => visual.id === id), `missing projectile visual language: ${id}`));
const requiredVisuals = visuals.filter((visual) => requiredVisualIds.includes(visual.id));
assert.strictEqual(new Set(requiredVisuals.map((visual) => visual.core)).size, requiredVisuals.length, "core colors must be distinct per requested ammo type");
assert.strictEqual(new Set(requiredVisuals.map((visual) => visual.shape)).size, requiredVisuals.length, "shapes must be distinct per requested ammo type");
requiredVisuals.forEach((visual) => {
  assert(visual.trail !== visual.core && visual.trailLife > 0 && visual.trailStretch > 0, `${visual.id} must define a distinct trail`);
});
assert(config.FX.killBurst.zombie.some((spec) => spec.delay >= 0.1), "zombie kill burst must stagger its smoke beat");
assert(config.FX.killBurst.mech.some((spec) => spec.delay >= 0.1), "mech kill burst must stagger its smoke beat");
assert.strictEqual(config.FX.quality.high.maxParticles, 96, "visual polish must not raise the high particle-pool cap");
assert.strictEqual(config.FX.quality.low.maxParticles, 48, "visual polish must not raise the low particle-pool cap");
assert(gameSource.includes("enemy.hitFlashColor = weaponVisual(projectile.weaponMode).core"), "enemy hit tint must follow projectile color");
assert(gameSource.includes("enemyActionFrame") && gameSource.includes("useHurtAtlas"), "enemy hits must use authored raster hurt frames");
assert(gameSource.includes("drawVehicleNavigationLights") && gameSource.includes("const count = reduced ? 1 : 2"), "vehicle navigation lights must cover reduced mode");
assert(gameSource.includes("drawDepthLayers") && gameSource.includes('depthLayerTier = off ? "off" : low ? "low" : "full"'), "land depth layers must cover off/low/full tiers");
assert(gameSource.includes("drawR72EnvironmentDepth") && gameSource.includes('environment === "air"') && gameSource.includes('environment === "sea"') && gameSource.includes('environment === "space"'), "R72 must add deterministic parallax depth to every non-land environment");
assert(gameSource.includes("depthLayerEnvironment") && gameSource.includes("nearOffset"), "R72 environment depth must expose diagnostics and a distinct near-scroll rate");
assert(gameSource.includes("enemyHurtPoseDrawn") && !gameSource.includes('drawSprite(enemy.sprite, "hit"'), "raster enemies must retain a raster hurt reaction without art-style fallback");
assert(gameSource.includes("enemyDeathPoseDrawn") && gameSource.includes("spriteActions.death"), "raster enemies must retain time-based death atlas frames");
assert(gameSource.includes("drawVehicleDamageSmoke") && gameSource.includes("hpPct >= 0.35"), "vehicle hull smoke must start below 35% HP");
assert(gameSource.includes("drawScorchMarks") && gameSource.includes("const fxScorches = new Array(12)"), "ground scorch marks must use a fixed visual pool");
assert(gameSource.includes("reservedCritical") === false, "particle priority implementation must remain isolated in the FX module");
const fxSource = read("src/fx.js");
assert(fxSource.includes("reservedCritical") && fxSource.includes("priorityEvictions"), "FX pool must reserve critical capacity and expose priority recycling");
assert(gameSource.includes("state.projectiles.forEach(drawProjectile)"), "projectiles must use the dedicated ammo renderer");
assert(uiSource.includes("hud.dataset.weaponMode"), "HUD must switch its weapon signature immediately");

assert(gameSource.includes("drawRoadDetailOverlay") && gameSource.includes("roadDetailTier"), "road cracks/tracks must expose quality-tier diagnostics");
assert(gameSource.includes("drawBossArrivalVignette") && config.FX.bossArrival.strength > 0, "boss arrival vignette pulse must exist");
assert(gameSource.includes("drawLowHpPulse") && config.FX.lowHpPulse.threshold === 0.25, "low-HP full-screen pulse must exist");
assert(gameSource.includes('event.id === "sandstorm"') && gameSource.includes('event.id === "undertow"'), "event color filters must cover sandstorm and undertow");
assert(gameSource.includes("sandstormFlickerHz = 0") && gameSource.includes("sandstormSaturation = 0.42"), "sandstorm must remove flicker and use a restrained saturation profile");
assert(gameSource.includes("(reduced ? 0.5 : 1)") && gameSource.includes("(low ? 0.65 : 1)"), "sandstorm must explicitly halve reduced intensity and cover low quality");
assert(gameSource.includes("ctx.bezierCurveTo") && gameSource.includes("ctx.ellipse"), "sandstorm must use soft flowing bands and sparse motes instead of high-frequency noise");
assert(!gameSource.includes("(state.scroll * 1.8) % 44"), "legacy high-frequency sandstorm streaks must be removed");
assert(!shelterSource.includes("getTrailerImage(TRAILER_ROOM_ASSETS.character)"), "trailer room must not draw a second Xi layer");
const roomPng = fs.readFileSync(path.join(root, "assets/shelter/trailer/base_escape_pod.png"));
assert.strictEqual(roomPng.readUInt32BE(16), 780, "R71 room width must preserve the 780px interface");
assert.strictEqual(roomPng.readUInt32BE(20), 900, "R71 room height must preserve the 900px interface");
assert(roomPng.length > 500000, "R71 room should retain high-resolution downscaled detail");
assert(htmlSource.includes("hud-number-pop") && uiSource.includes("setAnimatedHudValue"), "HUD numbers must have pop animation wiring");

assert(config.FX.quality.low.maxParticles <= config.FX.quality.high.maxParticles / 2, "low tier must cap particles at half of high");
assert(config.FX.quality.low.emitRateMul <= 0.5, "low tier must reduce effect layers");
assert(gameSource.includes('p.texture === "flash" && meta.settings && meta.settings.reducedFlash'), "reduced mode must suppress texture flashes");
assert(gameSource.includes("drawBossArrivalVignette") && gameSource.includes("meta.settings.reducedFlash"), "reduced mode must cover full-screen pulses");
assert(htmlSource.includes("prefers-reduced-motion: reduce") && htmlSource.includes(".hud.is-reduced"), "HUD motion must respect both OS and game reduced settings");

console.log("Visual guard tests PASS");
