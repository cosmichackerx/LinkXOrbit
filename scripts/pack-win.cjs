const { execSync } = require("child_process");

function run(cmd) {
  execSync(cmd, { stdio: "inherit", shell: true });
}

run("npm prune --omit=dev");
try {
  // Pinned CLI + explicit electronVersion in package.json (Electron is pruned from node_modules).
  run("npx --yes electron-builder@25.1.8 --win --x64 --publish never");
} finally {
  // Restore devDependencies for local development after packaging.
  run("npm install");
}
