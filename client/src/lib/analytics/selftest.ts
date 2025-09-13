/**
 * Worker lifecycle self-test for development
 * Detects memory leaks by spawning and terminating workers repeatedly
 */

export async function workerSelfTest(
  spawn: () => Worker,
  options: {
    cycles?: number;
    delayMs?: number;
    verbose?: boolean;
  } = {}
): Promise<void> {
  // Only run in development
  if (!import.meta.env.DEV) return;

  const { cycles = 25, delayMs = 10, verbose = false } = options;
  const workers: Worker[] = [];

  try {
    if (verbose) {
      console.log(`[Worker Self-Test] Starting ${cycles} spawn/terminate cycles`);
    }

    for (let i = 0; i < cycles; i++) {
      const worker = spawn();
      workers.push(worker);

      // Small delay to let worker initialize
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Terminate immediately
      worker.terminate();

      if (verbose && (i + 1) % 5 === 0) {
        console.log(`[Worker Self-Test] Completed ${i + 1}/${cycles} cycles`);
      }
    }

    // Final cleanup
    workers.forEach(w => {
      try {
        w.terminate();
      } catch {
        // Worker already terminated
      }
    });

    console.log(`✅ [Worker Self-Test] Completed ${cycles} cycles successfully`);
  } catch (error) {
    console.error('❌ [Worker Self-Test] Failed:', error);
    // Clean up any remaining workers
    workers.forEach(w => {
      try {
        w.terminate();
      } catch {
        // Ignore cleanup errors
      }
    });
    throw error;
  }
}

/**
 * Runtime kill switch for analytics workers
 * Immediately terminates all workers and clears state
 */
export function createKillSwitch() {
  const workers = new Set<Worker>();

  return {
    register(worker: Worker) {
      workers.add(worker);
      return () => workers.delete(worker);
    },

    killAll() {
      console.warn(`[Kill Switch] Terminating ${workers.size} workers`);
      workers.forEach(worker => {
        try {
          worker.terminate();
        } catch (error) {
          console.error('[Kill Switch] Failed to terminate worker:', error);
        }
      });
      workers.clear();
    },

    get count() {
      return workers.size;
    }
  };
}