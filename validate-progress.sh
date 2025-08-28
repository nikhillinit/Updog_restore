#!/bin/bash

validate_progress() {
  local errors_file=$(mktemp)
  npx tsc -p tsconfig.client.json --noEmit 2>&1 | grep "error TS" > $errors_file
  
  echo "=== Error Analysis ==="
  echo "Total client errors: $(wc -l < $errors_file)"
  echo ""
  echo "Error breakdown:"
  echo "  TS2322 (type assignment): $(grep -c "TS2322" $errors_file || echo 0)"
  echo "  TS4111 (index signature): $(grep -c "TS4111" $errors_file || echo 0)"
  echo "  TS2532 (possibly undefined): $(grep -c "TS2532" $errors_file || echo 0)"
  echo "  TS7006 (implicit any): $(grep -c "TS7006" $errors_file || echo 0)"
  echo "  TS2345 (type mismatch): $(grep -c "TS2345" $errors_file || echo 0)"
  echo ""
  echo "Top error-prone files:"
  cut -d'(' -f1 $errors_file | awk -F'/' '{print $NF}' | sort | uniq -c | sort -nr | head -5
  
  rm -f $errors_file
}

validate_progress