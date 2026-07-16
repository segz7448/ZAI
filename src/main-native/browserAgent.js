/**
 * ZAI Desktop - Browser Agent (Playwright, multi-tab)
 *
 * Full replacement for src/services/browserAgent/BrowserAgentView.js's
 * imperative API. The Android version ran N real WebViews (one per tab,
 * only the active one visible) driven by an injected JS bridge
 * (domBridge.js) over postMessage; this runs N real Playwright Page
 * objects in one BrowserContext (so cookies/session are shared exactly
 * the way multiple WebViews sharing Android's cookie store were),
 * driven directly via Playwright's page.evaluate()/page.click()/etc
 * instead of a postMessage bridge - same capability, more direct
 * plumbing since there's no WebView boundary to cross here.
 *
 * CONTRACT: every method below matches BrowserAgentView.js's
 * useImperativeHandle surface name-for-name (navigate, goBack,
 * goForward, reload, stopLoading, newTab, closeTab, switchTab,
 * listTabs, getActiveTabId, extractInteractiveElements,
 * extractPageText, extractTables, getPageInfo, click, fill,
 * selectOption, setChecked, submitForm, scrollTo, waitForSelector,
 * runScript, setZoom, getZoom), all accepting an optional tabId that
 * defaults to the active tab - so BrowserAgentScreen.js and
 * agentLoop.js's _executeAction switch (verified against every case in
 * that switch statement) call this with zero logic changes, only the
 * import path (browserViewRef from native-clients/browserAgentClient.js
 * instead of a mounted <BrowserAgentView> ref).
 */

let playwright = null;
let browser = null;
let context = null;
const tabs = new Map(); // tabId -> { page, url, zoomPercent, elementRegistry }
let activeTabId = null;
let tabIdCounter = 0;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function makeTabId() {
  tabIdCounter += 1;
  return `tab_${Date.now()}_${tabIdCounter}`;
}

async function getPlaywright() {
  if (!playwright) playwright = require('playwright');
  return playwright;
}

async function ensureBrowser() {
  if (browser && context) return;
  const { chromium } = await getPlaywright();
  browser = await chromium.launch({ headless: false });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: DESKTOP_UA });
}

async function launch(initialUrl = 'https://www.google.com', externalTabId) {
  try {
    await ensureBrowser();
    if (tabs.size === 0) {
      await createTab(initialUrl, externalTabId);
    }
    return { success: true, error: null };
  } catch (err) {
    console.error('[BrowserAgent] launch failed:', err);
    return { success: false, error: { message: err?.message || 'Could not launch the browser.' } };
  }
}

async function createTab(url, externalTabId) {
  const id = externalTabId || makeTabId();
  const page = await context.newPage();
  tabs.set(id, { page, url, zoomPercent: 100, elementRegistry: new Map() });
  activeTabId = id;
  await navigate(url, id);
  return id;
}

function getTab(tabId) {
  const id = tabId || activeTabId;
  return tabs.get(id);
}

// ---- Navigation ----

async function navigate(url, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await tab.page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    tab.url = tab.page.url();
    if (tab.zoomPercent !== 100) await applyZoom(tab);
    return { success: true, data: { url: tab.url }, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || `Could not navigate to ${url}` } };
  }
}

async function goBack(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    await tab.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
    tab.url = tab.page.url();
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Could not go back.' } };
  }
}

async function goForward(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    await tab.page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
    tab.url = tab.page.url();
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Could not go forward.' } };
  }
}

async function reload(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    await tab.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Could not reload.' } };
  }
}

async function stopLoading(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    await tab.page.evaluate(() => window.stop());
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Could not stop loading.' } };
  }
}

// ---- Tabs ----

async function newTab(url = 'about:blank', externalTabId) {
  await ensureBrowser();
  const id = await createTab(url, externalTabId);
  return { success: true, data: { tabId: id }, error: null };
}

async function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    await tab.page.close();
  } catch {
    // already closed - fine
  }
  tabs.delete(tabId);
  if (activeTabId === tabId) {
    const remaining = [...tabs.keys()];
    activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
  }
  return { success: true, error: null };
}

function switchTab(tabId) {
  if (!tabs.has(tabId)) return { success: false, error: { message: 'No such tab.' } };
  activeTabId = tabId;
  return { success: true, error: null };
}

function listTabs() {
  return [...tabs.entries()].map(([id, tab]) => ({ id, url: tab.url, active: id === activeTabId }));
}

function getActiveTabId() {
  return activeTabId;
}

// ---- DOM reading/interaction ----

async function extractInteractiveElements(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  try {
    tab.elementRegistry.clear();
    const elements = await tab.page.evaluate(() => {
      const selector = 'a, button, input, textarea, select, [role="button"], [onclick], [contenteditable="true"]';
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .slice(0, 150)
        .map((el, i) => {
          el.setAttribute('data-zai-id', String(i));
          const label =
            el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
            el.innerText?.trim().slice(0, 80) || el.getAttribute('value') || '';
          return {
            id: String(i), tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || null,
            label, href: el.tagName.toLowerCase() === 'a' ? el.getAttribute('href') : null,
          };
        });
    });

    for (const el of elements) {
      const handle = await tab.page.$(`[data-zai-id="${el.id}"]`);
      if (handle) tab.elementRegistry.set(el.id, handle);
    }

    return { success: true, data: { elements, currentUrl: tab.page.url(), title: await tab.page.title() }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Could not read the page.' } };
  }
}

async function extractPageText(maxChars = 6000, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  try {
    const text = await tab.page.evaluate(() => document.body?.innerText || '');
    return { success: true, data: { text: text.slice(0, maxChars) }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Could not read page text.' } };
  }
}

async function extractTables(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  try {
    const tables = await tab.page.evaluate(() => {
      return Array.from(document.querySelectorAll('table')).slice(0, 10).map((table) => {
        return Array.from(table.querySelectorAll('tr')).map((row) =>
          Array.from(row.querySelectorAll('th, td')).map((cell) => cell.innerText.trim())
        );
      });
    });
    return { success: true, data: { tables }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Could not read tables.' } };
  }
}

async function getPageInfo(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  try {
    const title = await tab.page.title();
    return { success: true, data: { url: tab.page.url(), title }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Could not read page info.' } };
  }
}

async function click(zaiId, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  const handle = tab.elementRegistry.get(String(zaiId));
  if (!handle) return { success: false, error: { message: `Element ${zaiId} not found - extract the page again.` } };
  try {
    await handle.click({ timeout: 10000 });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Click failed.' } };
  }
}

async function fill(zaiId, text, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  const handle = tab.elementRegistry.get(String(zaiId));
  if (!handle) return { success: false, error: { message: `Element ${zaiId} not found - extract the page again.` } };
  try {
    await handle.fill(text, { timeout: 10000 });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Fill failed.' } };
  }
}

async function selectOption(zaiId, value, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  const handle = tab.elementRegistry.get(String(zaiId));
  if (!handle) return { success: false, error: { message: `Element ${zaiId} not found - extract the page again.` } };
  try {
    await handle.selectOption(value, { timeout: 10000 });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Select failed.' } };
  }
}

async function setChecked(zaiId, checked, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  const handle = tab.elementRegistry.get(String(zaiId));
  if (!handle) return { success: false, error: { message: `Element ${zaiId} not found - extract the page again.` } };
  try {
    if (checked) await handle.check({ timeout: 10000 });
    else await handle.uncheck({ timeout: 10000 });
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Checkbox toggle failed.' } };
  }
}

async function submitForm(zaiId, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  const handle = tab.elementRegistry.get(String(zaiId));
  if (!handle) return { success: false, error: { message: `Element ${zaiId} not found - extract the page again.` } };
  try {
    await handle.evaluate((el) => el.closest('form')?.requestSubmit?.() ?? el.click());
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Submit failed.' } };
  }
}

async function scrollTo(args, tabId) {
  const zaiId = args?.zaiId;
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  try {
    if (zaiId != null) {
      const handle = tab.elementRegistry.get(String(zaiId));
      if (handle) {
        await handle.scrollIntoViewIfNeeded();
        return { success: true, error: null };
      }
    }
    await tab.page.mouse.wheel(0, 600);
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: err?.message || 'Scroll failed.' } };
  }
}

async function waitForSelector(selector, timeoutMs = 8000, tabId) {
  const tab = getTab(tabId);
  if (!tab) return false;
  try {
    await tab.page.waitForSelector(selector, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function runScript(script, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  try {
    const result = await tab.page.evaluate(script);
    return { success: true, data: { result }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Script execution failed.' } };
  }
}

// ---- Zoom ----

async function applyZoom(tab) {
  await tab.page.evaluate((percent) => {
    document.documentElement.style.zoom = `${percent}%`;
  }, tab.zoomPercent).catch(() => {});
}

async function setZoom(percent, tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, error: { message: 'No such tab.' } };
  tab.zoomPercent = percent;
  await applyZoom(tab);
  return { success: true, error: null };
}

function getZoom(tabId) {
  const tab = getTab(tabId);
  return tab?.zoomPercent || 100;
}

// ---- Screenshot / misc ----

async function screenshot(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  try {
    const buffer = await tab.page.screenshot({ type: 'jpeg', quality: 60 });
    return { success: true, data: { base64: buffer.toString('base64') }, error: null };
  } catch (err) {
    return { success: false, data: null, error: { message: err?.message || 'Screenshot failed.' } };
  }
}

async function getCurrentUrl(tabId) {
  const tab = getTab(tabId);
  if (!tab) return { success: false, data: null, error: { message: 'No such tab.' } };
  return { success: true, data: { url: tab.page.url() }, error: null };
}

async function close() {
  try {
    if (browser) await browser.close();
  } catch {
    // ignore
  }
  browser = null;
  context = null;
  tabs.clear();
  activeTabId = null;
  return { success: true, error: null };
}

async function shutdown() {
  await close();
}

function registerIpc(ipcMain) {
  ipcMain.handle('browserAgent:launch', (_e, initialUrl, tabId) => launch(initialUrl, tabId));
  ipcMain.handle('browserAgent:navigate', (_e, url, tabId) => navigate(url, tabId));
  ipcMain.handle('browserAgent:goBack', (_e, tabId) => goBack(tabId));
  ipcMain.handle('browserAgent:goForward', (_e, tabId) => goForward(tabId));
  ipcMain.handle('browserAgent:reload', (_e, tabId) => reload(tabId));
  ipcMain.handle('browserAgent:stopLoading', (_e, tabId) => stopLoading(tabId));
  ipcMain.handle('browserAgent:newTab', (_e, url, tabId) => newTab(url, tabId));
  ipcMain.handle('browserAgent:closeTab', (_e, tabId) => closeTab(tabId));
  ipcMain.handle('browserAgent:switchTab', (_e, tabId) => switchTab(tabId));
  ipcMain.handle('browserAgent:listTabs', () => listTabs());
  ipcMain.handle('browserAgent:getActiveTabId', () => getActiveTabId());
  ipcMain.handle('browserAgent:extract', (_e, tabId) => extractInteractiveElements(tabId));
  ipcMain.handle('browserAgent:extractPageText', (_e, maxChars, tabId) => extractPageText(maxChars, tabId));
  ipcMain.handle('browserAgent:extractTables', (_e, tabId) => extractTables(tabId));
  ipcMain.handle('browserAgent:getPageInfo', (_e, tabId) => getPageInfo(tabId));
  ipcMain.handle('browserAgent:click', (_e, zaiId, tabId) => click(zaiId, tabId));
  ipcMain.handle('browserAgent:fill', (_e, zaiId, text, tabId) => fill(zaiId, text, tabId));
  ipcMain.handle('browserAgent:selectOption', (_e, zaiId, value, tabId) => selectOption(zaiId, value, tabId));
  ipcMain.handle('browserAgent:setChecked', (_e, zaiId, checked, tabId) => setChecked(zaiId, checked, tabId));
  ipcMain.handle('browserAgent:submitForm', (_e, zaiId, tabId) => submitForm(zaiId, tabId));
  ipcMain.handle('browserAgent:scrollTo', (_e, args, tabId) => scrollTo(args, tabId));
  ipcMain.handle('browserAgent:waitForSelector', (_e, selector, timeoutMs, tabId) => waitForSelector(selector, timeoutMs, tabId));
  ipcMain.handle('browserAgent:runScript', (_e, script, tabId) => runScript(script, tabId));
  ipcMain.handle('browserAgent:setZoom', (_e, percent, tabId) => setZoom(percent, tabId));
  ipcMain.handle('browserAgent:getZoom', (_e, tabId) => getZoom(tabId));
  ipcMain.handle('browserAgent:screenshot', (_e, tabId) => screenshot(tabId));
  ipcMain.handle('browserAgent:close', () => close());
  ipcMain.handle('browserAgent:getCurrentUrl', (_e, tabId) => getCurrentUrl(tabId));
}

module.exports = {
  launch, navigate, goBack, goForward, reload, stopLoading,
  newTab, closeTab, switchTab, listTabs, getActiveTabId,
  extractInteractiveElements, extractPageText, extractTables, getPageInfo,
  click, fill, selectOption, setChecked, submitForm, scrollTo, waitForSelector, runScript,
  setZoom, getZoom, screenshot, getCurrentUrl, close, shutdown, registerIpc,
};
