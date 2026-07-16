/**
 * ZAI Desktop - expo-file-system Shim (renderer-side)
 *
 * Replaces `import * as FileSystem from 'expo-file-system'` (and the
 * '/legacy' variant, same API) across the ported codebase - verified
 * against every FileSystem.* call site in the original app (chatStore.js,
 * llamaEngine.js, modelImportTool.js, fileProcessor.js, etc.): only
 * documentDirectory, cacheDirectory, getInfoAsync, readAsStringAsync,
 * writeAsStringAsync, deleteAsync, makeDirectoryAsync, copyAsync,
 * readDirectoryAsync, and EncodingType are used, so this shim's surface
 * is complete, not partial.
 *
 * documentDirectory/cacheDirectory are real, stable folder paths under
 * Electron's userData directory (fetched once at module load via a
 * synchronous-feeling cached promise - see ensureDirs() below), unlike
 * Android's file:// URI scheme; every path built from them is a plain
 * Windows filesystem path the main-process fs bridge can read directly.
 */

export const EncodingType = {
  UTF8: 'utf-8',
  Base64: 'base64',
};

let _documentDirectory = null;
let _cacheDirectory = null;
let _dirsReadyPromise = null;

// documentDirectory/cacheDirectory are consumed as plain string constants
// all over the ported code (e.g. `${FileSystem.documentDirectory}foo.db`),
// not awaited - so real paths are fetched once, eagerly, at module load,
// and every export below is a plain string by the time app code runs
// (App.jsx's boot sequence awaits `ready()` before rendering screens that
// touch these, same as it already awaits initDatabase()).
async function ensureDirs() {
  if (_dirsReadyPromise) return _dirsReadyPromise;
  _dirsReadyPromise = (async () => {
    const userDataPath = await window.zaiNative.app.getUserDataPath();
    _documentDirectory = `${userDataPath}\\zai-files\\`;
    _cacheDirectory = `${userDataPath}\\zai-cache\\`;
    documentDirectory = _documentDirectory;
    cacheDirectory = _cacheDirectory;
    await window.zaiNative.fs.mkdir(_documentDirectory);
    await window.zaiNative.fs.mkdir(_cacheDirectory);
  })();
  return _dirsReadyPromise;
}

/** Call once during app boot (see App.jsx) before any screen reads documentDirectory/cacheDirectory. */
export async function ready() {
  await ensureDirs();
  return { documentDirectory: _documentDirectory, cacheDirectory: _cacheDirectory };
}

// documentDirectory/cacheDirectory are consumed as plain string constants
// all over the ported code (e.g. `${FileSystem.documentDirectory}foo.db`),
// not awaited - so real paths are fetched once, eagerly, at module load.
// Since ESM exports can't be reassigned by importers but CAN be mutated
// via a getter/setter pair declared with `export let` + a live binding,
// this uses that instead of the CJS-only Object.defineProperty(exports)
// pattern. Screens should still prefer awaiting ready() during boot for
// correctness (same as App.jsx already awaits initDatabase()), but this
// also means the value is correct within a few ms of app start even for
// call sites that don't.
export let documentDirectory = '';
export let cacheDirectory = '';

function toFileUri(pathOrUri) {
  // Strips a `file://` prefix if present (call sites sometimes build
  // `file://${path}` URIs the way the Android build's FileSystem API
  // required) - the fs bridge here wants a plain OS path either way.
  return pathOrUri.startsWith('file://') ? pathOrUri.slice(7) : pathOrUri;
}

export async function getInfoAsync(fileUri) {
  const filePath = toFileUri(fileUri);
  const exists = await window.zaiNative.fs.exists(filePath);
  if (!exists) return { exists: false };
  const stat = await window.zaiNative.fs.stat(filePath);
  return { exists: true, uri: fileUri, isDirectory: stat?.isDirectory ?? false, size: stat?.size ?? 0 };
}

export async function readAsStringAsync(fileUri, options = {}) {
  const filePath = toFileUri(fileUri);
  const encoding = options.encoding === EncodingType.Base64 ? 'base64' : 'utf-8';
  return window.zaiNative.fs.readFile(filePath, encoding);
}

export async function writeAsStringAsync(fileUri, content, options = {}) {
  const filePath = toFileUri(fileUri);
  const encoding = options.encoding === EncodingType.Base64 ? 'base64' : 'utf-8';
  return window.zaiNative.fs.writeFile(filePath, content, encoding);
}

export async function deleteAsync(fileUri, options = {}) {
  const filePath = toFileUri(fileUri);
  try {
    return await window.zaiNative.fs.deleteFile(filePath);
  } catch (err) {
    if (options.idempotent) return true;
    throw err;
  }
}

export async function makeDirectoryAsync(dirUri, options = {}) {
  const dirPath = toFileUri(dirUri);
  return window.zaiNative.fs.mkdir(dirPath);
}

export async function copyAsync({ from, to }) {
  return window.zaiNative.fs.copyFile(toFileUri(from), toFileUri(to));
}

export async function readDirectoryAsync(dirUri) {
  // On Android this only existed for SAF folder listing. On Windows,
  // filesystemTool.js (see src/services/filesystem/filesystemTool.js)
  // uses this for real, ordinary directory listing since there's no SAF
  // concept to route around - so this is a genuine implementation here,
  // not a stub.
  const dirPath = toFileUri(dirUri);
  return window.zaiNative.fs.readDir(dirPath);
}

// StorageAccessFramework (Android SAF) has no desktop equivalent at all -
// native folder picker + direct fs access replaces it entirely (see
// native-clients/modelImportTool.js). Exported as a stub object so an
// `import * as FileSystem from '...'; const { StorageAccessFramework } = FileSystem`
// destructure doesn't throw; any actual call warns and returns a safe default.
export const StorageAccessFramework = {
  requestDirectoryPermissionsAsync: async () => {
    console.warn('[FileSystemShim] StorageAccessFramework has no desktop equivalent - use native-clients/modelImportTool.js instead');
    return { granted: false };
  },
  readDirectoryAsync: async () => [],
};

// Initialize immediately so early call sites that read documentDirectory
// synchronously-ish (right after import, before any await) still get a
// real value shortly after - screens should still prefer awaiting
// ready() during boot for correctness, matching how App.jsx already
// awaits initDatabase() before rendering.
ensureDirs();
