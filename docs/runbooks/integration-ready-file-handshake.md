---
status: ACTIVE
last_updated: 2026-03-27
owner: Core Team
review_cadence: P30D
categories: [testing, runbook, stabilization]
keywords: [validate:core, integration, ready-file, TEST_READY_FILE]
---

# Integration Ready-File Handshake

## Purpose

This runbook documents the machine-readable startup handshake used by the Phase
4 integration harness. Use it when `npm run test:phase4:integration` or
`npm run validate:core` fails before the server becomes healthy.

## Contract

- `server/bootstrap.ts` writes a JSON file when `TEST_READY_FILE` is set.
- `tests/integration/global-setup.ts` sets `TEST_READY_FILE` to
  `os.tmpdir()/vitest-int-server.json` before starting `npm run dev:api`.
- The file shape is:

```json
{ "port": 40123, "baseUrl": "http://localhost:40123", "pid": 12345 }
```

- `global-setup.ts` waits for that file, then verifies `${baseUrl}/healthz`
  before letting the integration worker continue.

## Canonical Command

```bash
npm run validate:core
```

That command must stay green before milestone work proceeds.

## Failure Modes

1. **No ready file appears within 30 seconds** The integration harness fails
   with `No server info file detected...`. This usually means the API process
   exited before `bootstrap()` reached the listen callback.

2. **Ready file exists but `/healthz` never becomes healthy** The server bound a
   port but did not finish booting. Check provider setup, env loading, and route
   initialization.

3. **Stale temp file** `global-setup.ts` removes the temp file before spawn. If
   you are debugging manually and reusing the same temp path, remove the old
   file before retrying.

## Operator Steps

1. Run `npm run test:phase4:integration` for the focused reproduction.
2. Inspect the temp file path from `tests/integration/global-setup.ts`
   (`PORT_FILE`).
3. If the file is missing, inspect the integration harness stderr tail in the
   test failure output.
4. If the file exists, request `${baseUrl}/healthz` manually and inspect the API
   boot logs.
5. If startup behavior changes, keep the handshake machine-readable. Do not
   reintroduce log parsing.

## CI Gate

- GitHub workflow: `.github/workflows/core-validation.yml`
- Job name: `validate-core`
- Local equivalent: `npm run validate:core`
