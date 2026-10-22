'use strict';
// Renders build/icon.png (1024x1024) from SVG using Electron. Run: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a9a6e"/>
      <stop offset="1" stop-color="#22694a"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-width="58" stroke-linecap="round">
    <path d="M330 300v424M450 300v424M570 300v424M690 300v424"/>
    <path d="M250 640 774 384" stroke-width="54"/>
  </g>
</svg>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, img.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log('wrote', out, img.getSize());
  app.quit();
});
