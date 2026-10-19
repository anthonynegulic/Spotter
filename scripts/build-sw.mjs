// Writes out/sw.js with a precache list of every file in the static build.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const SKIP = [/^sw\.js$/, /\.map$/, /^_next\/static\/[^/]+\/_(buildManifest|ssgManifest|clientMiddlewareManifest)\.js$/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(OUT)
  .map((f) => relative(OUT, f).split(sep).join("/"))
  .filter((f) => !SKIP.some((re) => re.test(f)))
  .sort();

/** Pages are cached under their clean URL (/today, not /today.html), which is how hosts serve them. */
function toUrl(file) {
  if (file === "index.html") return "/";
  if (file.endsWith(".html")) return "/" + file.slice(0, -".html".length);
  return "/" + file;
}

const hash = createHash("sha256");
for (const f of files) hash.update(f).update(readFileSync(join(OUT, f)));
const version = `${Date.now()}-${hash.digest("hex").slice(0, 10)}`;

const template = readFileSync("scripts/sw-template.js", "utf8");
const sw = template
  .replace("__VERSION__", version)
  .replace("__PRECACHE__", JSON.stringify(files.map(toUrl), null, 0));
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`sw.js: ${files.length} files precached, version ${version}`);
