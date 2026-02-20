# P4 Pipeline UI Polish -- Plan Review Findings

**Date:** 2026-02-16 **Reviewer:** Claude Code (planning-with-files session)

## Codebase State Summary

### Files Examined

- `client/src/components/pipeline/AddDealModal.tsx` (534 lines)
- `client/src/components/pipeline/ImportDealsModal.tsx` (529 lines)
- `client/src/components/pipeline/DealCard.tsx` (141 lines)
- `client/src/pages/pipeline.tsx` (435 lines)
- `server/routes/deal-pipeline.ts` (807 lines, 9 endpoints)
- `shared/schema.ts` (dealOpportunities, pipelineStages tables)
- `tests/api/deal-pipeline.test.ts` (459 lines, currently skipped in CI)
- `playwright.config.ts` (145 lines, 8 projects)
- E2E test directory: 42 spec files, page-object pattern established

### Key Findings

1. **No DnD library in deps** -- package.json has zero drag-and-drop packages.
   Plan must add one.
2. **ImportDealsModal fires N sequential POSTs** -- lines 177-211 loop over
   valid rows with individual fetch() calls. This is the exact anti-pattern the
   plan targets.
3. **Backend has no sorting params** -- GET /opportunities only supports cursor,
   limit, status, priority, fundId, search. No sortBy/sortDir.
4. **Backend has no bulk endpoints** -- no import/preview, no bulk status, no
   bulk archive.
5. **Backend has existing stage API** -- POST /deals/:id/stage already handles
   status transitions with activity logging. DnD can use this directly.
6. **Schema has no version column** -- deal_opportunities table lacks optimistic
   locking (no `version` field), yet test file references `version`. Tests are
   skipped and stale.
7. **Feature flag system exists** -- YAML registry with `useFeatureFlag` hook,
   good for DnD/bulk rollout.
8. **Playwright config uses project-based testMatch** -- new pipeline E2E must
   be added to an existing or new project in the projects array.
9. **Page objects pattern established** -- tests/e2e/page-objects/ has 7 page
   objects; pipeline should follow this pattern.
10. **Client uses `apiRequest` helper** -- ImportDealsModal bypasses it (raw
    fetch), should migrate.
