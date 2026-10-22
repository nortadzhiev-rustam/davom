'use strict';
const { app, BrowserWindow, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const { Store } = require('./server/store');
const { createAppServer } = require('./server/server');

let win = null;
let server = null;

if (!app.requestSingleInstanceLock()) {
  // Another copy is already running; it will focus its window.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    // DAVOM_DATA lets you keep the data somewhere else (for example on a USB stick).
    const dataDir = process.env.DAVOM_DATA || app.getPath('userData');
    try {
      const store = new Store(dataDir);
      server = createAppServer({
        store,
        publicDir: path.join(__dirname, 'public'),
        version: app.getVersion(),
        dataDir,
        openDataDir: () => shell.openPath(dataDir),
      });
      await server.start();
      server.onPortChange = () => win && win.loadURL(server.url());
    } catch (e) {
      dialog.showErrorBox('Davom', `Could not start: ${e.message}`);
      app.quit();
      return;
    }
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (server) server.stop();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151917' : '#f5f6f3',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });
  // Never navigate away from the local app; open nothing in new windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(server.url())) e.preventDefault();
  });
  win.loadURL(server.url());
}
