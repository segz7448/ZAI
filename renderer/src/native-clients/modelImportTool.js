/**
 * ZAI Desktop - Model Import Tool (renderer-side client)
 *
 * Drop-in replacement for src/services/llama/modelImportTool.js. Same
 * exported names (requestModelFolderAccess, hasModelFolderAccess,
 * getImportedModelStatus, importModel, importAllModels,
 * deleteImportedModel) so SettingsScreen.js's "Local Models" section
 * ports with only the import path changed.
 */

export async function requestModelFolderAccess() {
  return window.zaiNative.modelImport.requestModelFolderAccess();
}

export async function hasModelFolderAccess() {
  return window.zaiNative.modelImport.hasModelFolderAccess();
}

export async function getImportedModelStatus() {
  return window.zaiNative.modelImport.getImportedModelStatus();
}

export async function importModel(modelKey, { onProgress } = {}) {
  let unsubscribe;
  if (onProgress) {
    unsubscribe = window.zaiNative.modelImport.onProgress(onProgress);
  }
  try {
    return await window.zaiNative.modelImport.importModel(modelKey);
  } finally {
    unsubscribe?.();
  }
}

export async function importAllModels({ onProgress } = {}) {
  const results = {};
  const status = await getImportedModelStatus();
  for (const modelKey of Object.keys(status)) {
    results[modelKey] = await importModel(modelKey, { onProgress });
  }
  return results;
}

export async function deleteImportedModel(modelKey) {
  return window.zaiNative.modelImport.deleteImportedModel(modelKey);
}
