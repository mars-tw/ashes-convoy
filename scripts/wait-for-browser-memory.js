"use strict";

const os = require("os");

const MIN_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ATTEMPTS = 10;
const WAIT_MS = 60000;

function gib(bytes) {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const free = os.freemem();
    if (free >= MIN_BYTES) {
      console.log(`BROWSER MEMORY GATE PASS free=${gib(free)}GiB attempt=${attempt}`);
      return;
    }
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`BROWSER MEMORY GATE FAIL free=${gib(free)}GiB after ${MAX_ATTEMPTS} retries`);
    }
    console.log(`BROWSER MEMORY GATE WAIT free=${gib(free)}GiB retry=${attempt + 1}/${MAX_ATTEMPTS} in 60s`);
    await wait(WAIT_MS);
  }
})().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
