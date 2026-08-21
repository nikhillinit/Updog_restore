/**
 * Verify the Production Policy Ratification environment approval for the
 * current release-production run.
 *
 * Proves, from live GitHub API evidence only (never dispatch-actor
 * inference), that:
 *   - the policy environment exists with the exact configured name, cannot be
 *     admin-bypassed, and requires exactly the repository owner as its single
 *     reviewer with prevent_self_review disabled;
 *   - exactly one approval review record targets that environment, is
 *     approved, was authored by the repository owner, and its comment equals
 *     the staged approval template byte-for-byte (at most one trailing
 *     newline ignored on each side) while binding `run_attempt: 1`;
 *   - the reviewer currently holds admin, maintain, or write permission.
 *
 * Mirrors the injectable GitHub API client style of verify-plan-approval.mjs
 * so tests never touch the network.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPROVED_PERMISSIONS = new Set(['admin', 'maintain', 'write']);
const RUN_ID_PATTERN = /^[1-9][0-9]{0,31}$/;
const REPOSITORY_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

function fail(message) {
  throw new Error(`policy ratification verification failed: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameLogin(left, right) {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase()
  );
}

const KNOWN_FLAGS = [
  '--environment-name',
  '--run-id',
  '--run-attempt',
  '--expected-comment-file',
  '--output',
];

export function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!KNOWN_FLAGS.includes(flag)) fail(`unknown argument ${String(flag)}`);
    if (options.has(flag)) fail(`${flag} may be provided only once`);
    const value = argv[index + 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      fail(`${flag} requires a value`);
    }
    options.set(flag, value);
    index += 1;
  }
  for (const flag of KNOWN_FLAGS) {
    if (!options.has(flag)) fail(`${flag} is required`);
  }
  const runId = options.get('--run-id');
  if (!RUN_ID_PATTERN.test(runId)) fail('--run-id must be a positive decimal string');
  if (options.get('--run-attempt') !== '1') fail('--run-attempt must be 1');
  return {
    environmentName: options.get('--environment-name'),
    runId,
    runAttempt: 1,
    expectedCommentFile: options.get('--expected-comment-file'),
    outputPath: options.get('--output'),
  };
}

function githubApiClient({ token, apiBaseUrl = 'https://api.github.com', fetchImpl }) {
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

  return {
    async get(endpoint) {
      const url = new URL(
        String(endpoint).replace(/^\/+/, ''),
        `${baseUrl.toString().replace(/\/$/, '')}/`
      );
      if (url.origin !== baseUrl.origin) fail('GitHub API request crossed origin');
      let response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'updog-policy-ratification-verifier',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'error',
        });
      } catch {
        fail(`GitHub API request failed for ${url.pathname}`);
      }
      if (!response?.ok) {
        fail(
          `GitHub API request returned status ${response?.status ?? 'unknown'} for ${url.pathname}`
        );
      }
      if (response.redirected === true) fail(`GitHub API redirected request for ${url.pathname}`);
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
        return await response.json();
      } catch {
        fail(`GitHub API returned malformed JSON for ${url.pathname}`);
      }
    },
  };
}

export function normalizeEnvironment(environment, { environmentName, ownerLogin }) {
  if (!environment || typeof environment !== 'object') fail('environment API evidence is missing');
  if (environment.name !== environmentName) fail('environment name does not match exactly');
  if (!Number.isSafeInteger(environment.id) || environment.id < 1) {
    fail('environment id is not a positive integer');
  }
  if (environment.can_admins_bypass !== false) {
    fail('environment must not allow admin bypass');
  }
  const rules = environment.protection_rules;
  if (!Array.isArray(rules)) fail('environment protection rules are missing');
  // deployment branch policy entries are irrelevant to ratification; every
  // other non-required_reviewers rule type is unexpected configuration.
  const reviewerRules = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') fail('environment protection rule is malformed');
    if (rule.type === 'required_reviewers') {
      reviewerRules.push(rule);
      continue;
    }
    if (rule.type === 'branch_policy') continue;
    fail(`environment has unexpected protection rule type ${String(rule.type)}`);
  }
  if (reviewerRules.length !== 1) {
    fail('environment must have exactly one required_reviewers protection rule');
  }
  const rule = reviewerRules[0];
  if (rule.prevent_self_review !== false) {
    fail('required_reviewers rule must have prevent_self_review disabled');
  }
  if (!Array.isArray(rule.reviewers) || rule.reviewers.length !== 1) {
    fail('required_reviewers rule must name exactly one reviewer');
  }
  const reviewer = rule.reviewers[0];
  if (reviewer?.type !== 'User' || !sameLogin(reviewer?.reviewer?.login, ownerLogin)) {
    fail('required reviewer must be exactly the repository owner');
  }
  return { id: environment.id, name: environment.name };
}

function stripOneTrailingNewline(text) {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

export function normalizeApproval(
  approvals,
  { environmentId, environmentName, ownerLogin, expectedComment, runAttempt }
) {
  if (!Array.isArray(approvals)) fail('run approvals API evidence is missing');
  const matches = approvals.filter(
    (entry) =>
      Array.isArray(entry?.environments) &&
      entry.environments.some(
        (candidate) => candidate?.id === environmentId && candidate?.name === environmentName
      )
  );
  if (matches.length === 0) fail('no approval targets the policy environment');
  if (matches.length > 1) fail('multiple approvals target the policy environment');
  const match = matches[0];
  if (match.environments.length !== 1) {
    fail('policy approval spans unexpected environments');
  }
  if (match.state !== 'approved') fail('policy approval is not in approved state');
  const comment = match.comment;
  if (typeof comment !== 'string' || comment === '') fail('policy approval comment is empty');
  if (typeof expectedComment !== 'string' || expectedComment === '') {
    fail('expected approval comment template is empty');
  }
  if (stripOneTrailingNewline(comment) !== stripOneTrailingNewline(expectedComment)) {
    fail('policy approval comment does not equal the expected template byte-for-byte');
  }
  if (runAttempt !== 1) fail('policy approval requires run attempt 1');
  if (!comment.split('\n').includes(`run_attempt: ${runAttempt}`)) {
    fail('policy approval comment does not bind run_attempt: 1');
  }
  const reviewerLogin = match.user?.login;
  if (typeof reviewerLogin !== 'string' || !sameLogin(reviewerLogin, ownerLogin)) {
    fail('policy approval reviewer is not the repository owner');
  }
  return { reviewerLogin, commentSha256: sha256(comment) };
}

export function normalizeCollaboratorPermission(permission, expectedLogin) {
  if (!permission || typeof permission !== 'object') {
    fail('collaborator permission API evidence is missing');
  }
  if (!sameLogin(permission.user?.login, expectedLogin)) {
    fail('collaborator permission API returned a different user');
  }
  if (APPROVED_PERMISSIONS.has(permission.role_name)) return permission.role_name;
  if (APPROVED_PERMISSIONS.has(permission.permission)) return permission.permission;
  fail('collaborator permission API did not prove admin, maintain, or write access');
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  {
    fetchImpl = globalThis.fetch,
    readFileImpl = readFile,
    writeFileImpl = writeFile,
    output = console.log,
  } = {}
) {
  const options = parseArgs(argv);
  const repositoryMatch = REPOSITORY_PATTERN.exec(env.GITHUB_REPOSITORY ?? '');
  if (!repositoryMatch) fail('GITHUB_REPOSITORY must be owner/name');
  const [, ownerLogin, repositoryName] = repositoryMatch;
  const client = githubApiClient({
    token: env.GH_TOKEN || env.GITHUB_TOKEN,
    apiBaseUrl: env.GITHUB_API_URL || 'https://api.github.com',
    fetchImpl,
  });
  let expectedComment;
  try {
    expectedComment = (await readFileImpl(path.resolve(options.expectedCommentFile))).toString(
      'utf8'
    );
  } catch {
    fail('expected approval comment template could not be read');
  }
  const repoPath = `repos/${ownerLogin}/${repositoryName}`;
  const environment = normalizeEnvironment(
    await client.get(`${repoPath}/environments/${encodeURIComponent(options.environmentName)}`),
    { environmentName: options.environmentName, ownerLogin }
  );
  const approval = normalizeApproval(
    await client.get(`${repoPath}/actions/runs/${options.runId}/approvals`),
    {
      environmentId: environment.id,
      environmentName: environment.name,
      ownerLogin,
      expectedComment,
      runAttempt: options.runAttempt,
    }
  );
  const reviewerPermission = normalizeCollaboratorPermission(
    await client.get(
      `${repoPath}/collaborators/${encodeURIComponent(approval.reviewerLogin)}/permission`
    ),
    approval.reviewerLogin
  );
  const result = {
    environmentId: String(environment.id),
    environmentName: environment.name,
    reviewerLogin: approval.reviewerLogin,
    reviewerPermission,
    approvalState: 'approved',
    commentSha256: approval.commentSha256,
    verifiedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(result);
  await writeFileImpl(path.resolve(options.outputPath), `${serialized}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  output(serialized);
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath.toLowerCase() === modulePath.toLowerCase()) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'policy ratification verification failed'
    );
    process.exitCode = 1;
  });
}
