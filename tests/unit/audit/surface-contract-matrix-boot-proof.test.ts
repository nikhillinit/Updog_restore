import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import {
  invokeVercelFunction,
  commandFailureEvidence,
  assertRequiredG3Proofs,
  proofEnv,
  resolveBootProofOutput,
  runBootProof,
  vercelBuildInvocation,
  vercelBuildEnvironment,
  withVercelCredentialsMasked,
  workerProofEnvironment,
  workerProofPlan,
  executeWorkerProofPlan,
  vercelFunctionBuildFailureEvidence,
  vercelWebBuildFailureEvidence,
  workerConsumerIsHealthy,
  workerRuntimeProofs,
} from '../../../audit/surface-contract-matrix/scripts/boot-proof.mjs';
import {
  BootProofDocumentSchema as MatrixBootProofDocumentSchema,
  DeploymentSchema,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';

const fixture = (name: string) => path.join(process.cwd(), 'tests/unit/audit/fixtures', name);
const strictVercelEnvironment = {
  VERCEL_TOKEN: 'vercel-token-secret',
  VERCEL_ORG_ID: 'vercel-org-secret',
  VERCEL_PROJECT_ID: 'vercel-project-secret',
};

describe('surface contract matrix boot proof completion gates', () => {
  it('uses the G3 worker deployment vocabulary and binds worker proof identity to source SHA', () => {
    expect(DeploymentSchema.parse('railway-worker-fund-scenario-calc')).toBe(
      'railway-worker-fund-scenario-calc'
    );
    expect(DeploymentSchema.parse('railway-worker-capital-call-status')).toBe(
      'railway-worker-capital-call-status'
    );
    expect(DeploymentSchema.parse('local-process')).toBe('local-process');

    expect(() =>
      MatrixBootProofDocumentSchema.parse({
        schema_version: '1.1.0',
        source_sha: 'a'.repeat(40),
        proofs: [
          {
            deployment: 'railway-worker-fund-scenario-calc',
            runtime: 'worker_process',
            worker_identity: {
              workerType: 'fund-scenario-calc',
              commit: 'a'.repeat(40),
              deploymentId: 'proof-fund-scenario-calc',
            },
            boot_status: 'proven',
            boot_evidence: {
              command_or_artifact: 'fixture',
              probe: 'fixture',
              result: 'fixture',
              observed_at: 'fixture',
            },
          },
        ],
      })
    ).not.toThrow();

    const failedWorkerProof = {
      schema_version: '1.1.0',
      source_sha: 'a'.repeat(40),
      proofs: [
        {
          deployment: 'railway-worker-fund-scenario-calc',
          runtime: 'worker_process',
          boot_status: 'failed',
          boot_evidence: {
            command_or_artifact: 'fixture',
            probe: 'fixture',
            result: 'fixture',
            observed_at: 'fixture',
          },
        },
      ],
    };
    expect(() => MatrixBootProofDocumentSchema.parse(failedWorkerProof)).not.toThrow();
    expect(() =>
      MatrixBootProofDocumentSchema.parse({
        ...failedWorkerProof,
        proofs: [{ ...failedWorkerProof.proofs[0], boot_status: 'proven' }],
      })
    ).toThrow(/worker_identity/);
  });

  it('binds worker process and health listener evidence to one observed worker proof', () => {
    const proof = {
      deployment: 'railway-worker-fund-scenario-calc',
      runtime: 'worker_process',
      boot_status: 'proven',
      worker_identity: {
        workerType: 'fund-scenario-calc',
        commit: 'a'.repeat(40),
        deploymentId: 'proof-fund-scenario-calc',
      },
      boot_evidence: {
        command_or_artifact: 'Dockerfile.worker',
        probe: 'GET /health /live /ready /metrics /stats',
        result: 'fixture',
        observed_at: 'fixture',
      },
    };

    expect(workerRuntimeProofs(proof)).toEqual([proof, { ...proof, runtime: 'service_listener' }]);
  });

  it('requires all four G3 proof keys to be proven and rejects malformed outputs before boot', async () => {
    const source_sha = 'a'.repeat(40);
    const proofs = [
      ['vercel-api', 'make_app'],
      ['vercel-api', 'vercel_function'],
      ['railway-worker-fund-scenario-calc', 'worker_process'],
      ['railway-worker-capital-call-status', 'worker_process'],
    ].map(([deployment, runtime]) => ({
      deployment,
      runtime,
      boot_status: 'proven',
      boot_evidence: {
        command_or_artifact: 'fixture',
        probe: 'fixture',
        result: 'fixture',
        observed_at: 'fixture',
      },
      ...(deployment.startsWith('railway-worker-')
        ? {
            worker_identity: {
              workerType: deployment.replace('railway-worker-', ''),
              commit: source_sha,
              deploymentId: 'fixture',
            },
          }
        : {}),
    }));
    expect(() => assertRequiredG3Proofs({ proofs })).not.toThrow();
    expect(() => assertRequiredG3Proofs({ proofs: [...proofs, proofs[0]] })).toThrow(
      'duplicate key'
    );
    proofs[3].boot_status = 'unproven';
    expect(() => assertRequiredG3Proofs({ proofs })).toThrow(
      'railway-worker-capital-call-status|worker_process'
    );
    expect(resolveBootProofOutput('tests/unit/audit/fixtures/boot-proof-output.json')).toContain(
      'boot-proof-output.json'
    );
    expect(() => resolveBootProofOutput('tests/unit/audit/fixtures')).toThrow(
      'regular non-symlink file'
    );
    await expect(runBootProof({ output: 'tests/unit/audit/fixtures' })).rejects.toThrow(
      'regular non-symlink file'
    );
  });

  it('writes a strict proof document only to explicit output and preflights invalid targets before collection', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-'));
    const output = path.join(tempDir, 'proof.json');
    const tracked = path.join(process.cwd(), 'audit/surface-contract-matrix/boot-proofs.json');
    const trackedBefore = fs.readFileSync(tracked, 'utf8');
    const source_sha = 'b'.repeat(40);
    const collectProofs = vi.fn(async () =>
      [
        ['vercel-api', 'make_app', 'vercel'],
        ['vercel-api', 'vercel_function', 'vercel'],
        ['railway-worker-fund-scenario-calc', 'worker_process', 'fund-scenario-calc'],
        ['railway-worker-capital-call-status', 'worker_process', 'capital-call-status'],
      ].map(([deployment, runtime, workerType]) => ({
        deployment,
        runtime,
        boot_status: 'proven',
        boot_evidence: {
          command_or_artifact: 'fixture',
          probe: 'fixture',
          result: 'fixture',
          observed_at: 'fixture',
        },
        ...(deployment.startsWith('railway-worker-')
          ? {
              worker_identity: {
                workerType,
                commit: source_sha,
                deploymentId: `fixture-${workerType}`,
              },
            }
          : {}),
      }))
    );
    await expect(
      runBootProof({
        output,
        requireG3: true,
        collectProofs,
        sourceSha: source_sha,
        environment: { ...strictVercelEnvironment, VERCEL_PROJECT_ID: '' },
      })
    ).rejects.toThrow('VERCEL_PROJECT_ID');
    expect(collectProofs).not.toHaveBeenCalled();
    await runBootProof({
      output,
      requireG3: true,
      collectProofs,
      sourceSha: source_sha,
      environment: strictVercelEnvironment,
    });
    expect(
      MatrixBootProofDocumentSchema.parse(JSON.parse(fs.readFileSync(output, 'utf8')))
    ).toMatchObject({
      schema_version: '1.1.0',
      source_sha,
    });
    expect(fs.readFileSync(tracked, 'utf8')).toBe(trackedBefore);
    await expect(
      runBootProof({ output: tempDir, collectProofs, sourceSha: source_sha })
    ).rejects.toThrow();
    const symlinkOutput = path.join(tempDir, 'proof-link.json');
    fs.symlinkSync(output, symlinkOutput);
    await expect(
      runBootProof({ output: symlinkOutput, collectProofs, sourceSha: source_sha })
    ).rejects.toThrow('non-symlink');
    expect(collectProofs).toHaveBeenCalledTimes(1);
  });

  it('forwards Vercel credentials only to Vercel build and redacts every value from failure evidence', () => {
    const genericEnvironment = proofEnv({}, strictVercelEnvironment);
    expect(genericEnvironment).not.toHaveProperty('VERCEL_TOKEN');
    expect(genericEnvironment).not.toHaveProperty('VERCEL_ORG_ID');
    expect(genericEnvironment).not.toHaveProperty('VERCEL_PROJECT_ID');
    expect(vercelBuildEnvironment(strictVercelEnvironment)).toMatchObject(strictVercelEnvironment);
    expect(vercelBuildInvocation()).toEqual({
      command: 'npx',
      args: ['--yes', 'vercel@55.0.0', 'build', '--prod', '--yes'],
    });

    const outcome = commandFailureEvidence({
      deployment: 'vercel-api',
      command_or_artifact: 'vercel build',
      probe: 'fixture',
      label: 'Vercel build',
      environment: strictVercelEnvironment,
      result: {
        ok: false,
        status: 1,
        stderr: 'vercel-token-secret vercel-org-secret vercel-project-secret',
        stdout: '',
      },
    });
    expect(outcome.boot_evidence.result).not.toContain('vercel-token-secret');
    expect(outcome.boot_evidence.result).not.toContain('vercel-org-secret');
    expect(outcome.boot_evidence.result).not.toContain('vercel-project-secret');
  });
  it('requires Vercel handlers to complete an acceptable response', async () => {
    await expect(
      invokeVercelFunction({
        name: 'api/completing',
        entry: fixture('completing-vercel-handler.mjs'),
        responseTimeout: 100,
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      invokeVercelFunction({
        name: 'api/incomplete',
        entry: fixture('incomplete-vercel-handler.mjs'),
        responseTimeout: 25,
      })
    ).resolves.toMatchObject({ ok: false });
  });

  it('masks all Vercel credentials during emitted handler import and redacts hostile handler failures', async () => {
    const original = Object.fromEntries(
      Object.keys(strictVercelEnvironment).map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, strictVercelEnvironment);
    try {
      const direct = await invokeVercelFunction({
        name: 'api/hostile',
        entry: fixture('hostile-vercel-handler.mjs'),
        redactionEnvironment: strictVercelEnvironment,
      });
      expect(direct.result).not.toContain('vercel-token-secret');
      expect(direct.result).not.toContain('vercel-org-secret');
      expect(direct.result).not.toContain('vercel-project-secret');

      await withVercelCredentialsMasked(async () => {
        expect(process.env['VERCEL_TOKEN']).toBeUndefined();
        expect(process.env['VERCEL_ORG_ID']).toBeUndefined();
        expect(process.env['VERCEL_PROJECT_ID']).toBeUndefined();
        const masked = await invokeVercelFunction({
          name: 'api/hostile',
          entry: fixture('hostile-vercel-handler.mjs'),
          redactionEnvironment: strictVercelEnvironment,
        });
        expect(masked.result).not.toContain('vercel-token-secret');
        expect(masked.result).not.toContain('vercel-org-secret');
        expect(masked.result).not.toContain('vercel-project-secret');
      });
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rejects empty or non-running worker consumer health payloads', () => {
    expect(workerConsumerIsHealthy({ health: { workers: [] }, stats: { workers: [] } })).toBe(
      false
    );
    expect(
      workerConsumerIsHealthy({
        health: {
          workers: [{ name: 'fund-scenario-calc', status: 'unhealthy', isRunning: false }],
        },
        stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
      })
    ).toBe(false);
    expect(
      workerConsumerIsHealthy({
        health: { workers: [{ name: 'fund-scenario-calc', status: 'healthy', isRunning: true }] },
        stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
      })
    ).toBe(true);
    expect(
      workerConsumerIsHealthy({
        health: {
          status: 'healthy',
          workerType: 'fund-scenario-calc',
          commit: 'e'.repeat(40),
          deploymentId: 'proof-fund',
          workers: [{ name: 'fund-scenario-calc', status: 'healthy', isRunning: true }],
        },
        stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
        workerType: 'fund-scenario-calc',
        sourceSha: 'e'.repeat(40),
        deploymentId: 'proof-fund',
      })
    ).toBe(true);
    expect(
      workerConsumerIsHealthy({
        health: {
          status: 'healthy',
          workerType: 'capital-call-status',
          commit: 'e'.repeat(40),
          deploymentId: 'proof-fund',
          workers: [{ name: 'fund-scenario-calc', status: 'healthy', isRunning: true }],
        },
        stats: { workers: [{ name: 'fund-scenario-calc', processed: 0, errors: 0 }] },
        workerType: 'fund-scenario-calc',
        sourceSha: 'e'.repeat(40),
        deploymentId: 'proof-fund',
      })
    ).toBe(false);
  });

  it('sets exact Railway identity and worker-specific timeout environment', () => {
    expect(
      workerProofEnvironment({
        workerType: 'fund-scenario-calc',
        sourceSha: 'c'.repeat(40),
        deploymentId: 'fund-proof',
      })
    ).toMatchObject({
      RAILWAY_SERVICE_NAME: 'fund-scenario-calc',
      RAILWAY_ENVIRONMENT_NAME: 'production',
      RAILWAY_GIT_COMMIT_SHA: 'c'.repeat(40),
      RAILWAY_DEPLOYMENT_ID: 'fund-proof',
      FUND_SCENARIO_HARD_TIMEOUT_MS: '30000',
    });
    expect(
      workerProofEnvironment({
        workerType: 'capital-call-status',
        sourceSha: 'c'.repeat(40),
        deploymentId: 'capital-proof',
      })
    ).toMatchObject({ CAPITAL_CALL_STATUS_HARD_TIMEOUT_MS: '30000' });
  });

  it('requires capital schema preparation before worker launch and stops on schema failure', async () => {
    const plan = workerProofPlan({
      workerType: 'capital-call-status',
      sourceSha: 'd'.repeat(40),
      deploymentId: 'capital-proof',
    });
    expect(plan.steps).toEqual([
      'network',
      'redis',
      'postgres',
      'capital-schema-preparation',
      'image-build',
      'worker-launch',
    ]);
    const execute = vi.fn(async (step: string) => ({ ok: step !== 'capital-schema-preparation' }));
    await expect(executeWorkerProofPlan({ steps: plan.steps, execute })).resolves.toEqual({
      ok: false,
      failedStep: 'capital-schema-preparation',
    });
    expect(execute).not.toHaveBeenCalledWith('worker-launch');
  });

  it('records missing Vercel tooling as unproven without calling it a timeout', () => {
    const outcome = vercelFunctionBuildFailureEvidence({
      ok: false,
      status: null,
      signal: null,
      error: { code: 'ENOENT' },
    });
    expect(outcome).toMatchObject({
      deployment: 'vercel-api',
      runtime: 'vercel_function',
      boot_status: 'unproven',
      boot_evidence: {
        command_or_artifact: expect.stringContaining('npx --yes vercel@55.0.0 build --prod --yes'),
        probe: expect.stringContaining('every real Vercel build-output function'),
        result: expect.stringContaining('ENOENT'),
        observed_at: expect.stringMatching(/^proof:/),
      },
    });
    expect(outcome.boot_evidence.result).not.toContain('timeout');
  });

  it('records permission-denied Vercel tooling as unproven without calling it a timeout', () => {
    const outcome = vercelFunctionBuildFailureEvidence({
      ok: false,
      status: null,
      signal: null,
      error: { code: 'EACCES' },
    });
    expect(outcome.boot_status).toBe('unproven');
    expect(outcome.boot_evidence.result).toContain('EACCES');
    expect(outcome.boot_evidence.result).not.toContain('timeout');
  });

  it('keeps an executed Vercel build timeout failed', () => {
    const outcome = vercelFunctionBuildFailureEvidence({
      ok: false,
      status: null,
      signal: 'SIGTERM',
      error: { code: 'ETIMEDOUT' },
    });
    expect(outcome.boot_status).toBe('failed');
    expect(outcome.boot_evidence.result).toContain('ETIMEDOUT');
  });

  it('keeps an executed Vercel build failure failed', () => {
    const outcome = vercelFunctionBuildFailureEvidence({
      ok: false,
      status: 1,
      signal: null,
      stderr: 'Vercel build failed',
      stdout: '',
    });
    expect(outcome.boot_status).toBe('failed');
    expect(outcome.boot_evidence.result).toContain('status 1');
  });

  it('classifies permission-denied Vercel web build tooling as unproven', () => {
    const outcome = vercelWebBuildFailureEvidence({
      ok: false,
      status: null,
      signal: null,
      error: { code: 'EACCES' },
    });
    expect(outcome.boot_status).toBe('unproven');
    expect(outcome.boot_evidence.result).toContain('EACCES');
    expect(outcome.boot_evidence.result).not.toContain('timeout');
  });

  it('keeps an executed signal termination failed without calling it a timeout', () => {
    const outcome = commandFailureEvidence({
      deployment: 'vercel-web',
      command_or_artifact: 'npm run build:web; dist/public/index.html',
      probe: 'entry HTML references emitted bundle',
      label: 'npm run build:web',
      result: { ok: false, status: null, signal: 'SIGTERM' },
    });
    expect(outcome.boot_status).toBe('failed');
    expect(outcome.boot_evidence.result).toContain('SIGTERM');
    expect(outcome.boot_evidence.result).not.toContain('timeout');
  });
});
