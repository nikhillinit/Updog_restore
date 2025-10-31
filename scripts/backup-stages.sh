#!/bin/bash

# Backup Script for Stage Normalization
# Purpose: Create timestamped backup of portfolio_companies and deal_opportunities tables
# Usage: ./scripts/backup-stages.sh
# ADR-011 Reference: https://github.com/press-on-ventures/updog/blob/main/docs/adr/ADR-011-stage-normalization-v2.md

set -euo pipefail

# Verify DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable not set" >&2
  exit 1
fi

# Create backups directory if it doesn't exist and verify it's writable
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR" || {
  echo "ERROR: Failed to create backup directory: $BACKUP_DIR" >&2
  echo "Check file permissions and parent directory" >&2
  exit 1
}

# Verify backups directory is actually a directory (not a file)
if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: $BACKUP_DIR exists but is not a directory" >&2
  exit 1
fi

# Generate timestamped filename (RFC 3339 compatible)
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/stages_${TIMESTAMP}.sql"
STDERR_LOG="$BACKUP_DIR/stages_${TIMESTAMP}.log"

# Verify backup file doesn't already exist (simple TOCTOU prevention)
if [ -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file already exists: $BACKUP_FILE" >&2
  exit 1
fi

# Create backup with comprehensive error handling
echo "Creating backup: $BACKUP_FILE"
if ! pg_dump "$DATABASE_URL" \
  --table=portfolio_companies \
  --table=deal_opportunities \
  --if-exists \
  --clean \
  --no-owner \
  > "$BACKUP_FILE" 2> "$STDERR_LOG"; then
  echo "ERROR: pg_dump failed for $BACKUP_FILE" >&2
  echo "Diagnostic output:" >&2
  cat "$STDERR_LOG" >&2
  rm -f "$BACKUP_FILE" "$STDERR_LOG"
  exit 1
fi

# Check for warnings (pg_dump may succeed with warnings)
if [ -s "$STDERR_LOG" ]; then
  echo "WARNING: pg_dump completed but reported:" >&2
  cat "$STDERR_LOG" >&2
  rm -f "$STDERR_LOG"
fi

# Verify backup was created and has content
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not created: $BACKUP_FILE" >&2
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file is empty: $BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Validate backup contains expected SQL markers (prevent truncated backups)
if ! grep -q "^-- PostgreSQL database dump" "$BACKUP_FILE"; then
  echo "ERROR: Backup file missing PostgreSQL header: $BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

if ! grep -q "portfolio_companies\|deal_opportunities" "$BACKUP_FILE"; then
  echo "ERROR: Backup file missing expected tables: $BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Check file doesn't end abruptly (should have closing markers)
if ! tail -c 100 "$BACKUP_FILE" | grep -qE "^--|^COMMIT|^\\." ; then
  echo "ERROR: Backup file appears truncated (missing closing markers): $BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Report success
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup successful: $BACKUP_FILE ($BACKUP_SIZE)"

# Log success to syslog if available
if command -v logger &> /dev/null; then
  logger -t backup-stages -p local0.info "Stage normalization backup created: $BACKUP_FILE ($BACKUP_SIZE)"
fi

# Show restore instructions with parsed connection details
echo "   Restore with: psql \"\$DATABASE_URL\" < \"$BACKUP_FILE\""
echo "   Or for manual control: psql -d <database> < \"$BACKUP_FILE\""

exit 0
