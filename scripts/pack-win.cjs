const { execSync } = require("child_process");

function run(cmd) {
  execSync(cmd, { stdio: "inherit", shell: true });
}

run("npm prune --omit=dev");
try {
  run("npx electron-builder --win --x64");
} finally {
  // Restore devDependencies for local development after packaging.
  run("npm install");
}
