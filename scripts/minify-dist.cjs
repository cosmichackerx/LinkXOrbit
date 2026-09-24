const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const distRoot = path.join(__dirname, "..", "dist");
const jsFiles = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (full.endsWith(".js")) jsFiles.push(full);
  }
}

if (fs.existsSync(distRoot)) {
  walk(distRoot);
  for (const file of jsFiles) {
    const source = fs.readFileSync(file, "utf8");
    const { code } = esbuild.transformSync(source, {
      minify: true,
      loader: "js",
      target: "node18",
    });
    fs.writeFileSync(file, code);
  }
}
