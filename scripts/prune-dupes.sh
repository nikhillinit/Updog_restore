#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-feature/graduation-reserves}"
NEW_BRANCH="${2:-chore/remove-dupes-and-artifacts}"
DRY_RUN="${DRY_RUN:-0}"  # set to 1 for dry-run or pass third arg 'dry-run'
if [[ "${3:-}" == "dry-run" ]]; then DRY_RUN=1; fi

require() { command -v "$1" >/dev/null 2>&1 || { echo "Required command '$1' not found." >&2; exit 1; }; }
require git; require node; require npm; require gh

echo "➡️  Base branch: $BASE_BRANCH"
echo "➡️  New branch : $NEW_BRANCH"
echo "🧪 Dry run     : $DRY_RUN"

git fetch origin
git checkout "$BASE_BRANCH"
git pull --ff-only

backupTag="backup/before-cleanup-$(date +%Y%m%d-%H%M%S)"
echo "📸 Creating backup tag: $backupTag"
if [[ "$DRY_RUN" -eq 0 ]]; then git tag "$backupTag"; else echo "[DRY RUN] Would tag $backupTag"; fi

if [[ "$DRY_RUN" -eq 0 ]]; then git switch -c "$NEW_BRANCH"; else echo "[DRY RUN] Would create/switch to $NEW_BRANCH"; fi

# 1) Untrack artifacts + ignore going forward
ARTIFACT_DIRS=( "playwright-report" "test-results" )
for d in "${ARTIFACT_DIRS[@]}"; do
  [[ -e "$d" ]] || continue
  if [[ "$DRY_RUN" -eq 0 ]]; then git rm -r --cached --ignore-unmatch "$d" || true
  else echo "[DRY RUN] Would untrack $d"; fi
done

GITIGNORE=".gitignore"
touch "$GITIGNORE"
append_unique() {
  local line="$1"
  grep -Fqx "$line" "$GITIGNORE" || printf "%s\n" "$line" >> "$GITIGNORE"
}
append_unique ""
append_unique "# Test artifacts"
append_unique "playwright-report/"
append_unique "test-results/"
append_unique "*.tmp"
append_unique "*.log"

# 2) Remove duplicate/unused configs & strays
MAYBE_FILES=( "playwright.config.simple.ts" "preflight.sh" "simple-preview.ps1" "tsconfig.fast.json" "tatus" )
for f in "${MAYBE_FILES[@]}"; do
  [[ -e "$f" ]] || continue
  if [[ "$DRY_RUN" -eq 0 ]]; then git rm --cached --ignore-unmatch "$f" || true; rm -rf "$f"
  else echo "[DRY RUN] Would delete $f"; fi
done

# 3) package.json scripts rewrite
if [[ -f package.json ]]; then
node <<'NODE'
const fs = require('fs');
const path = 'package.json';
if (!fs.existsSync(path)) process.exit(0);
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts['test:e2e'] = 'playwright test -c playwright.config.ts';
pkg.scripts['typecheck'] = 'tsc -p tsconfig.json';
for (const k of Object.keys(pkg.scripts)) {
  if (typeof pkg.scripts[k] === 'string') {
    pkg.scripts[k] = pkg.scripts[k].replace(/playwright\.config\.simple\.ts/g, 'playwright.config.ts');
  }
}
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
NODE
  [[ "$DRY_RUN" -eq 1 ]] && echo "[DRY RUN] (package.json changes staged later)"
fi

# 4) CI workflow rewrites
WF_DIR=".github/workflows"
if [[ -d "$WF_DIR" ]]; then
  while IFS= read -r -d '' y; do
    tmp="$(mktemp)"
    sed -e 's/playwright\.config\.simple\.ts/playwright.config.ts/g' \
        -e 's/tsconfig\.fast\.json/tsconfig.json/g' \
        "$y" > "$tmp"
    if ! cmp -s "$tmp" "$y"; then
      if [[ "$DRY_RUN" -eq 0 ]]; then mv "$tmp" "$y"; else echo "[DRY RUN] Would update $y"; rm -f "$tmp"; fi
    else
      rm -f "$tmp"
    fi
  done < <(find "$WF_DIR" -type f -name "*.yml" -print0)
fi

# 5) Commit
if [[ "$DRY_RUN" -eq 0 ]]; then
  git add -A
  git commit -m "chore(repo): remove duplicate configs & committed artifacts; pin scripts to canonical configs"
else
  echo "[DRY RUN] Would commit changes"
fi

# 6) Validation suite (informational)
echo -e "\n📋 Running validation suite..."
if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "  Installing dependencies..."
  npm ci --prefer-offline --no-audit || echo "  ⚠️ npm ci failed (non-blocking here)"

  if [[ -f tsconfig.json ]]; then
    echo "  Type checking..."
    npm run -s typecheck || echo "  ⚠️ TS errors (non-blocking)"
  fi

  if [[ -f playwright.config.ts ]]; then
    echo "  Validating Playwright config..."
    npx playwright test -c playwright.config.ts --list || echo "  ⚠️ Playwright issues (non-blocking)"
  fi

  if grep -q '"lint"' package.json 2>/dev/null; then
    echo "  Running linter..."
    npm run -s lint --max-warnings=0 || echo "  ⚠️ Lint warnings/errors"
  fi
else
  echo "[DRY RUN] Would run npm ci / typecheck / playwright --list / lint"
fi

# 7) Push & PR (or simulate)
PR_TITLE="chore(repo): remove duplicates & artifacts; standardize configs"
read -r -d '' PR_BODY <<'EOF'
- Deletes unused alternates:
  - `playwright.config.simple.ts`, `preflight.sh`, `simple-preview.ps1`, `tsconfig.fast.json`, `tatus`
- Purges committed test artifacts: `playwright-report/`, `test-results/` and adds them to .gitignore
- Pins `test:e2e` to `playwright.config.ts`, `typecheck` to `tsconfig.json`
- Updates CI workflows referencing old paths
EOF

if [[ "$DRY_RUN" -eq 0 ]]; then
  git push -u origin "$NEW_BRANCH"
  gh pr create --base "$BASE_BRANCH" --title "$PR_TITLE" --body "$PR_BODY" --label chore --label repo-hygiene
  echo -e "\n📝 PR opened. Backup tag: $backupTag"
else
  echo "[DRY RUN] Would push branch & open PR"
fi

echo -e "\n📌 Rollback:"
echo "  git checkout $BASE_BRANCH"
echo "  git branch -D $NEW_BRANCH"
echo "  git push origin --delete $NEW_BRANCH"
echo "  gh pr close --delete-branch"
echo "  git reset --hard $backupTag"
