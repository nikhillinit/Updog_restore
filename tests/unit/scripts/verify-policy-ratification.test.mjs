import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { main } from '../../../scripts/release/verify-policy-ratification.mjs';

const ENV_NAME = 'Production Policy Ratification';
const ENV_ID = 4242;
const OWNER = 'octo-owner';
const REPO = 'octo-owner/updog';
const RUN_ID = '9999';
const SOURCE_SHA = 'a'.repeat(40);

const TEMPLATE = [
  'RELEASE-POLICY-RATIFICATION-V1',
  `run_id: ${RUN_ID}`,
  'run_attempt: 1',
  `source_sha: ${SOURCE_SHA}`,
  `policy_config_payload_sha256: ${'b'.repeat(64)}`,
  `policy_measurement_payload_sha256: ${'c'.repeat(64)}`,
  `characterization_file_sha256: ${'d'.repeat(64)}`,
  `canary_result_payload_sha256: ${'e'.repeat(64)}`,
  'decision: approved',
].join('\n');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function environmentFixture(overrides = {}) {
  return {
    id: ENV_ID,
    name: ENV_NAME,
    can_admins_bypass: false,
    protection_rules: [
      {
        id: 1,
        type: 'required_reviewers',
        prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { login: OWNER } }],
      },
    ],
    ...overrides,
  };
}

function policyApproval(overrides = {}) {
  return {
    environments: [{ id: ENV_ID, name: ENV_NAME }],
    state: 'approved',
    user: { login: OWNER },
    comment: TEMPLATE,
    ...overrides,
  };
}

// An earlier Production-environment review record; expected and ignored.
function productionApproval() {
  return {
    environments: [{ id: 1, name: 'Production' }],
    state: 'approved',
    user: { login: OWNER },
    comment: 'ship it',
  };
}

function permissionFixture(overrides = {}) {
  return { user: { login: OWNER }, role_name: 'admin', permission: 'admin', ...overrides };
}

function makeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    const handler = routes.find(([suffix]) => url.pathname === suffix);
    if (!handler) throw new Error(`unexpected fetch ${url.pathname}`);
    return {
      ok: true,
      status: 200,
      redirected: false,
      url: url.toString(),
      json: async () => JSON.parse(JSON.stringify(handler[1])),
    };
  };
  return { fetchImpl, calls };
}

const ENVIRONMENT_PATH = `/repos/${REPO}/environments/Production%20Policy%20Ratification`;
const APPROVALS_PATH = `/repos/${REPO}/actions/runs/${RUN_ID}/approvals`;
const PERMISSION_PATH = `/repos/${REPO}/collaborators/${OWNER}/permission`;

async function runVerifier({
  environment = environmentFixture(),
  approvals = [productionApproval(), policyApproval()],
  permission = permissionFixture(),
  template = TEMPLATE,
  argv,
} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ratification-'));
  const commentFile = path.join(dir, 'expected-comment.txt');
  await writeFile(commentFile, template);
  const outputPath = path.join(dir, 'result.json');
  const { fetchImpl, calls } = makeFetch([
    [ENVIRONMENT_PATH, environment],
    [APPROVALS_PATH, approvals],
    [PERMISSION_PATH, permission],
  ]);
  const lines = [];
  const result = await main(
    argv ?? [
      '--environment-name',
      ENV_NAME,
      '--run-id',
      RUN_ID,
      '--run-attempt',
      '1',
      '--expected-comment-file',
      commentFile,
      '--output',
      outputPath,
    ],
    { GH_TOKEN: 'test-token', GITHUB_REPOSITORY: REPO },
    { fetchImpl, output: (line) => lines.push(line) }
  );
  return { result, lines, calls, outputPath };
}

describe('verify-policy-ratification', () => {
  it('verifies the happy path and writes identical output file and stdout', async () => {
    const { result, lines, outputPath } = await runVerifier();
    expect(result).toEqual({
      environmentId: String(ENV_ID),
      environmentName: ENV_NAME,
      reviewerLogin: OWNER,
      reviewerPermission: 'admin',
      approvalState: 'approved',
      commentSha256: sha256(TEMPLATE),
      verifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(result);
    const fileContent = (await readFile(outputPath)).toString('utf8');
    expect(fileContent).toBe(`${lines[0]}\n`);
  });

  it('URL-encodes the environment name in the API request', async () => {
    const { calls } = await runVerifier();
    expect(calls[0]).toContain('/environments/Production%20Policy%20Ratification');
  });

  it('tolerates one trailing newline while hashing the exact API comment bytes', async () => {
    const comment = `${TEMPLATE}\n`;
    const { result } = await runVerifier({
      approvals: [policyApproval({ comment })],
    });
    expect(result.commentSha256).toBe(sha256(comment));
  });

  it('rejects when no approval targets the policy environment', async () => {
    await expect(runVerifier({ approvals: [productionApproval()] })).rejects.toThrow(
      /no approval targets/
    );
  });

  it('rejects when multiple approvals target the policy environment', async () => {
    await expect(
      runVerifier({ approvals: [policyApproval(), policyApproval()] })
    ).rejects.toThrow(/multiple approvals/);
  });

  it('rejects a policy approval spanning unexpected environments', async () => {
    await expect(
      runVerifier({
        approvals: [
          policyApproval({
            environments: [
              { id: ENV_ID, name: ENV_NAME },
              { id: 1, name: 'Production' },
            ],
          }),
        ],
      })
    ).rejects.toThrow(/spans unexpected environments/);
  });

  it('rejects a non-approved policy match', async () => {
    await expect(
      runVerifier({ approvals: [productionApproval(), policyApproval({ state: 'rejected' })] })
    ).rejects.toThrow(/not in approved state/);
  });

  it('rejects a comment that does not byte-match the template', async () => {
    await expect(
      runVerifier({
        approvals: [policyApproval({ comment: `${TEMPLATE}\nextra line` })],
      })
    ).rejects.toThrow(/byte-for-byte/);
  });

  it('rejects a matching comment that does not bind run_attempt: 1', async () => {
    const templateWithoutAttempt = TEMPLATE.split('\n')
      .filter((line) => line !== 'run_attempt: 1')
      .join('\n');
    await expect(
      runVerifier({
        template: templateWithoutAttempt,
        approvals: [policyApproval({ comment: templateWithoutAttempt })],
      })
    ).rejects.toThrow(/run_attempt/);
  });

  it('rejects a bypass-capable environment', async () => {
    await expect(
      runVerifier({ environment: environmentFixture({ can_admins_bypass: true }) })
    ).rejects.toThrow(/admin bypass/);
  });

  it('rejects a required_reviewers rule with two reviewers', async () => {
    await expect(
      runVerifier({
        environment: environmentFixture({
          protection_rules: [
            {
              id: 1,
              type: 'required_reviewers',
              prevent_self_review: false,
              reviewers: [
                { type: 'User', reviewer: { login: OWNER } },
                { type: 'User', reviewer: { login: 'someone-else' } },
              ],
            },
          ],
        }),
      })
    ).rejects.toThrow(/exactly one reviewer/);
  });

  it('rejects prevent_self_review enabled', async () => {
    await expect(
      runVerifier({
        environment: environmentFixture({
          protection_rules: [
            {
              id: 1,
              type: 'required_reviewers',
              prevent_self_review: true,
              reviewers: [{ type: 'User', reviewer: { login: OWNER } }],
            },
          ],
        }),
      })
    ).rejects.toThrow(/prevent_self_review/);
  });

  it('ignores branch_policy rules but rejects unexpected rule types', async () => {
    const withBranchPolicy = environmentFixture();
    withBranchPolicy.protection_rules = [
      { id: 2, type: 'branch_policy' },
      ...environmentFixture().protection_rules,
    ];
    const { result } = await runVerifier({ environment: withBranchPolicy });
    expect(result.approvalState).toBe('approved');

    const withWaitTimer = environmentFixture();
    withWaitTimer.protection_rules = [
      { id: 3, type: 'wait_timer', wait_timer: 30 },
      ...environmentFixture().protection_rules,
    ];
    await expect(runVerifier({ environment: withWaitTimer })).rejects.toThrow(
      /unexpected protection rule/
    );
  });

  it('rejects a reviewer who is not the repository owner', async () => {
    await expect(
      runVerifier({
        approvals: [policyApproval({ user: { login: 'someone-else' } })],
      })
    ).rejects.toThrow(/repository owner/);
  });

  it('rejects read collaborator permission', async () => {
    await expect(
      runVerifier({
        permission: permissionFixture({ role_name: 'read', permission: 'read' }),
      })
    ).rejects.toThrow(/admin, maintain, or write/);
  });

  it('rejects a run attempt other than 1 and malformed argv', async () => {
    await expect(
      runVerifier({
        argv: [
          '--environment-name',
          ENV_NAME,
          '--run-id',
          RUN_ID,
          '--run-attempt',
          '2',
          '--expected-comment-file',
          'x',
          '--output',
          'y',
        ],
      })
    ).rejects.toThrow(/--run-attempt must be 1/);
    await expect(runVerifier({ argv: ['--bogus', 'x'] })).rejects.toThrow(/unknown argument/);
    await expect(
      runVerifier({
        argv: [
          '--environment-name',
          ENV_NAME,
          '--environment-name',
          ENV_NAME,
          '--run-id',
          RUN_ID,
          '--run-attempt',
          '1',
          '--expected-comment-file',
          'x',
          '--output',
          'y',
        ],
      })
    ).rejects.toThrow(/only once/);
  });

  it('rejects an exact-name mismatch on the environment', async () => {
    await expect(
      runVerifier({ environment: environmentFixture({ name: 'production policy ratification' }) })
    ).rejects.toThrow(/name does not match/);
  });
});
