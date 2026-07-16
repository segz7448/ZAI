/**
 * ZAI Desktop - Preload / contextBridge
 *
 * This is the Windows equivalent of NativeModules.TermuxRunCommand /
 * expo-file-system / expo-sqlite being available to JS in the RN build.
 * Every ported service file (src/main-native/*Client.js in the renderer
 * bundle) calls through window.zaiNative.* instead of importing a native
 * module directly - same reason contextIsolation exists as the reason
 * Android sandboxes apps: the renderer (webpage-like context, could in
 * principle load remote content via the browser agent) never gets direct
 * Node/child_process/filesystem access, only these specific, narrow
 * request/response channels.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zaiNative', {
  // ---- Terminal (replaces NativeModules.TermuxRunCommand) ----
  terminal: {
    runCommand: (command, options) => ipcRenderer.invoke('terminal:runCommand', command, options),
    getShellInfo: () => ipcRenderer.invoke('terminal:getShellInfo'),
  },

  // ---- Local LLM (replaces llama.rn) ----
  // As of the model-server split, this no longer loads a GGUF in-process
  // via node-llama-cpp - src/main-native/llamaEngine.js is now an HTTP
  // client hitting a model server (e.g. llama.cpp's llama-server) that
  // the person runs and points the app at from Settings > Model Server.
  llama: {
    sendMessage: (history, modelKey, options) => ipcRenderer.invoke('llama:sendMessage', history, modelKey, options),
    ensureModelLoaded: (modelKey) => ipcRenderer.invoke('llama:ensureModelLoaded', modelKey),
    releaseCurrentModel: () => ipcRenderer.invoke('llama:releaseCurrentModel'),
    getLoadedModelKey: () => ipcRenderer.invoke('llama:getLoadedModelKey'),
    setServerConfig: (url, modelName) => ipcRenderer.invoke('llama:setServerConfig', url, modelName),
    getServerConfig: () => ipcRenderer.invoke('llama:getServerConfig'),
    checkServerStatus: () => ipcRenderer.invoke('llama:checkServerStatus'),
    onLoadProgress: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('llama:loadProgress', listener);
      return () => ipcRenderer.removeListener('llama:loadProgress', listener);
    },
  },

  // NOTE: the old "modelImport" bridge (folder-grant + GGUF copy for
  // in-process node-llama-cpp) has been removed from here - its backing
  // IPC channels are no longer registered in electron/main.js now that
  // local inference goes through a separately-run model server instead
  // (see llama.* above and Settings > Model Server). The main-process
  // file (src/main-native/modelImportTool.js) is left in place unused.

  // ---- SQLite (replaces expo-sqlite) ----
  db: {
    exec: (sql) => ipcRenderer.invoke('db:exec', sql),
    getAll: (sql, params) => ipcRenderer.invoke('db:getAll', sql, params),
    getFirst: (sql, params) => ipcRenderer.invoke('db:getFirst', sql, params),
    run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  },

  // ---- Secure storage (replaces expo-secure-store) ----
  secureStore: {
    setItem: (key, value) => ipcRenderer.invoke('secureStore:setItem', key, value),
    getItem: (key) => ipcRenderer.invoke('secureStore:getItem', key),
    deleteItem: (key) => ipcRenderer.invoke('secureStore:deleteItem', key),
  },

  // ---- Browser agent (replaces WebView-based BrowserAgentView/PiP) ----
  browserAgent: {
    launch: (initialUrl, tabId) => ipcRenderer.invoke('browserAgent:launch', initialUrl, tabId),
    navigate: (url, tabId) => ipcRenderer.invoke('browserAgent:navigate', url, tabId),
    goBack: (tabId) => ipcRenderer.invoke('browserAgent:goBack', tabId),
    goForward: (tabId) => ipcRenderer.invoke('browserAgent:goForward', tabId),
    reload: (tabId) => ipcRenderer.invoke('browserAgent:reload', tabId),
    stopLoading: (tabId) => ipcRenderer.invoke('browserAgent:stopLoading', tabId),
    newTab: (url, tabId) => ipcRenderer.invoke('browserAgent:newTab', url, tabId),
    closeTab: (tabId) => ipcRenderer.invoke('browserAgent:closeTab', tabId),
    switchTab: (tabId) => ipcRenderer.invoke('browserAgent:switchTab', tabId),
    listTabs: () => ipcRenderer.invoke('browserAgent:listTabs'),
    getActiveTabId: () => ipcRenderer.invoke('browserAgent:getActiveTabId'),
    extractInteractiveElements: (tabId) => ipcRenderer.invoke('browserAgent:extract', tabId),
    extractPageText: (maxChars, tabId) => ipcRenderer.invoke('browserAgent:extractPageText', maxChars, tabId),
    extractTables: (tabId) => ipcRenderer.invoke('browserAgent:extractTables', tabId),
    getPageInfo: (tabId) => ipcRenderer.invoke('browserAgent:getPageInfo', tabId),
    click: (zaiId, tabId) => ipcRenderer.invoke('browserAgent:click', zaiId, tabId),
    fill: (zaiId, text, tabId) => ipcRenderer.invoke('browserAgent:fill', zaiId, text, tabId),
    selectOption: (zaiId, value, tabId) => ipcRenderer.invoke('browserAgent:selectOption', zaiId, value, tabId),
    setChecked: (zaiId, checked, tabId) => ipcRenderer.invoke('browserAgent:setChecked', zaiId, checked, tabId),
    submitForm: (zaiId, tabId) => ipcRenderer.invoke('browserAgent:submitForm', zaiId, tabId),
    scrollTo: (args, tabId) => ipcRenderer.invoke('browserAgent:scrollTo', args, tabId),
    waitForSelector: (selector, timeoutMs, tabId) => ipcRenderer.invoke('browserAgent:waitForSelector', selector, timeoutMs, tabId),
    runScript: (script, tabId) => ipcRenderer.invoke('browserAgent:runScript', script, tabId),
    setZoom: (percent, tabId) => ipcRenderer.invoke('browserAgent:setZoom', percent, tabId),
    getZoom: (tabId) => ipcRenderer.invoke('browserAgent:getZoom', tabId),
    screenshot: (tabId) => ipcRenderer.invoke('browserAgent:screenshot', tabId),
    close: () => ipcRenderer.invoke('browserAgent:close'),
    getCurrentUrl: (tabId) => ipcRenderer.invoke('browserAgent:getCurrentUrl', tabId),
  },

  // ---- Filesystem (replaces expo-file-system for general file ops) ----
  fs: {
    readFile: (filePath, encoding) => ipcRenderer.invoke('fs:readFile', filePath, encoding),
    writeFile: (filePath, data, encoding) => ipcRenderer.invoke('fs:writeFile', filePath, data, encoding),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
    copyFile: (from, to) => ipcRenderer.invoke('fs:copyFile', from, to),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
    readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
    showSaveDialog: (options) => ipcRenderer.invoke('fs:showSaveDialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('fs:showOpenDialog', options),
  },

  // ---- App/system ----
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
});
