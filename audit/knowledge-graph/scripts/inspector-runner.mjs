/**
 * Standalone inspector-profile runner with hard lifecycle bounds.
 *
 * Transport-agnostic worker pool: the caller supplies `spawnProfile`, a
 * function that resolves a profile's runtime-inspection document (production
 * wraps `runInspector`'s child-process spawn; tests inject fakes). This
 * module owns only scheduling, concurrency, and the two deadlines below — it
 * never spawns a child process itself and never escalates SIGTERM/SIGKILL;
 * that belongs to the production `spawnProfile` wrapper, keyed off the
 * AbortSignal this runner passes in.
 *
 * Guarantees:
 * - One execution per profile, no retries.
 * - Results are returned in `profiles` list order, regardless of completion
 *   order.
 * - The first failure (explicit rejection or either deadline) stops new
 *   scheduling and aborts every active sibling via a shared AbortController.
 * - Every in-flight profile promise is awaited to settlement before this
 *   function resolves or rejects — never a dangling handle, never an
 *   unhandled rejection.
 * - A final NDJSON summary event is emitted on every exit path (success,
 *   failure, per-profile timeout, aggregate timeout) reporting
 *   `active_children: 0`.
 *
 * NDJSON event shape is intentionally bounded — `{ event, phase, profile,
 * duration_ms, exit_code, signal, active_children }` — with no projection
 * contents, no child stderr passthrough, and no env dumps.
 */

/**
 * @param {object} options
 * @param {string[]} options.profiles - Profile ids to run, in output order.
 * @param {number} [options.concurrency] - Max profiles running concurrently.
 * @param {(profile: string, ctx: { signal: AbortSignal }) => Promise<unknown>} options.spawnProfile
 *   Resolves a profile's runtime-inspection document; rejects on failure.
 * @param {number} [options.perProfileTimeoutMs] - Hard bound per profile.
 * @param {number} [options.aggregateTimeoutMs] - Hard bound across the run.
 * @param {(event: object) => void} [options.log] - NDJSON event sink; caller owns stderr.
 * @returns {Promise<unknown[]>} Documents in `profiles` order.
 */
export async function runInspectorProfiles({
  profiles,
  concurrency = 4,
  spawnProfile,
  perProfileTimeoutMs = 60_000,
  aggregateTimeoutMs = 330_000,
  log = () => {},
}) {
  const runStartedAt = Date.now();
  const results = new Array(profiles.length);
  const controller = new globalThis.AbortController();
  const activeChildren = new Set();
  let firstError = null;
  let next = 0;

  function emit(overrides) {
    log({
      event: overrides.event,
      phase: overrides.phase,
      profile: overrides.profile ?? null,
      duration_ms: overrides.duration_ms ?? null,
      exit_code: overrides.exit_code ?? null,
      signal: overrides.signal ?? null,
      active_children: overrides.active_children,
    });
  }

  function fail(error) {
    if (!firstError) {
      firstError = error;
    }
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }

  const aggregateTimer = globalThis.setTimeout(() => {
    fail(new Error(`Inspector run exceeded aggregate timeout (aggregateTimeoutMs=${aggregateTimeoutMs}ms)`));
  }, aggregateTimeoutMs);

  async function runProfile(index) {
    const profile = profiles[index];
    const startedAt = Date.now();
    activeChildren.add(profile);
    emit({ event: 'profile_start', phase: 'profile', profile, active_children: activeChildren.size });

    let timeoutId;
    const timeout = new Promise((_resolve, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        reject(new Error(
          `Inspector profile "${profile}" exceeded per-profile timeout (perProfileTimeoutMs=${perProfileTimeoutMs}ms)`
        ));
      }, perProfileTimeoutMs);
    });

    // Wrap in Promise.resolve().then so a synchronously-throwing spawnProfile
    // still produces a rejected promise rather than throwing out of runProfile.
    const spawned = Promise.resolve().then(() => spawnProfile(profile, { signal: controller.signal }));
    // Promise.race never cancels the losing side; swallow its eventual
    // settlement here so a timeout- or abort-driven loss never surfaces as
    // an unhandled rejection.
    spawned.catch(() => {});

    try {
      const document = await Promise.race([spawned, timeout]);
      results[index] = document;
      emit({
        event: 'profile_complete',
        phase: 'profile',
        profile,
        duration_ms: Date.now() - startedAt,
        exit_code: 0,
        active_children: activeChildren.size - 1,
      });
    } catch (error) {
      fail(error);
      // `spawned` may still be in flight when the timeout wins the race
      // (or a sibling's failure aborts us first). fail() above has already
      // aborted the shared signal, which is what drives the production
      // spawnProfile wrapper's own settlement (SIGTERM -> wait -> SIGKILL ->
      // wait). Wait for that settlement here so active_children never
      // under-reports a still-live child.
      await spawned.catch(() => {});
      emit({
        event: 'profile_error',
        phase: 'profile',
        profile,
        duration_ms: Date.now() - startedAt,
        active_children: activeChildren.size - 1,
      });
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
      activeChildren.delete(profile);
    }
  }

  async function worker() {
    while (next < profiles.length && !firstError) {
      const index = next;
      next += 1;
      try {
        await runProfile(index);
      } catch {
        // Failure already recorded via fail(); stop claiming new work.
        return;
      }
    }
  }

  const workerCount = Math.min(concurrency, profiles.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  globalThis.clearTimeout(aggregateTimer);

  emit({
    event: 'summary',
    phase: 'aggregate',
    duration_ms: Date.now() - runStartedAt,
    exit_code: firstError ? 1 : 0,
    active_children: activeChildren.size,
  });

  if (firstError) {
    throw firstError;
  }

  return results;
}
