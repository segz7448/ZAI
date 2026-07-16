# ZAI Desktop — Windows Port

## Quickest way to run it

1. Double-click **`setup.bat`** — do this once, the first time only. It
   installs everything ZAI needs (a few minutes, needs internet) and
   automatically adds a **ZAI** icon to your Desktop.
2. From then on, just double-click the **ZAI** icon on your Desktop to
   launch the app.

That's it — no typing commands required. If `setup.bat` says Node.js is
missing, install it from https://nodejs.org (choose the "LTS" version),
then run `setup.bat` again.

If the Desktop icon didn't get created for some reason, you can also
double-click **`Add Desktop Shortcut.bat`** any time to add it, or just
double-click **`start ZAI.bat`** directly in this folder instead.

---

The full app is ported and building cleanly: `npm install` succeeds (694+ packages),
`npm run build:renderer` produces a working production bundle (641 modules,
verified), and the Electron app boots end-to-end (opens its SQLite DB,
initializes every IPC handler) in a headless test run.

## What's ported (full feature set, not a subset)

**Screens:** ChatScreen, SettingsScreen, BrowserAgentScreen — copied from the
original app with only their native imports swapped, everything else (layout,
logic, styling) untouched.

**Components:** AttachmentSheet, ErrorBoundary, ImageViewerModal, MarkdownText,
MessageActionMenu, MessageActions, SidebarDrawer, Toast — all ported.

**Store/state:** chatStore, preferencesStore, themeStore (Zustand, unchanged
logic) — theme tokens and useTheme hook ported as-is.

**Core services:** toolOrchestrator, orchestrator (task classification/model
routing), memoryEngine, fileProcessor + its extraction pipeline (text/CSV/ZIP/
document), all office tools (docx/xlsx/pptx generation), pdfTool, githubTool,
syncEngine + Supabase client, database.js (full schema/queries).

**Native replacements** (the actual point of this port):
- Termux → real CMD/PowerShell via `child_process`
- llama.rn → `node-llama-cpp` running your same GGUF model, GPU-accelerated
- expo-sqlite → `better-sqlite3`
- expo-secure-store → Electron `safeStorage` (Windows DPAPI)
- expo-file-system → Node `fs`, wrapped to match the original API
- Android SAF folder access → native Windows folder/file dialogs
- WebView browser agent → **full multi-tab Playwright browser**, matching
  the original's complete imperative API (tabs, zoom, DOM extraction, forms,
  scripts) method-for-method
- expo-image-picker/document-picker → native file-open dialog
- expo-clipboard → browser Clipboard API
- expo-haptics → no-op (no vibration hardware on a PC)
- expo-blur → CSS `backdrop-filter`
- react-native Alert (unimplemented in react-native-web) → real in-app modal
- @expo/vector-icons → `react-icons` (avoided a React 19 peer conflict)
- react-native-safe-area-context → lightweight shim (no real safe-area
  concept on a desktop window; would've pulled in the same React 19 conflict)
- androidTts (expo-speech) → Web Speech API (`speechSynthesis`), works fully
  offline using Windows' own installed voices

## Known, honest gaps (not hidden, not guessed around)

1. **No floating browser preview (PiP).** The Android build showed a small
   docked live-preview of the WebView inside the phone UI. The Windows browser
   agent is a **real, separate Chromium window** driven by Playwright — not
   something embeddable inside Electron's own renderer the way a WebView
   could nest inside a phone screen. `BrowserAgentScreen` still works as a
   full remote-control panel (address bar, tabs, back/forward all drive the
   real window), the person can Alt-Tab to see the page directly. A live
   thumbnail (periodic screenshot polling into an `<img>`) would be a
   reasonable follow-up, not attempted here since it wasn't asked for.
2. **Termux-branded UI text in Settings.** The functional plumbing is fully
   rewired to CMD/PowerShell, but a few Settings screen strings still say
   "Termux" (e.g. "Termux not installed"). Since terminalTool's desktop
   version always reports itself as available, this mostly self-resolves in
   behavior, but the copy text is worth a pass — cosmetic, not functional.
3. **Camera capture** in the attachment picker has no desktop equivalent
   wired up (no phone camera) — reports as unavailable rather than crashing.

## Verified end-to-end

```
npm install                              # 694+ packages, clean
npx vite build --config renderer/vite.config.js   # 641 modules, clean build
xvfb-run -a npx electron . --no-sandbox  # boots, opens SQLite, inits all IPC
```

The GPU/dbus errors in a headless test run are container-sandbox noise (no
real display server here) — normal on an actual Windows machine.

## Running it yourself

```
npm install
npm run dev        # dev mode: Vite dev server + Electron, hot reload
npm run build       # production build -> dist-installer/*.exe (run on Windows)
```

## Bringing your own model

Same GGUF file you used on Android (`Qwen2.5-coder-3B-instruct-Q4_K_M.gguf`)
works here unchanged. Settings > Local Models > pick your folder → Import,
or drop it directly at
`%APPDATA%/zai-desktop/zai-models/qwen2.5-coder-3b-instruct-q4_k_m.gguf`
to skip the import step during testing.

## Architecture map (for anyone extending this further)

- `electron/main.js` / `electron/preload.js` — Electron shell + IPC bridge
- `src/main-native/*` — the actual native implementations (terminal, llama,
  db, secureStore, browserAgent, modelImportTool, fsBridge) — these run in
  Electron's main process (real Node, real OS access)
- `renderer/src/native-clients/*` — thin IPC-calling stand-ins the ported
  app code imports instead of the old native modules; these are what make
  the rest of the port "just work" with minimal changes
- `renderer/src/{screens,components,store,services,db,...}` — your actual
  app, ported with native imports redirected to `native-clients/*`
