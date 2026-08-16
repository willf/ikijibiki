#!/usr/bin/env node
// Bakes data/words.json (gzip+base64) directly into js/index.js's
// WORD_DATA_GZIP_B64 constant. The data lives in the script itself (not
// fetched at runtime) because fetch() for local files hits cross-origin
// restrictions when index.html is opened via file://. Entries missing a
// "def" value are dropped, since they have nothing to show the player.
//
// Run this after editing data/words.json, then re-run scripts/build.js.
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const jsPath = path.join(root, "js", "index.js");
const wordsPath = path.join(root, "data", "words.filtered.json");

const js = fs.readFileSync(jsPath, "utf8");
const data = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
const originalCount = data.entries.length;
data.entries = data.entries.filter((entry) => entry.def);
const skippedCount = originalCount - data.entries.length;
const words = JSON.stringify(data);
const b64 = zlib.gzipSync(words).toString("base64");

if (!/const WORD_DATA_GZIP_B64 =[^;]*;/.test(js)) {
  throw new Error("Could not find WORD_DATA_GZIP_B64 constant in js/index.js");
}

const updated = js.replace(
  /const WORD_DATA_GZIP_B64 =[^;]*;/,
  `const WORD_DATA_GZIP_B64 = "${b64}";`,
);

fs.writeFileSync(jsPath, updated);
console.log(
  `Embedded ${data.entries.length.toLocaleString()} entries ` +
    `(skipped ${skippedCount.toLocaleString()} missing a def), ` +
    `${words.length.toLocaleString()} bytes ` +
    `(${b64.length.toLocaleString()} base64 chars) into js/index.js`,
);
