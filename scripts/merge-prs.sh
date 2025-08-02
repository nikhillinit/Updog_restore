#!/bin/bash
set -euo pipefail

# Config
PR_LIST=(19 25 21 26 22)
DOCS_PRS=(17 18)
STATUS_FILE="STATUS.md"

# Color codes for better visibility
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Simple logging
log() {
    echo -e "[$(date '+%H:%M:%S')] $1" | tee -a "$STATUS_FILE"
}

# Test PR in worktree
test_pr() {
    local pr=$1
    log "${YELLOW}Testing PR #$pr...${NC}"
    
    git worktree add -q "../test-$pr" HEAD 2>/dev/null || true
    cd "../test-$pr"
    
    if gh pr checkout "$pr" && npm ci && npm test; then
        local result=0
    else
        local result=1
    fi
    
    cd - >/dev/null
    git worktree remove "../test-$pr" 2>/dev/null || true
    
    return $result
}

# Main execution
main() {
    log "${GREEN}🚀 Starting PR merge sequence${NC}"
    
    # Quick docs merge
    log "${YELLOW}Merging documentation PRs...${NC}"
    git checkout -b docs-bundle
    for pr in "${DOCS_PRS[@]}"; do
        gh pr checkout "$pr" && git add . && git commit -m "Add PR #$pr" || true
    done
    git checkout main
    git merge --squash docs-bundle
    git commit -m "docs: Sprint G2C documentation (PRs #17, #18)"
    git branch -D docs-bundle
    
    # Test & merge remaining PRs
    for pr in "${PR_LIST[@]}"; do
        if test_pr "$pr"; then
            log "${GREEN}✅ PR #$pr passed tests${NC}"
            gh pr merge "$pr" --merge --auto || log "${RED}❌ PR #$pr merge failed${NC}"
        else
            log "${RED}❌ PR #$pr failed tests${NC}"
        fi
        
        # Quick smoke test after each merge
        npm run lint && npm run test:quick || {
            log "${RED}⚠️  Smoke test failed after PR #$pr${NC}"
            git revert HEAD --no-edit
        }
    done
    
    log "${GREEN}✅ Merge sequence complete${NC}"
}

# Handle arguments
case "${1:-}" in
    "docs")
        # Just merge docs
        log "${YELLOW}Merging only documentation PRs...${NC}"
        git checkout -b docs-bundle
        for pr in "${DOCS_PRS[@]}"; do
            gh pr checkout "$pr" && git add . && git commit -m "Add PR #$pr" || true
        done
        git checkout main
        git merge --squash docs-bundle
        git commit -m "docs: Sprint G2C documentation (PRs #17, #18)"
        git branch -D docs-bundle
        log "${GREEN}✅ Documentation merge complete${NC}"
        ;;
    *)
        main "$@"
        ;;
esac
