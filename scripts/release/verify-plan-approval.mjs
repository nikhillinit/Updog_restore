import console from 'node:console';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';

const APPROVAL_MARKER = 'PLAN-APPROVAL-V2';
const REVIEW_MARKER = 'PLAN-REVIEW-V2';
const APPROVED_PERMISSIONS = new Set(['admin', 'maintain', 'write']);
const GITHUB_ACTIONS_APP = Object.freeze({
  name: 'GitHub Actions',
  ownerLogin: 'github',
  slug: 'github-actions',
});
const REVIEWER_KIND = 'independent-read-only-agent';
const SEPARATION_MODEL = 'single-maintainer-owner-attestation';
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const MAX_COMMENT_PAGES = 1_000;
const COMMENTS_PER_PAGE = 100;
const MAX_ACTION_PAGES = 1_000;
const ACTIONS_PER_PAGE = 100;
const CI_WORKFLOW_PATH = 'ci-unified.yml';
const CI_GATE_JOB_NAME = 'CI Gate Status';
const execFileAsync = promisify(execFile);

const REVIEW_FIELDS = Object.freeze([
  'plan_path',
  'plan_sha256',
  'reviewed_head_sha',
  'reviewer_kind',
  'review_verdict',
  'ci_gate_check_run_id',
  'blocking_findings',
]);

const APPROVAL_FIELDS = Object.freeze([
  'plan_path',
  'plan_sha256',
  'approved_base_head_sha',
  'approver_login',
  'review_comment_id',
  'review_body_sha256',
  'ci_gate_check_run_id',
  'separation_model',
  'decision',
  'accepted_exceptions',
]);

function fail(message) {
  throw new Error(`Plan approval verification failed: ${message}`);
}

function requireSafeString(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    fail(`${label} must be one non-empty trimmed line`);
  }
  return value;
}

function requirePlanPath(value) {
  const planPath = requireSafeString(value, 'plan path');
  if (
    path.posix.isAbsolute(planPath) ||
    planPath.includes('\\') ||
    planPath.includes(':') ||
    planPath === '.' ||
    planPath.startsWith('../') ||
    planPath.includes('/../') ||
    path.posix.normalize(planPath) !== planPath
  ) {
    fail('plan path must be a normalized repository-relative POSIX path');
  }
  return planPath;
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    fail(`${label} must be a lowercase 40-character SHA`);
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label} must be a lowercase 64-character SHA-256`);
  }
  return value;
}

function requireLogin(value, label) {
  if (typeof value !== 'string' || !LOGIN.test(value)) fail(`${label} is invalid`);
  return value;
}

function requirePositiveInteger(value, label) {
  const number = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number <= 0) fail(`${label} must be a positive integer`);
  return number;
}

function requireNonNegativeInteger(value, label) {
  const number = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) fail(`${label} must be a non-negative integer`);
  return number;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sameLogin(left, right) {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function parseFixedBody(body, marker, fields) {
  if (typeof body !== 'string') return null;
  const trimmedBody = body.trim();
  const lines = trimmedBody.split('\n');
  if (lines.length !== fields.length + 1 || lines[0] !== marker) return null;

  const parsed = {};
  for (let index = 0; index < fields.length; index += 1) {
    const prefix = `${fields[index]}: `;
    const line = lines[index + 1];
    if (!line.startsWith(prefix) || line.length === prefix.length) return null;
    parsed[fields[index]] = line.slice(prefix.length);
  }
  return { fields: parsed, trimmedBody };
}

export function buildPlanReviewBody({ planPath, planSha256, reviewedHeadSha, ciGateCheckRunId }) {
  return [
    REVIEW_MARKER,
    `plan_path: ${requirePlanPath(planPath)}`,
    `plan_sha256: ${requireSha256(planSha256, 'plan SHA-256')}`,
    `reviewed_head_sha: ${requireSha(reviewedHeadSha, 'reviewed head SHA')}`,
    `reviewer_kind: ${REVIEWER_KIND}`,
    'review_verdict: approved',
    `ci_gate_check_run_id: ${requirePositiveInteger(ciGateCheckRunId, 'CI gate check-run ID')}`,
    'blocking_findings: none',
  ].join('\n');
}

export function buildPlanApprovalBody({
  planPath,
  planSha256,
  approvedBaseHeadSha,
  approverLogin,
  reviewCommentId,
  reviewBodySha256,
  ciGateCheckRunId,
  separationModel,
}) {
  if (separationModel !== SEPARATION_MODEL) fail('separation model is invalid');
  return [
    APPROVAL_MARKER,
    `plan_path: ${requirePlanPath(planPath)}`,
    `plan_sha256: ${requireSha256(planSha256, 'plan SHA-256')}`,
    `approved_base_head_sha: ${requireSha(approvedBaseHeadSha, 'approved base head SHA')}`,
    `approver_login: ${requireLogin(approverLogin, 'approver login')}`,
    `review_comment_id: ${requirePositiveInteger(reviewCommentId, 'review comment ID')}`,
    `review_body_sha256: ${requireSha256(reviewBodySha256, 'review body SHA-256')}`,
    `ci_gate_check_run_id: ${requirePositiveInteger(ciGateCheckRunId, 'CI gate check-run ID')}`,
    `separation_model: ${SEPARATION_MODEL}`,
    'decision: approved',
    'accepted_exceptions: none',
  ].join('\n');
}

function parseApplicableReview(comment, expected) {
  const parsed = parseFixedBody(comment?.body, REVIEW_MARKER, REVIEW_FIELDS);
  if (!parsed) return null;
  const fields = parsed.fields;
  if (fields.plan_path !== expected.planPath || fields.plan_sha256 !== expected.planSha256)
    return null;

  const expectedBody = buildPlanReviewBody({
    planPath: fields.plan_path,
    planSha256: fields.plan_sha256,
    reviewedHeadSha: fields.reviewed_head_sha,
    ciGateCheckRunId: fields.ci_gate_check_run_id,
  });
  if (parsed.trimmedBody !== expectedBody) return null;
  return {
    body: parsed.trimmedBody,
    checkRunId: requirePositiveInteger(fields.ci_gate_check_run_id, 'review CI gate check-run ID'),
    comment,
    headSha: requireSha(fields.reviewed_head_sha, 'reviewed head SHA'),
  };
}

function parseApplicableApproval(comment, expected) {
  const parsed = parseFixedBody(comment?.body, APPROVAL_MARKER, APPROVAL_FIELDS);
  if (!parsed) return null;
  const fields = parsed.fields;
  if (
    fields.plan_path !== expected.planPath ||
    fields.plan_sha256 !== expected.planSha256 ||
    fields.approver_login !== expected.approverLogin
  ) {
    return null;
  }

  const expectedBody = buildPlanApprovalBody({
    planPath: fields.plan_path,
    planSha256: fields.plan_sha256,
    approvedBaseHeadSha: fields.approved_base_head_sha,
    approverLogin: fields.approver_login,
    reviewCommentId: fields.review_comment_id,
    reviewBodySha256: fields.review_body_sha256,
    ciGateCheckRunId: fields.ci_gate_check_run_id,
    separationModel: fields.separation_model,
  });
  if (parsed.trimmedBody !== expectedBody) return null;
  return {
    baseHeadSha: requireSha(fields.approved_base_head_sha, 'approved base head SHA'),
    body: parsed.trimmedBody,
    checkRunId: requirePositiveInteger(
      fields.ci_gate_check_run_id,
      'approval CI gate check-run ID'
    ),
    comment,
    reviewBodySha256: requireSha256(fields.review_body_sha256, 'approval review body SHA-256'),
    reviewCommentId: requirePositiveInteger(fields.review_comment_id, 'approval review comment ID'),
  };
}

function requireCommentMetadata(comment, expectedAuthor, label) {
  const commentId = requirePositiveInteger(comment?.id, `${label} comment ID`);
  const author = requireLogin(comment?.user?.login, `${label} comment author`);
  if (!sameLogin(author, expectedAuthor))
    fail(`${label} comment author does not match repository owner`);
  const createdAt = requireSafeString(comment?.created_at, `${label} created timestamp`);
  const updatedAt = requireSafeString(comment?.updated_at, `${label} updated timestamp`);
  if (createdAt !== updatedAt) fail(`${label} comment was edited`);
  if (Number.isNaN(Date.parse(createdAt))) fail(`${label} comment timestamp is invalid`);

  let url;
  try {
    url = new URL(requireSafeString(comment?.html_url, `${label} comment URL`));
  } catch {
    fail(`${label} comment URL is invalid`);
  }
  if (url.protocol !== 'https:') fail(`${label} comment URL must use HTTPS`);

  return {
    author,
    commentId,
    createdAt,
    updatedAt,
    url: url.toString(),
  };
}

function requireOne(items, label) {
  if (items.length !== 1)
    fail(`expected exactly one applicable unedited ${label}; found ${items.length}`);
  return items[0];
}

function ownerAuthoredUneditedCandidates(candidates, expectedAuthor, label) {
  const ownerCandidates = candidates.filter(({ comment }) =>
    sameLogin(comment?.user?.login, expectedAuthor)
  );
  if (candidates.length > 0 && ownerCandidates.length === 0) {
    fail(`${label} comment author does not match repository owner`);
  }
  return ownerCandidates.map((candidate) => ({
    ...candidate,
    metadata: requireCommentMetadata(candidate.comment, expectedAuthor, label),
  }));
}

function requireCheckRun(checkRun, expectedId, approvedBaseHeadSha) {
  if (!checkRun || typeof checkRun !== 'object') fail('CI check-run API evidence is missing');
  const id = requirePositiveInteger(checkRun.id, 'CI gate check-run ID');
  if (id !== expectedId) fail('referenced CI gate check-run ID does not match fetched check run');
  if (checkRun.name !== 'CI Gate Status') fail('referenced check run is not CI Gate Status');
  if (checkRun.head_sha !== approvedBaseHeadSha)
    fail('CI Gate Status does not target approved base head');
  if (checkRun.status !== 'completed' || checkRun.conclusion !== 'success') {
    fail('CI Gate Status is not completed successfully');
  }
  if (
    checkRun.app?.slug !== GITHUB_ACTIONS_APP.slug ||
    checkRun.app?.name !== GITHUB_ACTIONS_APP.name ||
    !sameLogin(checkRun.app?.owner?.login, GITHUB_ACTIONS_APP.ownerLogin)
  ) {
    fail('CI Gate Status does not belong to repository GitHub Actions');
  }
  const completedAt = requireSafeString(
    checkRun.completed_at,
    'CI Gate Status completion timestamp'
  );
  if (Number.isNaN(Date.parse(completedAt))) fail('CI Gate Status completion timestamp is invalid');
  return {
    completedAt,
    normalized: { conclusion: 'success', id, name: 'CI Gate Status' },
  };
}

function requireAncestry(ancestry, approvedBaseHeadSha, liveHeadSha, requireExactHead) {
  if (!ancestry || typeof ancestry !== 'object') fail('commit comparison API evidence is missing');
  if (ancestry.baseSha !== approvedBaseHeadSha || ancestry.headSha !== liveHeadSha) {
    fail('commit comparison does not bind approved base and live head');
  }
  if (ancestry.mergeBaseSha !== approvedBaseHeadSha)
    fail('approved base is not an ancestor of live head');

  if (requireExactHead) {
    if (approvedBaseHeadSha !== liveHeadSha || ancestry.status !== 'identical') {
      fail('approved base must equal exact live head before Task 1');
    }
    return;
  }

  const validStatus =
    (ancestry.status === 'identical' && approvedBaseHeadSha === liveHeadSha) ||
    (ancestry.status === 'ahead' && approvedBaseHeadSha !== liveHeadSha);
  if (!validStatus)
    fail('commit comparison does not prove approved base is an ancestor of live head');
}

function normalizeRepository(repository) {
  let owner;
  let name;
  if (typeof repository === 'string') {
    const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
    if (!match) fail('repository evidence must use owner/name form');
    owner = match[1];
    name = match[2];
  } else if (repository && typeof repository === 'object') {
    owner = repository.owner;
    name = repository.name;
  } else {
    fail('repository evidence is missing');
  }
  requireLogin(owner, 'repository owner');
  if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    fail('repository name is invalid');
  }
  return { owner, name };
}

function requireGateWorkflowEvidence(
  gateWorkflowRun,
  { ciWorkflowId, approvedBaseHeadSha, pullRequestNumber }
) {
  if (!gateWorkflowRun || typeof gateWorkflowRun !== 'object') {
    fail('bound CI workflow-run API evidence is missing');
  }
  const workflowRunId = requirePositiveInteger(
    gateWorkflowRun.workflowRunId,
    'bound CI workflow run ID'
  );
  const runAttempt = requirePositiveInteger(
    gateWorkflowRun.runAttempt,
    'bound CI workflow run attempt'
  );
  const workflowId = requirePositiveInteger(gateWorkflowRun.workflowId, 'CI workflow ID');
  if (workflowId !== ciWorkflowId) fail('bound CI workflow run uses a different workflow');
  if (gateWorkflowRun.event !== 'pull_request') {
    fail('bound CI workflow run is not a pull_request run');
  }
  const headSha = requireSha(gateWorkflowRun.headSha, 'bound CI workflow run head SHA');
  if (headSha !== approvedBaseHeadSha) {
    fail('bound CI workflow run does not target approved base head');
  }
  if (
    !Array.isArray(gateWorkflowRun.pullRequestNumbers) ||
    !gateWorkflowRun.pullRequestNumbers.some((number) => number === pullRequestNumber)
  ) {
    fail('bound CI workflow run is not associated with plan-approval pull request');
  }
  return { workflowRunId, runAttempt, event: 'pull_request', workflowId, headSha };
}

function requireFinalHeadCiEvidence(finalHeadCiGate, liveHeadSha) {
  if (!finalHeadCiGate || typeof finalHeadCiGate !== 'object') {
    fail('final-head CI gate evidence is missing');
  }
  const expectedKeys = ['checkRunId', 'workflowRunId', 'runAttempt', 'headSha'];
  const actualKeys = Object.keys(finalHeadCiGate).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort())) {
    fail('final-head CI gate evidence contains unexpected fields');
  }
  const checkRunId = requirePositiveInteger(finalHeadCiGate.checkRunId, 'final-head CI check-run ID');
  const workflowRunId = requirePositiveInteger(
    finalHeadCiGate.workflowRunId,
    'final-head CI workflow run ID'
  );
  const runAttempt = requirePositiveInteger(
    finalHeadCiGate.runAttempt,
    'final-head CI workflow run attempt'
  );
  const headSha = requireSha(finalHeadCiGate.headSha, 'final-head CI head SHA');
  if (headSha !== liveHeadSha) fail('final-head CI gate does not target live PR head');
  return { checkRunId, workflowRunId, runAttempt, headSha };
}

export function evaluatePlanApproval(input) {
  if (!input || typeof input !== 'object') fail('normalized API evidence is missing');
  const planPath = requirePlanPath(input.planPath);
  const planSha256 = requireSha256(input.planSha256, 'plan SHA-256');
  const approverLogin = requireLogin(input.approverLogin, 'approver login');
  const repositoryOwnerLogin = requireLogin(input.repositoryOwnerLogin, 'repository owner login');
  if (!sameLogin(approverLogin, repositoryOwnerLogin))
    fail('declared approver is not repository owner');
  if (!APPROVED_PERMISSIONS.has(input.collaboratorPermission)) {
    fail('collaborator permission API did not prove admin, maintain, or write access');
  }
  if (input.commentsComplete !== true) fail('issue-comment pagination is incomplete');
  if (!Array.isArray(input.comments)) fail('issue-comment API evidence is missing');

  const expected = { approverLogin, planPath, planSha256 };
  const approvedBaseHeadSha = requireSha(input.approvedBaseHeadSha, 'approved base head SHA');
  const liveHeadSha = requireSha(input.liveHeadSha, 'live PR head SHA');
  const repository = normalizeRepository(input.repository);
  const pullRequestNumber = requirePositiveInteger(
    input.pullRequestNumber,
    'plan-approval pull request number'
  );
  const ciWorkflowId = requirePositiveInteger(input.ciWorkflowId, 'CI workflow ID');
  const ownerComments = input.comments.filter((comment) =>
    sameLogin(comment?.user?.login, repositoryOwnerLogin)
  );

  const approval = requireOne(
    ownerAuthoredUneditedCandidates(
      ownerComments
        .map((comment) => parseApplicableApproval(comment, expected))
        .filter((candidate) => candidate?.baseHeadSha === approvedBaseHeadSha),
      repositoryOwnerLogin,
      'approval'
    ),
    'approval'
  );
  const review = requireOne(
    ownerAuthoredUneditedCandidates(
      ownerComments
        .map((comment) => parseApplicableReview(comment, expected))
        .filter(
          (candidate) =>
            candidate?.headSha === approvedBaseHeadSha &&
            candidate?.checkRunId === approval.checkRunId
        ),
      repositoryOwnerLogin,
      'review'
    ),
    'review'
  );

  const reviewMetadata = review.metadata;
  const approvalMetadata = approval.metadata;

  if (reviewMetadata.commentId !== approval.reviewCommentId)
    fail('approval references a different review comment ID');
  const reviewBodySha256 = sha256(review.body);
  if (reviewBodySha256 !== approval.reviewBodySha256)
    fail('approval review body SHA-256 does not match review');
  if (review.headSha !== approvedBaseHeadSha) fail('review and approval bind different head SHAs');
  if (review.checkRunId !== approval.checkRunId)
    fail('review and approval bind different CI check runs');

  const checkRun = requireCheckRun(input.checkRun, approval.checkRunId, approvedBaseHeadSha);
  const gateWorkflowRun = requireGateWorkflowEvidence(input.gateWorkflowRun, {
    ciWorkflowId,
    approvedBaseHeadSha,
    pullRequestNumber,
  });
  if (
    Date.parse(checkRun.completedAt) > Date.parse(reviewMetadata.createdAt) ||
    Date.parse(reviewMetadata.createdAt) > Date.parse(approvalMetadata.createdAt)
  ) {
    fail('CI completion, review, and approval timestamps are out of order');
  }
  requireAncestry(
    input.ancestry,
    approvedBaseHeadSha,
    liveHeadSha,
    input.requireExactHead === true
  );

  const result = {
    decision: 'approved',
    separationModel: SEPARATION_MODEL,
    repository,
    pullRequestNumber,
    plan: { path: planPath, sha256: planSha256 },
    approvedBaseHeadSha,
    liveHeadSha,
    permission: input.collaboratorPermission,
    review: {
      commentId: reviewMetadata.commentId,
      url: reviewMetadata.url,
      author: reviewMetadata.author,
      createdAt: reviewMetadata.createdAt,
      updatedAt: reviewMetadata.updatedAt,
      bodySha256: reviewBodySha256,
    },
    approval: {
      commentId: approvalMetadata.commentId,
      url: approvalMetadata.url,
      author: approvalMetadata.author,
      createdAt: approvalMetadata.createdAt,
      updatedAt: approvalMetadata.updatedAt,
      bodySha256: sha256(approval.body),
    },
    checkRun: {
      ...checkRun.normalized,
      workflowRunId: gateWorkflowRun.workflowRunId,
      runAttempt: gateWorkflowRun.runAttempt,
      event: gateWorkflowRun.event,
      workflowId: gateWorkflowRun.workflowId,
    },
  };
  if (input.requireFinalHeadCi === true) {
    result.finalHeadCiGate = requireFinalHeadCiEvidence(input.finalHeadCiGate, liveHeadSha);
  }
  return result;
}

function parseArgs(argv) {
  const options = { requireExactHead: false, requireFinalHeadCi: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-exact-head') {
      if (seen.has(argument)) fail(`${argument} may be provided only once`);
      seen.add(argument);
      options.requireExactHead = true;
      continue;
    }
    if (argument === '--require-final-head-ci') {
      if (seen.has(argument)) fail(`${argument} may be provided only once`);
      seen.add(argument);
      options.requireFinalHeadCi = true;
      continue;
    }
    if (!['--repo', '--pr', '--plan-path', '--approver-login'].includes(argument)) {
      fail(`unknown argument ${String(argument)}`);
    }
    if (seen.has(argument)) fail(`${argument} may be provided only once`);
    seen.add(argument);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`${argument} requires a value`);
    index += 1;
    if (argument === '--repo') options.repo = value;
    if (argument === '--pr') options.pr = requirePositiveInteger(value, 'pull request number');
    if (argument === '--plan-path') options.planPath = requirePlanPath(value);
    if (argument === '--approver-login')
      options.approverLogin = requireLogin(value, 'approver login');
  }

  for (const name of ['repo', 'pr', 'planPath', 'approverLogin']) {
    if (options[name] === undefined)
      fail(
        `missing required --${name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
      );
  }
  const repoMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(options.repo);
  if (!repoMatch) fail('repository must use owner/name form');
  return { ...options, owner: repoMatch[1], repository: repoMatch[2] };
}

function nextLinkFromHeader(linkHeader) {
  if (linkHeader === null || linkHeader === undefined || linkHeader === '') return null;
  if (typeof linkHeader !== 'string') fail('GitHub pagination Link header is invalid');
  let next = null;
  for (const segment of linkHeader.split(',')) {
    const match = /^\s*<([^>]+)>\s*;\s*(.+)\s*$/.exec(segment);
    if (!match) fail('GitHub pagination Link header is malformed');
    const relations = [];
    for (const parameter of match[2].split(';')) {
      const parameterMatch = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^;\s]+))\s*$/.exec(
        parameter
      );
      if (!parameterMatch) fail('GitHub pagination Link header is malformed');
      if (parameterMatch[1].toLowerCase() === 'rel') {
        relations.push(...(parameterMatch[2] ?? parameterMatch[3]).split(/\s+/));
      }
    }
    if (!relations.includes('next')) continue;
    if (next !== null) fail('GitHub pagination contains multiple next links');
    next = match[1];
  }
  return next;
}

function githubApiClient({
  token,
  apiBaseUrl = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
}) {
  if (typeof token !== 'string' || token.trim() === '')
    fail('GH_TOKEN or GITHUB_TOKEN is required');
  if (typeof fetchImpl !== 'function') fail('GitHub API fetch implementation is unavailable');
  let baseUrl;
  try {
    baseUrl = new URL(apiBaseUrl);
  } catch {
    fail('GitHub API base URL is invalid');
  }
  if (baseUrl.protocol !== 'https:') fail('GitHub API base URL must use HTTPS');

  async function request(endpoint, query = undefined) {
    const url =
      endpoint instanceof URL
        ? new URL(endpoint)
        : new URL(
            String(endpoint).replace(/^\/+/, ''),
            `${baseUrl.toString().replace(/\/$/, '')}/`
          );
    if (url.origin !== baseUrl.origin) fail('GitHub API pagination crossed origin');
    for (const [name, value] of Object.entries(query ?? {}))
      url.searchParams.set(name, String(value));
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'updog-plan-approval-verifier',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
      });
    } catch {
      fail(`GitHub API request failed for ${url.pathname}`);
    }
    if (!response?.ok)
      fail(
        `GitHub API request returned status ${response?.status ?? 'unknown'} for ${url.pathname}`
      );
    if (response.redirected === true) fail(`GitHub API redirected request for ${url.pathname}`);
    if (typeof response.url !== 'string' || response.url === '') {
      fail(`GitHub API omitted response URL for ${url.pathname}`);
    }
    let responseUrl;
    try {
      responseUrl = new URL(response.url);
    } catch {
      fail(`GitHub API returned invalid response URL for ${url.pathname}`);
    }
    if (responseUrl.toString() !== url.toString()) {
      fail(`GitHub API response URL changed for ${url.pathname}`);
    }
    try {
      return {
        data: await response.json(),
        link: response.headers?.get?.('link') ?? null,
        url,
      };
    } catch {
      fail(`GitHub API returned malformed JSON for ${url.pathname}`);
    }
  }

  return {
    async get(endpoint, query = undefined) {
      return (await request(endpoint, query)).data;
    },
    getPage: request,
  };
}

export async function collectIssueComments(client, owner, repository, pullRequest) {
  const comments = [];
  const endpointPath = `/repos/${owner}/${repository}/issues/${pullRequest}/comments`;
  let page = 1;
  let response = await client.getPage(endpointPath, { page, per_page: COMMENTS_PER_PAGE });
  const visited = new Set();
  while (response) {
    if (page > MAX_COMMENT_PAGES) fail('issue-comment pagination exceeded safe page limit');
    const items = response.data;
    if (!Array.isArray(items) || items.length > COMMENTS_PER_PAGE)
      fail('issue-comment pagination response is invalid');
    comments.push(...items);
    const nextLink = nextLinkFromHeader(response.link);
    let nextUrl;
    if (!nextLink) {
      if (items.length < COMMENTS_PER_PAGE) return comments;
      nextUrl = new URL(response.url);
      nextUrl.searchParams.set('page', String(page + 1));
      nextUrl.searchParams.set('per_page', String(COMMENTS_PER_PAGE));
    } else {
      if (items.length !== COMMENTS_PER_PAGE)
        fail('issue-comment pagination returned a truncated page');
      try {
        nextUrl = new URL(nextLink);
      } catch {
        fail('GitHub pagination next URL is invalid');
      }
    }
    if (nextUrl.origin !== response.url.origin || nextUrl.pathname !== response.url.pathname) {
      fail('GitHub pagination next URL changed endpoint');
    }
    const nextPage = Number(nextUrl.searchParams.get('page'));
    if (
      !Number.isSafeInteger(nextPage) ||
      nextPage !== page + 1 ||
      nextUrl.searchParams.get('per_page') !== String(COMMENTS_PER_PAGE)
    ) {
      fail('GitHub pagination next URL is not the next expected page');
    }
    if ([...nextUrl.searchParams.keys()].some((key) => !['page', 'per_page'].includes(key))) {
      fail('GitHub pagination next URL contains unexpected query fields');
    }
    const nextKey = nextUrl.toString();
    if (visited.has(nextKey)) fail('GitHub pagination repeated a page');
    visited.add(nextKey);
    page = nextPage;
    response = await client.getPage(nextUrl);
  }
  fail('issue-comment pagination ended without a terminal page');
}

async function collectActionsItems(client, endpointPath, itemKey, query, label) {
  const items = [];
  let page = 1;
  let response = await client.getPage(endpointPath, {
    ...query,
    page,
    per_page: ACTIONS_PER_PAGE,
  });
  let totalCount;
  const visited = new Set();
  while (response) {
    if (page > MAX_ACTION_PAGES) fail(`${label} pagination exceeded safe page limit`);
    if (!response.url || typeof response.url.toString !== 'function') {
      fail(`${label} pagination response URL is missing`);
    }
    const responseKey = response.url.toString();
    if (visited.has(responseKey)) fail(`${label} pagination repeated a page`);
    visited.add(responseKey);

    if (!response.data || typeof response.data !== 'object') {
      fail(`${label} pagination response is invalid`);
    }
    const pageTotalCount = requireNonNegativeInteger(
      response.data.total_count,
      `${label} total_count`
    );
    if (totalCount === undefined) totalCount = pageTotalCount;
    if (pageTotalCount !== totalCount) fail(`${label} total_count changed during pagination`);

    const pageItems = response.data[itemKey];
    if (!Array.isArray(pageItems) || pageItems.length > ACTIONS_PER_PAGE) {
      fail(`${label} pagination response is invalid`);
    }
    items.push(...pageItems);
    if (items.length > totalCount) fail(`${label} pagination returned too many items`);

    const nextLink = nextLinkFromHeader(response.link);
    if (!nextLink) {
      if (items.length !== totalCount) fail(`${label} pagination returned a truncated listing`);
      return items;
    }
    if (pageItems.length !== ACTIONS_PER_PAGE) {
      fail(`${label} pagination returned a truncated page`);
    }

    let nextUrl;
    try {
      nextUrl = new URL(nextLink);
    } catch {
      fail(`${label} pagination next URL is invalid`);
    }
    let responseUrl;
    try {
      responseUrl = new URL(response.url);
    } catch {
      fail(`${label} pagination response URL is invalid`);
    }
    if (nextUrl.origin !== responseUrl.origin || nextUrl.pathname !== responseUrl.pathname) {
      fail(`${label} pagination next URL changed endpoint`);
    }
    const nextPage = Number(nextUrl.searchParams.get('page'));
    if (
      !Number.isSafeInteger(nextPage) ||
      nextPage !== page + 1 ||
      nextUrl.searchParams.get('per_page') !== String(ACTIONS_PER_PAGE)
    ) {
      fail(`${label} pagination next URL is not the next expected page`);
    }
    for (const [name, value] of Object.entries(query)) {
      if (nextUrl.searchParams.get(name) !== String(value)) {
        fail(`${label} pagination next URL changed query filters`);
      }
    }
    const allowedQueryKeys = new Set([...Object.keys(query), 'page', 'per_page']);
    if ([...nextUrl.searchParams.keys()].some((name) => !allowedQueryKeys.has(name))) {
      fail(`${label} pagination next URL contains unexpected query fields`);
    }
    page = nextPage;
    response = await client.getPage(nextUrl);
  }
  fail(`${label} pagination ended without a terminal page`);
}

function normalizeWorkflowRunApiEvidence(
  workflowRun,
  { expectedWorkflowId, expectedRunId, expectedHeadSha, pullRequestNumber, label }
) {
  if (!workflowRun || typeof workflowRun !== 'object') {
    fail(`${label} workflow-run API evidence is missing`);
  }
  const workflowRunId = requirePositiveInteger(workflowRun.id, `${label} workflow run ID`);
  if (expectedRunId !== undefined && workflowRunId !== expectedRunId) {
    fail(`${label} workflow run ID does not match Actions job`);
  }
  const workflowId = requirePositiveInteger(workflowRun.workflow_id, `${label} workflow ID`);
  const event = requireSafeString(workflowRun.event, `${label} workflow run event`);
  const headSha = requireSha(workflowRun.head_sha, `${label} workflow run head SHA`);
  if (expectedHeadSha !== undefined && headSha !== expectedHeadSha) {
    fail(`${label} workflow run does not target expected head`);
  }
  if (!Array.isArray(workflowRun.pull_requests)) {
    fail(`${label} workflow run pull-request association is missing`);
  }
  const pullRequestNumbers = workflowRun.pull_requests.map((pullRequest) =>
    requirePositiveInteger(pullRequest?.number, `${label} workflow run pull-request number`)
  );
  return {
    workflowRunId,
    workflowId,
    event,
    headSha,
    pullRequestNumbers,
    status: workflowRun.status,
    conclusion: workflowRun.conclusion,
    runAttempt: workflowRun.run_attempt,
    expectedWorkflowId,
    pullRequestNumber,
  };
}

async function resolveBoundGateWorkflow({
  client,
  repoPath,
  checkRunId,
  approvedBaseHeadSha,
  pullRequestNumber,
}) {
  const workflow = await client.get(`${repoPath}/actions/workflows/${CI_WORKFLOW_PATH}`);
  const workflowId = requirePositiveInteger(workflow?.id, 'CI workflow ID');
  const job = await client.get(`${repoPath}/actions/jobs/${checkRunId}`);
  const jobId = requirePositiveInteger(job?.id, 'bound CI job ID');
  if (jobId !== checkRunId) fail('bound Actions job ID does not match CI check-run ID');
  const workflowRunId = requirePositiveInteger(job?.run_id, 'bound CI workflow run ID');
  const runAttempt = requirePositiveInteger(job?.run_attempt, 'bound CI workflow run attempt');
  const workflowRun = await client.get(`${repoPath}/actions/runs/${workflowRunId}`);
  const normalizedRun = normalizeWorkflowRunApiEvidence(workflowRun, {
    expectedWorkflowId: workflowId,
    expectedRunId: workflowRunId,
    expectedHeadSha: approvedBaseHeadSha,
    pullRequestNumber,
    label: 'bound CI',
  });
  if (normalizedRun.workflowId !== workflowId) {
    fail('bound CI workflow run uses a different workflow');
  }
  if (normalizedRun.event !== 'pull_request') {
    fail('bound CI workflow run is not a pull_request run');
  }
  if (!normalizedRun.pullRequestNumbers.includes(pullRequestNumber)) {
    fail('bound CI workflow run is not associated with plan-approval pull request');
  }
  return {
    workflowId,
    gateWorkflowRun: {
      workflowRunId: normalizedRun.workflowRunId,
      runAttempt,
      event: normalizedRun.event,
      workflowId: normalizedRun.workflowId,
      headSha: normalizedRun.headSha,
      pullRequestNumbers: normalizedRun.pullRequestNumbers,
    },
  };
}

async function resolveFinalHeadCiGate({
  client,
  repoPath,
  workflowId,
  liveHeadSha,
  pullRequestNumber,
}) {
  const workflowRuns = await collectActionsItems(
    client,
    `${repoPath}/actions/workflows/${CI_WORKFLOW_PATH}/runs`,
    'workflow_runs',
    { head_sha: liveHeadSha, event: 'pull_request' },
    'final-head workflow-run'
  );
  const normalizedRuns = workflowRuns.map((workflowRun) =>
    normalizeWorkflowRunApiEvidence(workflowRun, {
      expectedWorkflowId: workflowId,
      expectedHeadSha: liveHeadSha,
      pullRequestNumber,
      label: 'final-head',
    })
  );
  const candidates = normalizedRuns.filter(
    (workflowRun) =>
      workflowRun.workflowId === workflowId &&
      workflowRun.event === 'pull_request' &&
      workflowRun.headSha === liveHeadSha &&
      workflowRun.pullRequestNumbers.includes(pullRequestNumber)
  );
  const armedRuns = [];
  for (const workflowRun of candidates) {
    if (workflowRun.status !== 'completed') {
      fail('final-head candidate workflow run is not completed');
    }
    const runAttempt = requirePositiveInteger(
      workflowRun.runAttempt,
      'final-head workflow run attempt'
    );
    const jobs = await collectActionsItems(
      client,
      `${repoPath}/actions/runs/${workflowRun.workflowRunId}/attempts/${runAttempt}/jobs`,
      'jobs',
      {},
      'final-head jobs'
    );
    const planApprovalJobs = jobs.filter((job) => job?.name === 'plan-approval');
    if (planApprovalJobs.length > 1) {
      fail('final-head workflow run has multiple plan-approval jobs');
    }
    const planApprovalJob = planApprovalJobs[0];
    if (!planApprovalJob || planApprovalJob.conclusion === 'skipped') continue;
    armedRuns.push({ jobs, planApprovalJob, runAttempt, workflowRun });
  }
  if (armedRuns.length !== 1) {
    fail(`expected exactly one armed final-head workflow run; found ${armedRuns.length}`);
  }
  const [{ jobs, planApprovalJob, runAttempt, workflowRun }] = armedRuns;
  if (workflowRun.conclusion !== 'success') {
    fail('armed final-head workflow run did not complete successfully');
  }
  if (planApprovalJob.conclusion !== 'success') {
    fail('armed final-head plan-approval job did not complete successfully');
  }
  const gateJobs = jobs.filter((job) => job?.name === CI_GATE_JOB_NAME);
  if (gateJobs.length !== 1) {
    fail(`expected exactly one final-head ${CI_GATE_JOB_NAME} job; found ${gateJobs.length}`);
  }
  const gateJob = gateJobs[0];
  const checkRunId = requirePositiveInteger(gateJob.id, 'final-head CI check-run ID');
  const gateJobRunId = requirePositiveInteger(gateJob.run_id, 'final-head CI job workflow run ID');
  const gateJobRunAttempt = requirePositiveInteger(
    gateJob.run_attempt,
    'final-head CI job workflow run attempt'
  );
  if (gateJobRunId !== workflowRun.workflowRunId || gateJobRunAttempt !== runAttempt) {
    fail('final-head CI job is not bound to selected workflow-run attempt');
  }
  if (gateJob.status !== 'completed' || gateJob.conclusion !== 'success') {
    fail('final-head CI Gate Status is not completed successfully');
  }
  return { checkRunId, workflowRunId: workflowRun.workflowRunId, runAttempt, headSha: liveHeadSha };
}

function normalizeComparison(comparison, baseSha, headSha) {
  if (!comparison || typeof comparison !== 'object')
    fail('commit comparison API evidence is missing');
  if (!['ahead', 'behind', 'diverged', 'identical'].includes(comparison.status)) {
    fail('commit comparison API returned an unknown status');
  }
  if (comparison.base_commit?.sha !== baseSha)
    fail('commit comparison API returned a different base SHA');
  return {
    baseSha,
    headSha,
    status: comparison.status,
    mergeBaseSha: requireSha(comparison.merge_base_commit?.sha, 'comparison merge-base SHA'),
  };
}

function comparisonProvesLineage(ancestry, requireExactHead) {
  if (ancestry.mergeBaseSha !== ancestry.baseSha) return false;
  if (requireExactHead)
    return ancestry.baseSha === ancestry.headSha && ancestry.status === 'identical';
  return (
    (ancestry.baseSha === ancestry.headSha && ancestry.status === 'identical') ||
    (ancestry.baseSha !== ancestry.headSha && ancestry.status === 'ahead')
  );
}

async function selectApprovalLineage({
  client,
  comments,
  expected,
  liveHeadSha,
  repositoryOwnerLogin,
  repoPath,
  requireExactHead,
}) {
  const ownerComments = comments.filter((comment) =>
    sameLogin(comment?.user?.login, repositoryOwnerLogin)
  );
  const structuralApprovals = ownerComments
    .map((comment) => parseApplicableApproval(comment, expected))
    .filter(Boolean);
  const comparisons = new Map();
  const lineageApprovals = [];
  for (const approval of structuralApprovals) {
    if (requireExactHead && approval.baseHeadSha !== liveHeadSha) continue;
    let ancestry = comparisons.get(approval.baseHeadSha);
    if (!ancestry) {
      const comparison = await client.get(
        `${repoPath}/compare/${approval.baseHeadSha}...${liveHeadSha}`
      );
      ancestry = normalizeComparison(comparison, approval.baseHeadSha, liveHeadSha);
      comparisons.set(approval.baseHeadSha, ancestry);
    }
    if (comparisonProvesLineage(ancestry, requireExactHead))
      lineageApprovals.push({ ...approval, ancestry });
  }

  const approval = requireOne(
    ownerAuthoredUneditedCandidates(lineageApprovals, repositoryOwnerLogin, 'approval'),
    'approval'
  );
  const review = requireOne(
    ownerAuthoredUneditedCandidates(
      ownerComments
        .map((comment) => parseApplicableReview(comment, expected))
        .filter(
          (candidate) =>
            candidate?.headSha === approval.baseHeadSha &&
            candidate?.checkRunId === approval.checkRunId
        ),
      repositoryOwnerLogin,
      'review'
    ),
    'review'
  );
  if (review.metadata.commentId !== approval.reviewCommentId) {
    fail('approval references a different review comment ID');
  }
  if (sha256(review.body) !== approval.reviewBodySha256) {
    fail('approval review body SHA-256 does not match review');
  }
  return { approval, review, ancestry: approval.ancestry };
}

function selectionIdentity(selection) {
  return JSON.stringify({
    approvedBaseHeadSha: selection.approval.baseHeadSha,
    checkRunId: selection.approval.checkRunId,
    approval: {
      id: selection.approval.metadata.commentId,
      createdAt: selection.approval.metadata.createdAt,
      updatedAt: selection.approval.metadata.updatedAt,
      bodySha256: sha256(selection.approval.body),
    },
    review: {
      id: selection.review.metadata.commentId,
      createdAt: selection.review.metadata.createdAt,
      updatedAt: selection.review.metadata.updatedAt,
      bodySha256: sha256(selection.review.body),
    },
  });
}

function evidenceSelectionIdentity({ selection, gateWorkflow, finalHeadCiGate }) {
  return JSON.stringify({
    selection: selectionIdentity(selection),
    gateWorkflow: {
      workflowId: gateWorkflow.workflowId,
      workflowRunId: gateWorkflow.gateWorkflowRun.workflowRunId,
      runAttempt: gateWorkflow.gateWorkflowRun.runAttempt,
      event: gateWorkflow.gateWorkflowRun.event,
      headSha: gateWorkflow.gateWorkflowRun.headSha,
      pullRequestNumbers: [...gateWorkflow.gateWorkflowRun.pullRequestNumbers].sort(
        (left, right) => left - right
      ),
    },
    finalHeadCiGate: finalHeadCiGate ?? null,
  });
}

function normalizeCollaboratorPermission(permission, expectedLogin) {
  if (!permission || typeof permission !== 'object')
    fail('collaborator permission API evidence is missing');
  if (!sameLogin(permission.user?.login, expectedLogin)) {
    fail('collaborator permission API returned a different user');
  }
  if (APPROVED_PERMISSIONS.has(permission.role_name)) {
    const expectedLegacyPermission = permission.role_name === 'admin' ? 'admin' : 'write';
    if (permission.permission !== expectedLegacyPermission) {
      fail('collaborator permission API returned inconsistent role fields');
    }
    return permission.role_name;
  }
  if (APPROVED_PERMISSIONS.has(permission.permission)) return permission.permission;
  fail('collaborator permission API did not prove admin, maintain, or write access');
}

async function verifyLocalPlanState({
  approvedBaseHeadSha,
  cwd,
  execFileImpl,
  liveHeadSha,
  planPath,
  planSha256,
  requireExactHead,
}) {
  try {
    await execFileImpl('git', ['ls-files', '--error-unmatch', '--', planPath], {
      cwd,
      encoding: 'utf8',
    });
  } catch {
    fail('plan path is not tracked');
  }
  try {
    await execFileImpl('git', ['diff', '--quiet', '--', planPath], { cwd });
  } catch {
    fail('plan path has working-tree changes');
  }
  try {
    await execFileImpl('git', ['diff', '--cached', '--quiet', 'HEAD', '--', planPath], { cwd });
  } catch {
    fail('plan path has staged changes');
  }

  let localHead;
  try {
    ({ stdout: localHead } = await execFileImpl('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }));
  } catch {
    fail('local Git HEAD could not be read');
  }
  localHead = String(localHead).trim();
  requireSha(localHead, 'local Git HEAD');
  if (requireExactHead && localHead !== liveHeadSha)
    fail('local Git HEAD does not equal exact live PR head');
  if (!requireExactHead) {
    try {
      await execFileImpl('git', ['merge-base', '--is-ancestor', liveHeadSha, localHead], { cwd });
    } catch {
      fail('local Git HEAD does not contain live PR head');
    }
  }

  let approvedPlanBytes;
  try {
    ({ stdout: approvedPlanBytes } = await execFileImpl(
      'git',
      ['show', `${approvedBaseHeadSha}:${planPath}`],
      { cwd, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }
    ));
  } catch {
    fail('approved base does not contain tracked plan path');
  }
  const approvedPlanSha256 = createHash('sha256').update(approvedPlanBytes).digest('hex');
  if (approvedPlanSha256 !== planSha256)
    fail('approved base plan digest does not match local plan digest');

  let livePlanBytes;
  try {
    ({ stdout: livePlanBytes } = await execFileImpl('git', ['show', `${liveHeadSha}:${planPath}`], {
      cwd,
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch {
    fail('live PR head does not contain tracked plan path');
  }
  const livePlanSha256 = createHash('sha256').update(livePlanBytes).digest('hex');
  if (livePlanSha256 !== planSha256)
    fail('live PR head plan digest does not match approved plan digest');
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  {
    fetchImpl = globalThis.fetch,
    readFileImpl = readFile,
    execFileImpl = execFileAsync,
    cwd = process.cwd(),
    output = console.log,
  } = {}
) {
  const options = parseArgs(argv);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const client = githubApiClient({
    token,
    apiBaseUrl: env.GITHUB_API_URL || 'https://api.github.com',
    fetchImpl,
  });
  let planBytes;
  try {
    planBytes = await readFileImpl(path.resolve(cwd, options.planPath));
  } catch {
    fail('local plan path could not be read');
  }
  const planSha256 = createHash('sha256').update(planBytes).digest('hex');
  const repoPath = `repos/${options.owner}/${options.repository}`;
  const expected = {
    approverLogin: options.approverLogin,
    planPath: options.planPath,
    planSha256,
  };

  const [initialRepository, initialPullRequest, initialPermission, initialComments] =
    await Promise.all([
      client.get(repoPath),
      client.get(`${repoPath}/pulls/${options.pr}`),
      client.get(`${repoPath}/collaborators/${options.approverLogin}/permission`),
      collectIssueComments(client, options.owner, options.repository, options.pr),
    ]);
  const initialOwner = requireLogin(initialRepository?.owner?.login, 'repository owner login');
  const normalizedInitialPermission = normalizeCollaboratorPermission(
    initialPermission,
    options.approverLogin
  );
  const initialLiveHeadSha = requireSha(initialPullRequest?.head?.sha, 'live PR head SHA');
  const initialSelection = await selectApprovalLineage({
    client,
    comments: initialComments,
    expected,
    liveHeadSha: initialLiveHeadSha,
    repositoryOwnerLogin: initialOwner,
    repoPath,
    requireExactHead: options.requireExactHead,
  });
  const initialCheckRun = await client.get(
    `${repoPath}/check-runs/${initialSelection.approval.checkRunId}`
  );
  requireCheckRun(
    initialCheckRun,
    initialSelection.approval.checkRunId,
    initialSelection.approval.baseHeadSha
  );
  const initialGateWorkflow = await resolveBoundGateWorkflow({
    client,
    repoPath,
    checkRunId: initialSelection.approval.checkRunId,
    approvedBaseHeadSha: initialSelection.approval.baseHeadSha,
    pullRequestNumber: options.pr,
  });
  const initialFinalHeadCiGate = options.requireFinalHeadCi
    ? await resolveFinalHeadCiGate({
        client,
        repoPath,
        workflowId: initialGateWorkflow.workflowId,
        liveHeadSha: initialLiveHeadSha,
        pullRequestNumber: options.pr,
      })
    : undefined;
  await verifyLocalPlanState({
    approvedBaseHeadSha: initialSelection.approval.baseHeadSha,
    cwd,
    execFileImpl,
    liveHeadSha: initialLiveHeadSha,
    planPath: options.planPath,
    planSha256,
    requireExactHead: options.requireExactHead,
  });

  const [repository, pullRequest, permission, comments, checkRun, finalPlanBytes] =
    await Promise.all([
      client.get(repoPath),
      client.get(`${repoPath}/pulls/${options.pr}`),
      client.get(`${repoPath}/collaborators/${options.approverLogin}/permission`),
      collectIssueComments(client, options.owner, options.repository, options.pr),
      client.get(`${repoPath}/check-runs/${initialSelection.approval.checkRunId}`),
      readFileImpl(path.resolve(cwd, options.planPath)),
    ]);
  const repositoryOwnerLogin = requireLogin(repository?.owner?.login, 'repository owner login');
  if (!sameLogin(repositoryOwnerLogin, initialOwner))
    fail('repository owner changed during verification');
  const liveHeadSha = requireSha(pullRequest?.head?.sha, 'live PR head SHA');
  if (liveHeadSha !== initialLiveHeadSha) fail('live PR head changed during verification');
  if (createHash('sha256').update(finalPlanBytes).digest('hex') !== planSha256) {
    fail('local plan changed during verification');
  }
  const finalSelection = await selectApprovalLineage({
    client,
    comments,
    expected,
    liveHeadSha,
    repositoryOwnerLogin,
    repoPath,
    requireExactHead: options.requireExactHead,
  });
  requireCheckRun(checkRun, finalSelection.approval.checkRunId, finalSelection.approval.baseHeadSha);
  const finalGateWorkflow = await resolveBoundGateWorkflow({
    client,
    repoPath,
    checkRunId: finalSelection.approval.checkRunId,
    approvedBaseHeadSha: finalSelection.approval.baseHeadSha,
    pullRequestNumber: options.pr,
  });
  const finalFinalHeadCiGate = options.requireFinalHeadCi
    ? await resolveFinalHeadCiGate({
        client,
        repoPath,
        workflowId: finalGateWorkflow.workflowId,
        liveHeadSha: liveHeadSha,
        pullRequestNumber: options.pr,
      })
    : undefined;
  if (
    evidenceSelectionIdentity({
      selection: finalSelection,
      gateWorkflow: finalGateWorkflow,
      finalHeadCiGate: finalFinalHeadCiGate,
    }) !==
    evidenceSelectionIdentity({
      selection: initialSelection,
      gateWorkflow: initialGateWorkflow,
      finalHeadCiGate: initialFinalHeadCiGate,
    })
  ) {
    fail('review or approval record changed during verification');
  }
  const collaboratorPermission = normalizeCollaboratorPermission(permission, options.approverLogin);
  if (collaboratorPermission !== normalizedInitialPermission) {
    fail('collaborator permission changed during verification');
  }
  await verifyLocalPlanState({
    approvedBaseHeadSha: finalSelection.approval.baseHeadSha,
    cwd,
    execFileImpl,
    liveHeadSha,
    planPath: options.planPath,
    planSha256,
    requireExactHead: options.requireExactHead,
  });

  const result = evaluatePlanApproval({
    planPath: options.planPath,
    planSha256,
    approvedBaseHeadSha: finalSelection.approval.baseHeadSha,
    liveHeadSha,
    requireExactHead: options.requireExactHead,
    approverLogin: options.approverLogin,
    repositoryOwnerLogin,
    collaboratorPermission,
    repository: { owner: options.owner, name: options.repository },
    pullRequestNumber: options.pr,
    ciWorkflowId: finalGateWorkflow.workflowId,
    gateWorkflowRun: finalGateWorkflow.gateWorkflowRun,
    finalHeadCiGate: finalFinalHeadCiGate,
    requireFinalHeadCi: options.requireFinalHeadCi,
    comments,
    commentsComplete: true,
    checkRun,
    ancestry: finalSelection.ancestry,
  });
  output(JSON.stringify(result));
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath.toLowerCase() === modulePath.toLowerCase()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Plan approval verification failed');
    process.exitCode = 1;
  });
}
