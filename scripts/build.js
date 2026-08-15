#!/usr/bin/env node
// Builds a single self-contained root index.html from index.template.html:
// inlines css/index.css and js/index.js (which already has data/words.json
// baked in via scripts/embed-data.js) so the page needs no network requests
// once loaded.
"use strict";

const fs = require("fs");
const path = require("path");
const { applyConfig } = require("./apply-config");

const root = path.join(__dirname, "..");

applyConfig();

const html = fs.readFileSync(path.join(root, "index.template.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "index.css"), "utf8");
const js = fs.readFileSync(path.join(root, "js", "index.js"), "utf8");

let output = html
  .replace(
    '<link rel="stylesheet" href="css/index.css" />',
    `<style>\n${css}\n</style>`,
  )
  .replace('<script src="js/index.js"></script>', `<script>\n${js}\n</script>`);

fs.writeFileSync(path.join(root, "index.html"), output);

console.log("Wrote index.html");
