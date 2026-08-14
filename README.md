# ikijibiki

Ikijibiki is a small, static vocabulary game. It shows a random sample of
words, lets you mark the words you know, estimates your vocabulary size, and
shows a definition when you click a question mark.

## Run It

The root page can be opened directly in a modern browser:

```sh
open index.html
```

The page loads Lodash from jsDelivr, so an internet connection is needed for
that dependency. The word data itself is embedded in the JavaScript and works
when the page is opened with `file://`.

The packaged page is generated in `dist/`:

```sh
node scripts/build.js
open dist/index.html
```

There is no `package.json` or dependency installation step. Node.js 18 or
newer is recommended for the scripts because they use the built-in `fetch`
API.

## Project Layout

```text
index.html       Standalone page opened during development
css/index.css    Stylesheet source
js/index.js      Browser logic and embedded word data
data/words.json  Editable word and definition data
images/          Images used by the page
scripts/         Data-fetching, embedding, and build scripts
dist/            Generated self-contained page, ignored by Git
```

The root `index.html` currently contains embedded copies of the CSS and
JavaScript. Keep those embedded sections in sync with `css/index.css` and
`js/index.js` when changing the source files. `scripts/build.js` reads the
root page, replaces stylesheet/script references when present, and copies the
result plus `images/` into `dist/`.

## Add New Words

### Add a word manually

Edit `data/words.json`. It has two top-level arrays:

- `attributions` stores attribution text once and entries refer to it by index.
- `entries` stores the word, its definition, and the attribution index.

For example, add an attribution if needed, then add an entry:

```json
{
  "attributions": [
    "from Wiktionary, Creative Commons Attribution/Share-Alike License."
  ],
  "entries": [
    {
      "word": "example",
      "def": "A representative sample or instance.",
      "attr_i": 0
    }
  ]
}
```

When editing the existing file, preserve its other entries and use the index
of an existing matching attribution where possible. `attr_i` is zero-based.
Definitions may contain `<xref>word</xref>` markup. The app turns that markup
into a link to the referenced word on Wordnik. Other HTML is treated as text.

After editing the JSON, refresh the embedded data and rebuild:

```sh
node scripts/embed-data.js
node scripts/build.js
```

`embed-data.js` gzip-compresses the complete JSON file and writes the result
into the `WORD_DATA_GZIP_B64` constant in `js/index.js`. Do not edit that long
constant by hand. The build step then creates the distributable
`dist/index.html`.

### Fetch words from Wordnik

To fetch random words and their first definitions from the Wordnik API, set a
Wordnik API key and run:

```sh
WORDNIK_API_KEY=your_key node scripts/fetch-words.js [count] [delayMs]
```

Defaults are `10000` words and a `400` millisecond delay. For a small test
run:

```sh
WORDNIK_API_KEY=your_key node scripts/fetch-words.js 25 400
```

The script writes to `data/words.json`, skips words already present without
regard to case, interns repeated attribution text, checkpoints periodically,
and can be run again after an interruption. Get an API key from
<https://developer.wordnik.com/>. Do not commit the key; use the environment
variable or a local `.env` file that remains ignored by Git.

## How It Works

1. On page load, the browser inflates the gzip/base64 word data embedded in
   `js/index.js`.
2. It selects up to 100 random entries and sorts them alphabetically.
3. Clicking a word toggles its selected state and updates the vocabulary
   estimate.
4. Clicking a question mark displays that word's definition and attribution.
5. Definitions are parsed and escaped before cross-reference links are added.

The estimate uses the fixed dictionary size of 1,500,000 words and scales the
number selected against the number displayed. The celebratory Ikijibiki message
appears after the estimate exceeds 200,000 words.

## Development Notes

- Use `data/words.json` as the source of truth for word data.
- Run `node scripts/embed-data.js` after every data edit.
- Run `node scripts/build.js` before testing the packaged page.
- The generated `dist/` directory is ignored and should not be edited by hand.
- The Wordnik CDN script is pinned with an integrity hash in `index.html`.
- `LICENSE` contains the MIT license.
