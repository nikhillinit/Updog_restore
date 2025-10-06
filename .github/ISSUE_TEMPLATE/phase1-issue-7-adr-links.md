---
name: 'Phase 1 Issue #7: Link ADRs in README + CI Check'
about: Add ADR links to README and CI verification
labels: documentation, ai-agents, phase-1
milestone: Agent Foundation Phase 1
---

## Summary

Link ADRs in root README and add CI check to verify the link exists.

**Estimate:** 1 point **Status:** ADRs are complete (commit 8e8b1ff), need
README link + CI check

## Acceptance Criteria

- [ ] Add ADR link to root `README.md`:

  ```markdown
  ## Architecture Decisions

  See [docs/adr/](docs/adr/) for architectural decision records covering:

  - Evaluator metrics (IRR/TVPI/MOIC)
  - Token budgeting strategy
  - SSE streaming architecture
  ```

- [ ] Add CI check that root README includes ADR link (fail if missing)

## Tasks

- [ ] Add ADR section to root `README.md`
- [ ] Create CI job in `.github/workflows/ci.yml`:
  ```yaml
  - name: Verify ADR Link in README
    run: |
      if ! grep -q "docs/adr/" README.md; then
        echo "❌ README.md missing ADR link"
        exit 1
      fi
      echo "✅ ADR link present"
  ```

## Deliverables

All ADRs are complete and published:

- ✅ `docs/adr/README.md`
- ✅ `docs/adr/0001-evaluator-metrics.md`
- ✅ `docs/adr/0002-token-budgeting.md`
- ✅ `docs/adr/0003-streaming-architecture.md`
