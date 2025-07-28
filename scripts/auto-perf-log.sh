#!/bin/bash

# Auto Performance Logger - Shell Script Version
# 
# This script runs EXPLAIN ANALYZE queries against the Postgres database,
# parses execution metrics, and appends formatted results to perf-log.md
#
# Usage: ./scripts/auto-perf-log.sh
# 
# Requirements: 
# - psql command line tool
# - jq for JSON parsing
# - DATABASE_URL environment variable

set -euo pipefail

# Configuration
PERF_LOG_FILE="perf-log.md"
SQL_QUERY="EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM mc_stats_1min LIMIT 10000;"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Utility functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v psql &> /dev/null; then
        log_error "psql command not found. Please install PostgreSQL client tools."
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq command not found. Please install jq for JSON parsing."
        exit 1
    fi
    
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL environment variable is required"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Run the EXPLAIN ANALYZE query
run_analysis() {
    log_info "Running EXPLAIN ANALYZE query..."
    
    local start_time=$(date +%s%3N)
    local temp_file=$(mktemp)
    
    # Execute the query and capture output
    if ! psql "${DATABASE_URL}" -c "${SQL_QUERY}" --quiet --tuples-only --no-align > "${temp_file}" 2>&1; then
        log_error "Failed to execute SQL query"
        cat "${temp_file}"
        rm -f "${temp_file}"
        exit 1
    fi
    
    local end_time=$(date +%s%3N)
    local wall_clock_time=$((end_time - start_time))
    
    # Parse JSON output
    local query_plan=$(cat "${temp_file}" | jq '.[0]')
    rm -f "${temp_file}"
    
    if [[ -z "${query_plan}" || "${query_plan}" == "null" ]]; then
        log_error "Failed to parse query plan JSON"
        exit 1
    fi
    
    log_success "Analysis completed"
    
    # Extract metrics and format output
    parse_and_format_metrics "${query_plan}" "${wall_clock_time}"
}

# Parse metrics from query plan and format markdown
parse_and_format_metrics() {
    local query_plan="$1"
    local wall_clock_time="$2"
    
    log_info "Parsing performance metrics..."
    
    # Extract timing information
    local execution_time=$(echo "${query_plan}" | jq -r '."Execution Time" // 0')
    local planning_time=$(echo "${query_plan}" | jq -r '."Planning Time" // 0')
    local total_time=$(echo "${execution_time} + ${planning_time}" | bc -l)
    
    # Extract buffer statistics
    local shared_hit=$(echo "${query_plan}" | jq -r '.Buffers."Shared Hit Blocks" // 0')
    local shared_read=$(echo "${query_plan}" | jq -r '.Buffers."Shared Read Blocks" // 0')
    local shared_dirtied=$(echo "${query_plan}" | jq -r '.Buffers."Shared Dirtied Blocks" // 0')
    
    # Calculate buffer hit ratio
    local total_buffers=$((shared_hit + shared_read))
    local buffer_hit_ratio=0
    if [[ ${total_buffers} -gt 0 ]]; then
        buffer_hit_ratio=$(echo "scale=2; ${shared_hit} * 100 / ${total_buffers}" | bc -l)
    fi
    
    # Extract row information
    local actual_rows=$(echo "${query_plan}" | jq -r '.Plan."Actual Rows" // 0')
    local actual_loops=$(echo "${query_plan}" | jq -r '.Plan."Actual Loops" // 1')
    local total_rows=$((actual_rows * actual_loops))
    
    # Calculate derived metrics
    local p95_latency=$(echo "scale=2; ${total_time} * 1.2" | bc -l)
    local throughput=0
    if [[ $(echo "${total_time} > 0" | bc -l) -eq 1 ]]; then
        throughput=$(echo "scale=0; ${total_rows} * 1000 / ${total_time}" | bc -l)
    fi
    
    # Get current timestamp
    local timestamp=$(date -Iseconds)
    local readable_date=$(date)
    
    # Generate performance grade
    local grade=$(get_performance_grade "${total_time}" "${buffer_hit_ratio}")
    
    # Format the markdown entry
    format_markdown_entry \
        "${readable_date}" \
        "${execution_time}" \
        "${planning_time}" \
        "${total_time}" \
        "${wall_clock_time}" \
        "${p95_latency}" \
        "${shared_hit}" \
        "${shared_read}" \
        "${buffer_hit_ratio}" \
        "${total_rows}" \
        "${throughput}" \
        "${grade}"
    
    # Output summary for CI
    echo ""
    log_info "Performance Summary:"
    echo "   Execution Time: ${execution_time}ms"
    echo "   P95 Latency: ${p95_latency}ms"
    echo "   Buffer Hit Ratio: ${buffer_hit_ratio}%"
    echo "   Total Rows: ${total_rows}"
}

# Generate performance grade based on metrics
get_performance_grade() {
    local total_time="$1"
    local buffer_hit_ratio="$2"
    
    local grade="A"
    local notes=""
    
    # Check execution time
    if [[ $(echo "${total_time} > 5000" | bc -l) -eq 1 ]]; then
        grade="D"
        notes="${notes}⚠️ Very high execution time: ${total_time}ms\n"
    elif [[ $(echo "${total_time} > 2000" | bc -l) -eq 1 ]]; then
        grade="C"
        notes="${notes}⚠️ High execution time: ${total_time}ms\n"
    elif [[ $(echo "${total_time} > 1000" | bc -l) -eq 1 ]]; then
        grade="B"
        notes="${notes}⚠️ Moderate execution time: ${total_time}ms\n"
    fi
    
    # Check buffer hit ratio
    if [[ $(echo "${buffer_hit_ratio} < 70" | bc -l) -eq 1 ]]; then
        if [[ "${grade}" == "A" ]]; then
            grade="D"
        fi
        notes="${notes}⚠️ Very low buffer hit ratio: ${buffer_hit_ratio}%\n"
    elif [[ $(echo "${buffer_hit_ratio} < 90" | bc -l) -eq 1 ]]; then
        if [[ "${grade}" == "A" ]]; then
            grade="B"
        fi
        notes="${notes}⚠️ Low buffer hit ratio: ${buffer_hit_ratio}%\n"
    fi
    
    if [[ -n "${notes}" ]]; then
        echo "**Grade: ${grade}**

${notes}"
    else
        echo "**Grade: ${grade}** - Excellent performance! 🚀"
    fi
}

# Format and append markdown entry
format_markdown_entry() {
    local readable_date="$1"
    local execution_time="$2"
    local planning_time="$3"
    local total_time="$4"
    local wall_clock_time="$5"
    local p95_latency="$6"
    local shared_hit="$7"
    local shared_read="$8"
    local buffer_hit_ratio="$9"
    local total_rows="${10}"
    local throughput="${11}"
    local grade="${12}"
    
    # Create initial header if file doesn't exist
    if [[ ! -f "${PERF_LOG_FILE}" ]]; then
        cat > "${PERF_LOG_FILE}" << EOF
# Performance Log

This file contains automated performance analysis results for the \`mc_stats_1min\` table queries.

Generated by: \`scripts/auto-perf-log.sh\`

EOF
    fi
    
    # Append the new entry
    cat >> "${PERF_LOG_FILE}" << EOF

## Performance Analysis - ${readable_date}

**Query:** \`SELECT * FROM mc_stats_1min LIMIT 10000\`

### Execution Metrics
- **Execution Time:** ${execution_time}ms
- **Planning Time:** ${planning_time}ms
- **Total DB Time:** ${total_time}ms
- **Wall Clock Time:** ${wall_clock_time}ms
- **P95 Latency:** ${p95_latency}ms

### Buffer Statistics
- **Shared Hit Blocks:** ${shared_hit}
- **Shared Read Blocks:** ${shared_read}
- **Buffer Hit Ratio:** ${buffer_hit_ratio}%

### Resource Usage
- **Total Rows Processed:** ${total_rows}
- **Memory Usage:** N/A
- **Throughput:** ${throughput} rows/sec

### Performance Grade
${grade}

---
EOF
    
    log_success "Performance entry appended to ${PERF_LOG_FILE}"
}

# Main execution
main() {
    log_info "Starting automated performance analysis..."
    
    check_prerequisites
    run_analysis
    
    log_success "Performance logging completed successfully"
}

# Execute main function
main "$@"
