/**
 * ZAI Desktop - SQLite Layer (better-sqlite3)
 *
 * Replaces expo-sqlite. better-sqlite3 is synchronous by design (that's
 * why it's fast and doesn't need WAL-polling workarounds) - this wraps
 * every call in Promise.resolve() so the renderer-side db.js (ported
 * near-verbatim from the Android build) can keep calling
 * db.execAsync/getAllAsync/getFirstAsync/runAsync exactly as before, just
 * over IPC instead of directly. The four methods below are the entire
 * API surface src/db/database.js actually uses (verified against the
 * original file), so this shim is a complete replacement, not a partial
 * one.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

function init(userDataPath) {
  const dir = userDataPath;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'zai.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log(`[DB] Opened ${dbPath}`);
  return db;
}

/**
 * Mirrors expo-sqlite's execAsync: runs a (possibly multi-statement) raw
 * SQL string, no parameter binding. Used for schema creation
 * (CREATE TABLE IF NOT EXISTS ...; PRAGMA ...; etc.).
 */
async function execAsync(sql) {
  if (!db) throw new Error('Database not initialized');
  db.exec(sql);
}

/** Mirrors expo-sqlite's getAllAsync: returns every matching row. */
async function getAllAsync(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  return stmt.all(...normalizeParams(params));
}

/** Mirrors expo-sqlite's getFirstAsync: returns the first row or null. */
async function getFirstAsync(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  const row = stmt.get(...normalizeParams(params));
  return row ?? null;
}

/**
 * Mirrors expo-sqlite's runAsync: for INSERT/UPDATE/DELETE. Returns an
 * object exposing lastInsertRowId/changes the way expo-sqlite's result
 * object does, in case any call site reads those.
 */
async function runAsync(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  const info = stmt.run(...normalizeParams(params));
  return { lastInsertRowId: info.lastInsertRowid, changes: info.changes };
}

function normalizeParams(params) {
  // expo-sqlite call sites sometimes pass a single value instead of an
  // array for a 1-param query - better-sqlite3 always wants a flat
  // argument list, so this normalizes both call shapes.
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

function registerIpc(ipcMain) {
  ipcMain.handle('db:exec', (_e, sql) => execAsync(sql));
  ipcMain.handle('db:getAll', (_e, sql, params) => getAllAsync(sql, params));
  ipcMain.handle('db:getFirst', (_e, sql, params) => getFirstAsync(sql, params));
  ipcMain.handle('db:run', (_e, sql, params) => runAsync(sql, params));
}

module.exports = { init, execAsync, getAllAsync, getFirstAsync, runAsync, close, registerIpc };
