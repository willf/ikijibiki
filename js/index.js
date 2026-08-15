// Word + first-definition data ships embedded (gzip+base64) directly in this
// file so it works offline over file:// with no cross-origin fetch. Run
// `node scripts/embed-data.js` after editing data/words.json to refresh it.
const WORD_DATA_GZIP_B64 = "";
function compare_case_insensitive(a, b) {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function base64_to_bytes(b64) {
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function inflate_word_data(b64) {
  var bytes = base64_to_bytes(b64);
  var stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text().then((text) => JSON.parse(text));
}

function load_word_data() {
  return inflate_word_data(WORD_DATA_GZIP_B64);
}

function pick_random_words(entries, n) {
  return _.sampleSize(entries, n).sort((a, b) =>
    compare_case_insensitive(a.word, b.word),
  );
}

function find_definition(entries, word) {
  return entries.find(
    (entry) => compare_case_insensitive(entry.word, word) === 0,
  );
}

function build_word_li(word) {
  return `<li><span class="word">${word}</span>
  <span class="lookup">❓</span></li>`;
}

function build_word_lis(words) {
  return `${words.map(build_word_li).join("\n")}`;
}

function setDisplay(element, display) {
  element.style.display = display;
}

function wordnik_word_url(word) {
  return `https://www.wordnik.com/words/${encodeURIComponent(word)}`;
}

function escape_html(str) {
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Renders definition text as safe HTML, turning <xref>word</xref> markup into
// links to that word's Wordnik page; any other tags are dropped to plain text.
function node_to_definition_html(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escape_html(node.textContent);
  }
  if (node.tagName === "XREF") {
    var word = node.textContent;
    return `<a href="${escape_html(wordnik_word_url(word))}" class="xref">${escape_html(word)}</a>`;
  }
  return Array.from(node.childNodes).map(node_to_definition_html).join("");
}

function build_definition_html(text) {
  var dom = new DOMParser().parseFromString(text || "", "text/html");
  return Array.from(dom.body.childNodes).map(node_to_definition_html).join("");
}

function set_definition(definition, attributions) {
  var definition_word = document.getElementById("definition_word");
  var definition_text = document.getElementById("definition_text");
  var definition_attribution = document.getElementById(
    "definition_attribution",
  );
  var definition_link = document.getElementById("definition_link");
  definition_word.innerText = definition.word;
  definition_text.innerHTML = build_definition_html(definition.def);
  definition_attribution.innerText = attributions[definition.attr_i];
  definition_link.href = wordnik_word_url(definition.word);
}

function estimateVocabularySizeGiven(n) {
  return Math.round(document.dictionarySize * (n / document.sampleSize));
}

function ready(fn) {
  if (document.readyState != "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

function go() {
  console.log("setting up");
  document.dictionarySize = 93000; // total words Wordnik has definitions for
  var dictionary_size_el = document.getElementById("dictionary_size");
  dictionary_size_el.innerText = document.dictionarySize.toLocaleString();
  var according = document.getElementById("according");
  setDisplay(according, "block");
  var word_list = document.getElementById("wordlist");
  setDisplay(word_list, "none");
  load_word_data().then(({ entries, attributions }) => {
    document.sampleSize = Math.min(100, entries.length); // words actually shown, i.e. n
    var words = pick_random_words(entries, document.sampleSize).map(
      (entry) => entry.word,
    );
    word_list.innerHTML = build_word_lis(words);
    setDisplay(word_list, "block");
    //-
    spans = document.querySelectorAll("li span.lookup");
    spans.forEach((el) => {
      el.addEventListener(
        "click",
        function () {
          word = el.parentElement.querySelector(".word").innerText;
          var definition = find_definition(entries, word);
          var def = document.getElementById("definition");
          setDisplay(def, "block");
          set_definition(definition, attributions);
        },
        false,
      );
    });
    // set up click handler for words
    spans = document.querySelectorAll("li span.word");
    spans.forEach((el) => {
      el.addEventListener("click", function () {
        el.classList.toggle("highlight");
        words_selected = document.querySelectorAll(".highlight").length;
        estimated_vocabulary_size = estimateVocabularySizeGiven(words_selected);
        estimated_vocabulary_size_text =
          estimated_vocabulary_size.toLocaleString();
        word_el = document.getElementById("estimated_vocabulary_size");
        word_el.innerText = estimated_vocabulary_size_text;
        ikijibiki_el = document.getElementById("ikijibiki");
        if (estimated_vocabulary_size > 8000) {
          ikijibiki_el.innerText =
            "You are a walking dictionary! an Ikijibiki!! 🚶 📖 ";
          setDisplay(ikijibiki_el, "block");
        } else {
          setDisplay(ikijibiki_el, "none");
        }
      });
    }, false);
    // finish up
  });
  console.log("set up");
}

ready(go);
