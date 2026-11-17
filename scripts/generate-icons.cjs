// Renders build/icon.svg to PNG + multi-size ICO using Electron (no extra deps).
// Usage: npx electron scripts/generate-icons.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "build", "icon.svg"), "utf8");
const sizes = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 512, height: 512, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const big = full.resize({ width: 512, height: 512, quality: "best" });
  fs.writeFileSync(path.join(root, "build", "icon.png"), big.toPNG());
  const pngs = sizes.map((size) => ({ size, buf: big.resize({ width: size, height: size, quality: "best" }).toPNG() }));
  fs.writeFileSync(path.join(root, "build", "icon.ico"), buildIco(pngs));
  fs.mkdirSync(path.join(root, "src", "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "assets", "icon.png"), pngs.find((p) => p.size === 256).buf);
  console.log("Icons written: build/icon.png, build/icon.ico, src/assets/icon.png");
  app.quit();
});
