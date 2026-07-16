/**
 * ZAI - Local Model Configuration (model-server backed)
 *
 * Replaces the old llama.rn / node-llama-cpp in-process setup. ZAI still
 * runs entirely on models the person controls - no OpenRouter, no
 * Hugging Face, no per-call API key - but the model itself is no longer
 * loaded inside the app. Instead, the person runs their own model server
 * (llama.cpp's `llama-server`, or any OpenAI-compatible
 * `/v1/chat/completions` host) and points ZAI at it from Settings >
 * Model Server: a base URL (e.g. http://localhost:8080) plus, for
 * servers that host more than one model at once, a model identifier.
 *
 * Why: bundling node-llama-cpp meant a single native-module load
 * failure (wrong ABI, unsupported GPU backend, etc.) could crash the
 * whole Electron main process before the window ever painted - a fully
 * blank window with only the native menu bar and no error shown. Running
 * the model out-of-process removes that failure class entirely; the app
 * is just an HTTP client now, and a server that isn't running just
 * produces a normal, recoverable chat error.
 *
 * The list below is just display/preset metadata for Settings' model
 * picker - it does NOT control what's actually loaded (that's entirely
 * up to how the person started their server). Picking a preset here only
 * fills in the "model" field ZAI sends with each request, which matters
 * for multi-model servers (e.g. llama-swap) and is ignored by
 * single-model servers.
 */

export const MODEL_KEYS = {
  QWEN3_4B: 'qwen3_4b',
  QWEN25_3B: 'qwen25_3b_instruct',
  QWEN25_1_5B: 'qwen25_1_5b_instruct',
  CUSTOM: 'custom',
};

// Display presets for the Settings "Model Server" section's model picker.
// `serverModelId` is what gets sent as the `model` field in chat
// completion requests - for llama-server running a single GGUF this is
// ignored, so it's fine to leave as a sensible default; for llama-swap or
// similar it should match whatever name that server uses to identify the
// model.
export const LOCAL_MODELS = {
  [MODEL_KEYS.QWEN3_4B]: {
    key: MODEL_KEYS.QWEN3_4B,
    label: 'Qwen3 4B',
    description: 'Newest Qwen generation - strong all-round chat, coding, and reasoning.',
    serverModelId: 'qwen3-4b',
  },
  [MODEL_KEYS.QWEN25_3B]: {
    key: MODEL_KEYS.QWEN25_3B,
    label: 'Qwen2.5 3B Instruct',
    description: 'Good balance of speed and quality for everyday chat and coding.',
    serverModelId: 'qwen2.5-3b-instruct',
  },
  [MODEL_KEYS.QWEN25_1_5B]: {
    key: MODEL_KEYS.QWEN25_1_5B,
    label: 'Qwen2.5 1.5B Instruct',
    description: 'Smallest and fastest - best on modest hardware or for quick replies.',
    serverModelId: 'qwen2.5-1.5b-instruct',
  },
  [MODEL_KEYS.CUSTOM]: {
    key: MODEL_KEYS.CUSTOM,
    label: 'Custom',
    description: 'Any other model your server is running - type its model id exactly as the server expects.',
    serverModelId: '',
  },
};

/**
 * Task classifier - kept for the tool-routing/browser-agent checks
 * upstream in orchestrator.js ('github', 'browsing', 'imageGeneration',
 * 'vision' still get detected for that purpose). Every text-generation
 * category maps to whichever single model the person's server is
 * currently running - there's no per-category model split anymore, since
 * that's now entirely the person's choice of what to run on their server,
 * not something ZAI can route between.
 */
export function classifyTask(messageText = '') {
  const text = messageText.toLowerCase();

  const codingKeywords = [
    'code', 'build', 'app', 'function', 'debug', 'bug', 'component', 'api', 'script',
    'react', 'python', 'javascript', 'app development', 'web development', 'website',
    'frontend', 'backend', 'long context', 'refactor', 'compile', 'repository', 'repo',
  ];
  const reasoningMathKeywords = [
    'solve', 'proof', 'prove', 'theorem', 'equation', 'calculate', 'calculation',
    'math', 'maths', 'mathematics', 'algebra', 'calculus', 'geometry', 'derivative',
    'integral', 'probability', 'statistics', 'logic puzzle', 'logic problem',
    'riddle', 'step by step reasoning', 'think step by step', 'word problem',
    'brain teaser', 'chain of thought', 'reason through', 'reasoning problem',
  ];
  const toolTaskKeywords = [
    'push to github', 'push it to github', 'commit to github', 'create a repo',
    'create a repository', 'create a github repo', 'open a pull request',
    'create a pull request', 'open a pr', 'create a branch', 'github release',
    'upload to github', 'clone the repo', 'clone this repo',
    'zip this folder', 'zip the folder', 'extract this zip', 'unzip this',
    'create a folder', 'delete this file', 'delete this folder', 'move this file',
    'rename this file', 'rename this folder', 'save this to my phone',
    'save this to my device', 'save to storage', 'create these files',
    'make this a pdf', 'create a pdf', 'save as pdf', 'export as pdf',
    'merge these pdfs', 'merge pdfs', 'combine these pdfs', 'split this pdf',
    'split the pdf', 'create a word document', 'make this a word doc',
    'save as docx', 'create a docx', 'create a spreadsheet', 'save as xlsx',
    'create a xlsx', 'make this a spreadsheet', 'export as csv', 'save as csv',
    'create a csv', 'create a presentation', 'make a powerpoint',
    'create a pptx', 'save as pptx', 'make a slide deck', 'create a pitch deck',
  ];
  const browsingKeywords = [
    'search the web', 'search online', 'browse', 'go to', 'open this website', 'open this site',
    'visit this site', 'visit this url', 'look this up online', 'find on the web',
    'check the website', 'download the', 'latest release', 'current price of',
    'what does this website say', 'click on', 'fill out the form',
    'news today', 'today\'s news', 'latest news', 'what\'s happening', 'current events',
    'what happened today', 'recent news', 'breaking news',
  ];
  const imageGenerationKeywords = [
    'generate an image', 'generate image', 'create an image', 'create a picture',
    'draw a picture', 'draw an image', 'make an image', 'make a picture',
    'generate a picture', 'image of a', 'picture of a', 'draw me', 'paint me',
    'illustration of', 'render an image', 'image generation',
  ];
  const visionKeywords = ['photo', 'picture', 'screenshot', 'diagram', 'see this'];

  if (toolTaskKeywords.some((k) => text.includes(k))) return 'github';
  if (browsingKeywords.some((k) => text.includes(k))) return 'browsing';
  if (imageGenerationKeywords.some((k) => text.includes(k))) return 'imageGeneration';
  if (visionKeywords.some((k) => text.includes(k))) return 'vision';
  if (codingKeywords.some((k) => text.includes(k))) return 'coding';
  if (reasoningMathKeywords.some((k) => text.includes(k))) return 'reasoning';
  return 'general';
}

/**
 * Every task category resolves to "whatever the server is configured to
 * run" - orchestrator.js reads the person's chosen model preset (or
 * custom serverModelId) from preferences rather than this fixed table
 * now, but this export is kept so any code still importing
 * getModelKeyForTask() for logging/labeling purposes doesn't break.
 */
export function getModelKeyForTask() {
  return MODEL_KEYS.CUSTOM;
}

export function getModelDisplayList() {
  return Object.values(LOCAL_MODELS);
}
