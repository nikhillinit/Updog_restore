#!/usr/bin/env bash
set -euo pipefail

commit_if_any() { 
  git diff --cached --quiet || git commit -m "$1"
}

git add client/src/core/reserves/computeReservesFromGraduation.ts 2>/dev/null || true
commit_if_any "feat(reserves): add graduation-driven reserves engine"

git add client/src/pages/allocation-manager.tsx 2>/dev/null || true
commit_if_any "refactor(allocation): integrate graduation-derived reserves"

git add client/src/pages/reserves-demo.tsx client/src/components/reserves/** 2>/dev/null || true
commit_if_any "feat(demo): add /reserves-demo with scenarios"

git add client/src/core/reserves/__tests__/** tests/e2e/** 2>/dev/null || true
commit_if_any "test: add unit and e2e coverage"
