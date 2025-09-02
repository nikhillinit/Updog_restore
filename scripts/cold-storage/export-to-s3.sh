#!/bin/bash
# Cold storage export script - exports old fund events to S3 as Parquet files
# Run via cron: 0 2 * * * /path/to/export-to-s3.sh

set -euo pipefail

# Configuration
DB_URL="${DATABASE_URL}"
S3_BUCKET="${S3_BUCKET:-povc-fund-cold-storage}"
S3_PREFIX="${S3_PREFIX:-events}"
RETENTION_MONTHS="${RETENTION_MONTHS:-24}"
EXPORT_DATE=$(date +%Y%m%d)
MANIFEST_FILE="/tmp/export_manifest_${EXPORT_DATE}.json"

# Ensure required tools
command -v psql >/dev/null 2>&1 || { echo "psql required but not installed"; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "aws-cli required but not installed"; exit 1; }
command -v zstd >/dev/null 2>&1 || { echo "zstd required but not installed"; exit 1; }

echo "Starting cold storage export for ${EXPORT_DATE}"

# Create manifest header
cat > "${MANIFEST_FILE}" <<EOF
{
  "export_date": "${EXPORT_DATE}",
  "retention_months": ${RETENTION_MONTHS},
  "files": [
EOF

FIRST_FILE=true

# Export events older than retention period by fund
for fund_id in $(psql "${DB_URL}" -t -c "SELECT DISTINCT fund_id FROM fund_events WHERE event_time < NOW() - INTERVAL '${RETENTION_MONTHS} months' ORDER BY fund_id"); do
  fund_id=$(echo $fund_id | tr -d ' ')
  if [[ -z "$fund_id" ]]; then continue; fi
  
  echo "Exporting fund ${fund_id}..."
  
  # Count events to export
  EVENT_COUNT=$(psql "${DB_URL}" -t -c "SELECT COUNT(*) FROM fund_events WHERE fund_id = ${fund_id} AND event_time < NOW() - INTERVAL '${RETENTION_MONTHS} months'")
  EVENT_COUNT=$(echo $EVENT_COUNT | tr -d ' ')
  
  if [[ "$EVENT_COUNT" -eq 0 ]]; then
    echo "No events to export for fund ${fund_id}"
    continue
  fi
  
  # Generate checksum for verification
  CHECKSUM=$(psql "${DB_URL}" -t -c "SELECT MD5(string_agg(checksum, '' ORDER BY id)) FROM fund_events WHERE fund_id = ${fund_id} AND event_time < NOW() - INTERVAL '${RETENTION_MONTHS} months'")
  CHECKSUM=$(echo $CHECKSUM | tr -d ' ')
  
  # Export to S3 with compression
  S3_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/fund_${fund_id}/${EXPORT_DATE}/events.parquet.zst"
  
  # Use COPY TO PROGRAM for streaming export
  psql "${DB_URL}" -c "
    COPY (
      SELECT 
        id,
        fund_id,
        event_type,
        event_time,
        operation,
        entity_type,
        entity_id,
        old_values,
        new_values,
        metadata,
        checksum,
        created_at
      FROM fund_events 
      WHERE fund_id = ${fund_id} 
        AND event_time < NOW() - INTERVAL '${RETENTION_MONTHS} months'
      ORDER BY event_time, id
    ) TO PROGRAM 'zstd -c -T0 --long=31 | aws s3 cp - ${S3_PATH}'
    WITH (FORMAT 'parquet');
  "
  
  # Add to manifest
  if [[ "$FIRST_FILE" == "true" ]]; then
    FIRST_FILE=false
  else
    echo "," >> "${MANIFEST_FILE}"
  fi
  
  cat >> "${MANIFEST_FILE}" <<EOF
    {
      "fund_id": ${fund_id},
      "s3_path": "${S3_PATH}",
      "event_count": ${EVENT_COUNT},
      "checksum": "${CHECKSUM}",
      "size_bytes": $(aws s3api head-object --bucket "${S3_BUCKET}" --key "${S3_PREFIX}/fund_${fund_id}/${EXPORT_DATE}/events.parquet.zst" --query ContentLength --output text 2>/dev/null || echo 0)
    }
EOF
  
  echo "Exported ${EVENT_COUNT} events for fund ${fund_id}"
done

# Close manifest
cat >> "${MANIFEST_FILE}" <<EOF
  ],
  "total_funds": $(grep -c "fund_id" "${MANIFEST_FILE}" || echo 0),
  "glue_table": "povc_fund_events_archive",
  "athena_query_example": "SELECT * FROM povc_fund_events_archive WHERE year=${EXPORT_DATE:0:4} AND month=${EXPORT_DATE:4:2}"
}
EOF

# Upload manifest
aws s3 cp "${MANIFEST_FILE}" "s3://${S3_BUCKET}/${S3_PREFIX}/manifests/${EXPORT_DATE}_manifest.json"

echo "Export complete. Manifest uploaded to s3://${S3_BUCKET}/${S3_PREFIX}/manifests/${EXPORT_DATE}_manifest.json"

# Optional: Create/update Glue table for Athena queries
if command -v aws glue >/dev/null 2>&1; then
  echo "Creating Glue table for Athena queries..."
  aws glue create-table --database-name povc_analytics \
    --table-input "{
      \"Name\": \"povc_fund_events_archive\",
      \"StorageDescriptor\": {
        \"Location\": \"s3://${S3_BUCKET}/${S3_PREFIX}/\",
        \"InputFormat\": \"org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat\",
        \"OutputFormat\": \"org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat\",
        \"SerdeInfo\": {
          \"SerializationLibrary\": \"org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe\"
        },
        \"Compressed\": true
      },
      \"PartitionKeys\": [
        {\"Name\": \"fund_id\", \"Type\": \"int\"},
        {\"Name\": \"year\", \"Type\": \"string\"},
        {\"Name\": \"month\", \"Type\": \"string\"}
      ]
    }" 2>/dev/null || echo "Glue table already exists"
fi

# Cleanup
rm -f "${MANIFEST_FILE}"

echo "Cold storage export completed successfully"