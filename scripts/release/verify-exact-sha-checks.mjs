import { readFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCKED_G3_CONTEXTS = Object.freeze([
  'CI Gate Status',
  'Build Production',
  'Dependency Validation (Linux)',
  'Security Integration Tests',
  'Neon Transaction Lane',
  'Testcontainers',
  'analyze',
  'security-scan',
]);

export const LOCKED_CONTEXT_WORKFLOW_ALLOWLIST = Object.freeze({
  'CI Gate Status': '.github/workflows/ci-unified.yml',
  'Build Production': '.github/workflows/ci-unified.yml',
  'Dependency Validation (Linux)': '.github/workflows/ci-unified.yml',
  'Security Integration Tests': '.github/workflows/ci-unified.yml',
  'Neon Transaction Lane': '.github/workflows/ci-unified.yml',
  Testcontainers: '.github/workflows/testcontainers-ci.yml',
  analyze: '.github/workflows/codeql.yml',
  'security-scan': '.github/workflows/security-scan.yml',
});

const ALLOWED_EVENTS_BY_WORKFLOW = Object.freeze({
  '.github/workflows/ci-unified.yml': new Set(['push', 'workflow_dispatch']),
  '.github/workflows/testcontainers-ci.yml': new Set(['workflow_dispatch']),
  '.github/workflows/codeql.yml': new Set(['push', 'workflow_dispatch', 'schedule']),
  '.github/workflows/security-scan.yml': new Set(['push', 'workflow_dispatch', 'schedule']),
});

const SHA = /^[a-f0-9]{40}$/;
const SELF_REFERENCE = 'G3 Exact-SHA Verdict';
const SUCCESS = 'success';

function fail(message) {
  throw new Error(`Exact-SHA evidence failed: ${message}`);
}
function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) fail(`${label} must be a lowercase 40-character SHA`);
  return value;
}

function terminalSuccess(entry) {
  return entry?.status === 'completed' && entry?.conclusion === SUCCESS;
}

function exactPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer`);
  return value;
}

function parseUtc(value, label) {
  if (typeof value !== 'string' || !value.endsWith('Z')) fail(`${label} must be a UTC timestamp`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} must be a valid timestamp`);
  return timestamp;
}

function parseActionsDetailsUrl(detailsUrl, repository) {
  if (typeof detailsUrl !== 'string') fail('check details_url is required');
  const match = detailsUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/([1-9][0-9]*)\/job\/([1-9][0-9]*)(?:[?#].*)?$/);
  if (!match) fail('check details_url must identify an Actions run and job');
  if (match[1] !== repository) fail('check details_url repository does not match evidence repository');
  return { runId: Number(match[2]), jobId: Number(match[3]) };
}

function requirementContexts(protection) {
  const requirements = assertBranchProtectionReadable(protection);
  const ciAppRequirements = requirements.filter((requirement) => requirement.context === 'CI Gate Status');
  if (ciAppRequirements.length !== 1 || ciAppRequirements[0].appId === undefined) {
    fail('CI Gate Status must be exactly one app-bound branch-protection check');
  }
  for (const requirement of requirements) {
    if (requirement.context === SELF_REFERENCE) fail('branch protection has a self-reference to G3 Exact-SHA Verdict');
    if (!Object.hasOwn(LOCKED_CONTEXT_WORKFLOW_ALLOWLIST, requirement.context)) {
      fail(`unknown required context ${requirement.context}`);
    }
  }
  return { contexts: [...LOCKED_G3_CONTEXTS].sort(), githubActionsAppId: ciAppRequirements[0].appId };
}

export function assertBranchProtectionReadable(protection) {
  if (!protection || protection.status === 403 || protection.status === 404 || protection.error) {
    fail('branch protection could not be read');
  }
  const statusChecks = protection.required_status_checks;
  const contexts = Array.isArray(statusChecks?.contexts) ? statusChecks.contexts : [];
  const checks = Array.isArray(statusChecks?.checks) ? statusChecks.checks : [];
  const requirements = new Map(contexts.map((context) => [`${String(context)}:unbound`, { context: String(context) }]));
  for (const check of checks) {
    const context = String(check?.context ?? '');
    if (!context) continue;
    const appId = check?.app_id;
    if (appId === undefined || appId === null) {
      requirements.set(`${context}:unbound`, { context });
      continue;
    }
    // An app-bound requirement supersedes an unbound duplicate from contexts,
    // but multiple required apps for one context remain independent gates.
    requirements.delete(`${context}:unbound`);
    requirements.set(`${context}:app:${appId}`, { context, appId });
  }
  if (requirements.size === 0) fail('branch protection does not contain required contexts');
  return [...requirements.values()];
}

export async function collectPaginated(fetchPage, initialPage = undefined) {
  const results = [];
  let page = initialPage;
  let first = true;
  const visited = new Set();
  while (first || page) {
    first = false;
    const result = await fetchPage(page);
    if (!result || !Array.isArray(result.items)) fail('pagination response is incomplete');
    results.push(...result.items);
    page = result.next ?? null;
    if (page && visited.has(String(page))) fail('pagination repeated a page');
    if (page) visited.add(String(page));
  }
  return results;
}

function evidenceArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} evidence is not an array`);
  return value;
}

function indexById(items, label) {
  const index = new Map();
  for (const item of evidenceArray(items, label)) {
    const id = exactPositiveInteger(item?.id, `${label} ID`);
    if (index.has(id)) fail(`duplicate ${label} ID ${id}`);
    index.set(id, item);
  }
  return index;
}

function workflowDefinitionForPath(workflows, workflowPath) {
  const matching = evidenceArray(workflows, 'workflow definition').filter(
    (workflow) => workflow?.path === workflowPath && workflow?.state === 'active'
  );
  if (matching.length !== 1) fail(`workflow definition for ${workflowPath} must be exactly one active workflow`);
  return matching[0];
}

function workflowEvidenceForContext({ context, check, candidateSha, repository, githubActionsAppId, workflows, runsById, jobsById }) {
  if (check?.head_sha !== candidateSha) fail(`check ${context} does not match candidate SHA`);
  if (check?.app?.id !== githubActionsAppId) fail(`check ${context} is not owned by GitHub Actions App`);
  const expectedPath = LOCKED_CONTEXT_WORKFLOW_ALLOWLIST[context];
  const details = parseActionsDetailsUrl(check?.details_url, repository);
  const job = jobsById.get(details.jobId);
  if (!job) fail(`workflow job ${details.jobId} for ${context} was not fetched`);
  if (job.run_id !== details.runId) fail(`workflow job run ID does not match details_url for ${context}`);
  if (job.name !== context) fail(`workflow job name does not match required context ${context}`);
  if (job.head_sha !== candidateSha) fail(`workflow job ${context} does not match candidate SHA`);
  const run = runsById.get(details.runId);
  if (!run) fail(`workflow run ${details.runId} for ${context} was not fetched`);
  if (run.head_sha !== candidateSha) fail(`workflow run ${context} does not match candidate SHA`);
  if (run.repository?.full_name !== repository) fail(`workflow run repository does not match evidence repository for ${context}`);
  if (run.path !== expectedPath) fail(`workflow path does not match allowlist for ${context}`);
  const workflow = workflowDefinitionForPath(workflows, expectedPath);
  if (run.workflow_id !== workflow.id) fail(`workflow ID does not match definition for ${context}`);
  if (!ALLOWED_EVENTS_BY_WORKFLOW[expectedPath]?.has(run.event)) fail(`workflow event is not allowed for ${context}`);
  const jobAttempt = exactPositiveInteger(job.run_attempt, `workflow job run attempt for ${context}`);
  const runAttempt = exactPositiveInteger(run.run_attempt, `workflow run attempt for ${context}`);
  if (jobAttempt > runAttempt) fail(`workflow job attempt exceeds workflow run attempt for ${context}`);
  if (jobAttempt < runAttempt) return null;
  const attemptStartedAt = parseUtc(check.started_at ?? job.started_at ?? run.created_at ?? run.updated_at, `attempt start timestamp for ${context}`);
  return {
    context,
    checkRunId: exactPositiveInteger(check.id, `check run ID for ${context}`),
    workflowJobId: details.jobId,
    workflowRunId: details.runId,
    runAttempt,
    workflowId: exactPositiveInteger(workflow.id, `workflow ID for ${context}`),
    workflowPath: expectedPath,
    event: run.event,
    attemptStartedAt,
    trustedSuccess: terminalSuccess(check) && terminalSuccess(job) && terminalSuccess(run),
  };
}

export function aggregateExactShaEvidence({ candidateSha, protection, checkRuns, workflows, workflowRuns, workflowJobs }) {
  const exactSha = requireSha(candidateSha, 'candidate SHA');
  if (Array.isArray(arguments[0]?.statuses) && arguments[0].statuses.length > 0) {
    fail('legacy commit statuses cannot satisfy locked contexts');
  }
  const repository = String(arguments[0]?.repository ?? workflows?.[0]?.repository?.full_name ?? workflowRuns?.[0]?.repository?.full_name ?? '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('repository is required');
  const { contexts, githubActionsAppId } = requirementContexts(protection);
  if (contexts.includes(SELF_REFERENCE)) fail('branch protection has a self-reference to G3 Exact-SHA Verdict');
  const checks = evidenceArray(checkRuns, 'check run');
  const runsById = indexById(workflowRuns, 'workflow run');
  const jobsById = indexById(workflowJobs, 'workflow job');
  const workflowEvidence = contexts.map((context) => {
    const matching = checks.filter((check) => check?.name === context && check?.head_sha === exactSha);
    if (matching.length === 0) fail(`missing required context ${context} on candidate SHA`);
    const candidates = matching
      .map((check) => workflowEvidenceForContext({ context, check, candidateSha: exactSha, repository, githubActionsAppId, workflows, runsById, jobsById }))
      .filter((candidate) => candidate !== null);
    if (candidates.length === 0) fail(`missing current workflow attempt for ${context}`);
    candidates.sort((left, right) => left.attemptStartedAt - right.attemptStartedAt || left.checkRunId - right.checkRunId || left.workflowJobId - right.workflowJobId || left.workflowRunId - right.workflowRunId);
    const chosen = candidates.at(-1);
    if (!chosen?.trustedSuccess) fail(`latest trusted check result for ${context} is not terminal success`);
    const identity = { ...chosen };
    delete identity.attemptStartedAt;
    delete identity.trustedSuccess;
    return identity;
  }).sort((left, right) => (left.context < right.context ? -1 : left.context > right.context ? 1 : 0));
  return {
    repository,
    githubActionsAppId,
    candidateSha: exactSha,
    workflows: workflowEvidence,
  };
}

export function redactSecretShapedValues(value, key = '') {
  if (/token|secret|password|authorization|cookie|api.?key/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactSecretShapedValues(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactSecretShapedValues(item, name)]));
  }
  if (typeof value === 'string' && /:\/\/[^/\s:@]+:[^/\s@]+@|[?&](?:token|secret|key|password)=/i.test(value)) {
    return '[REDACTED]';
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  if (!inputPath || args.length !== 1) fail('expected one JSON evidence file path');
  const evidence = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = aggregateExactShaEvidence(evidence);
  console.log(`Exact-SHA contexts passed: ${result.workflows.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Exact-SHA evidence failed');
    process.exitCode = 1;
  });
}
