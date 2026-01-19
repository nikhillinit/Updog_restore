---
status: ACTIVE
last_updated: 2026-01-19
---

# CI Gating Test

This is a test documentation file to verify that the CI gating patch works correctly.

## Purpose

This file exists to demonstrate that documentation-only PRs will skip the Green Scoreboard workflow due to the `paths-ignore` configuration.

## Expected Behavior

When this file is committed and pushed as part of a PR that only contains documentation changes:
- The Green Scoreboard workflow should be skipped
- No TypeScript checks should run
- The PR can be merged without blocking on unrelated CI failures

## Test Date

Created: January 3, 2025

## Status

✅ Testing CI gating for docs-only PRs
