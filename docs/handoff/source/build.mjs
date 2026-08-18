import { readFile, writeFile } from "node:fs/promises";

const shots = JSON.parse(await readFile("shots.json", "utf8"));
const doc = await readFile("doc.html", "utf8");

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

const unused = Object.keys(shots).filter((k) => !used.has(k));
if (unused.length > 0) console.log("not embedded:", unused.join(", "));

await writeFile("../docs/handoff/shetrades-operator-handbook.html", out, "utf8");
console.log(`embedded ${used.size} screenshots, ${(out.length / 1024 / 1024).toFixed(2)} MB`);
