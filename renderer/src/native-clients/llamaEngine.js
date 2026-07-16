/**
 * ZAI Desktop - Local Llama Engine (renderer-side client)
 *
 * Drop-in replacement for src/services/llama/llamaEngine.js. Same
 * exported contract (sendMessage, releaseCurrentModel, getLoadedModelKey,
 * ERROR_TYPES) - toolOrchestrator.js, orchestrator.js, and agentLoop.js
 * all import this instead, with only the import path changed.
 *
 * The model itself now runs in a separate process entirely - a model
 * server (e.g. llama.cpp's `llama-server`) that the person starts
 * themselves and points the app at from Settings > Model Server. This
 * file just forwards to the main process
 * (src/main-native/llamaEngine.js), which is now a thin HTTP client to
 * that server rather than an in-process node-llama-cpp context. Nothing
 * here changed shape - only what happens on the other side of the IPC
 * call did.
 */

export const ERROR_TYPES = {
  MODEL_NOT_IMPORTED: 'MODEL_NOT_IMPORTED', // now means "server not configured"
  LOAD_FAILED: 'LOAD_FAILED', // now means "server not reachable"
  BAD_REQUEST: 'BAD_REQUEST',
  INFERENCE_ERROR: 'INFERENCE_ERROR',
  UNKNOWN: 'UNKNOWN',
};

export async function sendMessage(history, modelKey, options = {}) {
  return window.zaiNative.llama.sendMessage(history, modelKey, options);
}

export async function releaseCurrentModel() {
  return window.zaiNative.llama.releaseCurrentModel();
}

export async function getLoadedModelKey() {
  return window.zaiNative.llama.getLoadedModelKey();
}

/** Subscribe to model load progress events (loading/ready/error). */
export function onLoadProgress(callback) {
  return window.zaiNative.llama.onLoadProgress(callback);
}

/**
 * Pushes the person's configured server URL + (optional) model name down
 * to the main process's llamaEngine, which holds it in memory for every
 * subsequent sendMessage() call. Called from Settings whenever the
 * person saves the Model Server fields, and once at app launch after
 * preferences load (see preferencesStore.js loadPreferences()).
 */
export async function setServerConfig(url, modelName) {
  return window.zaiNative.llama.setServerConfig(url, modelName);
}

export async function getServerConfig() {
  return window.zaiNative.llama.getServerConfig();
}

/** Pings the configured server's /v1/models endpoint to confirm it's reachable. */
export async function checkServerStatus() {
  return window.zaiNative.llama.checkServerStatus();
}
