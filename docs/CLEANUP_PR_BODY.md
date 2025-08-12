# chore(cleanup): finalize FundStore rollout & retire legacy paths

## Summary
Removes legacy InvestmentStrategy state paths now that FundStore is fully rolled out (100%).
Locks rollout flag to 100%, retires migration telemetry and emergency toggles (keeps nuclear override).

## What's included
- 🔥 Remove legacy context/providers and unused selectors
- 🧹 Delete deprecated tests/fixtures for legacy state
- 🛡 Keep feature flag plumbing (default 100%) for one week as safeguard
- 📉 Turn off migration telemetry (VITE_TRACK_MIGRATIONS=0), keep health pings
- 📚 Update docs/DEPLOYMENT_RUNBOOK.md with final thresholds and outcomes
- 🧪 Tighten E2E to assert FundStore path exclusively

## Config changes
- `VITE_USE_FUND_STORE_ROLLOUT=100`
- `VITE_TRACK_MIGRATIONS=0`
- (Optional) Keep `VITE_ERROR_SCORE_THRESHOLD` for general monitoring

## Acceptance criteria
- [ ] CI: smoke + full + typecheck + build ✅
- [ ] No imports of legacy context/* or legacy reducers
- [ ] Wizard Step 3: remains derived, last stage grad=0 enforced, Next gated
- [ ] Telemetry dashboard shows 24h clean post-cleanup
- [ ] No user reports; overrides (ff_useFundStore=0) < 5

## Risk & rollback
**Risk: LOW**
- No data migrations; UI paths consolidated
- Rollback plan: revert this PR; set `VITE_USE_FUND_STORE_ROLLOUT` back to 10%

## Links
- Rollout PR: #48
- Monitoring notes: (paste runbook section/permalink)
- Baseline CI run: (paste)
