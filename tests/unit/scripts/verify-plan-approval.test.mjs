import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPlanApprovalBody,
  buildPlanReviewBody,
  collectIssueComments,
  evaluatePlanApproval,
  main,
} from '../../../scripts/release/verify-plan-approval.mjs';

const PLAN_PATH = 'docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md';
const PLAN_SHA256 = 'a'.repeat(64);
const APPROVED_BASE_HEAD_SHA = 'b'.repeat(40);
const DESCENDANT_HEAD_SHA = 'c'.repeat(40);
const APPROVER_LOGIN = 'nikhillinit';
const REVIEW_COMMENT_ID = 101;
const APPROVAL_COMMENT_ID = 202;
const CI_GATE_CHECK_RUN_ID = 303;
const CI_COMPLETED_AT = '2026-08-11T11:59:00Z';
const CREATED_AT = '2026-08-11T12:00:00Z';
const SEPARATION_MODEL = 'single-maintainer-owner-attestation';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reviewBody(overrides = {}) {
  return buildPlanReviewBody({
    planPath: PLAN_PATH,
    planSha256: PLAN_SHA256,
    reviewedHeadSha: APPROVED_BASE_HEAD_SHA,
    ciGateCheckRunId: CI_GATE_CHECK_RUN_ID,
    ...overrides,
  });
}

function approvalBody(overrides = {}) {
  return buildPlanApprovalBody({
    planPath: PLAN_PATH,
    planSha256: PLAN_SHA256,
    approvedBaseHeadSha: APPROVED_BASE_HEAD_SHA,
    approverLogin: APPROVER_LOGIN,
    reviewCommentId: REVIEW_COMMENT_ID,
    reviewBodySha256: sha256(reviewBody()),
    ciGateCheckRunId: CI_GATE_CHECK_RUN_ID,
    separationModel: SEPARATION_MODEL,
    ...overrides,
  });
}

function issueComment(id, body, overrides = {}) {
  return {
    id,
    html_url: `https://github.com/nikhillinit/Updog_restore/pull/1385#issuecomment-${id}`,
    user: { login: APPROVER_LOGIN },
    body,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function validInput() {
  return {
    planPath: PLAN_PATH,
    planSha256: PLAN_SHA256,
    approvedBaseHeadSha: APPROVED_BASE_HEAD_SHA,
    liveHeadSha: APPROVED_BASE_HEAD_SHA,
    requireExactHead: true,
    approverLogin: APPROVER_LOGIN,
    repositoryOwnerLogin: APPROVER_LOGIN,
    collaboratorPermission: 'admin',
    comments: [
      issueComment(REVIEW_COMMENT_ID, reviewBody()),
      issueComment(APPROVAL_COMMENT_ID, approvalBody()),
    ],
    commentsComplete: true,
    checkRun: {
      id: CI_GATE_CHECK_RUN_ID,
      name: 'CI Gate Status',
      head_sha: APPROVED_BASE_HEAD_SHA,
      status: 'completed',
      conclusion: 'success',
      completed_at: CI_COMPLETED_AT,
      app: { slug: 'github-actions', name: 'GitHub Actions', owner: { login: 'github' } },
    },
    ancestry: {
      baseSha: APPROVED_BASE_HEAD_SHA,
      headSha: APPROVED_BASE_HEAD_SHA,
      status: 'identical',
      mergeBaseSha: APPROVED_BASE_HEAD_SHA,
    },
  };
}

function expectRejected(input, pattern = /approval|review|failed|invalid/i) {
  expect(() => evaluatePlanApproval(input)).toThrow(pattern);
}

describe('plan approval exact V2 bodies', () => {
  it('builds fixed-order review and approval bodies exactly', () => {
    expect(reviewBody()).toBe(`PLAN-REVIEW-V2
plan_path: ${PLAN_PATH}
plan_sha256: ${PLAN_SHA256}
reviewed_head_sha: ${APPROVED_BASE_HEAD_SHA}
reviewer_kind: independent-read-only-agent
review_verdict: approved
ci_gate_check_run_id: ${CI_GATE_CHECK_RUN_ID}
blocking_findings: none`);

    expect(approvalBody()).toBe(`PLAN-APPROVAL-V2
plan_path: ${PLAN_PATH}
plan_sha256: ${PLAN_SHA256}
approved_base_head_sha: ${APPROVED_BASE_HEAD_SHA}
approver_login: ${APPROVER_LOGIN}
review_comment_id: ${REVIEW_COMMENT_ID}
review_body_sha256: ${sha256(reviewBody())}
ci_gate_check_run_id: ${CI_GATE_CHECK_RUN_ID}
separation_model: ${SEPARATION_MODEL}
decision: approved
accepted_exceptions: none`);
  });

  it('accepts one outer trim but rejects prefixes, suffixes, fences, and embedded blocks', () => {
    const trimmed = validInput();
    trimmed.comments[0].body = ` \n${reviewBody()}\n\t`;
    trimmed.comments[1].body = `\n${approvalBody()}\n`;
    expect(evaluatePlanApproval(trimmed).decision).toBe('approved');

    for (const mutate of [
      (body) => `prefix\n${body}`,
      (body) => `${body}\nsuffix`,
      (body) => `\`\`\`text\n${body}\n\`\`\``,
      (body) => `request follows:\n\n${body}\n\nthanks`,
    ]) {
      const review = validInput();
      review.comments[0].body = mutate(reviewBody());
      expectRejected(review);
      const approval = validInput();
      approval.comments[1].body = mutate(approvalBody());
      expectRejected(approval);
    }
  });

  it('never treats request markers or near-match approval fields as approval', () => {
    const request = validInput();
    request.comments[1].body = approvalBody().replace('PLAN-APPROVAL-V2', 'PLAN-REVIEW-REQUEST-V2');
    expectRejected(request);

    const mutations = [
      ['plan_path:', 'plan_path: other-'],
      [PLAN_SHA256, 'd'.repeat(64)],
      [APPROVED_BASE_HEAD_SHA, 'e'.repeat(40)],
      [`approver_login: ${APPROVER_LOGIN}`, 'approver_login: someone-else'],
      [`review_comment_id: ${REVIEW_COMMENT_ID}`, 'review_comment_id: 999'],
      [sha256(reviewBody()), 'f'.repeat(64)],
      [`ci_gate_check_run_id: ${CI_GATE_CHECK_RUN_ID}`, 'ci_gate_check_run_id: 999'],
      [SEPARATION_MODEL, 'two-party-review'],
      ['decision: approved', 'decision: review_requested'],
      ['accepted_exceptions: none', 'accepted_exceptions: known-risk'],
    ];
    for (const [from, to] of mutations) {
      const input = validInput();
      input.comments[1].body = approvalBody().replace(from, to);
      expectRejected(input);
    }
  });

  it('rejects review bodies with any wrong binding, verdict, reviewer kind, or finding', () => {
    for (const [from, to] of [
      [PLAN_PATH, 'docs/other-plan.md'],
      [PLAN_SHA256, 'd'.repeat(64)],
      [APPROVED_BASE_HEAD_SHA, 'e'.repeat(40)],
      ['reviewer_kind: independent-read-only-agent', 'reviewer_kind: implementation-agent'],
      ['review_verdict: approved', 'review_verdict: changes_requested'],
      [`ci_gate_check_run_id: ${CI_GATE_CHECK_RUN_ID}`, 'ci_gate_check_run_id: 999'],
      ['blocking_findings: none', 'blocking_findings: one'],
    ]) {
      const input = validInput();
      input.comments[0].body = reviewBody().replace(from, to);
      expectRejected(input);
    }
  });
});

describe('plan approval evidence evaluation', () => {
  it.each(['admin', 'maintain', 'write'])(
    'accepts live collaborator permission %s',
    (permission) => {
      const input = validInput();
      input.collaboratorPermission = permission;
      expect(evaluatePlanApproval(input)).toMatchObject({ decision: 'approved', permission });
    }
  );

  it.each(['read', 'triage', 'none', null])(
    'fails closed for insufficient permission %s',
    (permission) => {
      const input = validInput();
      input.collaboratorPermission = permission;
      expectRejected(input, /permission/i);
    }
  );

  it('requires comment author, declared approver, and repository owner to be identical', () => {
    for (const mutate of [
      (input) => {
        input.approverLogin = 'someone-else';
      },
      (input) => {
        input.repositoryOwnerLogin = 'someone-else';
      },
      (input) => {
        input.comments[0].user.login = 'someone-else';
      },
      (input) => {
        input.comments[1].user.login = 'someone-else';
      },
    ]) {
      const input = validInput();
      mutate(input);
      expectRejected(input, /author|approver|owner|login|review|approval/i);
    }
  });

  it('rejects edited review or approval even when exact body is restored', () => {
    for (const index of [0, 1]) {
      const input = validInput();
      input.comments[index].updated_at = '2026-08-11T12:01:00Z';
      expectRejected(input, /edited|timestamp|updated/i);
    }
  });

  it('requires exactly one applicable unedited review and approval', () => {
    for (const comments of [
      [],
      [issueComment(REVIEW_COMMENT_ID, reviewBody())],
      [issueComment(APPROVAL_COMMENT_ID, approvalBody())],
    ]) {
      const input = validInput();
      input.comments = comments;
      expectRejected(input, /exactly one|zero|approval|review/i);
    }

    const duplicateReview = validInput();
    duplicateReview.comments.push(issueComment(102, reviewBody()));
    expectRejected(duplicateReview, /review|multiple|exactly one/i);

    const duplicateApproval = validInput();
    duplicateApproval.comments.push(issueComment(203, approvalBody()));
    expectRejected(duplicateApproval, /approval|multiple|exactly one/i);
  });

  it('ignores non-owner copies and historical non-ancestor approval tuples', () => {
    const input = validInput();
    input.comments.push(
      issueComment(777, reviewBody(), { user: { login: 'public-reader' } }),
      issueComment(778, approvalBody(), { user: { login: 'public-reader' } })
    );
    input.comments.push(
      issueComment(781, approvalBody().replace(SEPARATION_MODEL, 'malformed-public-copy'), {
        user: { login: 'public-reader' },
      })
    );
    const historicalReview = reviewBody({ reviewedHeadSha: 'd'.repeat(40) });
    input.comments.push(
      issueComment(779, historicalReview),
      issueComment(
        780,
        buildPlanApprovalBody({
          planPath: PLAN_PATH,
          planSha256: PLAN_SHA256,
          approvedBaseHeadSha: 'd'.repeat(40),
          approverLogin: APPROVER_LOGIN,
          reviewCommentId: 779,
          reviewBodySha256: sha256(historicalReview),
          ciGateCheckRunId: CI_GATE_CHECK_RUN_ID,
          separationModel: SEPARATION_MODEL,
        })
      )
    );

    expect(evaluatePlanApproval(input)).toMatchObject({
      approval: { commentId: APPROVAL_COMMENT_ID },
      review: { commentId: REVIEW_COMMENT_ID },
    });
  });

  it('treats deletion as zero approvals and a later exact repost as a new record', () => {
    const deleted = validInput();
    deleted.comments = deleted.comments.filter(({ id }) => id !== APPROVAL_COMMENT_ID);
    expectRejected(deleted, /approval|zero|exactly one/i);

    const reposted = validInput();
    reposted.comments[1] = issueComment(909, approvalBody(), {
      created_at: '2026-08-11T12:05:00Z',
      updated_at: '2026-08-11T12:05:00Z',
    });
    expect(evaluatePlanApproval(reposted).approval).toMatchObject({
      commentId: 909,
      createdAt: '2026-08-11T12:05:00Z',
    });
  });

  it('requires linked review identity and exact trimmed body SHA-256', () => {
    const wrongId = validInput();
    wrongId.comments[0].id = 999;
    expectRejected(wrongId, /review|comment|id/i);

    const wrongHash = validInput();
    wrongHash.comments[1].body = approvalBody({ reviewBodySha256: 'f'.repeat(64) });
    expectRejected(wrongHash, /review|hash|approval/i);
  });

  it.each([
    ['name', 'Other Check'],
    ['head_sha', DESCENDANT_HEAD_SHA],
    ['status', 'in_progress'],
    ['conclusion', 'failure'],
  ])('rejects stale or failed CI when %s is wrong', (key, value) => {
    const input = validInput();
    input.checkRun[key] = value;
    expectRejected(input, /check|CI|head|success|completed/i);
  });

  it('requires the referenced check-run ID and repository GitHub Actions app', () => {
    const wrongId = validInput();
    wrongId.checkRun.id = 999;
    expectRejected(wrongId, /check|id/i);

    for (const app of [null, { slug: 'foreign-ci', name: 'Foreign CI' }]) {
      const input = validInput();
      input.checkRun.app = app;
      expectRejected(input, /Actions|app|repository/i);
    }

    for (const [key, value] of [
      ['slug', 'foreign-actions'],
      ['name', 'Foreign Actions'],
    ]) {
      const input = validInput();
      input.checkRun.app[key] = value;
      expectRejected(input, /Actions|app|repository/i);
    }
    const wrongOwner = validInput();
    wrongOwner.checkRun.app.owner.login = 'someone-else';
    expectRejected(wrongOwner, /Actions|app|repository/i);
  });

  it('requires CI completion before review and review before approval', () => {
    const lateCi = validInput();
    lateCi.checkRun.completed_at = '2026-08-11T12:01:00Z';
    expectRejected(lateCi, /timestamp|order|completion/i);

    const earlyApproval = validInput();
    earlyApproval.comments[0].created_at = '2026-08-11T12:01:00Z';
    earlyApproval.comments[0].updated_at = '2026-08-11T12:01:00Z';
    expectRejected(earlyApproval, /timestamp|order|review|approval/i);
  });

  it('requires exact live head before Task 1 and accepts only proved descendants later', () => {
    const exact = validInput();
    expect(evaluatePlanApproval(exact).liveHeadSha).toBe(APPROVED_BASE_HEAD_SHA);

    const descendant = validInput();
    descendant.requireExactHead = false;
    descendant.liveHeadSha = DESCENDANT_HEAD_SHA;
    descendant.ancestry = {
      baseSha: APPROVED_BASE_HEAD_SHA,
      headSha: DESCENDANT_HEAD_SHA,
      status: 'ahead',
      mergeBaseSha: APPROVED_BASE_HEAD_SHA,
    };
    expect(evaluatePlanApproval(descendant).liveHeadSha).toBe(DESCENDANT_HEAD_SHA);

    const staleExact = clone(descendant);
    staleExact.requireExactHead = true;
    expectRejected(staleExact, /exact|head/i);

    for (const status of ['behind', 'diverged', 'unknown']) {
      const unrelated = clone(descendant);
      unrelated.ancestry.status = status;
      unrelated.ancestry.mergeBaseSha = 'd'.repeat(40);
      expectRejected(unrelated, /ancestor|comparison|head/i);
    }
  });

  it('fails closed for plan drift, missing evidence, API errors, and incomplete pagination', () => {
    const drifted = validInput();
    drifted.planSha256 = 'd'.repeat(64);
    expectRejected(drifted, /plan|approval|review/i);

    const missingComment = validInput();
    missingComment.comments = undefined;
    expectRejected(missingComment);

    const truncated = validInput();
    truncated.commentsComplete = false;
    expectRejected(truncated, /pagination|complete/i);

    const uncertain = validInput();
    uncertain.collaboratorPermission = undefined;
    expectRejected(uncertain, /API|permission|error/i);
  });

  it('returns only normalized allowlisted evidence and never arbitrary bodies or secrets', () => {
    const input = validInput();
    input.token = 'ghp_super_secret';
    input.unrelatedComments = [{ body: 'arbitrary private text' }];
    input.comments.push(issueComment(404, 'unrelated body containing ghp_other_secret'));
    input.checkRun.output = { text: 'workflow log secret' };

    const result = evaluatePlanApproval(input);
    expect(result).toEqual({
      decision: 'approved',
      separationModel: SEPARATION_MODEL,
      plan: { path: PLAN_PATH, sha256: PLAN_SHA256 },
      approvedBaseHeadSha: APPROVED_BASE_HEAD_SHA,
      liveHeadSha: APPROVED_BASE_HEAD_SHA,
      permission: 'admin',
      review: {
        commentId: REVIEW_COMMENT_ID,
        url: `https://github.com/nikhillinit/Updog_restore/pull/1385#issuecomment-${REVIEW_COMMENT_ID}`,
        author: APPROVER_LOGIN,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        bodySha256: sha256(reviewBody()),
      },
      approval: {
        commentId: APPROVAL_COMMENT_ID,
        url: `https://github.com/nikhillinit/Updog_restore/pull/1385#issuecomment-${APPROVAL_COMMENT_ID}`,
        author: APPROVER_LOGIN,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        bodySha256: sha256(approvalBody()),
      },
      checkRun: { id: CI_GATE_CHECK_RUN_ID, name: 'CI Gate Status', conclusion: 'success' },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('ghp_');
    expect(serialized).not.toContain('arbitrary private text');
    expect(serialized).not.toContain('workflow log secret');
    expect(serialized).not.toContain('unrelatedComments');
  });
});

function page(url, data, link = null) {
  return { data, link, url: new URL(url) };
}

function mainHarness({
  liveHead = APPROVED_BASE_HEAD_SHA,
  secondHead = liveHead,
  localHead = APPROVED_BASE_HEAD_SHA,
  permissionUser = APPROVER_LOGIN,
  legacyPermission = 'write',
  secondPermissionRole = 'maintain',
  includeHistoricalTuple = false,
  removeApprovalOnSecondRead = false,
  requireExactHead = true,
  remotePlanDrift = false,
  untrackedPlan = false,
  redirectedResponse = false,
  omitResponseUrl = false,
  responseQueryDrift = false,
  malformedJson = false,
  httpStatus = 200,
} = {}) {
  const planBytes = Buffer.from('tracked plan bytes\n');
  const planSha256 = sha256(planBytes);
  const review = buildPlanReviewBody({
    planPath: PLAN_PATH,
    planSha256,
    reviewedHeadSha: APPROVED_BASE_HEAD_SHA,
    ciGateCheckRunId: CI_GATE_CHECK_RUN_ID,
  });
  const approval = buildPlanApprovalBody({
    planPath: PLAN_PATH,
    planSha256,
    approvedBaseHeadSha: APPROVED_BASE_HEAD_SHA,
    approverLogin: APPROVER_LOGIN,
    reviewCommentId: REVIEW_COMMENT_ID,
    reviewBodySha256: sha256(review),
    ciGateCheckRunId: CI_GATE_CHECK_RUN_ID,
    separationModel: SEPARATION_MODEL,
  });
  const comments = [
    issueComment(REVIEW_COMMENT_ID, review),
    issueComment(APPROVAL_COMMENT_ID, approval),
  ];
  if (includeHistoricalTuple) {
    const historicalHead = 'd'.repeat(40);
    const historicalReview = buildPlanReviewBody({
      planPath: PLAN_PATH,
      planSha256,
      reviewedHeadSha: historicalHead,
      ciGateCheckRunId: 404,
    });
    comments.push(
      issueComment(405, historicalReview),
      issueComment(
        406,
        buildPlanApprovalBody({
          planPath: PLAN_PATH,
          planSha256,
          approvedBaseHeadSha: historicalHead,
          approverLogin: APPROVER_LOGIN,
          reviewCommentId: 405,
          reviewBodySha256: sha256(historicalReview),
          ciGateCheckRunId: 404,
          separationModel: SEPARATION_MODEL,
        })
      )
    );
  }
  let pullReads = 0;
  let permissionReads = 0;
  let commentReads = 0;
  const fetchImpl = vi.fn(async (url) => {
    const requestUrl = new URL(url);
    let data;
    if (requestUrl.pathname.endsWith('/issues/1385/comments')) {
      commentReads += 1;
      data =
        removeApprovalOnSecondRead && commentReads > 1
          ? comments.filter(({ id }) => id !== APPROVAL_COMMENT_ID)
          : comments;
    } else if (requestUrl.pathname.endsWith('/pulls/1385')) {
      pullReads += 1;
      data = { head: { sha: pullReads === 1 ? liveHead : secondHead } };
    } else if (requestUrl.pathname.endsWith(`/check-runs/${CI_GATE_CHECK_RUN_ID}`)) {
      data = validInput().checkRun;
    } else if (requestUrl.pathname.includes('/compare/')) {
      const historicalHead = 'd'.repeat(40);
      const comparesHistorical = requestUrl.pathname.includes(`/compare/${historicalHead}...`);
      data = comparesHistorical
        ? {
            status: 'diverged',
            base_commit: { sha: historicalHead },
            merge_base_commit: { sha: 'e'.repeat(40) },
          }
        : liveHead === APPROVED_BASE_HEAD_SHA
          ? {
              status: 'identical',
              base_commit: { sha: APPROVED_BASE_HEAD_SHA },
              merge_base_commit: { sha: APPROVED_BASE_HEAD_SHA },
            }
          : {
              status: 'ahead',
              base_commit: { sha: APPROVED_BASE_HEAD_SHA },
              merge_base_commit: { sha: APPROVED_BASE_HEAD_SHA },
            };
    } else if (requestUrl.pathname.endsWith(`/collaborators/${APPROVER_LOGIN}/permission`)) {
      permissionReads += 1;
      data = {
        permission: legacyPermission,
        role_name: permissionReads === 1 ? 'maintain' : secondPermissionRole,
        user: { login: permissionUser },
      };
    } else if (requestUrl.pathname.endsWith('/repos/nikhillinit/Updog_restore')) {
      data = { owner: { login: APPROVER_LOGIN } };
    } else {
      throw new Error(`Unexpected API path: ${requestUrl.pathname}`);
    }
    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      status: httpStatus,
      redirected: redirectedResponse,
      url: omitResponseUrl
        ? ''
        : responseQueryDrift
          ? `${requestUrl.toString()}${requestUrl.search ? '&' : '?'}unexpected=1`
          : requestUrl.toString(),
      headers: { get: () => null },
      json: async () => {
        if (malformedJson) throw new SyntaxError('malformed');
        return data;
      },
    };
  });
  const execFileImpl = vi.fn(async (_file, args) => {
    if (args[0] === 'ls-files') {
      if (untrackedPlan) throw new Error('untracked');
      return { stdout: PLAN_PATH };
    }
    if (args[0] === 'diff') return { stdout: '' };
    if (args[0] === 'rev-parse') return { stdout: `${localHead}\n` };
    if (args[0] === 'merge-base') return { stdout: '' };
    if (args[0] === 'show') {
      if (remotePlanDrift && args[1] === `${liveHead}:${PLAN_PATH}`) {
        return { stdout: Buffer.from('remote plan drift') };
      }
      return { stdout: planBytes };
    }
    throw new Error(`Unexpected git command: ${args.join(' ')}`);
  });
  const outputs = [];
  return {
    args: [
      '--repo',
      'nikhillinit/Updog_restore',
      '--pr',
      '1385',
      '--plan-path',
      PLAN_PATH,
      '--approver-login',
      APPROVER_LOGIN,
      ...(requireExactHead ? ['--require-exact-head'] : []),
    ],
    dependencies: {
      cwd: '/repo',
      execFileImpl,
      fetchImpl,
      output: (value) => outputs.push(value),
      readFileImpl: vi.fn(async () => planBytes),
    },
    execFileImpl,
    fetchImpl,
    outputs,
  };
}

describe('plan approval GitHub adapter', () => {
  it('follows validated Link pagination and rejects truncated or cross-origin pages', async () => {
    const firstUrl = 'https://api.github.com/repos/o/r/issues/1/comments?page=1&per_page=100';
    const nextUrl = 'https://api.github.com/repos/o/r/issues/1/comments?page=2&per_page=100';
    const firstItems = Array.from({ length: 100 }, (_, id) => ({ id }));
    const client = {
      getPage: vi
        .fn()
        .mockResolvedValueOnce(page(firstUrl, firstItems, `<${nextUrl}>; rel="next"`))
        .mockResolvedValueOnce(page(nextUrl, [{ id: 100 }])),
    };
    await expect(collectIssueComments(client, 'o', 'r', 1)).resolves.toHaveLength(101);
    expect(client.getPage).toHaveBeenCalledTimes(2);

    const noLink = {
      getPage: vi
        .fn()
        .mockResolvedValueOnce(page(firstUrl, firstItems))
        .mockResolvedValueOnce(page(nextUrl, [])),
    };
    await expect(collectIssueComments(noLink, 'o', 'r', 1)).resolves.toHaveLength(100);
    expect(noLink.getPage).toHaveBeenCalledTimes(2);

    const truncated = {
      getPage: vi.fn(async () => page(firstUrl, [{ id: 1 }], `<${nextUrl}>; rel="next"`)),
    };
    await expect(collectIssueComments(truncated, 'o', 'r', 1)).rejects.toThrow(/truncated/i);

    const foreign = {
      getPage: vi.fn(async () =>
        page(
          firstUrl,
          firstItems,
          '<https://evil.example/comments?page=2&per_page=100>; rel="next"'
        )
      ),
    };
    await expect(collectIssueComments(foreign, 'o', 'r', 1)).rejects.toThrow(/endpoint|origin/i);

    const malformed = {
      getPage: vi.fn(async () => page(firstUrl, firstItems, 'not-a-link-header')),
    };
    await expect(collectIssueComments(malformed, 'o', 'r', 1)).rejects.toThrow(/malformed/i);

    const malformedParameter = {
      getPage: vi.fn(async () => page(firstUrl, firstItems, `<${nextUrl}>; rel="next"; malformed`)),
    };
    await expect(collectIssueComments(malformedParameter, 'o', 'r', 1)).rejects.toThrow(
      /malformed/i
    );

    const apiError = {
      getPage: vi.fn(async () => {
        throw new Error('denied');
      }),
    };
    await expect(collectIssueComments(apiError, 'o', 'r', 1)).rejects.toThrow(/denied/i);
  });

  it('normalizes maintain role, re-reads mutable API evidence, and prints only normalized JSON', async () => {
    const harness = mainHarness();
    const result = await main(harness.args, { GH_TOKEN: 'test-token' }, harness.dependencies);
    expect(result.permission).toBe('maintain');
    expect(harness.outputs).toEqual([JSON.stringify(result)]);
    const requestedPaths = harness.fetchImpl.mock.calls.map(([url]) => new URL(url).pathname);
    expect(requestedPaths.filter((value) => value.endsWith('/issues/1385/comments'))).toHaveLength(
      2
    );
    expect(requestedPaths.filter((value) => value.endsWith('/pulls/1385'))).toHaveLength(2);
    expect(harness.execFileImpl).toHaveBeenCalledWith(
      'git',
      ['show', `${APPROVED_BASE_HEAD_SHA}:${PLAN_PATH}`],
      expect.objectContaining({ cwd: '/repo', encoding: 'buffer' })
    );
  });

  it('ignores stale same-digest non-ancestor tuples after a rebase refresh', async () => {
    const harness = mainHarness({ includeHistoricalTuple: true, requireExactHead: false });
    await expect(
      main(harness.args, { GH_TOKEN: 'token' }, harness.dependencies)
    ).resolves.toMatchObject({
      approvedBaseHeadSha: APPROVED_BASE_HEAD_SHA,
      approval: { commentId: APPROVAL_COMMENT_ID },
    });
  });

  it('accepts a descendant only when its tracked plan digest still matches', async () => {
    const descendant = mainHarness({
      liveHead: DESCENDANT_HEAD_SHA,
      localHead: DESCENDANT_HEAD_SHA,
      requireExactHead: false,
    });
    await expect(
      main(descendant.args, { GH_TOKEN: 'token' }, descendant.dependencies)
    ).resolves.toMatchObject({ liveHeadSha: DESCENDANT_HEAD_SHA });

    const drifted = mainHarness({
      liveHead: DESCENDANT_HEAD_SHA,
      localHead: DESCENDANT_HEAD_SHA,
      remotePlanDrift: true,
      requireExactHead: false,
    });
    await expect(main(drifted.args, { GH_TOKEN: 'token' }, drifted.dependencies)).rejects.toThrow(
      /live PR head plan digest/i
    );
  });

  it('fails when head or collaborator identity changes during verification', async () => {
    const movedHead = mainHarness({ secondHead: DESCENDANT_HEAD_SHA });
    await expect(
      main(movedHead.args, { GH_TOKEN: 'token' }, movedHead.dependencies)
    ).rejects.toThrow(/head changed/i);

    const wrongUser = mainHarness({ permissionUser: 'someone-else' });
    await expect(
      main(wrongUser.args, { GH_TOKEN: 'token' }, wrongUser.dependencies)
    ).rejects.toThrow(/different user/i);

    const inconsistentPermission = mainHarness({ legacyPermission: 'read' });
    await expect(
      main(inconsistentPermission.args, { GH_TOKEN: 'token' }, inconsistentPermission.dependencies)
    ).rejects.toThrow(/inconsistent/i);

    const changedPermission = mainHarness({ secondPermissionRole: 'write' });
    await expect(
      main(changedPermission.args, { GH_TOKEN: 'token' }, changedPermission.dependencies)
    ).rejects.toThrow(/permission changed/i);

    const deletedApproval = mainHarness({ removeApprovalOnSecondRead: true });
    await expect(
      main(deletedApproval.args, { GH_TOKEN: 'token' }, deletedApproval.dependencies)
    ).rejects.toThrow(/approval/i);
  });

  it('fails closed for dirty or mismatched approved-base plan content', async () => {
    const dirty = mainHarness();
    dirty.dependencies.execFileImpl = vi.fn(async (_file, args) => {
      if (args[0] === 'diff') throw new Error('dirty');
      return dirty.execFileImpl(_file, args);
    });
    await expect(main(dirty.args, { GH_TOKEN: 'token' }, dirty.dependencies)).rejects.toThrow(
      /changes/i
    );

    const mismatched = mainHarness();
    mismatched.dependencies.execFileImpl = vi.fn(async (_file, args) => {
      if (args[0] === 'show') return { stdout: Buffer.from('different plan') };
      return mismatched.execFileImpl(_file, args);
    });
    await expect(
      main(mismatched.args, { GH_TOKEN: 'token' }, mismatched.dependencies)
    ).rejects.toThrow(/digest/i);

    const untracked = mainHarness({ untrackedPlan: true });
    await expect(
      main(untracked.args, { GH_TOKEN: 'token' }, untracked.dependencies)
    ).rejects.toThrow(/not tracked/i);

    const wrongLocalHead = mainHarness({ localHead: DESCENDANT_HEAD_SHA });
    await expect(
      main(wrongLocalHead.args, { GH_TOKEN: 'token' }, wrongLocalHead.dependencies)
    ).rejects.toThrow(/local Git HEAD/i);

    const unrelatedDescendantCheckout = mainHarness({
      liveHead: DESCENDANT_HEAD_SHA,
      localHead: 'e'.repeat(40),
      requireExactHead: false,
    });
    unrelatedDescendantCheckout.dependencies.execFileImpl = vi.fn(async (_file, args) => {
      if (args[0] === 'merge-base') throw new Error('not ancestor');
      return unrelatedDescendantCheckout.execFileImpl(_file, args);
    });
    await expect(
      main(
        unrelatedDescendantCheckout.args,
        { GH_TOKEN: 'token' },
        unrelatedDescendantCheckout.dependencies
      )
    ).rejects.toThrow(/does not contain live PR head/i);

    const concealedStaged = mainHarness();
    concealedStaged.dependencies.execFileImpl = vi.fn(async (_file, args) => {
      if (args[0] === 'diff' && args.includes('--cached')) throw new Error('staged');
      return concealedStaged.execFileImpl(_file, args);
    });
    await expect(
      main(concealedStaged.args, { GH_TOKEN: 'token' }, concealedStaged.dependencies)
    ).rejects.toThrow(/staged changes/i);
  });

  it('rejects HTTP errors, malformed JSON, and redirects', async () => {
    for (const [harness, pattern] of [
      [mainHarness({ httpStatus: 403 }), /status 403/i],
      [mainHarness({ malformedJson: true }), /malformed JSON/i],
      [mainHarness({ redirectedResponse: true }), /redirected/i],
      [mainHarness({ omitResponseUrl: true }), /omitted response URL/i],
      [mainHarness({ responseQueryDrift: true }), /response URL changed/i],
    ]) {
      await expect(main(harness.args, { GH_TOKEN: 'token' }, harness.dependencies)).rejects.toThrow(
        pattern
      );
    }
  });
});
