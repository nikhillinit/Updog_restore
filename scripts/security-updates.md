# Security Update Notes

Last updated: 2026-05-08

## Current Status

`npm audit --package-lock-only --audit-level=low` reports zero vulnerabilities.

The May 2026 Dependabot cleanup resolved the active notices by updating the
lockfile and direct dependency declarations, then removing the unused Lighthouse
CI CLI chain.

## Resolved Advisories

- `@anthropic-ai/sdk` updated to `^0.91.1`.
- `axios` override updated to `1.16.0` for transitive callers such as
  `@slack/webhook`, `wait-on`, and `start-server-and-test`.
- `bullmq` updated to `5.76.6` and `uuid` to `^11.1.1`.
- `express-rate-limit` updated to `^8.5.1`, pulling patched `ip-address`.
- `start-server-and-test` updated to `^2.1.5` and `wait-on` to `^9.0.5`.
- Transitive `basic-ftp` resolved to `5.3.1`.
- Transitive `protobufjs` resolved to patched `7.5.6` and `8.0.3` lines.

## Lighthouse CI

`@lhci/cli` was removed because it was unused by active npm scripts and kept a
stale vulnerable dependency chain in the project. Do not reintroduce it only to
recover the deleted `scripts/lighthouse-ci.js` runner. If Lighthouse automation
is needed again, add a maintained workflow with a fresh dependency review and a
package-lock audit in the same change.

## Verification

Use this baseline after dependency security updates:

```bash
npm audit --package-lock-only --audit-level=low
npm run check
npm run lint
```

For changes that alter runtime dependencies, also run the smallest relevant
targeted test first, then broaden to `npm test` when the affected surface is
shared.
