/**
 * Assembles the operator handbook: takes handbook.html, swaps every
 * IMG:<name> placeholder for the matching screenshot as an inline data URI,
 * and writes the finished single file to both places it is served from.
 *
 * Run `node optimise.mjs` first if the screenshots have changed; it rebuilds
 * shots.json from the PNGs in this folder.
 *
 *   node optimise.mjs && node build.mjs
 */
import { readFile, writeFile } from "node:fs/promises";

const DESTINATIONS = [
  // The client deliverable, kept in the repo.
  "../shetrades-operator-handbook.html",
  // Served by the dashboard at /handbook.html, which is what the Help link in
  // the sidebar opens. Both copies come from this one build so they cannot
  // drift apart.
  "../../../dashboard/public/handbook.html"
];

const shots = JSON.parse(await readFile("shots.json", "utf8"));
const doc = await readFile("handbook.html", "utf8");

const missing = new Set();
const used = new Set();

const out = doc.replace(/IMG:([a-z0-9-]+)/g, (_match, key) => {
  if (!shots[key]) {
    missing.add(key);
    return "";
  }
  used.add(key);
  return shots[key];
});

if (missing.size > 0) {
  console.error("MISSING SCREENSHOTS:", [...missing].join(", "));
  process.exitCode = 1;
}

// An em-dash in a client document is a house-style matter, not a typo, so the
// build refuses rather than quietly shipping one that crept back in.
const dashes = (out.match(/—|&mdash;/g) ?? []).length;
if (dashes > 0) {
  console.error(`FOUND ${dashes} em-dash(es). Rewrite them as ordinary punctuation.`);
  process.exitCode = 1;
}

const unused = Object.keys(shots).filter((key) => !used.has(key));
if (unused.length > 0) console.log("not embedded:", unused.join(", "));

for (const destination of DESTINATIONS) {
  await writeFile(destination, out, "utf8");
}
console.log(
  `embedded ${used.size} screenshots, ${(out.length / 1024 / 1024).toFixed(2)} MB, wrote ${DESTINATIONS.length} copies`
);
