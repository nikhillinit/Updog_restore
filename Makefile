.DEFAULT_GOAL := help

BASE_URL ?= http://localhost:3001

.PHONY: help parity perf-smoke badges

help: ## Show common developer targets
	@echo ""
	@echo "Common targets:"
	@echo "  make parity       - run Excel parity tests (Vitest) locally"
	@echo "  make perf-smoke   - run k6 smoke test locally (BASE_URL=$(BASE_URL))"
	@echo "  make badges       - inject CI status badges into README.md (idempotent)"
	@echo ""

parity: ## Run parity suite (requires tests/parity/* and test:parity script)
	@npm run -s test:parity

perf-smoke: ## Run k6 smoke locally (override BASE_URL=http://host:port if needed)
	@BASE_URL=$(BASE_URL) k6 run tests/perf/smoke.js

badges: ## Inject calc-parity & perf-smoke badges into README.md
	@node scripts/dev/inject-badges.js

# Convenience: allow 'make help' to be listed by 'make'
.PHONY: help
