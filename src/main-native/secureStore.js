/**
 * ZAI Desktop - Secure Storage (Electron safeStorage)
 *
 * Replaces expo-secure-store, used in the Android build to hold API keys
 * (e.g. the optional Gemini key for image gen/vision - see
 * src/config/localModels.js's comments on that being the one
 * still-cloud path). Electron's safeStorage uses the OS's native
 * credential encryption (DPAPI on Windows) the same way expo-secure-store
 * uses Android's Keystore - encrypted-at-rest, tied to the local user
 * account, not exportable by copying a file to another machine.
 *
 * Encrypted blobs are kept in a small JSON file (not the OS credential
 * vault directly - safeStorage only encrypts/decrypts buffers, it doesn't
 * provide its own keyed storage), namespaced by key.
 */

const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');

let storePath = null;

function init() {
  storePath = path.join(app.getPath('userData'), 'secure-store.json');
}

function readStore() {
  if (!fs.existsSync(storePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data), 'utf-8');
}

async function setItem(key, value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available on this system.');
  }
  const encrypted = safeStorage.encryptString(value).toString('base64');
  const store = readStore();
  store[key] = encrypted;
  writeStore(store);
  return true;
}

async function getItem(key) {
  const store = readStore();
  const encrypted = store[key];
  if (!encrypted) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch (err) {
    console.error('[SecureStore] decrypt failed:', err);
    return null;
  }
}

async function deleteItem(key) {
  const store = readStore();
  delete store[key];
  writeStore(store);
  return true;
}

function registerIpc(ipcMain) {
  ipcMain.handle('secureStore:setItem', (_e, key, value) => setItem(key, value));
  ipcMain.handle('secureStore:getItem', (_e, key) => getItem(key));
  ipcMain.handle('secureStore:deleteItem', (_e, key) => deleteItem(key));
}

module.exports = { init, setItem, getItem, deleteItem, registerIpc };
