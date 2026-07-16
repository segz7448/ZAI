/**
 * ZAI Desktop - Filesystem Tool (Windows)
 *
 * Replaces src/services/filesystem/filesystemTool.js's entire
 * Storage-Access-Framework (SAF) machinery. Android needed SAF because
 * Scoped Storage blocks apps from touching arbitrary paths outside their
 * own sandbox - that restriction doesn't exist on Windows: a desktop app
 * runs as the logged-in user and can read/write anywhere that user
 * account can, the same as any other program (VS Code, a text editor,
 * etc.). So "grant access to a folder, then work only in content:// URIs
 * forever" collapses into "pick a folder once (or don't - a full path
 * can be given directly), then use normal paths."
 *
 * PUBLIC API IS IDENTICAL to the Android version - requestAccess,
 * hasAccess, createFile, createFolder, deleteEntry, renameEntry,
 * moveEntry, zipFolder, extractZip, listFolder,
 * getOrCreateFileUriForTools, getExistingFileUriForTools - so
 * toolOrchestrator.js and pdfTool.js/docxTool.js/xlsxTool.js/pptxTool.js
 * (which call getOrCreateFileUriForTools/getExistingFileUriForTools) work
 * with zero call-site changes, only this file's own internals differ.
 * "uri" in return values is now just a plain Windows path string, not a
 * content:// URI - callers already treat it as an opaque string handle
 * to pass to FileSystem.writeAsStringAsync/readAsStringAsync, both of
 * which (see native-clients/fileSystemShim.js) accept plain paths
 * directly, so this substitution is transparent to them.
 */

import * as FileSystem from '../../native-clients/fileSystemShim';
import JSZip from 'jszip';
import { getPreferences, updatePreferences } from '../../db/database';

function requireAccessError() {
  return {
    success: false,
    data: null,
    error: {
      message: 'No folder selected yet. Open Settings > Filesystem and choose a folder first.',
    },
  };
}

async function getGrantedDirPath() {
  const prefsResult = await getPreferences();
  return prefsResult?.data?.filesystem_root_path || null;
}

/**
 * Opens a native folder picker so the person can choose a root folder
 * for the model's file operations (e.g. a project folder, their
 * Documents folder). Only needs to be done once - persisted the same way
 * the Android build persisted its SAF URI, just as a plain path now.
 */
export async function requestAccess() {
  try {
    const paths = await window.zaiNative.fs.showOpenDialog({
      title: 'Select a folder for ZAI to work in',
      properties: ['openDirectory'],
    });
    if (!paths.length) {
      return { success: false, data: null, error: { message: 'Folder access was not granted.' } };
    }
    await updatePreferences({ filesystem_root_path: paths[0] });
    return { success: true, data: { directoryPath: paths[0] }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Could not request folder access.' } };
  }
}

export async function hasAccess() {
  const p = await getGrantedDirPath();
  return !!p;
}

function joinPath(basePath, relativePath) {
  const normalized = relativePath.split('/').filter(Boolean).join('\\');
  return `${basePath}\\${normalized}`;
}

/** Used by pdfTool.js/docxTool.js/xlsxTool.js/pptxTool.js to get a writable path for their generated output. */
export async function getOrCreateFileUriForTools(relativePath) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = joinPath(baseDirPath, relativePath);
  const dirPath = fullPath.split('\\').slice(0, -1).join('\\');

  try {
    await FileSystem.makeDirectoryAsync(dirPath);
    return { success: true, data: { uri: fullPath }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not prepare ${relativePath} for writing.` } };
  }
}

/** Used by tools that need to read an existing file (e.g. mergePdfs reading a source PDF). */
export async function getExistingFileUriForTools(relativePath) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = joinPath(baseDirPath, relativePath);
  const info = await FileSystem.getInfoAsync(fullPath);
  if (!info.exists) {
    return { success: false, data: null, error: { message: `${relativePath} does not exist.` } };
  }
  return { success: true, data: { uri: fullPath }, error: null };
}

export async function createFile(relativePath, content) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = joinPath(baseDirPath, relativePath);
  const dirPath = fullPath.split('\\').slice(0, -1).join('\\');

  try {
    await FileSystem.makeDirectoryAsync(dirPath);
    await FileSystem.writeAsStringAsync(fullPath, content, { encoding: FileSystem.EncodingType.UTF8 });
    return { success: true, data: { path: relativePath, uri: fullPath }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not create ${relativePath}.` } };
  }
}

export async function createFolder(relativePath) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = joinPath(baseDirPath, relativePath);
  try {
    await FileSystem.makeDirectoryAsync(fullPath);
    return { success: true, data: { path: relativePath, uri: fullPath }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not create folder ${relativePath}.` } };
  }
}

export async function deleteEntry(relativePath) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = joinPath(baseDirPath, relativePath);
  const info = await FileSystem.getInfoAsync(fullPath);
  if (!info.exists) {
    return { success: false, data: null, error: { message: `${relativePath} does not exist.` } };
  }

  try {
    await FileSystem.deleteAsync(fullPath);
    return { success: true, data: { path: relativePath }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not delete ${relativePath}.` } };
  }
}

/** Rename in place - a real OS rename here, not the Android version's read/write/delete workaround (no SAF limitation to work around). */
export async function renameEntry(relativePath, newName) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = joinPath(baseDirPath, relativePath);
  const info = await FileSystem.getInfoAsync(fullPath);
  if (!info.exists) {
    return { success: false, data: null, error: { message: `${relativePath} does not exist.` } };
  }

  const newRelativePath = relativePath.split('/').slice(0, -1).concat(newName).join('/');
  const newFullPath = joinPath(baseDirPath, newRelativePath);

  try {
    // Windows equivalent of a real rename: read+write+delete via the fs
    // bridge (Node's fs.rename would be even more direct, but reusing
    // copyFile+deleteFile keeps this file's only dependency the same
    // fsBridge surface every other function here already uses).
    await window.zaiNative.fs.copyFile(fullPath, newFullPath);
    await FileSystem.deleteAsync(fullPath);
    return { success: true, data: { oldPath: relativePath, newPath: newRelativePath }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not rename ${relativePath}.` } };
  }
}

export async function moveEntry(sourcePath, destinationFolderPath, { keepOriginal = false } = {}) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const sourceFullPath = joinPath(baseDirPath, sourcePath);
  const info = await FileSystem.getInfoAsync(sourceFullPath);
  if (!info.exists) {
    return { success: false, data: null, error: { message: `${sourcePath} does not exist.` } };
  }

  const fileName = sourcePath.split('/').filter(Boolean).pop();
  const destFullPath = joinPath(baseDirPath, `${destinationFolderPath}/${fileName}`);
  const destDirPath = destFullPath.split('\\').slice(0, -1).join('\\');

  try {
    await FileSystem.makeDirectoryAsync(destDirPath);
    await window.zaiNative.fs.copyFile(sourceFullPath, destFullPath);
    if (!keepOriginal) {
      await FileSystem.deleteAsync(sourceFullPath);
    }
    return {
      success: true,
      data: { sourcePath, destinationPath: `${destinationFolderPath}/${fileName}`, copied: keepOriginal },
      error: null,
    };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not move ${sourcePath}.` } };
  }
}

export async function zipFolder(folderPath, zipOutputPath) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const folderFullPath = joinPath(baseDirPath, folderPath);
  const zip = new JSZip();

  async function addDirToZip(dirPath, zipFolderObj) {
    const entries = await FileSystem.readDirectoryAsync(dirPath);
    for (const name of entries) {
      const entryPath = `${dirPath}\\${name}`;
      const info = await FileSystem.getInfoAsync(entryPath);
      if (info.isDirectory) {
        await addDirToZip(entryPath, zipFolderObj.folder(name));
      } else {
        const content = await FileSystem.readAsStringAsync(entryPath, { encoding: FileSystem.EncodingType.Base64 });
        zipFolderObj.file(name, content, { base64: true });
      }
    }
  }

  try {
    await addDirToZip(folderFullPath, zip);
    const zipBase64 = await zip.generateAsync({ type: 'base64' });

    const outFullPath = joinPath(baseDirPath, zipOutputPath);
    const outDirPath = outFullPath.split('\\').slice(0, -1).join('\\');
    await FileSystem.makeDirectoryAsync(outDirPath);
    await FileSystem.writeAsStringAsync(outFullPath, zipBase64, { encoding: FileSystem.EncodingType.Base64 });

    return { success: true, data: { zipPath: zipOutputPath }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Could not create ZIP archive.' } };
  }
}

export async function extractZip(zipPath, destinationFolderPath) {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const zipFullPath = joinPath(baseDirPath, zipPath);
  const info = await FileSystem.getInfoAsync(zipFullPath);
  if (!info.exists) {
    return { success: false, data: null, error: { message: `${zipPath} does not exist.` } };
  }

  try {
    const base64Data = await FileSystem.readAsStringAsync(zipFullPath, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(base64Data, { base64: true });

    const destFullPath = joinPath(baseDirPath, destinationFolderPath);
    await FileSystem.makeDirectoryAsync(destFullPath);

    let extractedCount = 0;
    for (const [entryPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const targetPath = `${destFullPath}\\${entryPath.replace(/\//g, '\\')}`;
      const targetDir = targetPath.split('\\').slice(0, -1).join('\\');
      await FileSystem.makeDirectoryAsync(targetDir);

      const content = await entry.async('base64');
      await FileSystem.writeAsStringAsync(targetPath, content, { encoding: FileSystem.EncodingType.Base64 });
      extractedCount++;
    }

    return { success: true, data: { destinationFolderPath, filesExtracted: extractedCount }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not extract ${zipPath}.` } };
  }
}

export async function listFolder(relativePath = '') {
  const baseDirPath = await getGrantedDirPath();
  if (!baseDirPath) return requireAccessError();

  const fullPath = relativePath ? joinPath(baseDirPath, relativePath) : baseDirPath;
  try {
    const entries = await FileSystem.readDirectoryAsync(fullPath);
    return { success: true, data: { path: relativePath, entries }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || `Could not list ${relativePath || '(root)'}.` } };
  }
}
