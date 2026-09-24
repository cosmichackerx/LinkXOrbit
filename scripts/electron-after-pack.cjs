/**
 * Shrink the packaged app (similar spirit to Android shrinkResources):
 * keep only English Chromium locale packs and drop obvious dead weight.
 */
const fs = require("fs");
const path = require("path");

const KEEP_LOCALES = new Set(["en-US.pak"]);

function rmIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;

  const localesDir = path.join(appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    for (const file of fs.readdirSync(localesDir)) {
      if (!KEEP_LOCALES.has(file)) {
        fs.unlinkSync(path.join(localesDir, file));
      }
    }
  }

  // Unused stock Electron shell when shipping a custom app.
  rmIfExists(path.join(appOutDir, "resources", "default_app.asar"));
};
