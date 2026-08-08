import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  invokeVercelFunction,
  railwayApiDockerfileContractCheck,
  railwayApiRuntimeOutcome,
  vercelBuildProofOutcome,
  workerConsumerIsHealthy,
} from '../../../audit/surface-contract-matrix/scripts/boot-proof.mjs';

const fixture = (name: string) => path.join(process.cwd(), 'tests/unit/audit/fixtures', name);

describe('surface contract matrix boot proof completion gates', () => {
  it('requires Vercel handlers to complete an acceptable response', async () => {
    await expect(invokeVercelFunction({
      name: 'api/completing',
      entry: fixture('completing-vercel-handler.mjs'),
      responseTimeout: 100,
    })).resolves.toMatchObject({ ok: true });
    await expect(invokeVercelFunction({
      name: 'api/incomplete',
      entry: fixture('incomplete-vercel-handler.mjs'),
      responseTimeout: 25,
    })).resolves.toMatchObject({ ok: false });
  });

  it('rejects empty or non-running worker consumer health payloads', () => {
    expect(workerConsumerIsHealthy({ health: { workers: [] }, stats: { workers: [] } })).toBe(false);
    expect(workerConsumerIsHealthy({
      health: { workers: [{ name: 'fund-scenario-calc', status: 'unhealthy', isRunning: false }] },
      stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
    })).toBe(false);
    expect(workerConsumerIsHealthy({
      health: { workers: [{ name: 'fund-scenario-calc', status: 'healthy', isRunning: true }] },
      stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
    })).toBe(true);
  });

  it('accepts the exact Railway API Dockerfile launch contract', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: 'ENTRYPOINT ["dumb-init", "--"]',
      cmd: 'CMD ["node", "dist/index.js"]',
    })).toMatchObject({ ok: true });
  });

  it('rejects an ENTRYPOINT that changes the Railway init process', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: 'ENTRYPOINT ["sh", "-c"]',
      cmd: 'CMD ["node", "dist/index.js"]',
    })).toMatchObject({ ok: false });
  });

  it('rejects a CMD that does not launch the built API', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: 'ENTRYPOINT ["dumb-init", "--"]',
      cmd: 'CMD ["node", "server/index.js"]',
    })).toMatchObject({ ok: false });
  });

  it('rejects a shell-form CMD even when its text names dist/index.js', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: 'ENTRYPOINT ["dumb-init", "--"]',
      cmd: 'CMD node dist/index.js',
    })).toMatchObject({ ok: false });
  });

  it('rejects a missing Dockerfile directive', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: undefined,
      cmd: 'CMD ["node", "dist/index.js"]',
    })).toMatchObject({ ok: false });
  });

  it('rejects an exact contract with an extra entrypoint argument', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: 'ENTRYPOINT ["dumb-init", "--", "--verbose"]',
      cmd: 'CMD ["node", "dist/index.js"]',
    })).toMatchObject({ ok: false });
  });

  it('rejects an exact contract with an extra CMD argument', () => {
    expect(railwayApiDockerfileContractCheck({
      entrypoint: 'ENTRYPOINT ["dumb-init", "--"]',
      cmd: 'CMD ["node", "dist/index.js", "--inspect"]',
    })).toMatchObject({ ok: false });
  });

  it('proves the Railway container only after its listener responds', () => {
    expect(railwayApiRuntimeOutcome({
      dockerAvailable: true,
      containerListener: true,
      localListener: false,
    })).toMatchObject({ boot_status: 'proven' });
  });

  it('records an executed Railway container listener failure as failed', () => {
    expect(railwayApiRuntimeOutcome({
      dockerAvailable: true,
      containerListener: false,
      localListener: true,
    })).toMatchObject({ boot_status: 'failed' });
  });

  it('keeps a Docker-unavailable local listener pass unproven', () => {
    const outcome = railwayApiRuntimeOutcome({
      dockerAvailable: false,
      containerListener: false,
      localListener: true,
    });
    expect(outcome).toMatchObject({ boot_status: 'unproven' });
    expect(outcome.result).toContain('Dockerfile');
    expect(outcome.result).not.toContain('bootstrap() is not invoked');
  });

  it('keeps a Docker-unavailable local listener failure unproven', () => {
    expect(railwayApiRuntimeOutcome({
      dockerAvailable: false,
      containerListener: false,
      localListener: false,
    })).toMatchObject({ boot_status: 'unproven' });
  });

  it('treats an unavailable Docker prerequisite as unproven when no local probe ran', () => {
    expect(railwayApiRuntimeOutcome({
      dockerAvailable: false,
      containerListener: false,
      localListener: undefined,
    })).toMatchObject({ boot_status: 'unproven' });
  });

  it('does not let a local listener pass certify the container when Docker is unavailable', () => {
    const localPass = railwayApiRuntimeOutcome({
      dockerAvailable: false,
      containerListener: true,
      localListener: true,
    });
    expect(localPass.boot_status).toBe('unproven');
    expect(localPass.result.toLowerCase()).toContain('local');
  });

  it('records missing Vercel tooling as unproven without calling it a timeout', () => {
    const outcome = vercelBuildProofOutcome({
      ok: false,
      status: null,
      signal: null,
      error: { code: 'ENOENT' },
    });
    expect(outcome.boot_status).toBe('unproven');
    expect(outcome.result).toContain('unavailable');
    expect(outcome.result).toContain('ENOENT');
    expect(outcome.result).not.toContain('timeout');
  });

  it('records permission-denied Vercel tooling as unproven without calling it a timeout', () => {
    const outcome = vercelBuildProofOutcome({
      ok: false,
      status: null,
      signal: null,
      error: { code: 'EACCES' },
    });
    expect(outcome.boot_status).toBe('unproven');
    expect(outcome.result).toContain('unavailable');
    expect(outcome.result).toContain('EACCES');
    expect(outcome.result).not.toContain('timeout');
  });

  it('keeps an executed Vercel build timeout failed', () => {
    const outcome = vercelBuildProofOutcome({
      ok: false,
      status: null,
      signal: 'SIGTERM',
      error: { code: 'ETIMEDOUT' },
    });
    expect(outcome).toMatchObject({ boot_status: 'failed' });
    expect(outcome.result).toContain('timeout');
  });

  it('keeps an executed Vercel build failure failed', () => {
    const outcome = vercelBuildProofOutcome({
      ok: false,
      status: 1,
      signal: null,
      stderr: 'Vercel build failed',
      stdout: '',
    });
    expect(outcome).toMatchObject({ boot_status: 'failed' });
    expect(outcome.result).toContain('status 1');
  });
});
