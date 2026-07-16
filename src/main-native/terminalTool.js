/**
 * ZAI Desktop - Terminal Tool (Windows)
 *
 * Direct replacement for src/services/terminal/terminalTool.js from the
 * Android build. That version had to smuggle commands into Termux via an
 * Android Service Intent because apps have no shell of their own on
 * Android. None of that indirection is needed here: Windows IS the host
 * OS, so this runs commands directly via child_process, straight through
 * cmd.exe or PowerShell - no bootstrap script, no polling for a file to
 * appear, no permission dance.
 *
 * CONTRACT: runCommand() returns the exact same shape the old module did -
 * { success, data: { stdout, stderr, exitCode }, error } - so
 * toolOrchestrator.js needs zero changes to its call site
 * (terminalTool.runCommand(args.command)) once the renderer-side wrapper
 * (see renderer's terminalToolClient.js) forwards to this over IPC.
 */

const { spawn } = require('child_process');
const os = require('os');

const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes, matches the Android default

/**
 * Runs one shell command via the given shell (cmd.exe or PowerShell),
 * waits for it to finish (or times out), and returns real
 * stdout/stderr/exit code. Mirrors terminalTool.js's runCommand() shape
 * exactly.
 *
 * @param {string} command - a real shell command, e.g. "npm install" or "dir"
 * @param {object} options - { timeoutMs, workingDirectory, shell: 'cmd'|'powershell' }
 */
async function runCommand(command, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    workingDirectory = null,
    shell = 'powershell',
  } = options;

  return new Promise((resolve) => {
    let shellCmd;
    let shellArgs;

    if (shell === 'cmd') {
      shellCmd = 'cmd.exe';
      shellArgs = ['/d', '/s', '/c', command];
    } else {
      // PowerShell is the default - closer to a modern shell (pipes,
      // objects, etc.) and what most of your workflow already assumes.
      shellCmd = 'powershell.exe';
      shellArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command];
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(shellCmd, shellArgs, {
      cwd: workingDirectory || os.homedir(),
      windowsHide: true,
      env: process.env,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        success: false,
        data: null,
        error: {
          message: `Command did not finish within ${Math.round(timeoutMs / 1000)}s and was terminated.`,
        },
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        data: null,
        error: { message: err?.message || 'Could not start the shell process.' },
      });
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const succeeded = exitCode === 0;
      resolve({
        success: succeeded,
        data: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode },
        error: succeeded ? null : { message: stderr.trim() || `Command exited with code ${exitCode}`, exitCode },
      });
    });
  });
}

function getShellInfo() {
  return {
    platform: os.platform(),
    availableShells: ['powershell', 'cmd'],
    defaultShell: 'powershell',
  };
}

function registerIpc(ipcMain) {
  ipcMain.handle('terminal:runCommand', (_e, command, options) => runCommand(command, options));
  ipcMain.handle('terminal:getShellInfo', () => getShellInfo());
}

module.exports = { runCommand, getShellInfo, registerIpc };
