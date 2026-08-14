#!/usr/bin/env node
// Builds a single self-contained dist/index.html: inlines css/index.css and
// js/index.js (which already has data/words.json baked in via
// scripts/embed-data.js) so the page needs no network requests (besides the
// lodash CDN <script> tag) once loaded.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "dist");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "index.css"), "utf8");
const js = fs.readFileSync(path.join(root, "js", "index.js"), "utf8");

let output = html
  .replace(
    '<link rel="stylesheet" href="css/index.css" />',
    `<style>\n${css}\n</style>`,
  )
  .replace('<script src="js/index.js"></script>', `<script>\n${js}\n</script>`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), output);
fs.cpSync(path.join(root, "images"), path.join(outDir, "images"), {
  recursive: true,
});

console.log(`Wrote ${path.join("dist", "index.html")}`);
