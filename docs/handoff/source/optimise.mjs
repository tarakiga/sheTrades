import { readdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const files = (await readdir(".")).filter((f) => f.endsWith(".png")).sort();
const out = {};
let total = 0;

for (const file of files) {
  const buf = await readFile(file);
  const jpeg = await sharp(buf)
    .resize({ width: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const key = file.replace(/^shot-/, "").replace(/\.png$/, "");
  out[key] = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  total += jpeg.length;
  console.log(`${key.padEnd(28)} ${(buf.length / 1024).toFixed(0)}KB -> ${(jpeg.length / 1024).toFixed(0)}KB`);
}

await writeFile("shots.json", JSON.stringify(out));
console.log(`\ntotal jpeg ${(total / 1024 / 1024).toFixed(2)} MB, base64 approx ${((total * 1.34) / 1024 / 1024).toFixed(2)} MB`);
