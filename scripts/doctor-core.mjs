import console from 'node:console';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

const red = '\x1b[31m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

export const CANONICAL_WINDOWS_DOCTOR_COMMAND =
  '& .\\scripts\\windows-node-env.ps1 npm.cmd run doctor';

function formatBlock(title, bodyLines) {
  return [
    '',
    `${red}---------------------------------------------${reset}`,
    `${red}${title}${reset}`,
    '',
    ...bodyLines,
    `${red}---------------------------------------------${reset}`,
    '',
  ];
}

export function analyzeDoctorShellEnvironment({
  platform,
  env,
  cwd = process.cwd(),
}) {
  if (platform !== 'win32') {
    return {
      ok: true,
      exitCode: 0,
      stdoutLines: [
        `${green}[doctor:shell] PASS: non-Windows platform - shell validation skipped${reset}`,
      ],
      stderrLines: [],
    };
  }

  const stdoutLines = [
    '[doctor:shell] Validating shell environment for Windows npm workflows...',
  ];
  const stderrLines = [];
  const shell = env.SHELL || '';
  const comspec = env.COMSPEC || '';
  const isWSL = shell.includes('/bin/bash') && env.WSL_DISTRO_NAME;
  const isGitBash =
    shell.toLowerCase().includes('bash') || shell.includes('/bin/sh');

  if (isWSL) {
    stderrLines.push(
      `${red}[doctor:shell] FAIL: shell mismatch${reset}`,
      ...formatBlock('PROBLEM: Running in WSL', [
        'WSL is not the supported shell environment for these Windows npm workflows.',
        '',
        `${yellow}FIX THIS NOW:${reset}`,
        '',
        '  1. Exit WSL',
        '  2. Open PowerShell or CMD in Windows',
        `  3. Navigate to: ${cwd}`,
        `  4. Run: ${green}${CANONICAL_WINDOWS_DOCTOR_COMMAND}${reset}`,
      ])
    );

    return { ok: false, exitCode: 2, stdoutLines, stderrLines };
  }

  if (isGitBash) {
    stderrLines.push(
      `${red}[doctor:shell] FAIL: shell mismatch${reset}`,
      ...formatBlock('PROBLEM: Running in Git Bash', [
        'Git Bash can break Windows npm shim resolution and local script execution.',
        '',
        `${yellow}FIX THIS NOW (run in PowerShell or CMD):${reset}`,
        '',
        '  1. Close Git Bash',
        '  2. Open PowerShell or CMD',
        `  3. Run: ${green}${CANONICAL_WINDOWS_DOCTOR_COMMAND}${reset}`,
        `  4. If the canonical path passes, keep raw ${green}npm run doctor${reset} as non-canonical in this shell.`,
      ])
    );

    return { ok: false, exitCode: 2, stdoutLines, stderrLines };
  }

  const requiredEnvVars = [
    'COMSPEC',
    'SystemRoot',
    'windir',
    'ProgramData',
    'ALLUSERSPROFILE',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
  ];
  const missingEnvVars = requiredEnvVars.filter(
    name => !String(env[name] || '').trim()
  );

  if (missingEnvVars.length > 0) {
    stderrLines.push(
      `${red}[doctor:shell] FAIL: missing Windows environment prerequisites${reset}`,
      ...formatBlock('PROBLEM: Required Windows env vars are missing', [
        `Missing: ${missingEnvVars.join(', ')}`,
        '',
        'This usually means the current execution path is stripped or constrained.',
        'Treat raw `npm run doctor` as informational in this shell until the canonical path passes.',
        '',
        `${yellow}CANONICAL VERIFICATION PATH:${reset}`,
        `  ${green}${CANONICAL_WINDOWS_DOCTOR_COMMAND}${reset}`,
      ])
    );

    return { ok: false, exitCode: 2, stdoutLines, stderrLines };
  }

  stdoutLines.push(
    `${green}[doctor:shell] PASS: shell environment is correct for Windows npm workflows${reset}`,
    `[doctor:shell]    Detected: ${comspec || 'PowerShell'}`
  );

  return { ok: true, exitCode: 0, stdoutLines, stderrLines };
}

export function analyzeDoctorQuick({
  resolveModule = moduleName => require.resolve(moduleName),
} = {}) {
  const modules = ['vite', '@vitejs/plugin-react', 'autoprefixer'];
  const missing = [];

  for (const moduleName of modules) {
    try {
      resolveModule(moduleName);
    } catch {
      missing.push(moduleName);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      exitCode: 1,
      stdoutLines: [],
      stderrLines: [
        `[doctor:quick] FAIL: missing core modules: ${missing.join(', ')}`,
      ],
    };
  }

  return {
    ok: true,
    exitCode: 0,
    stdoutLines: ['doctor:quick PASS: core modules OK'],
    stderrLines: [],
  };
}

export function emitDoctorResult(result) {
  for (const line of result.stdoutLines) {
    console.log(line);
  }

  for (const line of result.stderrLines) {
    console.error(line);
  }
}
