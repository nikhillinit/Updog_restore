#!/bin/bash
# Automated health monitoring with auto-rollback capability
# Usage: ./monitor-health.sh [duration_minutes] [error_threshold]

DURATION=${1:-30}  # Default 30 minutes
ERROR_THRESHOLD=${2:-0.5}  # Default 0.5% error rate
PROD_HOST=${PROD_HOST:-"http://localhost:5000"}
CONFIG_PATH=${CONFIG_PATH:-"./dist/public/runtime-config.json"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to log with timestamp
log() {
  echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check error rate
check_error_rate() {
  # Fetch metrics
  METRICS=$(curl -s ${PROD_HOST}/metrics 2>/dev/null)
  
  # Extract fund_create metrics
  ERRORS=$(echo "$METRICS" | grep -oP 'fund_create_failure\s+\K\d+' || echo "0")
  SUCCESSES=$(echo "$METRICS" | grep -oP 'fund_create_success\s+\K\d+' || echo "0")
  
  TOTAL=$((ERRORS + SUCCESSES))
  
  if [ $TOTAL -eq 0 ]; then
    echo "0"
    return
  fi
  
  # Calculate error rate as percentage
  ERROR_RATE=$(echo "scale=2; ($ERRORS / $TOTAL) * 100" | bc -l)
  echo "$ERROR_RATE"
}

# Function to rollback
rollback() {
  log "${RED}🚨 Triggering rollback...${NC}"
  
  # Update runtime config to 0% rollout
  if [ -f "$CONFIG_PATH" ]; then
    jq '.flags.useFundStore.rollout = 0' "$CONFIG_PATH" > temp.json && mv temp.json "$CONFIG_PATH"
    log "${GREEN}✅ Rollout set to 0% in runtime config${NC}"
  fi
  
  # Log incident
  echo "{
    \"timestamp\": \"$(date -Iseconds)\",
    \"action\": \"auto_rollback\",
    \"error_rate\": \"$1\",
    \"threshold\": \"$ERROR_THRESHOLD\"
  }" >> rollback.log
  
  exit 1
}

# Main monitoring loop
monitor_health() {
  START_TIME=$(date +%s)
  END_TIME=$((START_TIME + DURATION * 60))
  ERROR_COUNT=0
  CHECK_COUNT=0
  
  log "${CYAN}🔍 Starting health monitoring${NC}"
  log "Duration: ${DURATION} minutes"
  log "Error threshold: ${ERROR_THRESHOLD}%"
  log "Target: ${PROD_HOST}"
  echo "═══════════════════════════════"
  
  while [ $(date +%s) -lt $END_TIME ]; do
    CHECK_COUNT=$((CHECK_COUNT + 1))
    
    # Check health endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" ${PROD_HOST}/healthz)
    
    if [ "$HTTP_CODE" != "200" ]; then
      log "${YELLOW}⚠️  Health check returned ${HTTP_CODE}${NC}"
      ERROR_COUNT=$((ERROR_COUNT + 1))
      
      if [ $ERROR_COUNT -ge 3 ]; then
        log "${RED}❌ 3 consecutive health check failures${NC}"
        rollback "health_check_failure"
      fi
    else
      ERROR_COUNT=0  # Reset on success
      
      # Check error rate
      ERROR_RATE=$(check_error_rate)
      
      if (( $(echo "$ERROR_RATE > $ERROR_THRESHOLD" | bc -l) )); then
        log "${RED}⚠️  Error rate ${ERROR_RATE}% exceeds threshold ${ERROR_THRESHOLD}%${NC}"
        ERROR_COUNT=$((ERROR_COUNT + 1))
        
        if [ $ERROR_COUNT -ge 2 ]; then
          log "${RED}❌ Error rate exceeded threshold for 2 consecutive checks${NC}"
          rollback "$ERROR_RATE"
        fi
      else
        log "${GREEN}✅ Check #${CHECK_COUNT}: Healthy (errors: ${ERROR_RATE}%)${NC}"
      fi
    fi
    
    # Wait 60 seconds before next check
    sleep 60
  done
  
  ELAPSED=$(($(date +%s) - START_TIME))
  log "${GREEN}🎉 Monitoring complete after ${ELAPSED} seconds${NC}"
  log "All health checks passed!"
  
  # Generate success report
  echo "{
    \"timestamp\": \"$(date -Iseconds)\",
    \"status\": \"success\",
    \"duration_seconds\": $ELAPSED,
    \"checks_performed\": $CHECK_COUNT
  }" > monitoring-success.json
  
  exit 0
}

# Execute
monitor_health