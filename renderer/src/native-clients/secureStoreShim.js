/**
 * ZAI Desktop - Secure Store Shim (renderer-side)
 *
 * Replaces `import * as SecureStore from 'expo-secure-store'` in
 * src/db/database.js. Same three methods
 * (setItemAsync/getItemAsync/deleteItemAsync) database.js already calls.
 */

export async function setItemAsync(key, value) {
  return window.zaiNative.secureStore.setItem(key, value);
}

export async function getItemAsync(key) {
  return window.zaiNative.secureStore.getItem(key);
}

export async function deleteItemAsync(key) {
  return window.zaiNative.secureStore.deleteItem(key);
}
