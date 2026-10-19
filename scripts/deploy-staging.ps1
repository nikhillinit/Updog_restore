# Retired (ADR-109). This script ran the Vercel CLI without --prod, which
# creates a Preview on whatever project is linked, including the original
# project, whose Previews have forked production data through the Neon
# integration. No Preview-producing action is admitted on the original project;
# Production reaches it only through Release Production
# (.github/workflows/release-production.yml).
Write-Host "[REFUSED] scripts/deploy-staging.ps1 is retired (ADR-109)." -ForegroundColor Red
exit 1
