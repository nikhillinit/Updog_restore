#!/usr/bin/env bash
# scripts/test-restore.sh
set -euo pipefail
BACKUP="${1:-./backups/latest.sql}"
TMP_DB="stage_restore_$(date +%s)"

createdb "$TMP_DB"
psql "$TMP_DB" -f "$BACKUP" >/dev/null
psql "$TMP_DB" -c "SELECT 1;" >/dev/null
dropdb "$TMP_DB"
echo "✅ restore OK"
