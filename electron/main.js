/**
 * ZAI Desktop - Electron Main Process
 *
 * This is the Windows equivalent of what MainApplication.kt + the Android
 * OS did for the mobile build: it owns the single native window, wires up
 * every IPC channel the renderer (your ported React UI) calls into, and
 * boots the on-device pieces that used to be Android-native modules:
 *
 *   - Termux RUN_COMMAND  -> src/main-native/terminalTool.js (CMD/PowerShell via child_process)
 *   - llama.rn            -> src/main-native/llamaEngine.js (HTTP client to a separately-run
 *                            model server, e.g. llama.cpp's `llama-server` - NOT loaded
 *                            in-process anymore, see note below)
 *   - expo-sqlite         -> src/main-native/db.js (better-sqlite3)
 *   - expo-secure-store   -> src/main-native/secureStore.js (Electron safeStorage)
 *   - Android SAF folder picker -> dialog.showOpenDialog
 *   - WebView browser agent -> src/main-native/browserAgent.js (Playwright, real Chromium)
 *
 * The renderer never touches Node/native APIs directly (contextIsolation
 * is on) - everything goes through electron/preload.js's contextBridge,
 * mirroring the shape of NativeModules.TermuxRunCommand /
 * NativeModules.* that the RN code originally called.
 *
 * IMPORTANT - why local inference is out-of-process now: this app used
 * to require('node-llama-cpp') and load a GGUF directly into THIS
 * process. That's a native module with a compiled binding tied to this
 * exact Electron/Node ABI and GPU backend; if it failed to load (wrong
 * ABI after a botched install, unsupported GPU path, etc.) the
 * require() below would throw before createWindow() ever ran - which is
 * exactly what produces a fully blank window with only the native menu
 * bar and no error dialog. src/main-native/llamaEngine.js is now a thin
 * HTTP client instead: you run your own model server (e.g. `llama-server
 * -m <model>.gguf --port 8080`, any of Qwen3 / Qwen2.5-3B /
 * Qwen2.5-1.5B / etc.) and point the app at it from Settings > Model
 * Server. Nothing native-module-related is required() at startup
 * anymore, so a missing/misbehaving model server can only ever produce a
 * chat error message, never a blank window.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

// Each native subsystem registers its own ipcMain.handle() calls -
// requiring them wires up their IPC channels as a side effect, same
// pattern as Expo config plugins registering native modules at build time.
const db = require('../src/main-native/db');
const secureStore = require('../src/main-native/secureStore');
const terminalTool = require('../src/main-native/terminalTool');
const llamaEngine = require('../src/main-native/llamaEngine');
const browserAgent = require('../src/main-native/browserAgent');
// modelImportTool.js is no longer wired up - it belonged to the old
// "grant a folder, copy a GGUF into app storage" flow that local
// inference used before moving to a separate model server (see
// llamaEngine.js and Settings > Model Server). The file is left in place
// unused rather than deleted, in case folder-based import is ever wanted
// again, but its IPC channels are intentionally not registered below.
const fsBridge = require('../src/main-native/fsBridge');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0B0B0F',
    title: 'ZAI',
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // node-llama-cpp/native modules need this off in the preload context
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(async () => {
  try {
    // Boot order matters: DB before anything that reads preferences,
    // llama engine registered but NOT loaded (lazy, same as the RN version -
    // ensureModelLoaded() only loads on first sendMessage call).
    db.init(app.getPath('userData'));
    secureStore.init();
    terminalTool.registerIpc(ipcMain);
    llamaEngine.registerIpc(ipcMain);
    browserAgent.registerIpc(ipcMain);
    db.registerIpc(ipcMain);
    secureStore.registerIpc(ipcMain);
    fsBridge.registerIpc(ipcMain, dialog);

    // Generic "open external link" + "show folder picker" channels the
    // renderer needs that don't belong to any one subsystem above.
    ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));
    ipcMain.handle('app:getVersion', () => app.getVersion());
    ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));

    // Note: the model server URL/model saved in Settings lives in the
    // user_preferences table, which the RENDERER creates and migrates
    // (renderer/src/db/database.js's initDatabase(), run once the React
    // app mounts) - it doesn't exist yet at this point in main-process
    // boot. So llamaEngine.setServerConfig() is pushed from the renderer
    // side instead, right after preferencesStore.loadPreferences() runs
    // (see preferencesStore.js) - that happens on every app launch before
    // ChatScreen can send a message, so llamaEngine is always configured
    // in time for the first real request.

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    // Anything thrown during boot used to leave the person with a blank
    // window and only the native menu bar visible, with no indication
    // anything had gone wrong. Surface it instead.
    console.error('[Main] Fatal error during startup:', err);
    dialog.showErrorBox('ZAI failed to start', `Something went wrong while starting up:\n\n${err?.message || err}\n\nPlease report this if it keeps happening.`);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  await browserAgent.shutdown();
  await llamaEngine.shutdown();
  db.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await browserAgent.shutdown();
  await llamaEngine.shutdown();
});
