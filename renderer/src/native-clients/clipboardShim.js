/**
 * ZAI Desktop - Clipboard Shim (replaces expo-clipboard)
 *
 * Electron's Chromium renderer has the standard web Clipboard API
 * natively - no native module needed the way Android required one. Same
 * two functions (setStringAsync/getStringAsync) the ported components
 * (MarkdownText.js, MessageActions.js, MessageActionMenu.js) already
 * call, so only their import line changes.
 */

export async function setStringAsync(text) {
  await navigator.clipboard.writeText(text);
  return true;
}

export async function getStringAsync() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return ''; // clipboard read can be permission-blocked; fail soft like the Android version does on denial
  }
}
