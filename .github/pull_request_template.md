## Description
<!-- Brief description of the changes in this PR -->

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Performance optimization
- [ ] Security fix
- [ ] Documentation update

## Performance Impact
<!-- If this PR touches async-heavy code paths, paste `npm run bench:load` output here -->
- [ ] **Benchmarks run**: <!-- benchmark-action will update this -->
- [ ] **Memory impact**: <!-- check for any significant memory changes -->
- [ ] **Bundle size checked**: <!-- for frontend changes -->

### Migration Progress (if applicable)
<!-- auto-filled by smart-fix.js -->
- Files in this batch: 
- Total files migrated: /
- Estimated completion: 

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Performance optimization
- [ ] Async iteration migration
- [ ] Documentation update

## Quality Checklist

### Testing
- [ ] Unit tests added/updated (`npm run test:unit`)
- [ ] Integration tests added/updated (if API change) (`npm run test:integration`)
- [ ] Tests pass locally
- [ ] Performance benchmarks show no regressions (>20% slower)

### Code Quality
- [ ] TypeScript checks pass (`npm run check`)
- [ ] ESLint passes (`npm run lint`)
- [ ] No console.log or debug statements left

### UI/UX (if applicable)
- [ ] Synthetics selectors updated (if UI change) - [Test ID conventions](client/src/lib/testIds.ts)
- [ ] Responsive design tested
- [ ] Accessibility checked (keyboard navigation, ARIA labels)

### Security
- [ ] Security headers unaffected or [updated tests](scripts/check-security-headers.mjs)
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

## Related Issues

Closes # (issue number)

## Additional Notes

Any additional information that reviewers should know about this PR.
