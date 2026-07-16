/**
 * ZAI Desktop - SQLite Shim (renderer-side)
 *
 * Replaces the `import * as SQLite from 'expo-sqlite'` line at the top
 * of src/db/database.js. Provides an openDatabaseAsync() that returns an
 * object with the same four methods (execAsync/getAllAsync/
 * getFirstAsync/runAsync) database.js already calls - so database.js
 * ports with just this one import line changed, per the verified API
 * surface (grep confirmed only these 4 methods are used across the
 * entire 1081-line file).
 */

export async function openDatabaseAsync() {
  // The actual better-sqlite3 connection lives in the main process
  // (src/main-native/db.js) and was already opened at app startup - this
  // just returns an object whose methods forward to it over IPC.
  return {
    execAsync: (sql) => window.zaiNative.db.exec(sql),
    getAllAsync: (sql, params) => window.zaiNative.db.getAll(sql, params),
    getFirstAsync: (sql, params) => window.zaiNative.db.getFirst(sql, params),
    runAsync: (sql, params) => window.zaiNative.db.run(sql, params),
  };
}
