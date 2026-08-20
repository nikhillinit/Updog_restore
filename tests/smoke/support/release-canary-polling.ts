/**
 * Shared release-canary worker polling support.
 *
 * The release canaries and the deterministic integration truth cases poll the
 * scenario calculation status route through this single module. The HTTP
 * fetch, the monotonic clock, and the sleep are injectable so tests can prove
 * the bounded-timeout behavior without wall-clock waits; production canary
 * runs use the real defaults.
 *
 * The public result is strict: either a validated success bound to the exact
 * expected execution identity, or a typed RELEASE_CANARY_WORKER_TIMEOUT
 * failure that retains the run/job/correlation identity it was waiting for.
 * A status response for a different correlation (for example an older
 * successful same-SHA run) is never accepted as evidence for this execution
 * -- there is no latest-run or SHA-wide success fallback.
 */

type JsonObject = Record<string, unknown>;

/**
 * Worker poll deadline. Must fit inside the Playwright per-test budget of
 * release-canaries.spec.ts with margin for the workflow's always-on residue
 * finalizer; tests/regressions/ci-fail-closed.test.ts pins that relationship.
 */
export const RELEASE_CANARY_WORKER_POLL_DEADLINE_MS = 120_000;
export const RELEASE_CANARY_WORKER_POLL_INTERVAL_MS = 250;
export const RELEASE_CANARY_WORKER_TIMEOUT = 'RELEASE_CANARY_WORKER_TIMEOUT' as const;

export interface ReleaseCanaryWorkerExpectation {
  fundId: number;
  scenarioSetId: string;
  jobId: string;
  correlationId: string;
}

export interface ReleaseCanaryWorkerPollDeps {
  fetchStatus: () => Promise<{ status: number; body: unknown }>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  deadlineMs?: number;
  intervalMs?: number;
}

export interface ReleaseCanaryWorkerSuccess {
  kind: 'succeeded';
  fundId: number;
  scenarioSetId: string;
  jobId: string;
  correlationId: string;
  snapshotId: number;
  calculationStartedAt: string;
  body: JsonObject;
}

export interface ReleaseCanaryWorkerTimeout {
  kind: typeof RELEASE_CANARY_WORKER_TIMEOUT;
  fundId: number;
  scenarioSetId: string;
  jobId: string;
  correlationId: string;
  observedStatuses: string[];
  lastBody: JsonObject | null;
}

export type ReleaseCanaryWorkerPollResult =
  | ReleaseCanaryWorkerSuccess
  | ReleaseCanaryWorkerTimeout;

function requireJsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[release-canary-polling] ${label} must be a JSON object`);
  }
  return value as JsonObject;
}

/**
 * Exact-execution identity gate: a status body counts as evidence for this
 * poll only when its fund, scenario set, AND correlation match the expected
 * execution. A mismatched body -- however successful -- can never substitute
 * for the run this poll is bound to.
 */
export function matchesExpectedExecution(
  body: JsonObject,
  expectation: ReleaseCanaryWorkerExpectation
): boolean {
  return (
    body['fundId'] === expectation.fundId &&
    body['scenarioSetId'] === expectation.scenarioSetId &&
    body['correlationId'] === expectation.correlationId
  );
}

export async function pollReleaseCanaryWorkerStatus(
  expectation: ReleaseCanaryWorkerExpectation,
  deps: ReleaseCanaryWorkerPollDeps
): Promise<ReleaseCanaryWorkerPollResult> {
  const now = deps.now ?? (() => Date.now());
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadlineMs = deps.deadlineMs ?? RELEASE_CANARY_WORKER_POLL_DEADLINE_MS;
  const intervalMs = deps.intervalMs ?? RELEASE_CANARY_WORKER_POLL_INTERVAL_MS;

  const startedAt = now();
  const observedStatuses: string[] = [];
  let lastBody: JsonObject | null = null;

  for (;;) {
    const response = await deps.fetchStatus();
    if (response.status !== 200) {
      throw new Error(
        `[release-canary-polling] status route returned ${response.status}: ${JSON.stringify(response.body)}`
      );
    }

    const body = requireJsonObject(response.body, 'status response');
    lastBody = body;

    if (matchesExpectedExecution(body, expectation)) {
      const status = typeof body['status'] === 'string' ? body['status'] : 'unknown';
      if (!observedStatuses.includes(status)) {
        observedStatuses.push(status);
      }

      if (status === 'failed') {
        throw new Error(
          `[release-canary-polling] worker reported terminal failure for the exact execution: ${JSON.stringify(body)}`
        );
      }

      if (status === 'succeeded') {
        if (body['jobId'] !== expectation.jobId) {
          throw new Error(
            `[release-canary-polling] succeeded status carries a different job identity: ${JSON.stringify(body)}`
          );
        }
        const snapshotId = body['snapshotId'];
        if (typeof snapshotId !== 'number' || !Number.isSafeInteger(snapshotId)) {
          throw new Error(
            `[release-canary-polling] succeeded status is missing a durable snapshot: ${JSON.stringify(body)}`
          );
        }
        const calculationStartedAt = body['calculationStartedAt'];
        if (
          typeof calculationStartedAt !== 'string' ||
          Number.isNaN(Date.parse(calculationStartedAt))
        ) {
          throw new Error(
            `[release-canary-polling] succeeded status is missing durable start evidence: ${JSON.stringify(body)}`
          );
        }
        return {
          kind: 'succeeded',
          fundId: expectation.fundId,
          scenarioSetId: expectation.scenarioSetId,
          jobId: expectation.jobId,
          correlationId: expectation.correlationId,
          snapshotId,
          calculationStartedAt,
          body,
        };
      }
    } else if (!observedStatuses.includes('mismatched-execution')) {
      // Evidence for some other execution; never a success substitute.
      observedStatuses.push('mismatched-execution');
    }

    if (now() - startedAt >= deadlineMs) {
      return {
        kind: RELEASE_CANARY_WORKER_TIMEOUT,
        fundId: expectation.fundId,
        scenarioSetId: expectation.scenarioSetId,
        jobId: expectation.jobId,
        correlationId: expectation.correlationId,
        observedStatuses,
        lastBody,
      };
    }

    await sleep(intervalMs);
  }
}
