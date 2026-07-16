/**
 * ZAI Desktop - Terminal Tool (renderer-side client)
 *
 * Drop-in replacement for the Android build's
 * src/services/terminal/terminalTool.js. Same exported function names and
 * shapes (runCommand, isTermuxInstalled, getSetupCommand,
 * openTermuxForSetup) so src/services/toolOrchestrator.js can import this
 * file instead with only the import path changed - no call-site changes.
 *
 * "Termux" naming is kept for isTermuxInstalled/openTermuxForSetup only
 * as compatibility shims (both now trivially resolve true/no-op, since
 * Windows has a shell natively and there's no separate app to check for
 * or open) - toolOrchestrator.js's calls to them still work without
 * modification if it checks these before running commands.
 */

export async function runCommand(command, options = {}) {
  return window.zaiNative.terminal.runCommand(command, options);
}

export function getSetupCommand() {
  // No setup needed on Windows - CMD/PowerShell are always available.
  // Kept as a function (not removed) so any call site that still invokes
  // it for display purposes gets a sensible message instead of an error.
  return null;
}

export async function isTermuxInstalled() {
  // Always true in spirit: PowerShell/CMD are part of Windows itself.
  return true;
}

export async function openTermuxForSetup() {
  return { success: true, error: null };
}

export async function getShellInfo() {
  return window.zaiNative.terminal.getShellInfo();
}
