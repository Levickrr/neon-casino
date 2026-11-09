/* Lists every translatable French string used in the code and checks that
   the Turkish dictionary covers all of them.
   Run: node tests/i18n-keys.js          (prints missing keys, exit 1 if any)
        node tests/i18n-keys.js --list   (prints all keys)                    */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.js$/.test(f) && !/i18n-tr\.js$/.test(f)) files.push(p);
  }
})(path.join(root, "js"));
const keys = new Set();
const unescape = (s) => s.replace(/\\(["'\\])/g, "$1");
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const re = /(?<![\w.])(?:t|NC\.t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) keys.add(unescape(m[1]));
}
// strings translated indirectly (data tables)
["Tous les jeux", "Cartes", "Table", "Instantané", "Nouveautés",
 "Rouge", "Jaune", "Bleu", "Noir", "Faux joker",
 "Carte haute", "Paire", "Double paire", "Brelan", "Quinte", "Couleur", "Full", "Carré", "Quinte flush", "Quinte flush royale",
 "Serré-agressif", "Suiveur", "Maniaque"].forEach((k) => keys.add(k));
// static HTML
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const reH = /\sdata-i18n>([\s\S]*?)<\/(?:a|span|dt|h2|h3|p|button)>/g;
let h;
while ((h = reH.exec(html))) keys.add(h[1].replace(/\s+/g, " ").trim());
const reA = /aria-label="([^"]+)"(?: title="([^"]+)")? data-i18n-attr/g;
while ((h = reA.exec(html))) { keys.add(h[1]); if (h[2]) keys.add(h[2]); }

if (process.argv.includes("--list")) { console.log(JSON.stringify([...keys].sort(), null, 1)); process.exit(0); }
globalThis.NC = {};
require(path.join(root, "js/core/i18n.js"));
require(path.join(root, "js/core/i18n-tr.js"));
const missing = [...keys].filter((k) => !globalThis.NC.i18n.has("tr", k));
console.log(`${keys.size} keys, ${missing.length} missing in Turkish`);
missing.forEach((k) => console.log("  - " + k));
process.exit(missing.length ? 1 : 0);
