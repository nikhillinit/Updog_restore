#!/usr/bin/env bash
set -euo pipefail

# baseline-check.sh (v4 optimal)
#
# Purpose:
#   Enforce "ratcheting" quality gates by comparing current metrics against committed baselines.
#
# Metrics:
#   - Test pass rate (basis points)  -> .baselines/tests.json
#   - TypeScript error count         -> .baselines/typescript.json
#   - ESLint warnings/errors counts  -> .baselines/eslint.json
#   - Build output size (bytes)      -> .baselines/bundle.json
#
# Usage:
#   ./scripts/baseline-check.sh
#   ./scripts/baseline-check.sh --update all "Initial baseline"
#   ./scripts/baseline-check.sh --update tests "After adding new tests"
#
# Env:
#   USE_EMOJI      (default: true)  - set to 'false' in CI for ASCII output
#   TEST_REPORTER  (auto|vitest|jest) (default: auto)
#   TYPECHECK_NPM_SCRIPT (auto|check|type-check|...) (default: auto)
#   LINT_NPM_SCRIPT (default: lint)
#   BUILD_NPM_SCRIPT (default: build)
#   BUILD_DIR (default: dist)
#   VERBOSE (default: false)

USE_EMOJI="${USE_EMOJI:-true}"
TEST_REPORTER="${TEST_REPORTER:-auto}"
TYPECHECK_NPM_SCRIPT="${TYPECHECK_NPM_SCRIPT:-auto}"
LINT_NPM_SCRIPT="${LINT_NPM_SCRIPT:-lint}"
BUILD_NPM_SCRIPT="${BUILD_NPM_SCRIPT:-build}"
BUILD_DIR="${BUILD_DIR:-dist}"
VERBOSE="${VERBOSE:-false}"

BASELINE_DIR="${BASELINE_DIR:-.baselines}"
TEST_BASELINE="${TEST_BASELINE:-${BASELINE_DIR}/tests.json}"
TS_BASELINE="${TS_BASELINE:-${BASELINE_DIR}/typescript.json}"
ESLINT_BASELINE="${ESLINT_BASELINE:-${BASELINE_DIR}/eslint.json}"
BUNDLE_BASELINE="${BUNDLE_BASELINE:-${BASELINE_DIR}/bundle.json}"

# ---------- UI helpers ----------
_use_emoji() {
  case "${USE_EMOJI,,}" in
    false|0|no) return 1 ;;
    *) return 0 ;;
  esac
}

if _use_emoji; then
  OK_PREFIX="[OK]"
  WARN_PREFIX="[WARN]"
  ERR_PREFIX="[ERROR]"
  INFO_PREFIX="[INFO]"
else
  OK_PREFIX="OK"
  WARN_PREFIX="WARN"
  ERR_PREFIX="ERROR"
  INFO_PREFIX="INFO"
fi

log_ok()   { echo "${OK_PREFIX} $*"; }
log_warn() { echo "${WARN_PREFIX} $*"; }
log_err()  { echo "${ERR_PREFIX} $*" >&2; }
log_info() { echo "${INFO_PREFIX} $*"; }

die() { log_err "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

maybe_debug_tail() {
  local file="$1"
  local lines="${2:-80}"
  if [[ "${VERBOSE,,}" == "true" ]]; then
    echo "----- tail ${lines}: ${file} -----"
    tail -n "${lines}" "${file}" || true
    echo "----------------------------------"
  fi
}

# ---------- Standard Failure Block (for subagent handoff) ----------
emit_failure_block() {
  local title="$1"
  local summary="$2"
  local cause="$3"
  local next_step="$4"
  local subagent="${5:-}"

  cat <<EOF

===============================================================================
VALIDATION FAILED: ${title}
===============================================================================
SUMMARY: ${summary}
PROBABLE_CAUSE: ${cause}
EOF
  if [[ -n "${subagent}" ]]; then
    echo "INVOKE_SUBAGENT: ${subagent}"
  fi
  cat <<EOF
NEXT_STEP: ${next_step}
===============================================================================

EOF
}

# ---------- formatting ----------
# Basis points: integer where 10000 = 100.00%
bp_to_percent() {
  local bp="$1"
  printf "%d.%02d" "$((bp/100))" "$((bp%100))"
}

utc_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# ---------- CLI ----------
usage() {
  cat <<'USAGE'
Usage:
  ./scripts/baseline-check.sh
  ./scripts/baseline-check.sh --update <tests|typescript|eslint|bundle|all> ["reason"]

Examples:
  ./scripts/baseline-check.sh
  ./scripts/baseline-check.sh --update all "Initial baseline"
  ./scripts/baseline-check.sh --update tests "After adding new tests"

Env vars:
  USE_EMOJI=false
  TEST_REPORTER=auto|vitest|jest
  TYPECHECK_NPM_SCRIPT=auto|check|type-check|...
  LINT_NPM_SCRIPT=lint
  BUILD_NPM_SCRIPT=build
  BUILD_DIR=dist
USAGE
}

UPDATE_MODE="false"
TARGET="all"
REASON=""

if [[ $# -gt 0 ]]; then
  case "${1:-}" in
    -h|--help)
      usage; exit 0;;
    --update)
      UPDATE_MODE="true"
      TARGET="${2:-all}"
      REASON="${3:-}"
      ;;
    *)
      die "Unknown argument: $1 (use --help)"
      ;;
  esac
fi

# ---------- temp workspace ----------
TMP_DIR="$(mktemp -d -t baseline-check.XXXXXX)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

mkdir -p "${BASELINE_DIR}"

require_cmd npm
require_cmd jq
require_cmd node

# ---------- detection ----------
detect_test_reporter() {
  if [[ "${TEST_REPORTER}" != "auto" ]]; then
    echo "${TEST_REPORTER}"
    return
  fi

  local test_script
  test_script="$(node -p "try{require('./package.json').scripts?.test||''}catch(e){''}" 2>/dev/null || true)"
  if echo "${test_script}" | grep -qi "vitest"; then
    echo "vitest"
    return
  fi
  if echo "${test_script}" | grep -qi "jest"; then
    echo "jest"
    return
  fi

  # Heuristic fallback: check installed bins
  if [[ -x "./node_modules/.bin/vitest" ]]; then echo "vitest"; return; fi
  if [[ -x "./node_modules/.bin/jest" ]]; then echo "jest"; return; fi

  # Default to vitest if unknown (modern default), but allow override via TEST_REPORTER
  echo "vitest"
}

detect_typecheck_script() {
  if [[ "${TYPECHECK_NPM_SCRIPT}" != "auto" ]]; then
    echo "${TYPECHECK_NPM_SCRIPT}"
    return
  fi

  local scripts
  scripts="$(node -p "try{Object.keys(require('./package.json').scripts||{}).join(' ')}catch(e){''}" 2>/dev/null || true)"

  for candidate in check type-check typecheck; do
    if echo " ${scripts} " | grep -q " ${candidate} "; then
      echo "${candidate}"
      return
    fi
  done

  echo ""
}

# ---------- tests ----------
TEST_REPORT="${TMP_DIR}/test-report.json"
TEST_STDOUT="${TMP_DIR}/test-output.txt"
TEST_EXIT=0

run_tests_once() {
  local reporter
  reporter="$(detect_test_reporter)"
  log_info "Running tests (reporter=${reporter})..."

  set +e
  if [[ "${reporter}" == "vitest" ]]; then
    # Vitest: ensure non-watch mode and emit JSON report to file
    npm test -- --run --reporter=json --outputFile="${TEST_REPORT}" >"${TEST_STDOUT}" 2>&1
  elif [[ "${reporter}" == "jest" ]]; then
    npm test -- --json --outputFile="${TEST_REPORT}" >"${TEST_STDOUT}" 2>&1
  else
    echo "Unsupported TEST_REPORTER: ${reporter}" >"${TEST_STDOUT}"
    TEST_EXIT=2
    set -e
    return 2
  fi
  TEST_EXIT=$?
  set -e

  if [[ ! -s "${TEST_REPORT}" ]]; then
    log_err "Test report was not generated at ${TEST_REPORT}."
    maybe_debug_tail "${TEST_STDOUT}" 120
    return 2
  fi

  return 0
}

tests_counts() {
  local report="$1"
  local total passed
  total="$(jq -r '
    if has("numTotalTests") then .numTotalTests
    elif has("testResults") then ([.testResults[]?.assertionResults[]?] | length)
    else 0 end
  ' "${report}")"
  passed="$(jq -r '
    if has("numPassedTests") then .numPassedTests
    elif has("testResults") then ([.testResults[]?.assertionResults[]? | select(.status=="passed")] | length)
    else 0 end
  ' "${report}")"
  echo "${passed}:${total}"
}

tests_failures() {
  local report="$1"
  jq -r '
    if has("testResults") then
      .testResults[]? | .name as $file |
      (.assertionResults[]? | select(.status=="failed") |
        "- \($file): \(.fullName // (
              ((.ancestorTitles // [])|join(" ")) +
              (if ((.ancestorTitles // [])|length)>0 then " " else "" end) +
              (.title // "")
            ) // (.title // "unknown test")
        )")
    else empty end
  ' "${report}" | sed '/^-\s*$/d'
}

write_tests_baseline() {
  local reason="$1"
  local passed_total
  passed_total="$(tests_counts "${TEST_REPORT}")"
  local passed="${passed_total%%:*}"
  local total="${passed_total##*:}"

  if [[ "${total}" -eq 0 ]]; then
    die "Cannot write tests baseline: total tests = 0 (report schema mismatch?)"
  fi

  local bp=$(( passed * 10000 / total ))

  jq -n \
    --arg updated_at "$(utc_now)" \
    --arg reason "${reason}" \
    --argjson passed "${passed}" \
    --argjson total "${total}" \
    --argjson pass_rate_bp "${bp}" \
    '{updated_at:$updated_at, reason:$reason, passed:$passed, total:$total, pass_rate_bp:$pass_rate_bp}' \
    > "${TEST_BASELINE}"

  log_ok "Updated ${TEST_BASELINE} (pass_rate=$(bp_to_percent "${bp}")%)"
}

check_tests_baseline() {
  [[ -f "${TEST_BASELINE}" ]] || die "Missing baseline file ${TEST_BASELINE}. Run: ./scripts/baseline-check.sh --update tests \"<reason>\""

  local passed_total
  passed_total="$(tests_counts "${TEST_REPORT}")"
  local passed="${passed_total%%:*}"
  local total="${passed_total##*:}"

  if [[ "${total}" -eq 0 ]]; then
    log_err "Test report schema mismatch: total tests parsed as 0."
    maybe_debug_tail "${TEST_STDOUT}" 120
    return 1
  fi

  local current_bp=$(( passed * 10000 / total ))
  local baseline_bp
  baseline_bp="$(jq -r '.pass_rate_bp' "${TEST_BASELINE}")"

  if [[ "${current_bp}" -lt "${baseline_bp}" ]]; then
    log_err "Test pass rate regressed: $(bp_to_percent "${current_bp}")% < $(bp_to_percent "${baseline_bp}")%."
    echo ""
    echo "Failed tests:"
    tests_failures "${TEST_REPORT}" | head -20
    maybe_debug_tail "${TEST_STDOUT}" 80
    return 1
  fi

  if [[ "${current_bp}" -gt "${baseline_bp}" ]]; then
    log_ok "Test pass rate improved: $(bp_to_percent "${current_bp}")% > $(bp_to_percent "${baseline_bp}")%."
  else
    log_ok "Test pass rate unchanged: $(bp_to_percent "${current_bp}")%."
  fi

  return 0
}

# ---------- TypeScript ----------
TYPECHECK_LOG="${TMP_DIR}/typecheck.log"

run_typecheck() {
  local script
  script="$(detect_typecheck_script)"
  if [[ -z "${script}" ]]; then
    log_warn "No typecheck script found (check/type-check/typecheck). Skipping TypeScript check."
    echo "0:0"
    return
  fi

  log_info "Running typecheck (npm run ${script})..."
  set +e
  npm run -s "${script}" >"${TYPECHECK_LOG}" 2>&1
  local exit_code=$?
  set -e

  local count
  count="$(grep -c 'error TS' "${TYPECHECK_LOG}" || echo 0)"
  echo "${exit_code}:${count}"
}

write_ts_baseline() {
  local reason="$1"
  local result
  result="$(run_typecheck)"
  local exit_code="${result%%:*}"
  local count="${result##*:}"

  # If typecheck failed but we found zero TS errors, surface output; likely script error.
  if [[ "${exit_code}" -ne 0 && "${count}" -eq 0 ]]; then
    log_err "Typecheck failed but no 'error TS' lines found--check the typecheck script."
    maybe_debug_tail "${TYPECHECK_LOG}" 120
    die "Cannot update TypeScript baseline."
  fi

  jq -n \
    --arg updated_at "$(utc_now)" \
    --arg reason "${reason}" \
    --argjson error_count "${count}" \
    '{updated_at:$updated_at, reason:$reason, error_count:$error_count}' \
    > "${TS_BASELINE}"

  log_ok "Updated ${TS_BASELINE} (error_count=${count})"
}

check_ts_baseline() {
  [[ -f "${TS_BASELINE}" ]] || die "Missing baseline file ${TS_BASELINE}. Run: ./scripts/baseline-check.sh --update typescript \"<reason>\""

  local baseline
  baseline="$(jq -r '.error_count' "${TS_BASELINE}")"

  local result
  result="$(run_typecheck)"
  local exit_code="${result%%:*}"
  local count="${result##*:}"

  if [[ "${exit_code}" -ne 0 && "${count}" -eq 0 ]]; then
    log_err "Typecheck failed but no TS errors were counted. Likely a script/runtime issue."
    maybe_debug_tail "${TYPECHECK_LOG}" 120
    return 1
  fi

  if [[ "${count}" -gt "${baseline}" ]]; then
    log_err "TypeScript errors increased: ${count} > ${baseline}."
    maybe_debug_tail "${TYPECHECK_LOG}" 120
    return 1
  fi

  if [[ "${count}" -lt "${baseline}" ]]; then
    log_ok "TypeScript errors decreased: ${count} < ${baseline}."
  else
    log_ok "TypeScript errors unchanged: ${count}."
  fi

  return 0
}

# ---------- ESLint ----------
ESLINT_REPORT="${TMP_DIR}/eslint-report.json"
ESLINT_STDERR="${TMP_DIR}/eslint-stderr.log"

run_eslint_json() {
  log_info "Running ESLint (npm run ${LINT_NPM_SCRIPT} -- --format json)..."
  set +e
  npm run -s "${LINT_NPM_SCRIPT}" -- --format json >"${ESLINT_REPORT}" 2>"${ESLINT_STDERR}"
  local exit_code=$?
  set -e

  if [[ ! -s "${ESLINT_REPORT}" ]]; then
    log_err "ESLint did not produce JSON output at ${ESLINT_REPORT}."
    maybe_debug_tail "${ESLINT_STDERR}" 120
    return 2
  fi

  # Return exit code too (lint may exit nonzero on warnings if configured)
  echo "${exit_code}"
}

eslint_counts() {
  local report="$1"
  local warnings errors
  warnings="$(jq '[.[].warningCount] | add // 0' "${report}")"
  errors="$(jq '[.[].errorCount] | add // 0' "${report}")"
  echo "${warnings}:${errors}"
}

write_eslint_baseline() {
  local reason="$1"
  run_eslint_json >/dev/null || true

  local counts
  counts="$(eslint_counts "${ESLINT_REPORT}")"
  local warnings="${counts%%:*}"
  local errors="${counts##*:}"

  jq -n \
    --arg updated_at "$(utc_now)" \
    --arg reason "${reason}" \
    --argjson warning_count "${warnings}" \
    --argjson error_count "${errors}" \
    '{updated_at:$updated_at, reason:$reason, warning_count:$warning_count, error_count:$error_count}' \
    > "${ESLINT_BASELINE}"

  log_ok "Updated ${ESLINT_BASELINE} (warnings=${warnings}, errors=${errors})"
}

check_eslint_baseline() {
  [[ -f "${ESLINT_BASELINE}" ]] || die "Missing baseline file ${ESLINT_BASELINE}. Run: ./scripts/baseline-check.sh --update eslint \"<reason>\""

  local baseline_w baseline_e
  baseline_w="$(jq -r '.warning_count' "${ESLINT_BASELINE}")"
  baseline_e="$(jq -r '.error_count' "${ESLINT_BASELINE}")"

  run_eslint_json >/dev/null || true

  local counts
  counts="$(eslint_counts "${ESLINT_REPORT}")"
  local warnings="${counts%%:*}"
  local errors="${counts##*:}"

  local failed="false"
  if [[ "${warnings}" -gt "${baseline_w}" ]]; then
    log_err "ESLint warnings increased: ${warnings} > ${baseline_w}."
    failed="true"
  fi
  if [[ "${errors}" -gt "${baseline_e}" ]]; then
    log_err "ESLint errors increased: ${errors} > ${baseline_e}."
    failed="true"
  fi
  if [[ "${failed}" == "true" ]]; then
    maybe_debug_tail "${ESLINT_STDERR}" 120
    return 1
  fi

  if [[ "${warnings}" -lt "${baseline_w}" || "${errors}" -lt "${baseline_e}" ]]; then
    log_ok "ESLint improved: warnings ${warnings} (baseline ${baseline_w}), errors ${errors} (baseline ${baseline_e})."
  else
    log_ok "ESLint unchanged: warnings ${warnings}, errors ${errors}."
  fi

  return 0
}

# ---------- Bundle size ----------
BUILD_LOG="${TMP_DIR}/build.log"

dir_size_bytes() {
  node -e '
    const fs = require("fs");
    const path = require("path");
    function size(p){
      const st = fs.statSync(p);
      if(st.isFile()) return st.size;
      if(st.isDirectory()){
        let total = 0;
        for(const entry of fs.readdirSync(p)){
          total += size(path.join(p, entry));
        }
        return total;
      }
      return 0;
    }
    console.log(size(process.argv[1]));
  ' "$1"
}

run_build() {
  log_info "Running build (npm run ${BUILD_NPM_SCRIPT})..."
  set +e
  npm run -s "${BUILD_NPM_SCRIPT}" >"${BUILD_LOG}" 2>&1
  local exit_code=$?
  set -e

  if [[ "${exit_code}" -ne 0 ]]; then
    log_err "Build failed (exit=${exit_code})."
    maybe_debug_tail "${BUILD_LOG}" 120
    return 2
  fi

  if [[ ! -d "${BUILD_DIR}" ]]; then
    log_err "Build output directory '${BUILD_DIR}' not found."
    maybe_debug_tail "${BUILD_LOG}" 120
    return 2
  fi

  local size
  size="$(dir_size_bytes "${BUILD_DIR}")"
  if [[ "${size}" -le 0 ]]; then
    log_err "Build output size is ${size} bytes (expected > 0)."
    return 2
  fi

  echo "${size}"
}

write_bundle_baseline() {
  local reason="$1"
  local size
  size="$(run_build)"

  jq -n \
    --arg updated_at "$(utc_now)" \
    --arg reason "${reason}" \
    --argjson size_bytes "${size}" \
    '{updated_at:$updated_at, reason:$reason, size_bytes:$size_bytes}' \
    > "${BUNDLE_BASELINE}"

  log_ok "Updated ${BUNDLE_BASELINE} (size_bytes=${size})"
}

check_bundle_baseline() {
  [[ -f "${BUNDLE_BASELINE}" ]] || die "Missing baseline file ${BUNDLE_BASELINE}. Run: ./scripts/baseline-check.sh --update bundle \"<reason>\""

  local baseline
  baseline="$(jq -r '.size_bytes' "${BUNDLE_BASELINE}")"

  local size
  size="$(run_build)"

  if [[ "${size}" -gt "${baseline}" ]]; then
    log_err "Bundle size increased: ${size} > ${baseline} bytes."
    return 1
  fi

  if [[ "${size}" -lt "${baseline}" ]]; then
    log_ok "Bundle size decreased: ${size} < ${baseline} bytes."
  else
    log_ok "Bundle size unchanged: ${size} bytes."
  fi

  return 0
}

# ---------- main ----------
REGRESSION_FOUND=0

run_targets_update() {
  local reason="$1"
  [[ -n "${reason}" ]] || reason="baseline update"

  run_tests_once || true
  case "${TARGET}" in
    all)
      write_tests_baseline "${reason}"
      write_ts_baseline "${reason}"
      write_eslint_baseline "${reason}"
      write_bundle_baseline "${reason}"
      ;;
    tests)
      write_tests_baseline "${reason}"
      ;;
    typescript)
      write_ts_baseline "${reason}"
      ;;
    eslint)
      write_eslint_baseline "${reason}"
      ;;
    bundle)
      write_bundle_baseline "${reason}"
      ;;
    *)
      die "Unknown update target: ${TARGET}"
      ;;
  esac
}

run_targets_check() {
  run_tests_once || true
  case "${TARGET}" in
    all)
      check_tests_baseline || REGRESSION_FOUND=1
      check_ts_baseline || REGRESSION_FOUND=1
      check_eslint_baseline || REGRESSION_FOUND=1
      check_bundle_baseline || REGRESSION_FOUND=1
      ;;
    tests)
      check_tests_baseline || REGRESSION_FOUND=1
      ;;
    typescript)
      check_ts_baseline || REGRESSION_FOUND=1
      ;;
    eslint)
      check_eslint_baseline || REGRESSION_FOUND=1
      ;;
    bundle)
      check_bundle_baseline || REGRESSION_FOUND=1
      ;;
    *)
      die "Unknown check target: ${TARGET}"
      ;;
  esac
}

if [[ "${UPDATE_MODE}" == "true" ]]; then
  run_targets_update "${REASON}"
  log_ok "Baselines updated. Commit ${BASELINE_DIR}/ to apply ratchet."
  exit 0
fi

run_targets_check

if [[ "${REGRESSION_FOUND}" -ne 0 ]]; then
  emit_failure_block \
    "Baseline Regression" \
    "One or more quality metrics regressed beyond threshold" \
    "Recent code changes degraded test pass rate, type safety, lint compliance, or bundle size" \
    "./scripts/baseline-check.sh --update <metric> \"Reason\" (after review)" \
    "baseline-regression-explainer"
  die "Baseline check failed: one or more metrics regressed."
fi

log_ok "All baseline checks passed."
exit 0
