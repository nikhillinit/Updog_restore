#!/usr/bin/env bash
#
# import-g2c-issues.sh
# Bulk-create GitHub issues from sprint-g2c-backlog.md headings.

REPO="nikhillinit/Updog_restore"
BACKLOG="./sprint-g2c-backlog.md"

# Extract lines like "#### G2C-001: Title"
grep -E '^#### G2C-[0-9]+:' "$BACKLOG" | while IFS= read -r line; do
  ISSUE_ID=$(echo "$line" | sed 's/^#### //' | cut -d':' -f1 | xargs)
  ISSUE_TITLE=$(echo "$line" | cut -d':' -f2- | xargs)
  # Grab the description block until the next heading or blank line
  ISSUE_BODY=$(awk "/^#### $ISSUE_ID:/{flag=1; next} /^#### [A-Z]/ {flag=0} flag" "$BACKLOG")

  # Create the issue
  "/c/Program Files/GitHub CLI/gh.exe" issue create \
    --repo "$REPO" \
    --title "$ISSUE_ID: $ISSUE_TITLE" \
    --body "$ISSUE_BODY" \
    --label "Gate G2C" \
    --label "$(echo "$ISSUE_ID" | cut -d'-' -f2)" \
    --assignee "@me"
done
