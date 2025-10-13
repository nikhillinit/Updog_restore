# Week 1 Scope: Client + Shared TypeScript Remediation

## In Scope ✅
- **client/** directory (strict mode, types-only fixes)
- **shared/** directory (strict mode, types-only fixes)
- **Target:** 0 TypeScript errors in client + shared
- **Constraints:** No runtime changes, no config changes

## Out of Scope ⏸️ (Week 2)
- **server/** directory (bypasses remain: `strict:false`, `strictNullChecks:false`)
- **vite.config.ts** (`tsconfigRaw` bypass remains)
- **Full codebase unified strictness**

## Rationale
Phase 0 verification confirmed:
- Client: **88** errors (strict mode active)
- Server: **1** errors (bypasses hiding most)
- Shared: **00** errors (strict mode active)
- **Scenario A*** confirmed: Server <=10 and Total <=220

## Quality Baselines
- Test failures: **0
0** (timeout 60s)
  - **Gate:** MUST NOT INCREASE during Track 1A
- Bundle size: **1915KB** (JS+CSS only, 114 assets)
  - **Gate:** MUST NOT increase by >5% (50KB threshold)

## Week 2 Deliverables
1. Remove server strictness bypasses
2. Remove `tsconfigRaw` from vite.config.ts
3. Fix server-side TypeScript errors
4. Achieve full codebase unified strictness
5. Update strictness guard CI to use `--scope=full`

## Phase 0 Artifacts
- Run ID: **20251013-153429**
- Full report: `artifacts/phase0/20251013-153429/phase0-summary.txt`
- Priority fixes: `artifacts/phase0/20251013-153429/priority-fixes.txt`

---
📋 Generated: Mon, Oct 13, 2025  3:37:17 PM
