#!/bin/bash
# Pro Bridge Validation Script
# Tests real browser automation with ChatGPT and Gemini subscriptions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SESSION_DIR="${PROJECT_DIR}/data/validation-sessions"
TEST_FILE="/tmp/pro-bridge-test-code.ts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_step() { echo -e "\n${YELLOW}=== $1 ===${NC}\n"; }

# Check prerequisites
check_prerequisites() {
    log_step "Checking Prerequisites"

    if [ -z "$OPENAI_API_KEY" ]; then
        log_error "OPENAI_API_KEY not set (required for Stagehand selectors)"
        echo "  export OPENAI_API_KEY=sk-..."
        exit 1
    fi
    log_success "OPENAI_API_KEY is set"

    if [ ! -f "$PROJECT_DIR/dist/cli.js" ]; then
        log_info "Building project..."
        cd "$PROJECT_DIR" && npm run build
    fi
    log_success "CLI built at dist/cli.js"

    # Create session directory
    mkdir -p "$SESSION_DIR"
    log_success "Session directory: $SESSION_DIR"
}

# Create test file with intentionally vulnerable code
create_test_file() {
    log_step "Creating Test File"

    cat > "$TEST_FILE" << 'EOF'
// Intentionally vulnerable code for validation testing
import { Request, Response } from 'express';

export function handleUserQuery(req: Request, res: Response) {
    // SQL Injection vulnerability
    const userId = req.query.id;
    const query = `SELECT * FROM users WHERE id = ${userId}`;

    // XSS vulnerability
    const userInput = req.body.comment;
    const html = `<div class="comment">${userInput}</div>`;

    // Command injection
    const filename = req.params.file;
    require('child_process').execSync(`cat /uploads/${filename}`);

    // Eval vulnerability
    const userCode = req.body.code;
    eval(userCode);

    // Hardcoded secret
    const apiKey = "sk-1234567890abcdef";

    res.send({ query, html });
}
EOF

    log_success "Test file created: $TEST_FILE"
    echo "  Contains: SQL injection, XSS, command injection, eval, hardcoded secret"
}

# Test 1: CLI Help
test_cli_help() {
    log_step "Test 1: CLI Help"

    if node "$PROJECT_DIR/dist/cli.js" --help | grep -q "GEMINI MODES"; then
        log_success "CLI help includes GEMINI_MODE documentation"
    else
        log_error "CLI help missing GEMINI_MODE documentation"
        return 1
    fi
}

# Test 2: ChatGPT Browser Mode
test_chatgpt_browser() {
    log_step "Test 2: ChatGPT Browser Mode"

    log_info "This will open a browser window for ChatGPT"
    log_info "If not logged in, please log in manually"
    log_warn "Press Ctrl+C to skip this test"

    echo -n "Starting in 3 seconds... "
    sleep 3
    echo "GO"

    if node "$PROJECT_DIR/dist/cli.js" \
        -p chatgpt \
        --session-dir "$SESSION_DIR" \
        -o json \
        "$TEST_FILE" > "$SESSION_DIR/chatgpt-result.json" 2>&1; then

        if grep -q '"provider"' "$SESSION_DIR/chatgpt-result.json"; then
            log_success "ChatGPT review completed"
            log_info "Result saved to: $SESSION_DIR/chatgpt-result.json"

            # Show summary
            echo "  Issues found: $(grep -c '"severity"' "$SESSION_DIR/chatgpt-result.json" || echo 0)"
        else
            log_warn "ChatGPT returned but output may not be valid JSON"
            cat "$SESSION_DIR/chatgpt-result.json"
        fi
    else
        log_error "ChatGPT review failed"
        cat "$SESSION_DIR/chatgpt-result.json" 2>/dev/null || true
        return 1
    fi
}

# Test 3: Gemini Browser Mode
test_gemini_browser() {
    log_step "Test 3: Gemini Browser Mode"

    log_info "This will open a browser window for Gemini"
    log_info "If not logged in, please log in with your Google account"
    log_warn "Press Ctrl+C to skip this test"

    echo -n "Starting in 3 seconds... "
    sleep 3
    echo "GO"

    export GEMINI_MODE=browser

    if node "$PROJECT_DIR/dist/cli.js" \
        -p gemini \
        --session-dir "$SESSION_DIR" \
        --deep-think \
        -o json \
        "$TEST_FILE" > "$SESSION_DIR/gemini-result.json" 2>&1; then

        if grep -q '"provider"' "$SESSION_DIR/gemini-result.json"; then
            log_success "Gemini browser review completed"
            log_info "Result saved to: $SESSION_DIR/gemini-result.json"

            echo "  Issues found: $(grep -c '"severity"' "$SESSION_DIR/gemini-result.json" || echo 0)"
        else
            log_warn "Gemini returned but output may not be valid JSON"
            cat "$SESSION_DIR/gemini-result.json"
        fi
    else
        log_error "Gemini browser review failed"
        cat "$SESSION_DIR/gemini-result.json" 2>/dev/null || true
        return 1
    fi
}

# Test 4: Session Lock
test_session_lock() {
    log_step "Test 4: Session Lock"

    # Check if lock file exists from previous test
    CHATGPT_LOCK="$SESSION_DIR/bridge.lock"
    GEMINI_LOCK="$SESSION_DIR/gemini-browser.lock"

    if [ -f "$CHATGPT_LOCK" ]; then
        log_warn "ChatGPT lock file exists (should be cleaned up): $CHATGPT_LOCK"
        rm -f "$CHATGPT_LOCK"
    else
        log_success "ChatGPT lock properly released"
    fi

    if [ -f "$GEMINI_LOCK" ]; then
        log_warn "Gemini lock file exists (should be cleaned up): $GEMINI_LOCK"
        rm -f "$GEMINI_LOCK"
    else
        log_success "Gemini lock properly released"
    fi
}

# Test 5: Session Persistence
test_session_persistence() {
    log_step "Test 5: Session Persistence Check"

    CHATGPT_PROFILE="$SESSION_DIR/chrome-profile"
    GEMINI_PROFILE="$SESSION_DIR/gemini-chrome-profile"

    if [ -d "$CHATGPT_PROFILE" ]; then
        log_success "ChatGPT Chrome profile persisted: $CHATGPT_PROFILE"
        echo "  Size: $(du -sh "$CHATGPT_PROFILE" | cut -f1)"
    else
        log_warn "ChatGPT Chrome profile not found (first run?)"
    fi

    if [ -d "$GEMINI_PROFILE" ]; then
        log_success "Gemini Chrome profile persisted: $GEMINI_PROFILE"
        echo "  Size: $(du -sh "$GEMINI_PROFILE" | cut -f1)"
    else
        log_warn "Gemini Chrome profile not found (first run?)"
    fi
}

# Test 6: Consensus Mode (Both Providers)
test_consensus() {
    log_step "Test 6: Consensus Mode (Both Providers)"

    log_info "This will run BOTH ChatGPT and Gemini"
    log_info "Two browser windows may open"
    log_warn "Press Ctrl+C to skip this test"

    echo -n "Starting in 5 seconds... "
    sleep 5
    echo "GO"

    export GEMINI_MODE=browser

    if node "$PROJECT_DIR/dist/cli.js" \
        --session-dir "$SESSION_DIR" \
        --min-agreement 0.5 \
        -o text \
        "$TEST_FILE" > "$SESSION_DIR/consensus-result.txt" 2>&1; then

        if grep -q "CODE REVIEW CONSENSUS" "$SESSION_DIR/consensus-result.txt"; then
            log_success "Consensus review completed"
            log_info "Result saved to: $SESSION_DIR/consensus-result.txt"

            echo ""
            echo "--- Consensus Summary ---"
            grep -A 10 "CODE REVIEW CONSENSUS" "$SESSION_DIR/consensus-result.txt" | head -15
            echo "-------------------------"
        else
            log_warn "Consensus output format unexpected"
            cat "$SESSION_DIR/consensus-result.txt"
        fi
    else
        log_error "Consensus review failed"
        cat "$SESSION_DIR/consensus-result.txt" 2>/dev/null || true
        return 1
    fi
}

# Test 7: Debug Snapshots
test_debug_snapshots() {
    log_step "Test 7: Debug Snapshots"

    SNAPSHOT_DIR="$SESSION_DIR/snapshots"

    if [ -d "$SNAPSHOT_DIR" ] && [ "$(ls -A "$SNAPSHOT_DIR" 2>/dev/null)" ]; then
        log_success "Debug snapshots created: $SNAPSHOT_DIR"
        ls -la "$SNAPSHOT_DIR"
    else
        log_info "No debug snapshots (tests passed without errors)"
    fi
}

# Summary
print_summary() {
    log_step "Validation Summary"

    echo "Session Directory: $SESSION_DIR"
    echo ""
    echo "Output Files:"
    ls -la "$SESSION_DIR"/*.json "$SESSION_DIR"/*.txt 2>/dev/null || echo "  (none)"
    echo ""
    echo "Chrome Profiles:"
    du -sh "$SESSION_DIR"/*-profile 2>/dev/null || echo "  (none)"
}

# Interactive menu
run_interactive() {
    echo ""
    echo "Pro Bridge Validation Script"
    echo "============================"
    echo ""
    echo "Select tests to run:"
    echo "  1) All tests (recommended for first run)"
    echo "  2) ChatGPT only"
    echo "  3) Gemini only"
    echo "  4) Consensus (both)"
    echo "  5) Quick checks (no browser)"
    echo "  q) Quit"
    echo ""
    read -p "Choice [1-5, q]: " choice

    case $choice in
        1)
            check_prerequisites
            create_test_file
            test_cli_help
            test_chatgpt_browser
            test_gemini_browser
            test_session_lock
            test_session_persistence
            test_consensus
            test_debug_snapshots
            print_summary
            ;;
        2)
            check_prerequisites
            create_test_file
            test_chatgpt_browser
            test_session_lock
            print_summary
            ;;
        3)
            check_prerequisites
            create_test_file
            test_gemini_browser
            test_session_lock
            print_summary
            ;;
        4)
            check_prerequisites
            create_test_file
            test_consensus
            print_summary
            ;;
        5)
            check_prerequisites
            create_test_file
            test_cli_help
            test_session_lock
            test_session_persistence
            ;;
        q|Q)
            echo "Exiting."
            exit 0
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Main
if [ "$1" == "--all" ]; then
    check_prerequisites
    create_test_file
    test_cli_help
    test_chatgpt_browser
    test_gemini_browser
    test_session_lock
    test_session_persistence
    test_consensus
    test_debug_snapshots
    print_summary
elif [ "$1" == "--quick" ]; then
    check_prerequisites
    create_test_file
    test_cli_help
    test_session_lock
    test_session_persistence
else
    run_interactive
fi

log_step "Validation Complete"
