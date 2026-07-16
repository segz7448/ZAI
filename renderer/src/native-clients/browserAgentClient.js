/**
 * ZAI Desktop - Browser Agent Client (renderer-side)
 *
 * Drop-in replacement for a mounted BrowserAgentView's imperative ref.
 * Most methods here are thin IPC pass-throughs (see
 * src/main-native/browserAgent.js for the real Playwright-backed logic),
 * matching BrowserAgentView.js's async method shapes exactly.
 *
 * ONE DELIBERATE DIFFERENCE: newTab/closeTab/switchTab/listTabs/
 * getActiveTabId/getZoom are SYNCHRONOUS in the original (they read/write
 * local React state directly, no await at any call site - confirmed
 * against every call in BrowserAgentScreen.js, e.g.
 * `setTabs(browserRef.current.listTabs())` with no await). IPC is
 * inherently async, so this client keeps its OWN synchronous local tab
 * registry (id/url/zoom only - the real Page objects stay in the main
 * process), updated immediately/optimistically on every tab-mutating
 * call, with the matching IPC call fired off in the background to keep
 * the real Playwright-side tab set in sync. Tab IDs are generated HERE
 * (not in the main process) specifically so newTab() can return an id
 * synchronously, exactly like the original.
 */

let tabIdCounter = 0;
function makeTabId() {
  tabIdCounter += 1;
  return `tab_${Date.now()}_${tabIdCounter}`;
}

// local mirror: tabId -> { url, zoomPercent }
const localTabs = new Map();
let localActiveTabId = null;
let launched = false;

async function ensureLaunched() {
  if (launched) return;
  launched = true;
  const id = makeTabId();
  localTabs.set(id, { url: 'https://www.google.com', zoomPercent: 100 });
  localActiveTabId = id;
  await window.zaiNative.browserAgent.launch('https://www.google.com', id);
}

export const browserViewRef = {
  current: {
    // ---- Navigation (async, matches original) ----
    async navigate(url, tabId) {
      await ensureLaunched();
      const id = tabId || localActiveTabId;
      const tab = localTabs.get(id);
      if (tab) tab.url = url;
      return window.zaiNative.browserAgent.navigate(url, id);
    },
    goBack: (tabId) => window.zaiNative.browserAgent.goBack(tabId || localActiveTabId),
    goForward: (tabId) => window.zaiNative.browserAgent.goForward(tabId || localActiveTabId),
    reload: (tabId) => window.zaiNative.browserAgent.reload(tabId || localActiveTabId),
    stopLoading: (tabId) => window.zaiNative.browserAgent.stopLoading(tabId || localActiveTabId),

    // ---- Tabs (SYNCHRONOUS, matches original exactly) ----
    newTab(url = 'about:blank') {
      const id = makeTabId();
      localTabs.set(id, { url, zoomPercent: 100 });
      localActiveTabId = id;
      launched = true;
      // Fire-and-forget: the real Playwright tab is created in the
      // background using this same id, so subsequent async calls
      // (navigate/click/etc.) that arrive slightly later already have a
      // real tab to resolve against by the time they're awaited.
      window.zaiNative.browserAgent.newTab(url, id).catch((err) => {
        console.error('[BrowserAgentClient] newTab failed:', err);
      });
      return id;
    },
    closeTab(tabId) {
      localTabs.delete(tabId);
      if (localActiveTabId === tabId) {
        const remaining = [...localTabs.keys()];
        localActiveTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
      }
      window.zaiNative.browserAgent.closeTab(tabId).catch(() => {});
    },
    switchTab(tabId) {
      if (localTabs.has(tabId)) {
        localActiveTabId = tabId;
        window.zaiNative.browserAgent.switchTab(tabId).catch(() => {});
      }
    },
    listTabs() {
      return [...localTabs.entries()].map(([id, tab]) => ({
        id, url: tab.url, active: id === localActiveTabId,
      }));
    },
    getActiveTabId() {
      return localActiveTabId;
    },

    // ---- DOM reading/interaction (async, matches original) ----
    async extractInteractiveElements(tabId) {
      await ensureLaunched();
      return window.zaiNative.browserAgent.extractInteractiveElements(tabId || localActiveTabId);
    },
    extractPageText: (maxChars, tabId) => window.zaiNative.browserAgent.extractPageText(maxChars, tabId || localActiveTabId),
    extractTables: (tabId) => window.zaiNative.browserAgent.extractTables(tabId || localActiveTabId),
    async getPageInfo(tabId) {
      await ensureLaunched();
      return window.zaiNative.browserAgent.getPageInfo(tabId || localActiveTabId);
    },
    click: (zaiId, tabId) => window.zaiNative.browserAgent.click(zaiId, tabId || localActiveTabId),
    fill: (zaiId, text, tabId) => window.zaiNative.browserAgent.fill(zaiId, text, tabId || localActiveTabId),
    selectOption: (zaiId, value, tabId) => window.zaiNative.browserAgent.selectOption(zaiId, value, tabId || localActiveTabId),
    setChecked: (zaiId, checked, tabId) => window.zaiNative.browserAgent.setChecked(zaiId, checked, tabId || localActiveTabId),
    submitForm: (zaiId, tabId) => window.zaiNative.browserAgent.submitForm(zaiId, tabId || localActiveTabId),
    scrollTo: (args, tabId) => window.zaiNative.browserAgent.scrollTo(args, tabId || localActiveTabId),
    waitForSelector: (selector, timeoutMs, tabId) => window.zaiNative.browserAgent.waitForSelector(selector, timeoutMs, tabId || localActiveTabId),
    runScript: (script, tabId) => window.zaiNative.browserAgent.runScript(script, tabId || localActiveTabId),

    // ---- Zoom: setZoom is async (matches original returning a Promise);
    // getZoom is SYNCHRONOUS (matches original reading a local ref) ----
    setZoom(percent, tabId) {
      const id = tabId || localActiveTabId;
      const tab = localTabs.get(id);
      if (tab) tab.zoomPercent = percent;
      return window.zaiNative.browserAgent.setZoom(percent, id);
    },
    getZoom(tabId) {
      const tab = localTabs.get(tabId || localActiveTabId);
      return tab?.zoomPercent || 100;
    },

    // ---- Misc ----
    screenshot: (tabId) => window.zaiNative.browserAgent.screenshot(tabId || localActiveTabId),
    close: () => window.zaiNative.browserAgent.close(),
    getCurrentUrl: (tabId) => window.zaiNative.browserAgent.getCurrentUrl(tabId || localActiveTabId),
  },
};
