#!/bin/bash

# BMAD Fix Progress Monitor
# Run this in a separate terminal to watch progress

echo "🔍 TypeScript Error Monitor"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initial count
INITIAL=$(npx tsc --noEmit 2>&1 | grep "client/" | wc -l)
echo -e "${YELLOW}Initial client errors: ${INITIAL}${NC}"
echo ""

# Monitor loop
while true; do
  # Get current counts
  CLIENT_ERRORS=$(npx tsc --noEmit 2>&1 | grep "client/" | wc -l)
  SERVER_ERRORS=$(npx tsc --noEmit 2>&1 | grep "server/" | wc -l)
  TOTAL_ERRORS=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
  
  # Calculate progress
  FIXED=$((INITIAL - CLIENT_ERRORS))
  PERCENT=$((FIXED * 100 / INITIAL))
  
  # Clear and redraw
  clear
  echo "🤖 BMAD Auto-Fix Progress Monitor"
  echo "================================="
  echo ""
  echo -e "${GREEN}✅ Server errors: ${SERVER_ERRORS}${NC} (Complete!)"
  echo -e "${YELLOW}🔧 Client errors: ${CLIENT_ERRORS}${NC} (from ${INITIAL})"
  echo -e "${BLUE}📊 Total errors: ${TOTAL_ERRORS}${NC}"
  echo ""
  echo -e "${GREEN}Fixed so far: ${FIXED} (${PERCENT}%)${NC}"
  echo ""
  
  # Progress bar
  echo -n "Progress: ["
  PROGRESS=$((PERCENT / 2))
  for ((i=0; i<50; i++)); do
    if [ $i -lt $PROGRESS ]; then
      echo -n "█"
    else
      echo -n "░"
    fi
  done
  echo "] ${PERCENT}%"
  echo ""
  
  # Top error files
  echo "📁 Files with most errors:"
  npx tsc --noEmit 2>&1 | grep "client/" | cut -d: -f1 | sort | uniq -c | sort -rn | head -5 | while read count file; do
    echo "   $count errors: $(basename $file)"
  done
  
  echo ""
  echo "Last update: $(date '+%H:%M:%S')"
  echo "Press Ctrl+C to stop monitoring"
  
  # Update every 5 seconds
  sleep 5
done