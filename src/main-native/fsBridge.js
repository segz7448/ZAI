/**
 * ZAI Desktop - Filesystem Bridge
 *
 * General-purpose file read/write/dialog IPC used by the ported
 * office/pdf/zip export tools (src/services/office, src/services/pdf,
 * src/services/zipHandler from the Android build) and the filesystem
 * tool used by the model's tool-calling (create/delete/move file, save
 * exported docx/pdf/xlsx, etc.). Replaces expo-file-system for
 * everything that ISN'T the model-import path (which has its own file,
 * modelImportTool.js, since that one has extra progress/registry logic).
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

async function readFile(filePath, encoding = 'utf-8') {
  if (encoding === 'base64') {
    const buf = await fsp.readFile(filePath);
    return buf.toString('base64');
  }
  return fsp.readFile(filePath, encoding);
}

async function writeFile(filePath, data, encoding = 'utf-8') {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  if (encoding === 'base64') {
    await fsp.writeFile(filePath, Buffer.from(data, 'base64'));
  } else {
    await fsp.writeFile(filePath, data, encoding);
  }
  return true;
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function mkdir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
  return true;
}

async function deleteFile(filePath) {
  await fsp.rm(filePath, { force: true, recursive: true });
  return true;
}

async function copyFile(from, to) {
  const dir = path.dirname(to);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.copyFile(from, to);
  return true;
}

async function stat(filePath) {
  const s = await fsp.stat(filePath);
  return { isDirectory: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs };
}

async function readDir(dirPath) {
  return fsp.readdir(dirPath);
}

async function showSaveDialog(dialog, options = {}) {
  const result = await dialog.showSaveDialog({
    title: options.title || 'Save file',
    defaultPath: options.defaultPath,
    filters: options.filters,
  });
  return result.canceled ? null : result.filePath;
}

async function showOpenDialog(dialog, options = {}) {
  const result = await dialog.showOpenDialog({
    title: options.title || 'Open file',
    properties: options.properties || ['openFile'],
    filters: options.filters,
  });
  return result.canceled ? [] : result.filePaths;
}

function registerIpc(ipcMain, dialog) {
  ipcMain.handle('fs:readFile', (_e, filePath, encoding) => readFile(filePath, encoding));
  ipcMain.handle('fs:writeFile', (_e, filePath, data, encoding) => writeFile(filePath, data, encoding));
  ipcMain.handle('fs:exists', (_e, filePath) => exists(filePath));
  ipcMain.handle('fs:mkdir', (_e, dirPath) => mkdir(dirPath));
  ipcMain.handle('fs:deleteFile', (_e, filePath) => deleteFile(filePath));
  ipcMain.handle('fs:copyFile', (_e, from, to) => copyFile(from, to));
  ipcMain.handle('fs:stat', (_e, filePath) => stat(filePath));
  ipcMain.handle('fs:readDir', (_e, dirPath) => readDir(dirPath));
  ipcMain.handle('fs:showSaveDialog', (_e, options) => showSaveDialog(dialog, options));
  ipcMain.handle('fs:showOpenDialog', (_e, options) => showOpenDialog(dialog, options));
}

module.exports = { readFile, writeFile, exists, mkdir, deleteFile, copyFile, stat, readDir, registerIpc };
