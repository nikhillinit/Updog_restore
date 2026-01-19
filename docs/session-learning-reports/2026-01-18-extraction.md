---
status: HISTORICAL
last_updated: 2026-01-19
---

# Session Learnings Report

**Generated:** 2026-01-18
**Sources Analyzed:** 8 findings files
**Existing Reflections:** 1 (REFL-001)

---

## Learning Candidates

### Candidate 1: Post-Merge Jobs Not Validated by PR CI
- **Score:** 6/10 (repeated pattern +3, production impact +2, DX friction +1)
- **Source:** `docs/plans/2026-01-15-ci-routing-bundle-fix/findings.md:127`
- **Category:** Infrastructure
- **Anti-Pattern:** Assuming PR CI validates all workflows; jobs with `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` only run post-merge
- **Fix:** Manually review workflow conditions, add schema validation for post-merge jobs
- **Recommendation:** CREATE REFLECTION

### Candidate 2: Cross-Platform File Enumeration Fragility
- **Score:** 5/10 (repeated pattern +3, DX friction +1, performance +1)
- **Source:** `docs/plans/2026-01-15-ci-routing-bundle-fix/findings.md:131`
- **Category:** Infrastructure
- **Anti-Pattern:** Using filesystem walking for deterministic comparisons; Windows/Linux see different file sets
- **Fix:** Use `git ls-files` instead of filesystem walking for deterministic enumeration
- **Recommendation:** CREATE REFLECTION

### Candidate 3: Schema Format Backward Compatibility
- **Score:** 5/10 (production impact +2, repeated pattern +3)
- **Source:** `docs/plans/2026-01-15-ci-routing-bundle-fix/findings.md:57-99`
- **Category:** API
- **Anti-Pattern:** Changing output format (array vs object) without checking all consumers
- **Fix:** Maintain backward-compatible schema while adding new fields
- **Recommendation:** CREATE REFLECTION

### Candidate 4: Non-Existent Chunk References in Size-Limit
- **Score:** 3/10 (DX friction +1, repeated pattern +2)
- **Source:** `docs/plans/2026-01-15-ci-routing-bundle-fix/findings.md:35-55`
- **Category:** Infrastructure
- **Anti-Pattern:** Referencing build artifacts that don't exist in current build output
- **Fix:** Validate chunk names against actual build output before adding to config
- **Recommendation:** CREATE REFLECTION (borderline)

### Candidate 5: Integration Test Server Auto-Startup
- **Score:** 3/10 (DX friction +1, infrastructure +2)
- **Source:** `docs/plans/integration-test-phase0-validation/findings.md:8-32`
- **Category:** Testing
- **Anti-Pattern:** Manually starting server before integration tests when setup.ts does it automatically
- **Fix:** Trust the test infrastructure; check setup.ts for auto-startup logic
- **Recommendation:** SKIP (documentation, not anti-pattern)

### Candidate 6: Stale/Orphaned Test Files
- **Score:** 4/10 (repeated pattern +3, DX friction +1)
- **Source:** `.taskmaster/docs/issue-153/findings.md:76-90`
- **Category:** Testing
- **Anti-Pattern:** Test files using different API than implementation, wrong extension, excluded from config
- **Fix:** Maintain test-implementation API parity, use consistent `.test.ts` extension
- **Recommendation:** CREATE REFLECTION

### Candidate 7: Rollback Testing Without Down Files
- **Score:** 4/10 (production impact +2, security +2)
- **Source:** `.taskmaster/plans/issue-360/findings.md:132-139`
- **Category:** Database
- **Anti-Pattern:** Testing rollback mechanisms when no explicit down.sql files exist
- **Fix:** Either create explicit down files OR document rollback as "recreate from scratch"
- **Recommendation:** SKIP (architectural decision, not anti-pattern)

### Candidate 8: Unit-Integration Test Overlap
- **Score:** 3/10 (DX friction +1, performance +2)
- **Source:** `.taskmaster/plans/issue-360/findings.md:141-154`
- **Category:** Testing
- **Anti-Pattern:** Duplicating unit test coverage in integration tests
- **Fix:** Integration tests should only add persistence verification, not repeat logic tests
- **Recommendation:** SKIP (documented in test-pyramid skill)

### Candidate 9: XIRR Solver Divergence on Extreme Returns
- **Score:** 5/10 (financial calculation +3, repeated pattern +2)
- **Source:** `.taskmaster/docs/findings.md:34-37`
- **Category:** Math
- **Anti-Pattern:** Newton-Raphson without fallback diverges on extreme IRR values (>100%/year)
- **Fix:** Implement Brent's method fallback, improve initial guess heuristics
- **Recommendation:** CREATE REFLECTION

### Candidate 10: Monte Carlo Stochastic Test Flakiness
- **Score:** 4/10 (repeated pattern +3, DX friction +1)
- **Source:** `.taskmaster/docs/findings.md:18-22`
- **Category:** Testing
- **Anti-Pattern:** Statistical tests without seeded PRNG produce flaky results
- **Fix:** Use deterministic seeded PRNG for reproducibility
- **Recommendation:** UPDATE EXISTING (covered by statistical-testing skill)

---

## Summary

| Candidate | Score | Action |
|-----------|-------|--------|
| 1. Post-Merge Jobs Not Validated | 6 | CREATE REFLECTION |
| 2. Cross-Platform File Enumeration | 5 | CREATE REFLECTION |
| 3. Schema Format Backward Compatibility | 5 | CREATE REFLECTION |
| 4. Non-Existent Chunk References | 3 | CREATE REFLECTION |
| 5. Server Auto-Startup | 3 | SKIP |
| 6. Stale/Orphaned Test Files | 4 | CREATE REFLECTION |
| 7. Rollback Testing | 4 | SKIP |
| 8. Unit-Integration Overlap | 3 | SKIP |
| 9. XIRR Solver Divergence | 5 | CREATE REFLECTION |
| 10. Monte Carlo Flakiness | 4 | SKIP (skill exists) |

---

## Actions

1. [x] REFL-001 created for "Dynamic Imports Prevent Test Side Effects" - VERIFIED
2. [x] REFL-002 created for "Post-Merge Jobs Not Validated by PR CI" - VERIFIED
3. [x] REFL-003 created for "Cross-Platform File Enumeration Fragility" - VERIFIED
4. [x] REFL-004 created for "Schema Format Backward Compatibility" - DRAFT
5. [x] REFL-005 created for "Stale Test Files with API Mismatch" - DRAFT
6. [x] REFL-006 created for "XIRR Newton-Raphson Divergence on Extreme Returns" - VERIFIED

---

## Next Steps

Run for each candidate:
```bash
python scripts/manage_skills.py new --title "Title"
```

Then populate the reflection with content from the source findings file.
