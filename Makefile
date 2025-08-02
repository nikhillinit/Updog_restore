.PHONY: perf smoke merge-all watch merge-docs

# Show CI performance for last 5 runs
perf:
	@echo "📊 CI Performance (last 5 runs):"
	@gh run list --limit 5 --json name,conclusion,createdAt,updatedAt | \
		jq -r '.[] | "\(.name): \(((.updatedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) / 60 | floor) min (\(.conclusion))"'

# Run smoke test
smoke:
	npm run lint && npm run test:quick && node scripts/smoke.js

# Merge all PRs
merge-all:
	./scripts/merge-prs.sh

# Merge only documentation PRs
merge-docs:
	./scripts/merge-prs.sh docs

# Watch CI runs
watch:
	gh run watch --exit-status

# Quick PR status check
pr-status:
	@echo "📋 Outstanding PRs:"
	@gh pr list --json number,title,state,mergeable -t "{{range .}}#{{.number}}: {{.title}} ({{.state}}, Mergeable: {{.mergeable}}){{\"\\n\"}}{{end}}"

# Initialize STATUS.md for tracking
init-status:
	@echo "# PR Merge Status - $$(date)" > STATUS.md
	@echo "Starting PR merge tracking..." >> STATUS.md

# Test integration branch locally
test-integration:
	@echo "🧪 Testing integration of all PRs..."
	@git checkout -b test-integration
	@for pr in 19 25 21 26; do \
		echo "Testing PR #$$pr..."; \
		gh pr checkout $$pr || exit 1; \
		git merge --no-ff --no-commit || echo "⚠️  Conflict in PR $$pr"; \
	done
	@npm test
