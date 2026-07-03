"use strict";

const PALETTES = {
  zombie: {
    ".": null,
    A: "#101719",
    B: "#26382c",
    C: "#4d7b42",
    D: "#9fcb73",
    E: "#64252b",
    F: "#c8bd8b",
    G: "#8a5a2a",
    H: "#354252",
    I: "#d6e995"
  },
  hive: {
    ".": null,
    A: "#0b0f12",
    B: "#27212a",
    C: "#5a3439",
    D: "#8c5940",
    E: "#b84937",
    F: "#b7e35d",
    G: "#ff9b30",
    H: "#1d2730",
    I: "#d8c58d"
  },
  metal: {
    ".": null,
    A: "#0c1116",
    B: "#26313a",
    C: "#56636d",
    D: "#b7c1c8",
    E: "#8b4a24",
    F: "#f08a24",
    G: "#ffd166",
    H: "#32b7c9",
    I: "#9e2f27",
    J: "#05080b"
  },
  energy: {
    ".": null,
    A: "#101014",
    B: "#d95d27",
    C: "#ff9f1c",
    D: "#ffe66d",
    E: "#5fe4e8",
    F: "#2d7dd2",
    G: "#ef476f",
    H: "#7b2cbf",
    I: "#89f05a",
    J: "#68706a"
  },
  gate: {
    ".": null,
    A: "#101419",
    B: "#2b343c",
    C: "#66727d",
    D: "#c9d1d8",
    E: "#f25f3a",
    F: "#ffbf3f",
    G: "#55d6d2",
    H: "#8ee36b",
    I: "#f4f0c9",
    J: "#7b2e2e"
  },
  terrain: {
    ".": null,
    A: "#151719",
    B: "#2b2f31",
    C: "#55514a",
    D: "#80745e",
    E: "#a6602c",
    F: "#c8b074",
    G: "#6f8746",
    H: "#35404a",
    I: "#91613c",
    J: "#d08b39"
  },
  shelter: {
    ".": null,
    A: "#0b0e12",
    B: "#1f1716",
    C: "#3b261f",
    D: "#6b3d24",
    E: "#a96b35",
    F: "#f0c887",
    G: "#ffd86a",
    H: "#ff9438",
    I: "#cbd5d8",
    J: "#8b9298",
    K: "#172b3a",
    L: "#4d8fb0",
    M: "#8fd6e8",
    N: "#34524b",
    O: "#78b86b",
    P: "#f3dcc2",
    Q: "#d89a75",
    R: "#5a2d25",
    S: "#f5e7b8",
    T: "#b33f33",
    U: "#6a4b35",
    V: "#b9e8dc",
    W: "#ffffff",
    X: "#1a2428",
    Y: "#2f574f",
    Z: "#9e7a55",
    0: "#263445",
    1: "#5f6f7a",
    2: "#d7eff2",
    3: "#442c1d",
    4: "#c6a36a",
    5: "#5d4032",
    6: "#2a6f62",
    7: "#c9a050",
    8: "#82d1ff",
    9: "#203a4c"
  }
};

const SPRITE_SPECS = {
  zombie_shambler: { stage: 1, type: "enemy", w: 16, h: 16, anims: { idle: 1, walk: 4, hit: 1, death: 3 } },
  zombie_runner: { stage: 1, type: "enemy", w: 16, h: 16, anims: { idle: 1, walk: 4, hit: 1, death: 3 } },
  zombie_bloater: { stage: 1, type: "enemy", w: 24, h: 24, anims: { idle: 1, walk: 4, hit: 1, death: 4, burst: 4 } },
  boss_hive_titan: { stage: 1, type: "boss", w: 48, h: 48, anims: { idle: 1, walk: 6, attack: 4, rage: 3, hit: 1, death: 5 } },
  vehicle_iron_crow: { stage: 1, type: "vehicle", w: 64, h: 36, anims: { idle: 2, move: 4, damage: 2, wreck: 3 } },
  vehicle_dawn_skiff: { stage: 1, type: "vehicle", w: 48, h: 48, anims: { idle: 4, move: 4, damage: 2, wreck: 3 } },
  bullet_machine: { stage: 1, type: "bullet", w: 8, h: 8, anims: { move: 2 } },
  bullet_pulse: { stage: 1, type: "bullet", w: 8, h: 8, anims: { move: 2 } },
  bullet_rocket: { stage: 1, type: "bullet", w: 12, h: 8, anims: { move: 2 } },
  effect_muzzle: { stage: 1, type: "effect", w: 16, h: 16, anims: { burst: 3 } },
  effect_hit: { stage: 1, type: "effect", w: 16, h: 16, anims: { burst: 3 } },
  effect_explosion_small: { stage: 1, type: "effect", w: 24, h: 24, anims: { burst: 5 } },
  effect_shield: { stage: 1, type: "effect", w: 32, h: 32, anims: { pulse: 4 } },
  gate_damage: { stage: 1, type: "gate", w: 32, h: 48, anims: { idle: 4, break: 4 } },
  gate_rate: { stage: 1, type: "gate", w: 32, h: 48, anims: { idle: 4, break: 4 } },
  gate_multishot: { stage: 1, type: "gate", w: 32, h: 48, anims: { idle: 4, break: 4 } },
  gate_repair: { stage: 1, type: "gate", w: 32, h: 48, anims: { idle: 4, break: 4 } },
  tile_road: { stage: 1, type: "terrain", w: 32, h: 32, anims: { idle: 1 } },
  tile_wasteland: { stage: 1, type: "terrain", w: 32, h: 32, anims: { idle: 1 } },
  bg_ruins_strip: { stage: 1, type: "background", w: 128, h: 32, anims: { scroll: 1 } },
  scene_bed_sleeper: { stage: 3, type: "scene", w: 112, h: 72, anims: { idle: 1, breathe: 3 } },
  scene_window_frame: { stage: 3, type: "scene", w: 96, h: 80, anims: { idle: 1 } },
  scene_zombie_silhouette: { stage: 3, type: "scene", w: 32, h: 56, anims: { idle: 1, walk: 4 } },
  scene_shelf_supplies: { stage: 3, type: "scene", w: 80, h: 88, anims: { idle: 1 } },
  scene_lamp_bulb: { stage: 3, type: "scene", w: 32, h: 48, anims: { idle: 1, glow: 3 } },
  scene_string_lights: { stage: 3, type: "scene", w: 128, h: 24, anims: { idle: 1, twinkle: 4 } },
  scene_teddy: { stage: 3, type: "scene", w: 24, h: 28, anims: { idle: 1 } },
  scene_radio: { stage: 3, type: "scene", w: 32, h: 24, anims: { idle: 1, blink: 2 } },
  scene_plant_shelf: { stage: 3, type: "scene", w: 72, h: 72, anims: { idle: 1, sway: 3 } },
  scene_props: { stage: 3, type: "scene", w: 96, h: 48, anims: { idle: 1 } }
};

function grid(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
}

function setPixel(target, x, y, ch) {
  if (y < 0 || y >= target.length || x < 0 || x >= target[0].length || ch === ".") return;
  target[y][x] = ch;
}

function paint(target, x, y, pattern) {
  for (let row = 0; row < pattern.length; row += 1) {
    for (let col = 0; col < pattern[row].length; col += 1) {
      setPixel(target, x + col, y + row, pattern[row][col]);
    }
  }
}

function rect(target, x, y, w, h, ch) {
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      setPixel(target, x + col, y + row, ch);
    }
  }
}

function outlineRect(target, x, y, w, h, outline, fill) {
  rect(target, x, y, w, h, outline);
  if (w > 2 && h > 2) rect(target, x + 1, y + 1, w - 2, h - 2, fill);
}

function drawLine(target, x0, y0, x1, y1, ch) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    setPixel(target, x, y, ch);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function ellipse(target, cx, cy, rx, ry, outline, fill, shade) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1) {
        const ch = d > 0.7 ? outline : shade && (x < cx - 1 || y > cy + 1) ? shade : fill;
        setPixel(target, x, y, ch);
      }
    }
  }
}

function rowsFrom(target) {
  return target.map((row) => row.join(""));
}

function makeFrame(w, h, draw) {
  const target = grid(w, h);
  draw(target);
  return rowsFrom(target);
}

function sequence(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}_${index}`);
}

function makeSprite(id, type, palette, pivot, hitbox, frames, anims, extraTags) {
  const spec = SPRITE_SPECS[id];
  const stageTag = `stage${spec.stage}`;
  return {
    id,
    type,
    palette,
    w: spec.w,
    h: spec.h,
    pivot,
    hitbox,
    frames,
    anims,
    tags: [stageTag, type].concat(extraTags || [])
  };
}

function shamblerFrame(kind, step) {
  return makeFrame(16, 16, (g) => {
    if (kind === "death") {
      if (step === 0) {
        paint(g, 4, 5, [".AAA.", "ABCCA", "ACDCA", ".AEA."]);
        paint(g, 3, 9, ["AAGGCAA", ".AEEBA.", "..A.A..", ".AA.AA."]);
      } else if (step === 1) {
        paint(g, 2, 9, ["..AAAAA.", ".ACCCCEA", "AAGGGEAA", ".AABBBA.", "..A..A.."]);
      } else {
        paint(g, 1, 11, ["..AEEAAA.....", ".AAGGGCCAA...", "AABBBCCEEA..", "..AA....AA..."]);
      }
      return;
    }

    const sway = kind === "idle" ? 0 : step === 1 ? -1 : step === 3 ? 1 : 0;
    paint(g, 5 + sway, 2, [".AAA.", "ABCCA", "ACDCA", ".AEA."]);
    paint(g, 4, 6, [".AGGA.", "AAGGCA", ".AGCCA", ".AABA."]);
    if (kind === "hit") {
      paint(g, 4, 4, ["E...E", ".E.E.", "..E.."]);
      paint(g, 7, 8, ["EE", "E."]);
    }
    if (kind === "idle") {
      paint(g, 3, 7, ["AA", "A.", "A."]);
      paint(g, 10, 7, ["AA", ".A", ".A"]);
      paint(g, 5, 10, ["A..A", "BB.B", "A..A", "A..A"]);
      return;
    }
    if (step % 2 === 0) {
      paint(g, 3, 7, ["AA", "A.", "A."]);
      paint(g, 10, 7, ["AA", ".A", "..A"]);
      paint(g, 5, 10, ["A..A", "BB.B", "A...B", "A...A"]);
    } else {
      paint(g, 3, 7, [".AA", "..A", "..A"]);
      paint(g, 10, 7, ["AA", "A.", "A."]);
      paint(g, 5, 10, ["A..A", "BB.B", "..A.B", "..A.A"]);
    }
    if (step === 2) {
      paint(g, 6, 11, [".B.", ".A.", "A.."]);
      setPixel(g, 9, 8, "D");
    }
  });
}

function runnerFrame(kind, step) {
  return makeFrame(16, 16, (g) => {
    if (kind === "death") {
      if (step === 0) {
        paint(g, 5, 4, [".AAA", "ACDA", "AEA."]);
        paint(g, 4, 8, ["AAHCA", ".AHBA", "A.A.A", "..A.."]);
      } else if (step === 1) {
        paint(g, 3, 10, [".AAAAAA.", "AHDCCEA.", ".AABBBA.", "A..A..A."]);
      } else {
        paint(g, 2, 12, ["AAEEAAAAA...", ".AHHCCBEEA..", "..AA..AAA..."]);
      }
      return;
    }

    const lean = kind === "idle" ? 0 : step === 0 || step === 3 ? 1 : -1;
    paint(g, 5 + lean, 1, [".AAA.", "ACDCA", ".AEA."]);
    paint(g, 4 + lean, 5, [".AHCA.", "AAHCCA", ".ABCBA", "..A.A."]);
    if (kind === "hit") {
      paint(g, 4, 3, ["E.E", ".E.", "E.E"]);
      paint(g, 8, 7, ["EE"]);
    }
    if (kind === "idle") {
      paint(g, 4, 6, ["A.", "A.", ".A"]);
      paint(g, 9, 6, ["AA", ".A", ".A"]);
      paint(g, 6, 9, ["A.A", "BBB", "A.A", "A.A"]);
      return;
    }
    if (step === 0) {
      paint(g, 3, 6, ["A.", ".A", ".A"]);
      paint(g, 10, 5, ["AA", "A.", "A."]);
      paint(g, 5, 9, ["A..A", "BB.B", "..A.", ".A..", "A..."]);
    } else if (step === 1) {
      paint(g, 4, 5, ["AA", ".A", ".A"]);
      paint(g, 9, 6, [".A", "A.", "A."]);
      paint(g, 5, 9, ["A..A", "BBB.", "A...", ".A..", "..A."]);
    } else if (step === 2) {
      paint(g, 3, 5, ["AA", "A.", "A."]);
      paint(g, 10, 6, ["A.", ".A", ".A"]);
      paint(g, 5, 9, ["A..A", "BB.B", "A..A", "A..A"]);
    } else {
      paint(g, 4, 6, ["A.", ".A", ".A"]);
      paint(g, 9, 5, ["AA", "A.", "A."]);
      paint(g, 5, 9, ["A..A", "BB.B", "...A", "..A.", ".A.."]);
    }
  });
}

function bloaterFrame(kind, step) {
  return makeFrame(24, 24, (g) => {
    if (kind === "burst") {
      ellipse(g, 12, 12, 4 + step, 4 + step, "A", step < 2 ? "E" : "G", step < 2 ? "C" : "I");
      paint(g, 5 - step, 7, ["E", ".I", "A"]);
      paint(g, 18 + step, 8, ["I", "E.", ".A"]);
      paint(g, 8, 17 + step, ["AIEIA"]);
      if (step < 2) ellipse(g, 12, 13, 7 - step, 6 - step, "A", "C", "B");
      return;
    }
    if (kind === "death") {
      ellipse(g, 12, 15 + step, 7, Math.max(2, 7 - step), "A", step < 3 ? "C" : "E", "B");
      paint(g, 8 - step, 18, ["AEEA", ".BB."]);
      paint(g, 15 + step, 18, ["AIEA", ".AA."]);
      if (step < 2) ellipse(g, 11, 7 + step, 4, 3, "A", "C", "B");
      return;
    }

    const sway = kind === "idle" ? 0 : step === 1 ? -1 : step === 3 ? 1 : 0;
    ellipse(g, 12 + sway, 12, 7, 8, "A", "C", "B");
    ellipse(g, 11 + sway, 5, 4, 3, "A", "C", "B");
    paint(g, 10 + sway, 5, ["FEF"]);
    paint(g, 10 + sway, 9, ["DDD", "DCD", "CEC"]);
    paint(g, 7 + sway, 13, ["EE", "E."]);
    paint(g, 15 + sway, 14, ["I.", "II"]);
    if (kind === "hit") {
      paint(g, 8, 8, ["E...E", ".E.E.", "..E.."]);
      paint(g, 11, 14, ["EEE"]);
    }
    if (step % 2 === 0 || kind === "idle") {
      paint(g, 4, 10, ["AA", "A.", "A."]);
      paint(g, 18, 10, ["AA", ".A", ".A"]);
      paint(g, 8, 20, ["AA..AA", "A....A"]);
    } else {
      paint(g, 5, 10, [".AA", "..A", "..A"]);
      paint(g, 17, 10, ["AA.", "A..", "A.."]);
      paint(g, 8, 20, ["A....A", "AA..AA"]);
    }
    if (kind === "walk" && step === 2) {
      paint(g, 10, 17, ["DCD", ".D."]);
      setPixel(g, 18, 19, "A");
    }
  });
}

function bossFrame(kind, step) {
  return makeFrame(48, 48, (g) => {
    if (kind === "death") {
      const sink = step * 3;
      ellipse(g, 24, 26 + sink, 15, Math.max(4, 13 - step * 2), "A", step < 4 ? "C" : "E", "B");
      ellipse(g, 16, 30 + sink, 7, Math.max(2, 5 - step), "A", "D", "C");
      ellipse(g, 31, 29 + sink, 8, Math.max(2, 6 - step), "A", step < 3 ? "E" : "B", "C");
      paint(g, 10, 39, ["AEEFFEEA", ".AAGGAA."]);
      paint(g, 29, 40, ["AAIIIAA", "..AAA.."]);
      if (step < 3) ellipse(g, 24, 11 + sink, 9, 6, "A", "C", "B");
      return;
    }

    const sway = kind === "walk" ? (step % 3) - 1 : 0;
    const raise = kind === "attack" ? step : 0;
    drawLine(g, 12, 18, 5 - raise, 26 - raise * 3, "A");
    drawLine(g, 36, 18, 43 + raise, 26 - raise * 3, "A");
    drawLine(g, 13, 19, 6 - raise, 27 - raise * 3, kind === "rage" ? "F" : "D");
    drawLine(g, 35, 19, 42 + raise, 27 - raise * 3, kind === "rage" ? "F" : "D");
    drawLine(g, 19, 35, 14 - (step % 2), 44, "A");
    drawLine(g, 29, 35, 35 + (step % 2), 44, "A");
    drawLine(g, 21, 36, 18, 45, "D");
    drawLine(g, 27, 36, 30, 45, "D");
    ellipse(g, 24 + sway, 25, 15, 15, "A", "C", "B");
    ellipse(g, 24 + sway, 11, 10, 7, "A", "C", "B");
    ellipse(g, 16 + sway, 24, 5, 7, "A", "D", "C");
    ellipse(g, 32 + sway, 24, 5, 7, "A", "E", "C");
    paint(g, 17 + sway, 4, ["A.A.A.A", ".A.A.A."]);
    paint(g, 20 + sway, 10, ["G..G", ".FF."]);
    paint(g, 20 + sway, 16, ["AIIIIA", ".AEEA."]);
    paint(g, 17 + sway, 26, ["F.F.F.F", ".D.E.D."]);
    paint(g, 12 + sway, 32, ["A..A.....A..A", ".D.D.....D.D."]);
    if (kind === "attack") {
      paint(g, 21, 18 - step, [".FFF.", "FGGGF", ".FFF."]);
      drawLine(g, 24, 17, 24, 5 + step, "F");
      drawLine(g, 23, 17, 19 - step, 8, "G");
      drawLine(g, 25, 17, 30 + step, 8, "G");
    }
    if (kind === "rage") {
      paint(g, 8, 16, ["F", ".F", "..F"]);
      paint(g, 39, 15, ["F", "F.", "F.."]);
      paint(g, 18, 7, ["FGFGFGFGFGFG"]);
      paint(g, 15, 30, ["F.F.F.F.F.F"]);
      drawLine(g, 9 + step, 10, 5 + step, 6 + step, "G");
      drawLine(g, 38 - step, 10, 43 - step, 6 + step, "G");
    }
    if (kind === "hit") {
      paint(g, 14, 13, ["E...E...E", ".E.E.E.E.", "..E...E.."]);
      paint(g, 25, 28, ["EEE", "E.E"]);
    }
  });
}

function ironCrowFrame(kind, step) {
  return makeFrame(64, 36, (g) => {
    if (kind === "wreck") {
      outlineRect(g, 5, 20 + step, 42, 8, "A", "B");
      paint(g, 11, 17 + step, ["AICCCA", ".AIIA."]);
      drawLine(g, 34, 18 + step, 50, 27 + step, "A");
      drawLine(g, 35, 19 + step, 51, 28 + step, "E");
      paint(g, 10, 29, ["A.A.A.A.A.A.A"]);
      paint(g, 17, 14, ["JJJ", "J.J"]);
      paint(g, 41, 13, ["JJ", ".J", "J."]);
      return;
    }

    const smoke = step % 4;
    rect(g, 0, 30, 64, 2, "A");
    rect(g, 0, 32, 64, 1, "C");
    outlineRect(g, 4, 18, 42, 10, "A", "C");
    outlineRect(g, 16, 13, 18, 7, "A", "B");
    outlineRect(g, 36, 14, 13, 14, "A", "B");
    paint(g, 48, 16, ["AAAAA", ".CCCCA", "..CCCA", "...CCA", "....A"]);
    outlineRect(g, 22, 9, 12, 5, "A", "C");
    rect(g, 34, 10, 13, 2, "A");
    rect(g, 46, 9, 8, 1, "D");
    outlineRect(g, 8, 14, 5, 5, "A", "B");
    paint(g, 9, 12, ["JJ", "J."]);
    paint(g, 11 + smoke, 7 - smoke, ["J"]);
    paint(g, 8, 21, ["H.H.H"]);
    paint(g, 20, 16, ["DDDD", "EEEE"]);
    paint(g, 5, 26, ["A.A.A.A.A.A.A.A.A.A.A"]);
    for (let i = 0; i < 6; i += 1) {
      const x = 8 + i * 6;
      paint(g, x, 27 + (kind === "move" && (i + step) % 2 === 0 ? 1 : 0), ["ABA", "BAB"]);
    }
    paint(g, 2, 24, ["A....A", ".A..A.", "..AA.."]);
    if (kind === "damage") {
      paint(g, 25, 18, ["I.I.I", ".III.", "I.I.I"]);
      paint(g, 42, 12, ["JJ", "J.", ".J"]);
    }
    if (kind === "idle" && step === 1) paint(g, 55, 24, ["FG", "GF"]);
    if (kind === "move") paint(g, 55, 23 + (step % 2), ["FGG", "GFF"]);
  });
}

function dawnSkiffFrame(kind, step) {
  return makeFrame(48, 48, (g) => {
    if (kind === "wreck") {
      outlineRect(g, 12, 24 + step, 23, 7, "A", "B");
      drawLine(g, 10, 25 + step, 2, 34 + step, "A");
      drawLine(g, 36, 25 + step, 45, 34 + step, "A");
      paint(g, 16, 20, ["AIICCA", ".AIIA."]);
      paint(g, 18, 35, ["JJJ", "J.J"]);
      paint(g, 31, 33, ["JJ", ".J"]);
      return;
    }
    const bob = kind === "idle" ? (step === 1 ? -1 : step === 3 ? 1 : 0) : step % 2;
    outlineRect(g, 13, 20 + bob, 22, 10, "A", "C");
    paint(g, 17, 16 + bob, [".AAAAAA.", "ABHHHHBA", ".ACDDCA."]);
    drawLine(g, 13, 23 + bob, 3, 31 + bob, "A");
    drawLine(g, 34, 23 + bob, 44, 31 + bob, "A");
    drawLine(g, 12, 24 + bob, 4, 29 + bob, "D");
    drawLine(g, 35, 24 + bob, 43, 29 + bob, "D");
    rect(g, 8, 25 + bob, 8, 2, "A");
    rect(g, 32, 25 + bob, 8, 2, "A");
    paint(g, 20, 29 + bob, ["A....A", "BFGGFB", ".FGGF."]);
    paint(g, 21, 33 + bob + (step % 2), [".FGF.", "F...F"]);
    paint(g, 15, 30 + bob, ["AFAA"]);
    paint(g, 29, 30 + bob, ["AAFA"]);
    if (kind === "idle") {
      setPixel(g, 21 + step, 36 + (step % 2), step % 2 ? "G" : "F");
      setPixel(g, 26 - step, 36 + (step % 2), step % 2 ? "F" : "G");
    }
    if (kind === "damage") {
      paint(g, 18, 21 + bob, ["I.I.I", ".III.", "I.I.I"]);
      paint(g, 33, 18 + bob, ["JJ", "J."]);
    }
    if (kind === "move") {
      paint(g, 6, 29 + bob, step % 2 ? ["F", "G"] : ["G", "F"]);
      paint(g, 41, 29 + bob, step % 2 ? ["G", "F"] : ["F", "G"]);
      setPixel(g, 22 + step, 38, step % 2 ? "G" : "F");
    }
  });
}

function bulletMachineFrame(step) {
  return makeFrame(8, 8, (g) => {
    paint(g, step % 2, 2, ["ADDC", "ABBC", ".CC."]);
    paint(g, 5, 3, ["D", "C"]);
  });
}

function bulletPulseFrame(step) {
  return makeFrame(8, 8, (g) => {
    ellipse(g, 3 + step, 3, 3, 3, "F", "E", "H");
    paint(g, 3 + step, 3, ["D"]);
  });
}

function bulletRocketFrame(step) {
  return makeFrame(12, 8, (g) => {
    paint(g, 1, 2, ["AEEEDDA.", "ABBBCCA>", "AEEEDDA."]);
    setPixel(g, 8, 3, "D");
    paint(g, 0, 3, step % 2 ? ["BC"] : ["CB"]);
  });
}

function muzzleFrame(step) {
  return makeFrame(16, 16, (g) => {
    if (step === 0) paint(g, 5, 6, [".D.", "DCD", ".B."]);
    if (step === 1) paint(g, 3, 4, ["..D..", ".DCD.", "DCBCD", ".DCD.", "..B.."]);
    if (step === 2) paint(g, 2, 3, ["...D...", ".D.C.D.", "..CBC..", "DCB.BCD", "..CBC..", ".B...B."]);
  });
}

function hitFrame(step) {
  return makeFrame(16, 16, (g) => {
    const c = step === 2 ? "J" : step === 1 ? "D" : "E";
    paint(g, 7, 3 + step, [c]);
    drawLine(g, 7, 7, 3 - step, 4 + step, c);
    drawLine(g, 8, 7, 12 + step, 4 + step, c);
    drawLine(g, 7, 8, 4 - step, 12, c);
    drawLine(g, 8, 8, 11 + step, 12, c);
    paint(g, 6, 6, ["ADA", "DED", "ADA"]);
  });
}

function explosionFrame(step) {
  return makeFrame(24, 24, (g) => {
    if (step === 0) {
      ellipse(g, 12, 12, 4, 4, "B", "C", "D");
      paint(g, 11, 11, ["D"]);
    } else if (step === 1) {
      ellipse(g, 12, 12, 7, 6, "B", "C", "D");
      ellipse(g, 12, 12, 3, 3, "C", "D", "D");
    } else if (step === 2) {
      ellipse(g, 12, 12, 10, 8, "B", "C", "J");
      paint(g, 8, 8, ["D.D.D", ".C.C."]);
    } else if (step === 3) {
      ellipse(g, 12, 12, 11, 9, "J", "B", "J");
      paint(g, 5, 7, ["C...C...C", ".B.B.B.B."]);
      paint(g, 8, 16, ["J.J.J"]);
    } else {
      ellipse(g, 12, 12, 10, 8, "J", "J", "J");
      paint(g, 4, 10, ["J..J...J..J", "..J.....J.."]);
    }
  });
}

function shieldFrame(step) {
  return makeFrame(32, 32, (g) => {
    const rx = 11 + (step % 2);
    const ry = 13 - (step % 2);
    ellipse(g, 16, 16, rx, ry, "F", ".", ".");
    ellipse(g, 16, 16, rx - 2, ry - 2, ".", ".", ".");
    drawLine(g, 16, 3 + step, 16, 7 + step, "E");
    drawLine(g, 16, 25 - step, 16, 29 - step, "E");
    drawLine(g, 4 + step, 16, 8 + step, 16, "E");
    drawLine(g, 24 - step, 16, 28 - step, 16, "E");
    paint(g, 12, 14, ["E...E", ".F.F.", "..E.."]);
  });
}

function gateFrame(kind, state, step) {
  const icon = { damage: "E", rate: "F", multishot: "G", repair: "H" }[kind];
  return makeFrame(32, 48, (g) => {
    outlineRect(g, 4, 5, 24, 38, "A", "B");
    outlineRect(g, 7, 9, 18, 28, "A", "C");
    rect(g, 9, 11, 14, 24, step % 2 === 0 ? icon : "I");
    rect(g, 10, 12, 12, 22, icon);
    rect(g, 5, 40, 22, 4, "A");
    rect(g, 6, 41, 20, 2, "C");
    paint(g, 6, 4, [".DDDDDDDDDDDDDDDDDD.", "DAAAAAAAAAAAAAAAAAAD"]);
    if (kind === "damage") {
      drawLine(g, 16, 15, 16, 29, "I");
      drawLine(g, 12, 29, 20, 21, "A");
      drawLine(g, 13, 28, 21, 20, "I");
    } else if (kind === "rate") {
      drawLine(g, 12, 17, 20, 23, "I");
      drawLine(g, 12, 29, 20, 23, "I");
      drawLine(g, 14, 17, 22, 23, "A");
      drawLine(g, 14, 29, 22, 23, "A");
    } else if (kind === "multishot") {
      paint(g, 12, 17, ["I.I.I", ".I.I.", "I.I.I"]);
      drawLine(g, 16, 23, 11, 30, "I");
      drawLine(g, 16, 23, 16, 31, "I");
      drawLine(g, 16, 23, 21, 30, "I");
    } else {
      rect(g, 14, 16, 5, 16, "I");
      rect(g, 9, 21, 15, 5, "I");
      rect(g, 15, 17, 3, 14, icon);
      rect(g, 10, 22, 13, 3, icon);
    }
    if (state === "idle") {
      rect(g, 10, 13 + ((step * 5) % 18), 12, 1, "I");
      setPixel(g, 9 + step * 4, 7, icon);
    }
    if (state === "break") {
      const drop = step * 2;
      drawLine(g, 8, 12, 20, 30 + step, "J");
      drawLine(g, 24, 10, 15, 35, "J");
      rect(g, 9, 11, 3 + step, 7 + step, ".");
      rect(g, 20 - step, 27, 4 + step, 8, ".");
      paint(g, 5 + step, 38 + drop, ["AJA", ".J."]);
      paint(g, 22 - step, 39 + drop, ["AJA", "J.."]);
    }
  });
}

function tileRoadFrame() {
  return makeFrame(32, 32, (g) => {
    rect(g, 0, 0, 32, 32, "B");
    rect(g, 0, 0, 2, 32, "A");
    rect(g, 30, 0, 2, 32, "A");
    for (let y = 0; y < 32; y += 8) rect(g, 15, y + 1, 2, 5, "F");
    drawLine(g, 5, 4, 13, 11, "C");
    drawLine(g, 25, 8, 18, 14, "A");
    drawLine(g, 9, 22, 3, 29, "C");
    paint(g, 21, 24, ["E", ".E", "..E"]);
  });
}

function tileWastelandFrame() {
  return makeFrame(32, 32, (g) => {
    rect(g, 0, 0, 32, 32, "D");
    for (let y = 0; y < 32; y += 4) {
      for (let x = (y % 8) / 2; x < 32; x += 7) setPixel(g, x, y, y % 3 === 0 ? "C" : "I");
    }
    ellipse(g, 7, 23, 4, 2, "C", "F", "D");
    drawLine(g, 19, 5, 25, 11, "B");
    drawLine(g, 25, 5, 19, 11, "B");
    paint(g, 17, 18, ["AEEA", ".CC."]);
    paint(g, 3, 6, ["G", ".G", "G."]);
  });
}

function ruinsStripFrame() {
  return makeFrame(128, 32, (g) => {
    rect(g, 0, 25, 128, 7, "B");
    rect(g, 0, 29, 128, 3, "A");
    const buildings = [
      [3, 12, 12, 17],
      [20, 7, 10, 22],
      [37, 15, 18, 14],
      [62, 5, 13, 24],
      [82, 10, 19, 19],
      [110, 14, 12, 15]
    ];
    buildings.forEach(([x, y, w, h], index) => {
      outlineRect(g, x, y, w, h, "A", index % 2 ? "H" : "C");
      for (let wy = y + 3; wy < y + h - 2; wy += 5) {
        for (let wx = x + 2; wx < x + w - 2; wx += 4) setPixel(g, wx, wy, index % 3 === 0 ? "J" : "A");
      }
      drawLine(g, x + w - 1, y, x + w + 5, y + 5, "A");
    });
    paint(g, 50, 22, ["AAEAA", ".CCC."]);
    paint(g, 103, 23, ["AIIA", ".BB."]);
    drawLine(g, 12, 24, 2, 30, "E");
    drawLine(g, 78, 23, 91, 31, "E");
  });
}

function makeSceneSprite(id, pivot, hitbox, frames, anims, extraTags) {
  return makeSprite(id, "scene", "shelter", pivot, hitbox, frames, anims, ["shelter"].concat(extraTags || []));
}

function sceneBedSleeperFrame(step) {
  return makeFrame(112, 72, (g) => {
    const rise = step === 1 ? -1 : step === 2 ? 1 : 0;
    outlineRect(g, 5, 42, 102, 21, "B", "D");
    rect(g, 8, 62, 96, 4, "B");
    rect(g, 13, 33, 89, 14, "P");
    rect(g, 16, 36, 82, 4, "S");
    outlineRect(g, 9, 26, 26, 19, "B", "U");
    rect(g, 12, 29, 20, 11, "P");
    rect(g, 13, 30, 18, 3, "S");
    ellipse(g, 74, 31, 7, 7, "R", "Q", "R");
    ellipse(g, 70, 28, 8, 5, "R", "R", "3");
    paint(g, 69, 31, ["RRRRRR", "R.A..R", "R..RR."]);
    paint(g, 76, 32, ["R"]);
    paint(g, 82, 35, ["PQP", ".P."]);
    ellipse(g, 53, 43 + rise, 40, 14, "B", "E", "D");
    ellipse(g, 62, 41 + rise, 28, 10, "D", "F", "E");
    drawLine(g, 22, 36 + rise, 36, 52 + rise, "F");
    drawLine(g, 39, 34 + rise, 51, 55 + rise, "D");
    drawLine(g, 59, 34 + rise, 70, 55 + rise, "F");
    drawLine(g, 78, 35 + rise, 89, 51 + rise, "D");
    drawLine(g, 27, 51 + rise, 82, 45 + rise, "4");
    drawLine(g, 24, 56 + rise, 87, 52 + rise, "D");
    drawLine(g, 31, 41 + rise, 45, 59 + rise, "F");
    drawLine(g, 67, 33 + rise, 93, 49 + rise, "S");
    paint(g, 20, 45 + rise, ["G.G.G.G.G.G.G", ".F.F.F.F.F.F."]);
    paint(g, 37, 39 + rise, ["F..F..F..F..F", ".4..4..4..4."]);
    paint(g, 91, 44 + rise, ["BB", "B.", "BB"]);
    rect(g, 10, 65, 5, 5, "C");
    rect(g, 92, 64, 5, 6, "C");
    paint(g, 6, 39, ["GGGGGGGGGGGG"]);
    if (step === 2) paint(g, 45, 38, ["F.F.F.F"]);
  });
}

function sceneWindowFrameFrame() {
  return makeFrame(96, 80, (g) => {
    rect(g, 3, 3, 90, 6, "A");
    rect(g, 3, 71, 90, 6, "A");
    rect(g, 3, 3, 6, 74, "A");
    rect(g, 87, 3, 6, 74, "A");
    rect(g, 7, 7, 82, 3, "J");
    rect(g, 7, 67, 82, 4, "B");
    rect(g, 7, 7, 4, 64, "B");
    rect(g, 85, 7, 4, 64, "J");
    rect(g, 7, 37, 82, 5, "B");
    rect(g, 45, 7, 6, 66, "B");
    rect(g, 13, 14, 28, 3, "L");
    rect(g, 55, 14, 25, 3, "L");
    rect(g, 14, 60, 27, 3, "9");
    rect(g, 55, 60, 25, 3, "9");
    paint(g, 20, 24, ["2..2.....2....2", ".2....2.....2.."]);
    paint(g, 56, 47, ["2....2....2", "...2....2.."]);
    drawLine(g, 15, 18, 37, 59, "2");
    drawLine(g, 58, 16, 78, 48, "2");
    drawLine(g, 16, 52, 32, 52, "M");
    drawLine(g, 59, 28, 75, 28, "M");
    for (let x = 8; x <= 84; x += 12) {
      setPixel(g, x, 8, "4");
      setPixel(g, x, 72, "4");
    }
  });
}

function sceneZombieSilhouetteFrame(kind, step) {
  return makeFrame(32, 56, (g) => {
    const sway = kind === "walk" ? step % 2 : 0;
    const arm = kind === "walk" ? step - 1 : 0;
    ellipse(g, 16 + sway, 9, 6, 7, "A", "X", "K");
    rect(g, 12 + sway, 16, 9, 19, "X");
    rect(g, 13 + sway, 18, 7, 14, "K");
    paint(g, 13 + sway, 9, ["Y.Y", ".N."]);
    drawLine(g, 12 + sway, 19, 4 + arm, 30, "X");
    drawLine(g, 21 + sway, 19, 28 - arm, 31, "X");
    drawLine(g, 14 + sway, 34, 9 - (step % 2), 52, "X");
    drawLine(g, 19 + sway, 34, 24 + (step % 2), 52, "X");
    drawLine(g, 15 + sway, 34, 12, 51, "K");
    drawLine(g, 20 + sway, 34, 21, 51, "K");
    if (kind === "walk" && step === 2) paint(g, 10, 22, ["N", ".N"]);
    if (kind === "walk" && step === 3) paint(g, 21, 23, ["N", "N."]);
  });
}

function sceneShelfSuppliesFrame() {
  return makeFrame(80, 88, (g) => {
    outlineRect(g, 3, 5, 74, 78, "A", "C");
    rect(g, 6, 14, 68, 4, "B");
    rect(g, 6, 38, 68, 4, "B");
    rect(g, 6, 63, 68, 4, "B");
    rect(g, 8, 8, 4, 73, "B");
    rect(g, 68, 8, 4, 73, "B");
    for (let x = 14; x < 64; x += 13) {
      outlineRect(g, x, 22, 8, 15, "A", "J");
      rect(g, x + 2, 27, 4, 4, x % 2 ? "S" : "T");
      rect(g, x + 1, 23, 6, 2, "I");
    }
    for (let x = 13; x < 55; x += 16) {
      outlineRect(g, x, 44, 7, 18, "A", "L");
      rect(g, x + 2, 41, 3, 4, "M");
      rect(g, x + 1, 50, 5, 4, "2");
    }
    for (let x = 40; x < 67; x += 12) {
      outlineRect(g, x, 45, 9, 16, "A", "V");
      rect(g, x + 2, 48, 5, 3, "S");
      rect(g, x + 1, 42, 7, 3, "J");
    }
    paint(g, 14, 70, ["SSSSS", "S...S", "SSSSS"]);
    paint(g, 25, 72, ["TTTT", "T..T"]);
    outlineRect(g, 42, 69, 21, 10, "A", "D");
    paint(g, 47, 71, ["POTS", ".44."]);
    paint(g, 12, 11, ["G.G.G.G.G.G.G.G.G"]);
  });
}

function sceneLampBulbFrame(kind, step) {
  return makeFrame(32, 48, (g) => {
    const hot = kind === "glow" ? step : 0;
    rect(g, 14, 20, 4, 20, "J");
    rect(g, 9, 40, 14, 4, "B");
    rect(g, 7, 44, 18, 3, "A");
    outlineRect(g, 8, 14, 16, 8, "B", hot === 1 ? "G" : "F");
    ellipse(g, 16, 11, 6, 8, "B", hot === 0 ? "F" : hot === 1 ? "G" : "W", "H");
    paint(g, 13, 5, hot === 2 ? ["G.W.G", ".WWW.", "G.W.G"] : [".G.G.", "..W..", ".G.G."]);
    drawLine(g, 5, 22, 16, 2, "J");
    setPixel(g, 5, 22, "A");
    setPixel(g, 26, 22, "A");
    if (kind === "glow") {
      paint(g, 6 + step, 8, ["G", ".G"]);
      paint(g, 24 - step, 8, ["G", "G."]);
    }
  });
}

function sceneStringLightsFrame(kind, step) {
  return makeFrame(128, 24, (g) => {
    const points = [
      [2, 8],
      [18, 13],
      [34, 15],
      [50, 10],
      [66, 8],
      [82, 12],
      [99, 15],
      [116, 10],
      [127, 9]
    ];
    for (let i = 0; i < points.length - 1; i += 1) drawLine(g, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], "J");
    points.slice(1, -1).forEach(([x, y], index) => {
      const bright = kind === "twinkle" ? (index + step) % 4 : index % 3;
      rect(g, x - 1, y + 1, 3, 2, "B");
      setPixel(g, x, y + 3, bright === 0 ? "W" : bright === 1 ? "G" : bright === 2 ? "H" : "F");
      if (bright === 0 || bright === 1) {
        setPixel(g, x - 2, y + 3, "G");
        setPixel(g, x + 2, y + 3, "G");
      }
    });
    paint(g, 5, 2, ["4...4...4"]);
  });
}

function sceneTeddyFrame() {
  return makeFrame(24, 28, (g) => {
    ellipse(g, 7, 8, 4, 4, "B", "Z", "U");
    ellipse(g, 17, 8, 4, 4, "B", "Z", "U");
    ellipse(g, 12, 11, 7, 8, "B", "Z", "U");
    ellipse(g, 12, 19, 8, 7, "B", "Z", "U");
    ellipse(g, 12, 18, 4, 4, "U", "4", "Z");
    paint(g, 9, 10, ["A...A", "..R..", ".AAA."]);
    drawLine(g, 5, 17, 1, 23, "B");
    drawLine(g, 19, 17, 23, 23, "B");
    drawLine(g, 8, 23, 5, 27, "B");
    drawLine(g, 16, 23, 19, 27, "B");
  });
}

function sceneRadioFrame(kind, step) {
  return makeFrame(32, 24, (g) => {
    drawLine(g, 6, 5, 2, 0, "J");
    outlineRect(g, 3, 7, 26, 14, "A", "C");
    rect(g, 6, 10, 9, 7, "K");
    rect(g, 7, 11, 7, 5, "L");
    for (let x = 17; x <= 25; x += 2) drawLine(g, x, 10, x, 17, "J");
    ellipse(g, 24, 17, 3, 3, "A", "J", "1");
    setPixel(g, 27, 9, kind === "blink" && step === 1 ? "T" : "G");
    if (kind === "blink" && step === 1) paint(g, 25, 7, ["T.T", ".T."]);
    rect(g, 5, 21, 4, 2, "B");
    rect(g, 23, 21, 4, 2, "B");
  });
}

function scenePlantShelfFrame(kind, step) {
  return makeFrame(72, 72, (g) => {
    const sway = kind === "sway" ? step - 1 : 0;
    outlineRect(g, 4, 8, 64, 55, "A", "C");
    rect(g, 8, 21, 56, 4, "B");
    rect(g, 8, 44, 56, 4, "B");
    rect(g, 10, 12, 15, 7, "0");
    rect(g, 12, 14, 11, 3, "8");
    rect(g, 45, 11, 15, 8, "B");
    rect(g, 47, 13, 11, 4, "G");
    for (let x = 13; x <= 53; x += 13) {
      outlineRect(g, x, 49, 10, 9, "A", "5");
      drawLine(g, x + 5, 48, x + 3 + sway, 37, "O");
      drawLine(g, x + 5, 48, x + 8 + sway, 38, "O");
      drawLine(g, x + 5, 47, x + 5 + sway, 34, "6");
      ellipse(g, x + 2 + sway, 39, 4, 2, "Y", "O", "6");
      ellipse(g, x + 8 + sway, 39, 4, 2, "Y", "O", "6");
      ellipse(g, x + 5 + sway, 34, 3, 4, "Y", "O", "6");
    }
    drawLine(g, 17, 26, 55, 26, "G");
    for (let x = 19; x < 55; x += 8) setPixel(g, x, 27, "H");
    rect(g, 5, 63, 62, 4, "B");
  });
}

function scenePropsFrame() {
  return makeFrame(96, 48, (g) => {
    rect(g, 0, 37, 96, 6, "B");
    rect(g, 0, 34, 96, 4, "D");
    outlineRect(g, 7, 13, 18, 20, "A", "S");
    paint(g, 10, 17, ["T.T.T", ".TT..", "T...T"]);
    outlineRect(g, 29, 20, 22, 12, "A", "J");
    rect(g, 31, 17, 18, 5, "B");
    paint(g, 34, 23, ["4.4.4", ".4.4."]);
    outlineRect(g, 59, 18, 13, 16, "A", "P");
    rect(g, 61, 16, 9, 3, "I");
    rect(g, 62, 24, 7, 4, "L");
    outlineRect(g, 76, 22, 12, 12, "A", "F");
    rect(g, 88, 25, 4, 5, "A");
    paint(g, 12, 5, ["SSSSSSSSSS", "S.T..T..S", "SSSSSSSSSS"]);
    drawLine(g, 52, 31, 62, 23, "J");
    drawLine(g, 53, 31, 63, 23, "J");
    paint(g, 5, 39, ["FDFDFDFDFDFDFDF"]);
    paint(g, 68, 39, ["EEEEFFFFEEE"]);
  });
}

const SPRITES = {
  zombie_shambler: makeSprite(
    "zombie_shambler",
    "enemy",
    "zombie",
    { x: 8, y: 14 },
    { x: 3, y: 2, w: 10, h: 13 },
    {
      idle_0: shamblerFrame("idle", 0),
      walk_0: shamblerFrame("walk", 0),
      walk_1: shamblerFrame("walk", 1),
      walk_2: shamblerFrame("walk", 2),
      walk_3: shamblerFrame("walk", 3),
      hit_0: shamblerFrame("hit", 0),
      death_0: shamblerFrame("death", 0),
      death_1: shamblerFrame("death", 1),
      death_2: shamblerFrame("death", 2)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      walk: { frames: sequence("walk", 4), fps: 7, loop: true },
      hit: { frames: ["hit_0"], fps: 1, loop: false },
      death: { frames: sequence("death", 3), fps: 8, loop: false }
    }
  ),
  zombie_runner: makeSprite(
    "zombie_runner",
    "enemy",
    "zombie",
    { x: 8, y: 14 },
    { x: 4, y: 1, w: 9, h: 14 },
    {
      idle_0: runnerFrame("idle", 0),
      walk_0: runnerFrame("walk", 0),
      walk_1: runnerFrame("walk", 1),
      walk_2: runnerFrame("walk", 2),
      walk_3: runnerFrame("walk", 3),
      hit_0: runnerFrame("hit", 0),
      death_0: runnerFrame("death", 0),
      death_1: runnerFrame("death", 1),
      death_2: runnerFrame("death", 2)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      walk: { frames: sequence("walk", 4), fps: 12, loop: true },
      hit: { frames: ["hit_0"], fps: 1, loop: false },
      death: { frames: sequence("death", 3), fps: 10, loop: false }
    }
  ),
  zombie_bloater: makeSprite(
    "zombie_bloater",
    "enemy",
    "zombie",
    { x: 12, y: 22 },
    { x: 4, y: 2, w: 16, h: 20 },
    {
      idle_0: bloaterFrame("idle", 0),
      walk_0: bloaterFrame("walk", 0),
      walk_1: bloaterFrame("walk", 1),
      walk_2: bloaterFrame("walk", 2),
      walk_3: bloaterFrame("walk", 3),
      hit_0: bloaterFrame("hit", 0),
      death_0: bloaterFrame("death", 0),
      death_1: bloaterFrame("death", 1),
      death_2: bloaterFrame("death", 2),
      death_3: bloaterFrame("death", 3),
      burst_0: bloaterFrame("burst", 0),
      burst_1: bloaterFrame("burst", 1),
      burst_2: bloaterFrame("burst", 2),
      burst_3: bloaterFrame("burst", 3)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      walk: { frames: sequence("walk", 4), fps: 5, loop: true },
      hit: { frames: ["hit_0"], fps: 1, loop: false },
      death: { frames: sequence("death", 4), fps: 7, loop: false },
      burst: { frames: sequence("burst", 4), fps: 12, loop: false }
    }
  ),
  boss_hive_titan: makeSprite(
    "boss_hive_titan",
    "boss",
    "hive",
    { x: 24, y: 43 },
    { x: 7, y: 3, w: 34, h: 42 },
    {
      idle_0: bossFrame("idle", 0),
      walk_0: bossFrame("walk", 0),
      walk_1: bossFrame("walk", 1),
      walk_2: bossFrame("walk", 2),
      walk_3: bossFrame("walk", 3),
      walk_4: bossFrame("walk", 4),
      walk_5: bossFrame("walk", 5),
      attack_0: bossFrame("attack", 0),
      attack_1: bossFrame("attack", 1),
      attack_2: bossFrame("attack", 2),
      attack_3: bossFrame("attack", 3),
      rage_0: bossFrame("rage", 0),
      rage_1: bossFrame("rage", 1),
      rage_2: bossFrame("rage", 2),
      hit_0: bossFrame("hit", 0),
      death_0: bossFrame("death", 0),
      death_1: bossFrame("death", 1),
      death_2: bossFrame("death", 2),
      death_3: bossFrame("death", 3),
      death_4: bossFrame("death", 4)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      walk: { frames: sequence("walk", 6), fps: 6, loop: true },
      attack: { frames: sequence("attack", 4), fps: 8, loop: false },
      rage: { frames: sequence("rage", 3), fps: 6, loop: true },
      hit: { frames: ["hit_0"], fps: 1, loop: false },
      death: { frames: sequence("death", 5), fps: 6, loop: false }
    }
  ),
  vehicle_iron_crow: makeSprite(
    "vehicle_iron_crow",
    "vehicle",
    "metal",
    { x: 32, y: 29 },
    { x: 3, y: 8, w: 54, h: 24 },
    {
      idle_0: ironCrowFrame("idle", 0),
      idle_1: ironCrowFrame("idle", 1),
      move_0: ironCrowFrame("move", 0),
      move_1: ironCrowFrame("move", 1),
      move_2: ironCrowFrame("move", 2),
      move_3: ironCrowFrame("move", 3),
      damage_0: ironCrowFrame("damage", 0),
      damage_1: ironCrowFrame("damage", 1),
      wreck_0: ironCrowFrame("wreck", 0),
      wreck_1: ironCrowFrame("wreck", 1),
      wreck_2: ironCrowFrame("wreck", 2)
    },
    {
      idle: { frames: sequence("idle", 2), fps: 2, loop: true },
      move: { frames: sequence("move", 4), fps: 10, loop: true },
      damage: { frames: sequence("damage", 2), fps: 6, loop: false },
      wreck: { frames: sequence("wreck", 3), fps: 5, loop: false }
    },
    ["train"]
  ),
  vehicle_dawn_skiff: makeSprite(
    "vehicle_dawn_skiff",
    "vehicle",
    "metal",
    { x: 24, y: 33 },
    { x: 4, y: 14, w: 40, h: 24 },
    {
      idle_0: dawnSkiffFrame("idle", 0),
      idle_1: dawnSkiffFrame("idle", 1),
      idle_2: dawnSkiffFrame("idle", 2),
      idle_3: dawnSkiffFrame("idle", 3),
      move_0: dawnSkiffFrame("move", 0),
      move_1: dawnSkiffFrame("move", 1),
      move_2: dawnSkiffFrame("move", 2),
      move_3: dawnSkiffFrame("move", 3),
      damage_0: dawnSkiffFrame("damage", 0),
      damage_1: dawnSkiffFrame("damage", 1),
      wreck_0: dawnSkiffFrame("wreck", 0),
      wreck_1: dawnSkiffFrame("wreck", 1),
      wreck_2: dawnSkiffFrame("wreck", 2)
    },
    {
      idle: { frames: sequence("idle", 4), fps: 4, loop: true },
      move: { frames: sequence("move", 4), fps: 12, loop: true },
      damage: { frames: sequence("damage", 2), fps: 6, loop: false },
      wreck: { frames: sequence("wreck", 3), fps: 5, loop: false }
    },
    ["skiff"]
  ),
  bullet_machine: makeSprite(
    "bullet_machine",
    "bullet",
    "energy",
    { x: 4, y: 4 },
    { x: 1, y: 2, w: 6, h: 4 },
    { move_0: bulletMachineFrame(0), move_1: bulletMachineFrame(1) },
    { move: { frames: sequence("move", 2), fps: 18, loop: true } }
  ),
  bullet_pulse: makeSprite(
    "bullet_pulse",
    "bullet",
    "energy",
    { x: 4, y: 4 },
    { x: 1, y: 1, w: 6, h: 6 },
    { move_0: bulletPulseFrame(0), move_1: bulletPulseFrame(1) },
    { move: { frames: sequence("move", 2), fps: 14, loop: true } }
  ),
  bullet_rocket: makeSprite(
    "bullet_rocket",
    "bullet",
    "energy",
    { x: 6, y: 4 },
    { x: 0, y: 2, w: 11, h: 4 },
    { move_0: bulletRocketFrame(0), move_1: bulletRocketFrame(1) },
    { move: { frames: sequence("move", 2), fps: 14, loop: true } }
  ),
  effect_muzzle: makeSprite(
    "effect_muzzle",
    "effect",
    "energy",
    { x: 8, y: 8 },
    { x: 2, y: 3, w: 12, h: 10 },
    { burst_0: muzzleFrame(0), burst_1: muzzleFrame(1), burst_2: muzzleFrame(2) },
    { burst: { frames: sequence("burst", 3), fps: 18, loop: false } }
  ),
  effect_hit: makeSprite(
    "effect_hit",
    "effect",
    "energy",
    { x: 8, y: 8 },
    { x: 2, y: 2, w: 12, h: 12 },
    { burst_0: hitFrame(0), burst_1: hitFrame(1), burst_2: hitFrame(2) },
    { burst: { frames: sequence("burst", 3), fps: 16, loop: false } }
  ),
  effect_explosion_small: makeSprite(
    "effect_explosion_small",
    "effect",
    "energy",
    { x: 12, y: 12 },
    { x: 1, y: 2, w: 22, h: 20 },
    {
      burst_0: explosionFrame(0),
      burst_1: explosionFrame(1),
      burst_2: explosionFrame(2),
      burst_3: explosionFrame(3),
      burst_4: explosionFrame(4)
    },
    { burst: { frames: sequence("burst", 5), fps: 14, loop: false } }
  ),
  effect_shield: makeSprite(
    "effect_shield",
    "effect",
    "energy",
    { x: 16, y: 16 },
    { x: 3, y: 2, w: 26, h: 28 },
    {
      pulse_0: shieldFrame(0),
      pulse_1: shieldFrame(1),
      pulse_2: shieldFrame(2),
      pulse_3: shieldFrame(3)
    },
    { pulse: { frames: sequence("pulse", 4), fps: 8, loop: true } }
  ),
  gate_damage: makeSprite(
    "gate_damage",
    "gate",
    "gate",
    { x: 16, y: 43 },
    { x: 4, y: 5, w: 24, h: 39 },
    {
      idle_0: gateFrame("damage", "idle", 0),
      idle_1: gateFrame("damage", "idle", 1),
      idle_2: gateFrame("damage", "idle", 2),
      idle_3: gateFrame("damage", "idle", 3),
      break_0: gateFrame("damage", "break", 0),
      break_1: gateFrame("damage", "break", 1),
      break_2: gateFrame("damage", "break", 2),
      break_3: gateFrame("damage", "break", 3)
    },
    { idle: { frames: sequence("idle", 4), fps: 5, loop: true }, break: { frames: sequence("break", 4), fps: 10, loop: false } },
    ["damage"]
  ),
  gate_rate: makeSprite(
    "gate_rate",
    "gate",
    "gate",
    { x: 16, y: 43 },
    { x: 4, y: 5, w: 24, h: 39 },
    {
      idle_0: gateFrame("rate", "idle", 0),
      idle_1: gateFrame("rate", "idle", 1),
      idle_2: gateFrame("rate", "idle", 2),
      idle_3: gateFrame("rate", "idle", 3),
      break_0: gateFrame("rate", "break", 0),
      break_1: gateFrame("rate", "break", 1),
      break_2: gateFrame("rate", "break", 2),
      break_3: gateFrame("rate", "break", 3)
    },
    { idle: { frames: sequence("idle", 4), fps: 5, loop: true }, break: { frames: sequence("break", 4), fps: 10, loop: false } },
    ["rate"]
  ),
  gate_multishot: makeSprite(
    "gate_multishot",
    "gate",
    "gate",
    { x: 16, y: 43 },
    { x: 4, y: 5, w: 24, h: 39 },
    {
      idle_0: gateFrame("multishot", "idle", 0),
      idle_1: gateFrame("multishot", "idle", 1),
      idle_2: gateFrame("multishot", "idle", 2),
      idle_3: gateFrame("multishot", "idle", 3),
      break_0: gateFrame("multishot", "break", 0),
      break_1: gateFrame("multishot", "break", 1),
      break_2: gateFrame("multishot", "break", 2),
      break_3: gateFrame("multishot", "break", 3)
    },
    { idle: { frames: sequence("idle", 4), fps: 5, loop: true }, break: { frames: sequence("break", 4), fps: 10, loop: false } },
    ["multishot"]
  ),
  gate_repair: makeSprite(
    "gate_repair",
    "gate",
    "gate",
    { x: 16, y: 43 },
    { x: 4, y: 5, w: 24, h: 39 },
    {
      idle_0: gateFrame("repair", "idle", 0),
      idle_1: gateFrame("repair", "idle", 1),
      idle_2: gateFrame("repair", "idle", 2),
      idle_3: gateFrame("repair", "idle", 3),
      break_0: gateFrame("repair", "break", 0),
      break_1: gateFrame("repair", "break", 1),
      break_2: gateFrame("repair", "break", 2),
      break_3: gateFrame("repair", "break", 3)
    },
    { idle: { frames: sequence("idle", 4), fps: 5, loop: true }, break: { frames: sequence("break", 4), fps: 10, loop: false } },
    ["repair"]
  ),
  tile_road: makeSprite(
    "tile_road",
    "terrain",
    "terrain",
    { x: 16, y: 16 },
    { x: 0, y: 0, w: 32, h: 32 },
    { idle_0: tileRoadFrame() },
    { idle: { frames: ["idle_0"], fps: 1, loop: true } }
  ),
  tile_wasteland: makeSprite(
    "tile_wasteland",
    "terrain",
    "terrain",
    { x: 16, y: 16 },
    { x: 0, y: 0, w: 32, h: 32 },
    { idle_0: tileWastelandFrame() },
    { idle: { frames: ["idle_0"], fps: 1, loop: true } }
  ),
  bg_ruins_strip: makeSprite(
    "bg_ruins_strip",
    "background",
    "terrain",
    { x: 0, y: 32 },
    { x: 0, y: 0, w: 128, h: 32 },
    { scroll_0: ruinsStripFrame() },
    { scroll: { frames: ["scroll_0"], fps: 1, loop: true } }
  ),
  scene_bed_sleeper: makeSceneSprite(
    "scene_bed_sleeper",
    { x: 56, y: 64 },
    { x: 5, y: 24, w: 102, h: 46 },
    {
      idle_0: sceneBedSleeperFrame(0),
      breathe_0: sceneBedSleeperFrame(1),
      breathe_1: sceneBedSleeperFrame(2),
      breathe_2: sceneBedSleeperFrame(3)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      breathe: { frames: sequence("breathe", 3), fps: 1.4, loop: true }
    },
    ["bed", "sleeper"]
  ),
  scene_window_frame: makeSceneSprite(
    "scene_window_frame",
    { x: 48, y: 78 },
    { x: 5, y: 5, w: 86, h: 70 },
    { idle_0: sceneWindowFrameFrame() },
    { idle: { frames: ["idle_0"], fps: 1, loop: true } },
    ["window"]
  ),
  scene_zombie_silhouette: makeSceneSprite(
    "scene_zombie_silhouette",
    { x: 16, y: 54 },
    { x: 3, y: 2, w: 26, h: 53 },
    {
      idle_0: sceneZombieSilhouetteFrame("idle", 0),
      walk_0: sceneZombieSilhouetteFrame("walk", 0),
      walk_1: sceneZombieSilhouetteFrame("walk", 1),
      walk_2: sceneZombieSilhouetteFrame("walk", 2),
      walk_3: sceneZombieSilhouetteFrame("walk", 3)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      walk: { frames: sequence("walk", 4), fps: 1.2, loop: true }
    },
    ["window", "zombie"]
  ),
  scene_shelf_supplies: makeSceneSprite(
    "scene_shelf_supplies",
    { x: 40, y: 84 },
    { x: 3, y: 5, w: 74, h: 78 },
    { idle_0: sceneShelfSuppliesFrame() },
    { idle: { frames: ["idle_0"], fps: 1, loop: true } },
    ["supplies"]
  ),
  scene_lamp_bulb: makeSceneSprite(
    "scene_lamp_bulb",
    { x: 16, y: 46 },
    { x: 5, y: 2, w: 22, h: 45 },
    {
      idle_0: sceneLampBulbFrame("idle", 0),
      glow_0: sceneLampBulbFrame("glow", 0),
      glow_1: sceneLampBulbFrame("glow", 1),
      glow_2: sceneLampBulbFrame("glow", 2)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      glow: { frames: sequence("glow", 3), fps: 2, loop: true }
    },
    ["lamp"]
  ),
  scene_string_lights: makeSceneSprite(
    "scene_string_lights",
    { x: 64, y: 12 },
    { x: 1, y: 2, w: 126, h: 20 },
    {
      idle_0: sceneStringLightsFrame("idle", 0),
      twinkle_0: sceneStringLightsFrame("twinkle", 0),
      twinkle_1: sceneStringLightsFrame("twinkle", 1),
      twinkle_2: sceneStringLightsFrame("twinkle", 2),
      twinkle_3: sceneStringLightsFrame("twinkle", 3)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      twinkle: { frames: sequence("twinkle", 4), fps: 3, loop: true }
    },
    ["lights"]
  ),
  scene_teddy: makeSceneSprite(
    "scene_teddy",
    { x: 12, y: 27 },
    { x: 0, y: 4, w: 24, h: 24 },
    { idle_0: sceneTeddyFrame() },
    { idle: { frames: ["idle_0"], fps: 1, loop: true } },
    ["bed", "prop"]
  ),
  scene_radio: makeSceneSprite(
    "scene_radio",
    { x: 16, y: 22 },
    { x: 2, y: 0, w: 28, h: 23 },
    {
      idle_0: sceneRadioFrame("idle", 0),
      blink_0: sceneRadioFrame("blink", 0),
      blink_1: sceneRadioFrame("blink", 1)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      blink: { frames: sequence("blink", 2), fps: 1.5, loop: true }
    },
    ["radio"]
  ),
  scene_plant_shelf: makeSceneSprite(
    "scene_plant_shelf",
    { x: 36, y: 68 },
    { x: 4, y: 8, w: 64, h: 60 },
    {
      idle_0: scenePlantShelfFrame("idle", 0),
      sway_0: scenePlantShelfFrame("sway", 0),
      sway_1: scenePlantShelfFrame("sway", 1),
      sway_2: scenePlantShelfFrame("sway", 2)
    },
    {
      idle: { frames: ["idle_0"], fps: 1, loop: true },
      sway: { frames: sequence("sway", 3), fps: 1.6, loop: true }
    },
    ["plant"]
  ),
  scene_props: makeSceneSprite(
    "scene_props",
    { x: 48, y: 44 },
    { x: 0, y: 5, w: 96, h: 39 },
    { idle_0: scenePropsFrame() },
    { idle: { frames: ["idle_0"], fps: 1, loop: true } },
    ["props"]
  )
};

const DSSprites = { PALETTES, SPRITES, SPRITE_SPECS };

if (typeof window !== "undefined") window.DSSprites = DSSprites;
if (typeof module !== "undefined" && module.exports) module.exports = DSSprites;
