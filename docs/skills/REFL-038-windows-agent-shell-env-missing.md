---
id: REFL-038
title: Windows Agent Execution Paths Can Lose COMSPEC and Profile Env
severity: high
category: Development Environment
discovered: 2026-04-10
tags:
  [
    windows,
    node,
    npm,
    powershell,
    comspec,
    appdata,
    environment,
    playwright,
    debugging,
  ]
error_codes: []
last_updated: 2026-04-18
---

# REFL-038: Windows Agent Execution Paths Can Lose COMSPEC and Profile Env

## Current Classification

For the April 2026 issue class in this repo, the primary evidenced repo
remediation surface is the Windows `doctor` path under constrained spawning, not
generic Node incompatibility.

- Canonical verification command:
  `& .\scripts\windows-node-env.ps1 npm.cmd run doctor`
- Treat raw `npm.cmd run doctor` as informational unless it classifies failures
  cleanly.
- Keep runtime-contract cleanup separate from defect proof:
  - supported contract: Node `>=20.19.0`
  - preferred local baseline: `.nvmrc` -> `v20.19.5`
  - pinned toolchain line: `volta` -> Node `20.19.0`
  - newer lines such as Node 22 may be tolerated, but they are not the default
    troubleshooting baseline for this issue class

## Pattern

In this repository's Windows agent execution path, the shell environment can
arrive with critical variables unset:

- `COMSPEC`
- `USERPROFILE`
- `APPDATA`
- `LOCALAPPDATA`

When that happens, Node/npm/browser tooling does not fail in one clean way. The
observed failure modes split by execution path:

- Inside the sandboxed agent path, setting `COMSPEC=C:\Windows\System32\cmd.exe`
  was enough to restore `cmd /c echo ok` and `node.exe --version`.
- In the same sandboxed path, Node JavaScript execution (`node -e ...`,
  `node npm-cli.js`, npm wrapper commands) still crashed with
  `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`.
- On April 10, 2026, restoring the broader Windows base environment in-process
  was enough to recover real JS execution and `npm.cmd`:
  - `SystemRoot=C:\Windows`
  - `windir=C:\Windows`
  - `ProgramData=C:\ProgramData`
  - `ALLUSERSPROFILE=C:\ProgramData`
  - `USERPROFILE`
  - `APPDATA`
  - `LOCALAPPDATA`
  - `TEMP`
  - `TMP`
- Earlier unsandboxed probes showed launch failures for `cmd.exe`/`node.exe`,
  but the refined April 10, 2026 helper-driven path recovered direct JS
  execution plus `doctor`/Vitest outside the sandbox. The remaining outside-
  sandbox boundary appears to be command-output capture behavior, not the same
  raw launch failure shape.

## Why It Matters

This creates a false diagnostic trap:

1. Repo-level drift can be real (`vite` vs `npx vite`, missing `script-shell`,
   stale reset docs).
2. But those issues can be masked by an execution environment that is already
   missing the variables Windows tooling expects.
3. A fix validated in a normal terminal is still not enough if the same command
   class cannot run from the agent-compatible path.

The right debugging model is dual-path:

- prove commands in a normal Windows terminal
- prove the same class of commands in the agent-compatible path

Do not claim the environment is fixed until both pass.

## Minimal High-Signal Probes

Use these probes in order:

```powershell
Get-Command node
Get-Command npm
Get-Command cmd
echo $env:COMSPEC
node --version
node -e "console.log('ok')"
node -e "require('crypto').randomBytes(8); console.log('crypto-ok')"
cmd /c echo ok
```

If `COMSPEC` is empty in the agent path, try a single-command retry with:

```powershell
$env:COMSPEC='C:\Windows\System32\cmd.exe'
```

That can distinguish shell/process-launch failure from deeper Node runtime
failure.

If `node.exe --version` works but `node -e ...` still fails with the CSPRNG
assertion, test again after restoring the broader base environment:

```powershell
$env:COMSPEC='C:\Windows\System32\cmd.exe'
$env:SystemRoot='C:\Windows'
$env:windir='C:\Windows'
$env:ProgramData='C:\ProgramData'
$env:ALLUSERSPROFILE='C:\ProgramData'
$env:USERPROFILE=[Environment]::GetFolderPath('UserProfile')
$env:APPDATA=[Environment]::GetFolderPath('ApplicationData')
$env:LOCALAPPDATA=[Environment]::GetFolderPath('LocalApplicationData')
$env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp'
$env:TMP=Join-Path $env:LOCALAPPDATA 'Temp'
& 'C:\Program Files\nodejs\node.exe' -e "require('crypto').randomBytes(8); console.log('crypto-ok')"
& 'C:\Program Files\nodejs\npm.cmd' --version
```

This repo now includes a reusable helper. For this issue class, this is the
canonical Windows verification path:

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run doctor
```

## Repository Implications

The repo should still harden the parts it controls:

- Repo-level `.npmrc` should NOT pin `script-shell=C:\Windows\System32\cmd.exe`;
  Windows shell hardening should live in user-level npm config or a Windows-only
  bootstrap helper
- Windows-sensitive Vite scripts should prefer `npx vite`
- Reset guides must not reference npm scripts that do not exist

But those repo fixes are not substitutes for validating the underlying agent
runtime path.

## Apply This Pattern When

1. Windows npm wrappers fail in an agent session with shell-resolution errors
2. `Get-Command` resolves binaries, but process launch still fails
3. Playwright/browser validation cannot start despite prior successful local
   runs
4. You need to separate repo breakage from execution-environment breakage

## Do Not Assume

1. "Works in a normal terminal" means the agent path is healthy
2. `node --version` passing means JavaScript execution is healthy
3. npm wrapper failure automatically means package corruption

## Related Files

- `docs/WINDOWS_NODE_CORRUPTION_PREVENTION.md`
- `docs/dev-environment-reset.md`
- `.npmrc`
- `package.json`
