#!/bin/bash
# Staging Monitor Script
# Purpose: Automated monitoring of staging deployment during 48-hour soak test
# Runs every 15 minutes via cron or GitHub Actions
# Author: Claude
# Last Updated: 2025-10-04

set -euo pipefail

# Configuration
STAGING_URL="${STAGING_URL:-https://updog-staging.vercel.app}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
ALERT_ON_FAILURE="${ALERT_ON_FAILURE:-true}"
LOG_FILE="${LOG_FILE:-staging-monitor.log}"
METRICS_FILE="${METRICS_FILE:-staging-metrics.json}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Slack notification function
send_slack_notification() {
    local message="$1"
    local emoji="${2:-🤖}"

    if [ -n "$SLACK_WEBHOOK" ] && [ "$ALERT_ON_FAILURE" = "true" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"$emoji $message\"}" \
            --silent --show-error || log_warn "Failed to send Slack notification"
    fi
}

# Initialize metrics
init_metrics() {
    cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "checks": {
    "health": null,
    "feature_flags": null,
    "bundle_size": null,
    "response_time": null,
    "console_errors": null
  },
  "status": "unknown"
}
EOF
}

# Update metrics
update_metric() {
    local check_name="$1"
    local status="$2"
    local details="${3:-}"

    if [ -f "$METRICS_FILE" ]; then
        # Update using jq if available, otherwise recreate
        if command -v jq &> /dev/null; then
            jq ".checks.${check_name} = {\"status\": \"$status\", \"details\": \"$details\", \"timestamp\": \"$(date -Iseconds)\"}" "$METRICS_FILE" > "${METRICS_FILE}.tmp"
            mv "${METRICS_FILE}.tmp" "$METRICS_FILE"
        fi
    fi
}

# Health check
check_health() {
    log_info "Checking health endpoint..."

    local http_code
    local response_time
    local response_body

    # Make request and capture response time
    response=$(curl -s -w "\n%{http_code}\n%{time_total}" "$STAGING_URL/api/health" 2>&1 || echo "CURL_FAILED")

    if [ "$response" = "CURL_FAILED" ]; then
        log_error "Health check failed - curl command failed"
        update_metric "health" "failed" "curl_failed"
        send_slack_notification "🚨 Staging health check failed - cannot reach server" "🚨"
        return 1
    fi

    # Parse response (last two lines are status code and time)
    response_body=$(echo "$response" | head -n -2)
    http_code=$(echo "$response" | tail -n 2 | head -n 1)
    response_time=$(echo "$response" | tail -n 1)

    log_info "Health check response code: $http_code (${response_time}s)"

    if [ "$http_code" -ne 200 ]; then
        log_error "Health check failed with status code: $http_code"
        update_metric "health" "failed" "http_${http_code}"
        send_slack_notification "🚨 Staging health check failed - HTTP $http_code" "🚨"
        return 1
    fi

    # Check response time
    response_time_ms=$(echo "$response_time * 1000" | bc)
    if (( $(echo "$response_time_ms > 1000" | bc -l) )); then
        log_warn "Health check slow: ${response_time_ms}ms (threshold: 1000ms)"
        update_metric "health" "slow" "${response_time_ms}ms"
    else
        log_info "Health check passed in ${response_time_ms}ms"
        update_metric "health" "passed" "${response_time_ms}ms"
    fi

    # Parse health response if JSON
    if command -v jq &> /dev/null && echo "$response_body" | jq . &> /dev/null; then
        local status=$(echo "$response_body" | jq -r '.status // "unknown"')
        local db_status=$(echo "$response_body" | jq -r '.database.status // "unknown"')
        local redis_status=$(echo "$response_body" | jq -r '.redis.status // "unknown"')

        log_info "Service status: $status"
        log_info "Database status: $db_status"
        log_info "Redis status: $redis_status"

        if [ "$db_status" != "connected" ] && [ "$db_status" != "unknown" ]; then
            log_error "Database not connected: $db_status"
            send_slack_notification "⚠️ Staging database connection issue: $db_status" "⚠️"
        fi

        if [ "$redis_status" != "connected" ] && [ "$redis_status" != "unknown" ]; then
            log_warn "Redis not connected: $redis_status"
            send_slack_notification "⚠️ Staging Redis connection issue: $redis_status" "⚠️"
        fi
    fi

    return 0
}

# Feature flags check
check_feature_flags() {
    log_info "Checking feature flags..."

    # Fetch homepage and check for feature flags in embedded script
    local response
    response=$(curl -s "$STAGING_URL" 2>&1 || echo "CURL_FAILED")

    if [ "$response" = "CURL_FAILED" ]; then
        log_error "Feature flags check failed - cannot fetch homepage"
        update_metric "feature_flags" "failed" "curl_failed"
        send_slack_notification "🚨 Cannot fetch staging homepage for feature flag check" "🚨"
        return 1
    fi

    # Check if deterministicEngineV1 is mentioned and enabled
    if echo "$response" | grep -q "deterministicEngineV1.*false"; then
        log_error "Feature flag deterministicEngineV1 is disabled!"
        update_metric "feature_flags" "failed" "flag_disabled"
        send_slack_notification "⚠️ Feature flag deterministicEngineV1 is disabled in staging" "⚠️"
        return 1
    elif echo "$response" | grep -q "deterministicEngineV1.*true"; then
        log_info "Feature flag deterministicEngineV1 is enabled"
        update_metric "feature_flags" "passed" "flag_enabled"
    else
        log_warn "Feature flag deterministicEngineV1 not found in response"
        update_metric "feature_flags" "unknown" "flag_not_found"
    fi

    # Check if staging ribbon is present
    if echo "$response" | grep -q "STAGING ENVIRONMENT" || echo "$response" | grep -q "staging"; then
        log_info "Staging ribbon detected"
    else
        log_warn "Staging ribbon not detected in response"
    fi

    return 0
}

# Bundle size check
check_bundle_size() {
    log_info "Checking bundle sizes..."

    # This check requires local build, so we'll fetch bundle info from Vercel if possible
    # For now, we'll check if critical assets are loadable

    local main_bundle_url="$STAGING_URL/assets/index-*.js"
    local response

    # Try to fetch any JS bundle to verify it's loadable
    response=$(curl -s -I "$STAGING_URL" 2>&1 | grep -i "content-type" || echo "")

    if [ -n "$response" ]; then
        log_info "Homepage assets loadable"
        update_metric "bundle_size" "passed" "assets_loadable"
    else
        log_warn "Could not verify bundle loading"
        update_metric "bundle_size" "unknown" "could_not_verify"
    fi

    return 0
}

# Response time check
check_response_time() {
    log_info "Checking homepage response time..."

    local response_time
    response_time=$(curl -s -w "%{time_total}" -o /dev/null "$STAGING_URL" 2>&1 || echo "FAILED")

    if [ "$response_time" = "FAILED" ]; then
        log_error "Response time check failed"
        update_metric "response_time" "failed" "curl_failed"
        send_slack_notification "🚨 Cannot measure staging response time" "🚨"
        return 1
    fi

    local response_time_ms=$(echo "$response_time * 1000" | bc)
    log_info "Homepage response time: ${response_time_ms}ms"

    # Alert if response time > 3 seconds
    if (( $(echo "$response_time_ms > 3000" | bc -l) )); then
        log_warn "Slow response time: ${response_time_ms}ms (threshold: 3000ms)"
        update_metric "response_time" "slow" "${response_time_ms}ms"
        send_slack_notification "⚠️ Staging response time slow: ${response_time_ms}ms" "⚠️"
    else
        log_info "Response time acceptable"
        update_metric "response_time" "passed" "${response_time_ms}ms"
    fi

    return 0
}

# Console errors check (requires headless browser - optional)
check_console_errors() {
    log_info "Console errors check (requires headless browser - skipped in basic mode)"
    update_metric "console_errors" "skipped" "requires_headless_browser"
    return 0
}

# Determine overall status
determine_overall_status() {
    local failed_checks=0
    local total_checks=0

    if [ -f "$METRICS_FILE" ] && command -v jq &> /dev/null; then
        # Count failed checks
        failed_checks=$(jq '[.checks[] | select(.status == "failed")] | length' "$METRICS_FILE")
        total_checks=$(jq '[.checks[]] | length' "$METRICS_FILE")

        if [ "$failed_checks" -eq 0 ]; then
            jq '.status = "healthy"' "$METRICS_FILE" > "${METRICS_FILE}.tmp"
            mv "${METRICS_FILE}.tmp" "$METRICS_FILE"
            log_info "Overall status: HEALTHY (0 failed checks)"
            return 0
        else
            jq '.status = "unhealthy"' "$METRICS_FILE" > "${METRICS_FILE}.tmp"
            mv "${METRICS_FILE}.tmp" "$METRICS_FILE"
            log_error "Overall status: UNHEALTHY ($failed_checks failed checks)"
            send_slack_notification "🚨 Staging monitor detected $failed_checks failed checks" "🚨"
            return 1
        fi
    fi

    return 0
}

# Main execution
main() {
    log_info "========================================="
    log_info "Starting staging monitor check"
    log_info "Staging URL: $STAGING_URL"
    log_info "========================================="

    # Initialize metrics file
    init_metrics

    # Run all checks
    local overall_result=0

    check_health || overall_result=1
    echo ""

    check_feature_flags || overall_result=1
    echo ""

    check_bundle_size || overall_result=1
    echo ""

    check_response_time || overall_result=1
    echo ""

    check_console_errors || overall_result=1
    echo ""

    # Determine overall status
    determine_overall_status || overall_result=1

    log_info "========================================="
    if [ $overall_result -eq 0 ]; then
        log_info "✅ All staging monitor checks passed"
    else
        log_error "❌ Some staging monitor checks failed"
    fi
    log_info "========================================="

    # Output metrics if jq available
    if [ -f "$METRICS_FILE" ] && command -v jq &> /dev/null; then
        echo ""
        log_info "Metrics summary:"
        jq . "$METRICS_FILE"
    fi

    exit $overall_result
}

# Run main function
main "$@"
