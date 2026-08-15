#!/usr/bin/env node
// Bakes config.toml values into their matching js/index.js constants. Only a
// small subset of TOML (flat `key = value` pairs, `#` comments) is supported
// since the config is intentionally simple.
//
// Run this directly after editing config.toml, or let scripts/build.js call
// applyConfig() so it always runs before a build.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const jsPath = path.join(root, "js", "index.js");
const configPath = path.join(root, "config.toml");

// Maps config.toml keys to the js/index.js constant they're baked into.
const CONFIG_CONSTANTS = {
  dictionary_size: "DICTIONARY_SIZE",
  ikijibiki_threshold: "IKIJIBIKI_THRESHOLD",
};

function parse_simple_toml(text) {
  const config = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!match) throw new Error(`Could not parse config.toml line: ${rawLine}`);
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      config[key] = Number(value);
    } else if (value === "true" || value === "false") {
      config[key] = value === "true";
    } else if (/^".*"$/.test(value)) {
      config[key] = value.slice(1, -1);
    } else {
      throw new Error(`Unsupported config.toml value for ${key}: ${rawValue}`);
    }
  }
  return config;
}

function readConfig() {
  return parse_simple_toml(fs.readFileSync(configPath, "utf8"));
}

function applyConfig() {
  let js = fs.readFileSync(jsPath, "utf8");
  const config = readConfig();

  for (const [key, constantName] of Object.entries(CONFIG_CONSTANTS)) {
    if (typeof config[key] !== "number") {
      throw new Error(`config.toml is missing a numeric ${key}`);
    }
    const pattern = new RegExp(`const ${constantName} = [^;]*;`);
    if (!pattern.test(js)) {
      throw new Error(`Could not find ${constantName} constant in js/index.js`);
    }
    js = js.replace(pattern, `const ${constantName} = ${config[key]};`);
    console.log(`Applied ${key} = ${config[key]} to js/index.js`);
  }

  fs.writeFileSync(jsPath, js);
}

module.exports = { applyConfig, readConfig };

if (require.main === module) {
  applyConfig();
}
