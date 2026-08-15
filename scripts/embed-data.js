#!/usr/bin/env node
// Bakes data/words.json (gzip+base64) directly into js/index.js's
// WORD_DATA_GZIP_B64 constant. The data lives in the script itself (not
// fetched at runtime) because fetch() for local files hits cross-origin
// restrictions when index.html is opened via file://.
//
// Run this after editing data/words.json, then re-run scripts/build.js.
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const jsPath = path.join(root, "js", "index.js");
const wordsPath = path.join(root, "data", "words.ahd.json");

const js = fs.readFileSync(jsPath, "utf8");
const words = fs.readFileSync(wordsPath, "utf8");
const b64 = zlib.gzipSync(words).toString("base64");

const updated = js.replace(
  /const WORD_DATA_GZIP_B64 =[^;]*;/,
  `const WORD_DATA_GZIP_B64 = "${b64}";`,
);

if (updated === js) {
  throw new Error("Could not find WORD_DATA_GZIP_B64 constant in js/index.js");
}

fs.writeFileSync(jsPath, updated);
console.log(
  `Embedded ${words.length.toLocaleString()} bytes of word data ` +
    `(${b64.length.toLocaleString()} base64 chars) into js/index.js`,
);
