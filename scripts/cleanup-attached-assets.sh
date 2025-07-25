#!/usr/bin/env bash
set -e

KEEP=(
  "attached_assets/important-guide.pdf"
  "attached_assets/company-logo.png"
  # …add exceptions here…
)

find attached_assets -type f | while read -r file; do
  keep=false
  for k in "${KEEP[@]}"; do
    [[ "$file" == "$k" ]] && keep=true
  done
  if ! $keep; then
    echo "Deleting $file"
    git rm "$file"
  fi
done
#git commit -am "Cleanup attached assets"




