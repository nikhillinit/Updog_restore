#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <REVERT_MAIN_SHA> <RELEASE_RUN_ID>" >&2
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

EXPECTED_SHA=$1
RELEASE_RUN_ID=$2

[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] ||
  fail "REVERT_MAIN_SHA must be an exact 40-character lowercase commit SHA."
[[ "$RELEASE_RUN_ID" =~ ^[1-9][0-9]*$ ]] ||
  fail "RELEASE_RUN_ID must be a positive integer."
command -v gh >/dev/null 2>&1 || fail "GitHub CLI (gh) is required."

if ! REPOSITORY="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"; then
  fail "Could not resolve current GitHub repository."
fi
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] ||
  fail "GitHub CLI returned an invalid repository name."

if ! LIVE_MAIN="$(gh api "repos/${REPOSITORY}/commits/main" --jq '.sha')"; then
  fail "Could not resolve live main SHA."
fi
[[ "$LIVE_MAIN" =~ ^[0-9a-f]{40}$ ]] ||
  fail "GitHub returned an invalid live main SHA."
[[ "$LIVE_MAIN" == "$EXPECTED_SHA" ]] ||
  fail "Live main ${LIVE_MAIN} does not equal revert release target ${EXPECTED_SHA}."

if ! RUN="$(
  gh api "repos/${REPOSITORY}/actions/runs/${RELEASE_RUN_ID}" \
    --jq '[.name, .path, .event, .head_branch, .head_sha, .status, .conclusion, .html_url] | @tsv'
)"; then
  fail "Could not load Release Production run ${RELEASE_RUN_ID}."
fi

IFS=$'\t' read -r \
  RUN_NAME \
  RUN_PATH \
  RUN_EVENT \
  RUN_BRANCH \
  RUN_SHA \
  RUN_STATUS \
  RUN_CONCLUSION \
  RUN_URL <<<"$RUN"

[[ "$RUN_NAME" == "Release Production" ]] ||
  fail "Run ${RELEASE_RUN_ID} is not Release Production."
[[ "$RUN_PATH" == ".github/workflows/release-production.yml" ]] ||
  fail "Run ${RELEASE_RUN_ID} used unexpected workflow path ${RUN_PATH}."
[[ "$RUN_EVENT" == "workflow_dispatch" && "$RUN_BRANCH" == "main" ]] ||
  fail "Release run must be a workflow_dispatch from main."
[[ "$RUN_SHA" == "$EXPECTED_SHA" ]] ||
  fail "Release run SHA ${RUN_SHA} does not equal ${EXPECTED_SHA}."
[[ "$RUN_STATUS" == "completed" && "$RUN_CONCLUSION" == "success" ]] ||
  fail "Release run is ${RUN_STATUS}/${RUN_CONCLUSION}, not completed/success."
[[ "$RUN_URL" == https://github.com/*/actions/runs/"${RELEASE_RUN_ID}" ]] ||
  fail "Release run returned an invalid evidence URL."

if ! JOBS="$(
  gh api "repos/${REPOSITORY}/actions/runs/${RELEASE_RUN_ID}/jobs?per_page=100" \
    --jq '
      if .total_count > 100 then
        error("Release run has more than 100 jobs; refusing incomplete evidence.")
      else
        .jobs[] | [.name, .status, .conclusion, .html_url] | @tsv
      end
    '
)"; then
  fail "Could not load jobs for Release Production run ${RELEASE_RUN_ID}."
fi

require_successful_job() {
  local expected_name=$1
  local matches=0
  local job_name job_status job_conclusion job_url

  while IFS=$'\t' read -r job_name job_status job_conclusion job_url; do
    if [[ "$job_name" == "$expected_name" ]]; then
      matches=$((matches + 1))
      [[ "$job_status" == "completed" && "$job_conclusion" == "success" ]] ||
        fail "${expected_name} is ${job_status}/${job_conclusion}, not completed/success."
      [[ "$job_url" == https://github.com/*/actions/runs/"${RELEASE_RUN_ID}"/job/* ]] ||
        fail "${expected_name} returned an invalid evidence URL."
    fi
  done <<<"$JOBS"

  [[ "$matches" -eq 1 ]] ||
    fail "Expected exactly one successful ${expected_name} job; found ${matches}."
}

require_successful_job "Validate Staged Deployment Identity"
require_successful_job "Authenticated Staged Production Smoke"
require_successful_job "Promote Staged Vercel Deployment"
require_successful_job "Authenticated Post-promotion Smoke"

echo "PASS: live main equals revert release target ${EXPECTED_SHA}."
echo "PASS: Release Production ${RELEASE_RUN_ID} completed successfully for exact SHA."
echo "PASS: staged identity, authenticated staged smoke, promotion, and post-promotion smoke succeeded."
echo "Evidence: ${RUN_URL}"
