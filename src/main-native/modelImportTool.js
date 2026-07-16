/**
 * ZAI Desktop - Model Import Tool
 *
 * Replaces src/services/llama/modelImportTool.js's Android SAF folder
 * picker + copyAsync dance. Windows has no SAF/content:// URI concept at
 * all - a normal native folder picker (dialog.showOpenDialog with
 * properties: ['openDirectory']) already returns a real filesystem path
 * the app can read directly, so the "grant access, then copy because we
 * can't read it directly" two-step from Android collapses into one step
 * here. The copy into app-private storage is kept anyway (rather than
 * loading straight from wherever the person's GGUF lives) so behavior -
 * and the electron-store-recorded state - matches the Android version,
 * and so the model survives the source folder being unmounted/moved
 * later (e.g. an external drive).
 */

const path = require('path');
const fs = require('fs');
const { app: electronApp } = require('electron');
const Store = require('electron-store');

const LOCAL_MODELS = {
  qwen25_coder_3b: {
    key: 'qwen25_coder_3b',
    label: 'Qwen2.5 Coder 3B',
    sourceFilename: 'Qwen2.5-coder-3B-instruct-Q4_K_M.gguf',
    localFilename: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
  },
};

let store = null;

function getStore() {
  if (!store) store = new Store({ name: 'zai-preferences' });
  return store;
}

function modelsDir() {
  const dir = path.join(electronApp.getPath('userData'), 'zai-models');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function requestModelFolderAccess(dialog) {
  const result = await dialog.showOpenDialog({
    title: 'Select the folder containing your GGUF model files',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return { success: false, data: null, error: { message: 'Folder access was not granted.' } };
  }
  const dirPath = result.filePaths[0];
  getStore().set('model_folder_path', dirPath);
  return { success: true, data: { directoryPath: dirPath }, error: null };
}

async function hasModelFolderAccess() {
  return !!getStore().get('model_folder_path');
}

async function getImportedModelStatus() {
  const status = {};
  for (const model of Object.values(LOCAL_MODELS)) {
    const localPath = path.join(modelsDir(), model.localFilename);
    const exists = fs.existsSync(localPath);
    status[model.key] = {
      imported: exists,
      sizeBytes: exists ? fs.statSync(localPath).size : 0,
      localPath,
    };
  }
  return status;
}

function findSourceFile(dirPath, filename) {
  if (!fs.existsSync(dirPath)) return null;
  const entries = fs.readdirSync(dirPath);
  const exact = entries.find((f) => f === filename);
  if (exact) return path.join(dirPath, exact);
  const lower = filename.toLowerCase();
  const ci = entries.find((f) => f.toLowerCase() === lower);
  return ci ? path.join(dirPath, ci) : null;
}

async function importModel(modelKey, onProgress) {
  const model = LOCAL_MODELS[modelKey];
  if (!model) return { success: false, error: { message: `Unknown model: ${modelKey}` } };

  const dirPath = getStore().get('model_folder_path');
  if (!dirPath) {
    return { success: false, error: { message: 'No model folder selected yet. Choose a folder in Settings > Local Models first.' } };
  }

  try {
    const sourcePath = findSourceFile(dirPath, model.sourceFilename);
    if (!sourcePath) {
      return { success: false, error: { message: `Could not find "${model.sourceFilename}" in the selected folder.` } };
    }

    const destPath = path.join(modelsDir(), model.localFilename);
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

    onProgress?.({ status: 'copying', modelKey });

    // Streamed copy (not read-into-memory) - same reasoning as the
    // Android version's comment about avoiding a base64 round-trip for
    // multi-GB files, just via Node streams instead of a native copy API.
    await new Promise((resolve, reject) => {
      const total = fs.statSync(sourcePath).size;
      let copied = 0;
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(destPath);
      readStream.on('data', (chunk) => {
        copied += chunk.length;
        onProgress?.({ status: 'copying', modelKey, progress: copied / total });
      });
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      readStream.pipe(writeStream);
    });

    const finalSize = fs.statSync(destPath).size;
    onProgress?.({ status: 'done', modelKey, sizeBytes: finalSize });

    return { success: true, data: { localPath: destPath, sizeBytes: finalSize }, error: null };
  } catch (err) {
    console.error('[ModelImportTool] importModel failed:', err);
    return { success: false, error: { message: err?.message || `Could not import ${model.label}.` } };
  }
}

async function deleteImportedModel(modelKey) {
  const model = LOCAL_MODELS[modelKey];
  if (!model) return { success: false, error: { message: `Unknown model: ${modelKey}` } };
  const destPath = path.join(modelsDir(), model.localFilename);
  try {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || `Could not delete ${model.label}.` } };
  }
}

function registerIpc(ipcMain, dialog) {
  ipcMain.handle('modelImport:requestFolderAccess', () => requestModelFolderAccess(dialog));
  ipcMain.handle('modelImport:hasFolderAccess', () => hasModelFolderAccess());
  ipcMain.handle('modelImport:getStatus', () => getImportedModelStatus());
  ipcMain.handle('modelImport:importModel', (e, modelKey) =>
    importModel(modelKey, (progress) => e.sender.send('modelImport:progress', progress))
  );
  ipcMain.handle('modelImport:deleteModel', (_e, modelKey) => deleteImportedModel(modelKey));
}

module.exports = {
  requestModelFolderAccess,
  hasModelFolderAccess,
  getImportedModelStatus,
  importModel,
  deleteImportedModel,
  registerIpc,
  LOCAL_MODELS,
};
