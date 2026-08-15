#!/usr/bin/env node
// Fetches N random words + first definitions from the Wordnik API and writes
// data/words.json for scripts/build.js to embed. Wordnik rate-limits calls
// (one request per word for definitions), so this runs slowly on purpose,
// checkpoints progress to disk, and can be safely re-run to resume.
//
// Usage:
//   WORDNIK_API_KEY=xxxx node scripts/fetch-words.js [count] [delayMs]
//
// Get a free API key at https://developer.wordnik.com/
"use strict";

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.WORDNIK_API_KEY;
if (!API_KEY) {
  console.error(
    "Set WORDNIK_API_KEY in the environment before running this script.",
  );
  process.exit(1);
}

const count = parseInt(process.argv[2] || "10000", 10);
const delayMs = parseInt(process.argv[3] || "400", 10);
const outPath = path.join(__dirname, "..", "data", "words.json");

const wordsEndpoint = "https://api.wordnik.com/v4/words.json/randomWords";
const wordEndpoint = "https://api.wordnik.com/v4/word.json/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function build_url(url_string, params) {
  var url = new URL(url_string);
  url.search = new URLSearchParams({ ...params, api_key: API_KEY });
  return url;
}

async function wn_call(endpoint, params) {
  const response = await fetch(build_url(endpoint, params));
  if (response.status === 429) {
    console.log("rate limited, waiting 60s...");
    await sleep(60000);
    return wn_call(endpoint, params);
  }
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText} for ${endpoint}`,
    );
  }
  return response.json();
}

async function fetch_candidate_words(n) {
  const seen = new Set();
  const words = [];
  while (words.length < n) {
    const batch = await wn_call(wordsEndpoint, {
      hasDictionaryDef: true,
      minCorpusCount: 5,
      minLength: 5,
      limit: Math.min(500, n - words.length),
    });
    for (const entry of batch) {
      if (!seen.has(entry.word)) {
        seen.add(entry.word);
        words.push(entry.word);
      }
    }
    await sleep(delayMs);
  }
  return words;
}

async function fetch_first_definition(word) {
  const definitions = await wn_call(
    wordEndpoint + encodeURIComponent(word) + "/definitions",
    {
      limit: 1,
      includeRelated: false,
      sourceDictionaries: "all",
      useCanonical: false,
      includeTags: false,
    },
  );
  const first = definitions && definitions[0];
  if (!first) return null;
  return { word, text: first.text, attributionText: first.attributionText };
}

function load_existing() {
  try {
    return JSON.parse(fs.readFileSync(outPath, "utf8"));
  } catch {
    return { attributions: [], entries: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
}

// Interns attributionText strings so each entry stores a small index instead
// of repeating the same handful of attribution sentences thousands of times.
function attribution_index(attributions, text) {
  let index = attributions.indexOf(text);
  if (index === -1) {
    index = attributions.length;
    attributions.push(text);
  }
  return index;
}

async function main() {
  const data = load_existing();
  const { attributions, entries } = data;
  const have = new Set(entries.map((e) => e.word.toLowerCase()));

  console.log(
    `Have ${entries.length} words already, fetching candidates for ${count}...`,
  );
  const candidates = await fetch_candidate_words(count);

  for (const word of candidates) {
    if (have.has(word.toLowerCase())) continue;
    try {
      const definition = await fetch_first_definition(word);
      if (definition) {
        entries.push({
          word: definition.word,
          def: definition.text,
          attr_i: attribution_index(attributions, definition.attributionText),
        });
        have.add(word.toLowerCase());
        if (entries.length % 100 === 0) {
          save(data);
          console.log(`${entries.length}/${count} saved`);
        }
      }
    } catch (err) {
      console.error(`skipping "${word}": ${err.message}`);
    }
    await sleep(delayMs);
    if (entries.length >= count) break;
  }

  save(data);
  console.log(`Done. Wrote ${entries.length} words to ${outPath}`);
}

main();
