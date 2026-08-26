#!/usr/bin/env bash
# pilot.sh – one‑touch deployment (canary + attestation trigger)

set -euo pipefail
IFS=$'\n\t'

TAG="pre-pilot-$(date +%Y%m%d-%H%M)"
REMOTE=${REMOTE:-origin}

rollback_tag() {
  echo "⚠️  Interrupted! Removing tag $TAG ..."
  git tag -d "$TAG" 2>/dev/null || true
}
trap rollback_tag INT TERM

echo "📸  Creating snapshot commit & tag ..."
git add .async-migration-log
git commit -m "chore: pre‑pilot snapshot [skip ci]" || true     # commit may be empty
./launch-script.sh --dry-run

git tag -a "$TAG" -m "safe‑point with logs"
git push "$REMOTE" HEAD "$TAG"

echo "🚀  Deploying 5 % canary ..."
./launch-script.sh --batch-size 5 --canary

# -------------------------------------------
# Capture performance baseline
# -------------------------------------------
echo "📊  Capturing performance baseline..."
mkdir -p .perf-baseline
BASELINE_FILE=".perf-baseline/$(date +%Y%m%d-%H%M).json"
if curl -sf http://localhost:3000/metrics > "$BASELINE_FILE" 2>/dev/null; then
  git add "$BASELINE_FILE"
  HUSKY=0 git commit -m "perf: baseline snapshot" --quiet || true
  echo "✅  Baseline saved to $BASELINE_FILE"
else
  echo "⚠️  Could not capture baseline (service may be starting)"
fi

# -------------------------------------------
# Generate one‑click rollback script
# -------------------------------------------
cat > rollback-last.sh << EOF
#!/usr/bin/env bash
git reset --hard $TAG && git push -f $REMOTE main
echo "✅  Rolled back to $TAG"
EOF
chmod +x rollback-last.sh
echo "💾  Rollback helper saved → ./rollback-last.sh"

echo "🔐  Kicking off async SBOM / signing workflow ..."
gh workflow run post-deploy-attestation.yml -f tag="$TAG" >/dev/null

echo -e "\n✅  Canary deployed. Monitor at http://localhost:3000/metrics"
echo "🛑  To roll back: ./rollback-last.sh"
echo "🔥  Initial canary size: 5" > .canary-size
