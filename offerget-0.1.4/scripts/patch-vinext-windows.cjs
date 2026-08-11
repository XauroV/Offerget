const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "vinext",
  "dist",
  "server",
  "static-file-cache.js",
);
const original = "relativePath: path.relative(base, batch[j]),";
const patched = 'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),';

if (!fs.existsSync(target)) {
  console.log("[job-tracker] Vinext is not installed; Windows path patch skipped.");
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
if (source.includes(patched)) {
  console.log("[job-tracker] Vinext Windows asset path patch already applied.");
  process.exit(0);
}
if (!source.includes(original)) {
  throw new Error("Vinext static cache implementation changed; Windows path patch needs review.");
}

fs.writeFileSync(target, source.replace(original, patched), "utf8");
console.log("[job-tracker] Applied Vinext Windows asset path patch.");
