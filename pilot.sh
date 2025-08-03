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

echo "🔐  Kicking off async SBOM / signing workflow ..."
gh workflow run post-deploy-attestation.yml -f tag="$TAG" >/dev/null

echo -e "\n✅  Canary deployed. Monitor at http://localhost:3000/metrics"
echo "🛑  To roll back: git reset --hard $TAG && git push -f $REMOTE main"
