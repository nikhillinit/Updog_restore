## TypeScript Remediation — Quick Smoke

- [ ] Type-check passes (`npm run check:client` + `npm run check:shared`)
- [ ] Build succeeds (`npm run build`)
- [ ] Dev server starts without new errors (`npm run dev`)
- [ ] **Core test failures ≤ Phase 0 baseline** (see
      `artifacts/phase0/latest/test-failures-baseline.txt`)

**Scope:** types-only (no runtime/config changes)

**Artifacts:** `artifacts/phase0/latest/`

**Phase 0 Summary** (paste link to file in your branch):

```
artifacts/phase0/latest/phase0-summary.txt
```

**Notes:**

<!-- Add any relevant context, known issues, or testing notes -->

---

## Standard PR Template (use for non-TypeScript PRs)

## Description

<!-- Brief description of the changes in this PR -->

## Slice Summary

### Owned Files

<!-- List the files or modules this PR owns -->

### Explicit Non-Goals

<!-- List what this PR intentionally does not change -->

### Schema Or Contract Impact

<!-- State "none" or describe API/schema/contract impact -->

### Rollback Path

<!-- Describe how to revert or disable this slice safely -->

### Commands Actually Run

<!-- List the exact local validation commands you ran -->

### Docs Or Guardrail Impact

<!-- State "none" or describe which docs/guardrail artifacts changed and why -->

### Archived Active Docs

<!-- State "none" or list any active doc moved to docs/archive and its new path -->

## Required Slice Checklist

- [ ] Owned files are listed explicitly
- [ ] Explicit non-goals are listed
- [ ] Schema or contract impact is called out
- [ ] Rollback path is documented
- [ ] Commands actually run are listed
- [ ] Docs or guardrail artifacts changed, with reason
- [ ] Any active doc archived is named, with destination path

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to
      not work as expected)
- [ ] Performance optimization
- [ ] Security fix
- [ ] Documentation update

## Performance Impact

<!-- If this PR touches async-heavy code paths, note any performance impact -->

- [ ] **Benchmarks run**: <!-- benchmark-action will update this -->
- [ ] **Memory impact**: <!-- check for any significant memory changes -->
- [ ] **Bundle size checked**: <!-- for frontend changes -->

### Migration Progress (if applicable)

<!-- auto-filled by smart-fix.js -->

- Files in this batch:
- Total files migrated: /
- Estimated completion:

## Quality Checklist

### Testing

- [ ] Unit tests added/updated (`npm run test:unit`)
- [ ] Integration tests added/updated (if API change)
      (`npm run test:integration`)
- [ ] Tests pass locally
- [ ] Performance benchmarks show no regressions (>20% slower)

### Code Quality

- [ ] TypeScript checks pass (`npm run check`)
- [ ] ESLint passes (`npm run lint`)
- [ ] No console.log or debug statements left

### UI/UX (if applicable)

- [ ] Synthetics selectors updated (if UI change) -
      [Test ID conventions](../client/src/lib/testIds.ts)
- [ ] Responsive design tested
- [ ] Accessibility checked (keyboard navigation, ARIA labels)

### Security

- [ ] Security headers unaffected or
      [updated tests](../scripts/check-security-headers.mjs)
- [ ] No secrets or credentials in code
- [ ] Input validation implemented

### Reserves v1.1 Specific (if applicable)

- [ ] Conservation invariant maintained (allocated + remaining = available)
- [ ] Exit MOIC ranking verified
- [ ] Cap policies tested
- [ ] Quarter-based calculations accurate
- [ ] Bundle size optimized (dynamic imports for export libs)

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged and published in downstream modules
- [ ] Required slice checklist above is complete

## Related Issues

Closes # (issue number)

## Additional Notes

Any additional information that reviewers should know about this PR.
