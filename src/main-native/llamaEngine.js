/**
 * ZAI Desktop - Model Server Client (replaces node-llama-cpp)
 *
 * Local inference no longer runs in-process. It used to load a GGUF file
 * directly into Electron's main process via node-llama-cpp - a native
 * module that has to match this exact Electron/Node ABI, GPU backend,
 * etc. If that native binding failed to load for any reason, the
 * `require()` at the top of electron/main.js would throw BEFORE
 * createWindow() ever ran, which is why the app could show only the
 * native menu bar with a fully blank window and no error dialog: the
 * renderer never got a chance to load at all.
 *
 * Now this file is just a thin HTTP client. The person runs their own
 * model server (llama.cpp's `llama-server`, or any OpenAI-compatible
 * `/v1/chat/completions` endpoint) however they like - any GGUF, any of
 * Qwen3 / Qwen2.5-3B / Qwen2.5-1.5B / etc., started and swapped by hand,
 * completely decoupled from the Electron app's lifecycle. A crashed or
 * not-yet-started server now just means a chat error message, never a
 * blank window.
 *
 * The exported CONTRACT is unchanged on purpose:
 *   sendMessage(history, modelKey, options) ->
 *     { success, data: { content, toolCalls, raw } | null, error }
 * so toolOrchestrator.js / orchestrator.js need no changes at all -
 * only the internals of ensureModelLoaded/sendMessage changed from
 * "load a GGUF" to "check the server is reachable".
 */

const ERROR_TYPES = {
  MODEL_NOT_IMPORTED: 'MODEL_NOT_IMPORTED', // repurposed below: "server not configured"
  LOAD_FAILED: 'LOAD_FAILED', // repurposed below: "server not reachable"
  BAD_REQUEST: 'BAD_REQUEST',
  INFERENCE_ERROR: 'INFERENCE_ERROR',
  UNKNOWN: 'UNKNOWN',
};

const COMPLETION_TIMEOUT_MS = 2 * 60 * 1000;
const HEALTHCHECK_TIMEOUT_MS = 5 * 1000;

// In-memory only - the actual persisted copy lives in user_preferences
// (model_server_url / model_server_model), set via setServerConfig() from
// the renderer whenever Settings saves. Kept in-memory here too so every
// sendMessage call doesn't need to round-trip to SQLite first.
let serverUrl = null; // e.g. "http://localhost:8080"
let serverModel = null; // optional - only matters for multi-model servers
let lastKnownStatus = 'unconfigured'; // 'unconfigured' | 'ready' | 'unreachable'

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function setServerConfig(url, modelName) {
  serverUrl = url ? url.replace(/\/+$/, '') : null;
  serverModel = modelName || null;
  lastKnownStatus = serverUrl ? 'unknown' : 'unconfigured';
  return { success: true, error: null };
}

function getServerConfig() {
  return { url: serverUrl, model: serverModel, status: lastKnownStatus };
}

/** Hits the server's /v1/models (or falls back to a bare GET /) to confirm it's up. */
async function checkServerStatus() {
  if (!serverUrl) {
    lastKnownStatus = 'unconfigured';
    return { success: false, error: { type: ERROR_TYPES.MODEL_NOT_IMPORTED, message: 'No model server URL configured yet. Set one in Settings > Model Server.' } };
  }

  try {
    const res = await withTimeout(
      fetch(`${serverUrl}/v1/models`, { method: 'GET' }),
      HEALTHCHECK_TIMEOUT_MS,
      'Timed out reaching the model server.'
    );
    if (!res.ok) {
      lastKnownStatus = 'unreachable';
      return { success: false, error: { type: ERROR_TYPES.LOAD_FAILED, message: `Model server responded with HTTP ${res.status}.` } };
    }
    const body = await res.json().catch(() => null);
    lastKnownStatus = 'ready';
    return { success: true, error: null, data: body };
  } catch (err) {
    lastKnownStatus = 'unreachable';
    return {
      success: false,
      error: {
        type: ERROR_TYPES.LOAD_FAILED,
        message: `Could not reach the model server at ${serverUrl}. Make sure it's running (e.g. \`llama-server -m <model>.gguf --port 8080\`) and the URL/port in Settings match.`,
      },
    };
  }
}

/**
 * Kept for API-shape compatibility with the old in-process engine (the
 * IPC channel name and calling code in the renderer are unchanged) - here
 * it just means "confirm the server is reachable," since there's no
 * model to actually load into this process anymore.
 */
async function ensureModelLoaded(modelKey, onProgress) {
  onProgress?.({ status: 'loading', modelKey });
  const result = await checkServerStatus();
  onProgress?.({ status: result.success ? 'ready' : 'error', modelKey, message: result.error?.message });
  return result;
}

/** Converts ZAI's {role, content} history into OpenAI-style chat messages, unchanged. */
function buildMessagesFromHistory(history) {
  return history
    .filter((m) => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
}

async function sendMessage(history, modelKey, options = {}) {
  if (!Array.isArray(history) || history.length === 0) {
    return { success: false, data: null, error: { type: ERROR_TYPES.BAD_REQUEST, message: 'Empty conversation history' } };
  }

  if (!serverUrl) {
    return {
      success: false,
      data: null,
      error: { type: ERROR_TYPES.MODEL_NOT_IMPORTED, message: 'No model server URL configured yet. Set one in Settings > Model Server.' },
    };
  }

  try {
    const messages = buildMessagesFromHistory(history);

    console.log(`[ModelServerClient] Sending completion request to ${serverUrl} (model: ${serverModel || modelKey || 'server default'})...`);
    const startTime = Date.now();

    const res = await withTimeout(
      fetch(`${serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Some servers (llama-server with a single loaded model) ignore
          // this field entirely; multi-model servers (llama-swap, etc.)
          // use it to route/hot-swap. serverModel (Settings-configured)
          // takes priority over the internal modelKey since it's what
          // the person actually typed in for their server.
          model: serverModel || modelKey || 'default',
          messages,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
      }),
      COMPLETION_TIMEOUT_MS,
      `Model server took longer than ${COMPLETION_TIMEOUT_MS / 1000}s to respond.`
    );

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      lastKnownStatus = 'unreachable';
      return {
        success: false,
        data: null,
        error: { type: ERROR_TYPES.INFERENCE_ERROR, message: `Model server returned HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}` },
      };
    }

    lastKnownStatus = 'ready';
    const json = await res.json();
    const responseText = json?.choices?.[0]?.message?.content;

    console.log(`[ModelServerClient] Completion finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    if (!responseText) {
      return { success: false, data: null, error: { type: ERROR_TYPES.INFERENCE_ERROR, message: 'No content in the model server response.' } };
    }

    return {
      success: true,
      data: { content: responseText, toolCalls: json?.choices?.[0]?.message?.tool_calls || null, raw: json },
      error: null,
    };
  } catch (err) {
    lastKnownStatus = 'unreachable';
    console.error('[ModelServerClient] completion failed:', err);
    return {
      success: false,
      data: null,
      error: {
        type: ERROR_TYPES.INFERENCE_ERROR,
        message: err?.message?.includes('timed out') || err?.message?.includes('Timed out')
          ? err.message
          : `Could not reach the model server at ${serverUrl}. Is it running?`,
      },
    };
  }
}

/** No-op now (nothing to unload from this process) - kept so callers don't need branching. */
async function releaseCurrentModel() {
  return { success: true, error: null };
}

function getLoadedModelKey() {
  return serverModel;
}

async function shutdown() {
  // Nothing to tear down - the model server is a separate process the
  // person manages themselves.
}

function registerIpc(ipcMain) {
  ipcMain.handle('llama:sendMessage', (_e, history, modelKey, options) => sendMessage(history, modelKey, options));
  ipcMain.handle('llama:ensureModelLoaded', (e, modelKey) =>
    ensureModelLoaded(modelKey, (progress) => e.sender.send('llama:loadProgress', progress))
  );
  ipcMain.handle('llama:releaseCurrentModel', () => releaseCurrentModel());
  ipcMain.handle('llama:getLoadedModelKey', () => getLoadedModelKey());
  ipcMain.handle('llama:setServerConfig', (_e, url, modelName) => setServerConfig(url, modelName));
  ipcMain.handle('llama:getServerConfig', () => getServerConfig());
  ipcMain.handle('llama:checkServerStatus', () => checkServerStatus());
}

module.exports = {
  sendMessage,
  ensureModelLoaded,
  releaseCurrentModel,
  getLoadedModelKey,
  setServerConfig,
  getServerConfig,
  checkServerStatus,
  registerIpc,
  shutdown,
  ERROR_TYPES,
};
