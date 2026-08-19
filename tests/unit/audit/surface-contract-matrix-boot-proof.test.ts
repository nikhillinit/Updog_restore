import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import {
  invokeVercelFunction,
  invokeVercelFunctionInIsolatedChild,
  vercelBuildOutputFunctions,
  commandFailureEvidence,
  assertRequiredG3Proofs,
  dockerProofEnvironment,
  proofEnv,
  resolveBootProofOutput,
  runBootProofCleanRoom,
  runBootProofInner,
  vercelBuildInvocation,
  vercelBuildEnvironment,
  vercelFunctionProofEnvironment,
  withVercelCredentialsMasked,
  workerProofEnvironment,
  workerPostgresProofHostname,
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

const cleanRoomDocument = (source_sha: string) => ({
  schema_version: '1.1.0',
  source_sha,
  proofs: [{
    deployment: 'local-process',
    boot_status: 'unproven',
    boot_evidence: {
      command_or_artifact: 'fixture',
      probe: 'fixture',
      result: 'fixture',
      observed_at: 'fixture',
    },
  }],
});

describe('surface contract matrix boot proof completion gates', () => {
  it('keeps Docker proof config isolated', () => {
    const environment = {
      PATH: '/usr/bin',
      DOCKER_CONFIG: ' /private/tmp/surface-proof-docker ',
    };
    expect(dockerProofEnvironment({}, environment)).toMatchObject({
      DOCKER_CONFIG: '/private/tmp/surface-proof-docker',
    });
    expect(proofEnv({}, environment)).not.toHaveProperty('DOCKER_CONFIG');
    expect(vercelFunctionProofEnvironment(environment)).not.toHaveProperty('DOCKER_CONFIG');
  });

  it('healthchecks both worker-specific ports before Railway PORT', () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile.worker'), 'utf8');
    const healthPortSelection = dockerfile.slice(
      dockerfile.indexOf('const healthServerPort = firstValidPort('),
      dockerfile.indexOf('const socket = new net.Socket();')
    );
    expect(healthPortSelection).toContain('process.env.FUND_SCENARIO_WORKER_HEALTH_PORT');
    expect(healthPortSelection).toContain('process.env.CAPITAL_CALL_STATUS_WORKER_HEALTH_PORT');
    expect(
      healthPortSelection.indexOf('process.env.CAPITAL_CALL_STATUS_WORKER_HEALTH_PORT')
    ).toBeLessThan(healthPortSelection.indexOf('process.env.PORT'));
  });

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
    await expect(runBootProofInner({ output: 'tests/unit/audit/fixtures' })).rejects.toThrow(
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
      runBootProofInner({
        output,
        requireG3: true,
        collectProofs,
        sourceSha: source_sha,
        environment: { ...strictVercelEnvironment, VERCEL_PROJECT_ID: '' },
        readSourceSha: () => source_sha,
      })
    ).rejects.toThrow('VERCEL_PROJECT_ID');
    expect(collectProofs).not.toHaveBeenCalled();
    await runBootProofInner({
      output,
      requireG3: true,
      collectProofs,
      sourceSha: source_sha,
      environment: strictVercelEnvironment,
      readSourceSha: () => source_sha,
    });
    expect(
      MatrixBootProofDocumentSchema.parse(JSON.parse(fs.readFileSync(output, 'utf8')))
    ).toMatchObject({
      schema_version: '1.1.0',
      source_sha,
    });
    expect(fs.readFileSync(tracked, 'utf8')).toBe(trackedBefore);
    await expect(
      runBootProofInner({ output: tempDir, collectProofs, sourceSha: source_sha })
    ).rejects.toThrow();
    const symlinkOutput = path.join(tempDir, 'proof-link.json');
    fs.symlinkSync(output, symlinkOutput);
    await expect(
      runBootProofInner({ output: symlinkOutput, collectProofs, sourceSha: source_sha })
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

  it('discovers each Vercel function handler from its .vc-config.json manifest', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-vercel-output-'));
    fs.writeFileSync(path.join(outputRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    const functionsRoot = path.join(outputRoot, 'functions');
    const apiFunction = path.join(functionsRoot, 'api.func');
    const catchAllFunction = path.join(functionsRoot, 'api', '[...slug].func');
    for (const [directory, handler] of [
      [apiFunction, 'serve.js'],
      [catchAllFunction, 'api/[...slug].js'],
    ]) {
      fs.mkdirSync(path.dirname(path.join(directory, handler)), { recursive: true });
      fs.writeFileSync(
        path.join(directory, '.vc-config.json'),
        JSON.stringify({ runtime: 'nodejs22.x', handler })
      );
      fs.writeFileSync(
        path.join(directory, handler),
        'export default (_request, response) => response.end();'
      );
    }

    const functions = vercelBuildOutputFunctions(functionsRoot);
    expect(
      functions.map(({ name, entry }) => ({ name, entry: path.relative(functionsRoot, entry!) }))
    ).toEqual([
      { name: 'api', entry: 'api.func/serve.js' },
      { name: 'api/[...slug]', entry: 'api/[...slug].func/api/[...slug].js' },
    ]);
    await expect(
      Promise.all(functions.map((functionEntry) => invokeVercelFunction(functionEntry)))
    ).resolves.toEqual([
      expect.objectContaining({ name: 'api', ok: true }),
      expect.objectContaining({ name: 'api/[...slug]', ok: true }),
    ]);
  });

  it('rejects unsafe or unresolved Vercel manifest handlers', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-vercel-output-'));
    const functionsRoot = path.join(outputRoot, 'functions');
    const cases = [
      ['traversal', '../outside.js', 'relative'],
      ['absolute', '/etc/passwd', 'relative'],
      ['missing', 'missing.js', 'missing'],
      ['symlink', 'linked.js', 'symbolic link'],
    ] as const;
    for (const [name, handler] of cases) {
      const directory = path.join(functionsRoot, `${name}.func`);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, '.vc-config.json'),
        JSON.stringify({ runtime: 'nodejs22.x', handler })
      );
      if (name === 'missing') {
        fs.writeFileSync(path.join(directory, 'index.js'), 'export default () => {};');
      }
      if (name === 'symlink') {
        const target = path.join(outputRoot, 'target.js');
        fs.writeFileSync(target, 'export default () => {};');
        fs.symlinkSync(target, path.join(directory, handler));
      }
    }

    const configSymlinkDirectory = path.join(functionsRoot, 'config-symlink.func');
    fs.mkdirSync(configSymlinkDirectory, { recursive: true });
    const configTarget = path.join(outputRoot, 'config-target.json');
    fs.writeFileSync(configTarget, JSON.stringify({ runtime: 'nodejs22.x', handler: 'serve.js' }));
    fs.symlinkSync(configTarget, path.join(configSymlinkDirectory, '.vc-config.json'));

    const parentSymlinkDirectory = path.join(functionsRoot, 'parent-symlink.func');
    const handlerParent = path.join(outputRoot, 'handler-parent');
    fs.mkdirSync(handlerParent, { recursive: true });
    fs.writeFileSync(path.join(handlerParent, 'serve.js'), 'export default () => {};');
    fs.mkdirSync(parentSymlinkDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(parentSymlinkDirectory, '.vc-config.json'),
      JSON.stringify({ runtime: 'nodejs22.x', handler: 'linked-parent/serve.js' })
    );
    fs.symlinkSync(handlerParent, path.join(parentSymlinkDirectory, 'linked-parent'));

    const missingConfigDirectory = path.join(functionsRoot, 'missing-config.func');
    fs.mkdirSync(missingConfigDirectory, { recursive: true });

    const malformedConfigDirectory = path.join(functionsRoot, 'malformed-config.func');
    fs.mkdirSync(malformedConfigDirectory, { recursive: true });
    fs.writeFileSync(path.join(malformedConfigDirectory, '.vc-config.json'), '{');

    const missingRuntimeDirectory = path.join(functionsRoot, 'missing-runtime.func');
    fs.mkdirSync(missingRuntimeDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(missingRuntimeDirectory, '.vc-config.json'),
      JSON.stringify({ handler: 'serve.js' })
    );
    fs.writeFileSync(path.join(missingRuntimeDirectory, 'serve.js'), 'export default () => {};');

    const wrongRuntimeDirectory = path.join(functionsRoot, 'wrong-runtime.func');
    fs.mkdirSync(wrongRuntimeDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(wrongRuntimeDirectory, '.vc-config.json'),
      JSON.stringify({ runtime: 'nodejs20.x', handler: 'serve.js' })
    );
    fs.writeFileSync(path.join(wrongRuntimeDirectory, 'serve.js'), 'export default () => {};');

    const symlinkFunctionTarget = path.join(outputRoot, 'symlink-function-target');
    fs.mkdirSync(symlinkFunctionTarget, { recursive: true });
    fs.writeFileSync(
      path.join(symlinkFunctionTarget, '.vc-config.json'),
      JSON.stringify({ runtime: 'nodejs22.x', handler: 'serve.js' })
    );
    fs.writeFileSync(path.join(symlinkFunctionTarget, 'serve.js'), 'export default () => {};');
    fs.symlinkSync(symlinkFunctionTarget, path.join(functionsRoot, 'symlink-function.func'));

    const symlinkRouteTarget = path.join(outputRoot, 'symlink-route-target');
    fs.mkdirSync(symlinkRouteTarget, { recursive: true });
    fs.symlinkSync(symlinkRouteTarget, path.join(functionsRoot, 'symlink-route'));

    const functions = vercelBuildOutputFunctions(functionsRoot);
    expect(functions).toHaveLength(cases.length + 8);
    for (const [name, _handler, message] of cases) {
      const functionEntry = functions.find((candidate) => candidate.name === name);
      expect(functionEntry?.entry).toBeUndefined();
      expect(functionEntry?.error).toContain(message);
    }
    expect(functions.find((candidate) => candidate.name === 'config-symlink')?.error).toContain(
      'non-symlink'
    );
    expect(functions.find((candidate) => candidate.name === 'parent-symlink')?.error).toContain(
      'symbolic link'
    );
    expect(functions.find((candidate) => candidate.name === 'missing-config')?.error).toContain(
      'missing .vc-config.json'
    );
    expect(functions.find((candidate) => candidate.name === 'malformed-config')?.error).toContain(
      'unreadable .vc-config.json'
    );
    expect(functions.find((candidate) => candidate.name === 'missing-runtime')?.error).toContain(
      'runtime'
    );
    expect(functions.find((candidate) => candidate.name === 'wrong-runtime')?.error).toContain(
      'nodejs22.x'
    );
    expect(functions.find((candidate) => candidate.name === 'symlink-function')?.error).toContain(
      'symbolic link'
    );
    expect(functions.find((candidate) => candidate.name === 'symlink-route')?.error).toContain(
      'symbolic link'
    );
  });

  it('does not discover nested .func directories inside a Vercel function bundle', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-vercel-output-'));
    const functionsRoot = path.join(outputRoot, 'functions');
    const outer = path.join(functionsRoot, 'api.func');
    const nested = path.join(outer, 'node_modules', 'nested.func');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(outer, '.vc-config.json'),
      JSON.stringify({ runtime: 'nodejs22.x', handler: 'serve.js' })
    );
    fs.writeFileSync(path.join(outer, 'serve.js'), 'export default () => {};');
    fs.writeFileSync(
      path.join(nested, '.vc-config.json'),
      JSON.stringify({ runtime: 'nodejs22.x', handler: 'nested.js' })
    );
    fs.writeFileSync(path.join(nested, 'nested.js'), 'export default () => {};');

    expect(vercelBuildOutputFunctions(functionsRoot).map(({ name }) => name)).toEqual(['api']);
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

  it('invokes build-output handlers in production Vercel runtime with synthetic isolation', () => {
    const original = {
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
      SURFACE_BOOT_PROOF_AMBIENT_SENTINEL: process.env.SURFACE_BOOT_PROOF_AMBIENT_SENTINEL,
    };
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://parent-secret@production.example/private',
      SESSION_SECRET: 'parent-session-secret',
      VERCEL_TOKEN: 'parent-vercel-token-secret',
      VERCEL_ORG_ID: 'parent-vercel-org-secret',
      VERCEL_PROJECT_ID: 'parent-vercel-project-secret',
      SURFACE_BOOT_PROOF_AMBIENT_SENTINEL: 'must-not-reach-child',
    });
    try {
      expect(proofEnv()).toMatchObject({
        NODE_ENV: 'test',
        ALLOW_MEMORY_STORAGE: '1',
      });
      const startedAt = Date.now();
      const result = invokeVercelFunctionInIsolatedChild({
        name: '--isolated',
        entry: fixture('isolated-vercel-handler.mjs'),
        responseTimeout: 100,
        redactionEnvironment: strictVercelEnvironment,
      });
      expect(result).toMatchObject({ name: '--isolated', ok: true });
      expect(Date.now() - startedAt).toBeLessThan(1_000);

      const failed = invokeVercelFunctionInIsolatedChild({
        name: 'api/secret-leak',
        entry: fixture('secret-leaking-vercel-handler.mjs'),
        responseTimeout: 100,
        redactionEnvironment: strictVercelEnvironment,
      });
      expect(failed).toMatchObject({ name: 'api/secret-leak', ok: false });
      for (const secret of [
        'parent-secret',
        'parent-session-secret',
        'parent-vercel-token-secret',
        'parent-vercel-org-secret',
        'parent-vercel-project-secret',
        'must-not-reach-child',
      ]) {
        expect(result.result).not.toContain(secret);
        expect(failed.result).not.toContain(secret);
      }
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('SIGKILL bounds a SIGTERM-trapping handler that never settles', () => {
    const startedAt = Date.now();
    const result = invokeVercelFunctionInIsolatedChild({
      name: 'api/sigterm-trap',
      entry: fixture('sigterm-trapping-vercel-handler.mjs'),
      responseTimeout: 1,
    });
    expect(result).toMatchObject({ name: 'api/sigterm-trap', ok: false });
    expect(result.result).toContain('SIGKILL');
    expect(Date.now() - startedAt).toBeLessThan(2_500);
  });

  it('uses the resolved function directory as the isolated child working directory', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-vercel-function-'));
    const entry = path.join(directory, 'cwd-handler.mjs');
    fs.writeFileSync(
      entry,
      [
        "import path from 'node:path';",
        "import process from 'node:process';",
        "import { fileURLToPath } from 'node:url';",
        'const handlerDirectory = path.dirname(fileURLToPath(import.meta.url));',
        'export default (_request, response) => {',
        "  if (process.cwd() !== handlerDirectory) throw new Error('unexpected child working directory');",
        '  response.end();',
        '};',
      ].join('\n')
    );

    expect(
      invokeVercelFunctionInIsolatedChild({
        name: 'api/cwd',
        entry,
        directory,
        responseTimeout: 100,
      })
    ).toMatchObject({ name: 'api/cwd', ok: true });
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

  it('uses a Docker-network hostname on the existing node-postgres loopback suffix', () => {
    expect(workerPostgresProofHostname('surface-matrix-worker-postgres-proof')).toBe(
      'surface-matrix-worker-postgres-proof.localhost'
    );
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

  it('runs normal boot proof only in detached clean room and atomically copies requested output', async () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-clean-room-repo-'));
    const output = path.join(repositoryRoot, 'audit', 'surface-contract-matrix', 'requested-proof.json');
    const candidateSha = 'c'.repeat(40);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{}\n');
    fs.writeFileSync(path.join(repositoryRoot, 'package-lock.json'), '{}\n');
    fs.writeFileSync(path.join(repositoryRoot, 'untracked-generated-artifact.txt'), 'preserve exactly\n');
    const calls: Array<{ command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }> = [];
    try {
      await runBootProofCleanRoom({
        repositoryRoot,
        output,
        candidateSha,
        environment: {
          PATH: '/clean-room-bin',
          VERCEL_TOKEN: 'clean-room-credential',
          VERCEL_ORG_ID: 'clean-room-org',
          VERCEL_PROJECT_ID: 'clean-room-project',
          ARBITRARY_SECRET: 'must-not-reach-git',
          DATABASE_URL: 'postgresql://parent-secret',
          GIT_DIR: '/parent-git-dir',
          GIT_WORK_TREE: '/parent-work-tree',
        },
        stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
        runCommand: (command, args, options) => {
          calls.push({ command, args, cwd: options.cwd, env: options.env });
          if (command === process.execPath) {
            expect(options.cwd).not.toBe(repositoryRoot);
            expect(args).toContain('--internal-clean-room');
            expect(args).toEqual(expect.arrayContaining(['--source-sha', candidateSha]));
            expect(options.env?.SURFACE_BOOT_PROOF_INTERNAL_CLEAN_ROOM).toBe('1');
            fs.writeFileSync(args[args.indexOf('--output') + 1], `${JSON.stringify(cleanRoomDocument(candidateSha))}\n`);
          }
          return { status: 0 };
        },
      });
      expect(calls[0]).toMatchObject({
        command: 'git',
        args: ['worktree', 'add', '--detach', expect.any(String), candidateSha],
        cwd: repositoryRoot,
      });
      const installCall = calls.find((call) => call.command === 'npm');
      expect(installCall?.args).toEqual(['ci']);
      expect(installCall?.cwd).not.toBe(repositoryRoot);
      expect(installCall?.env).toMatchObject({
        PATH: '/clean-room-bin',
        HUSKY: '0',
        CI: '1',
      });
      expect(installCall?.env).not.toHaveProperty('VERCEL_TOKEN');
      expect(calls.at(-1)).toMatchObject({ command: 'git', args: ['worktree', 'remove', '--force', expect.any(String)] });
      const gitWorktreeCalls = calls.filter((call) => call.command === 'git');
      expect(gitWorktreeCalls).toHaveLength(2);
      for (const call of gitWorktreeCalls) {
        expect(call.env).toMatchObject({ PATH: '/clean-room-bin', HUSKY: '0' });
        for (const key of [
          'ARBITRARY_SECRET',
          'VERCEL_TOKEN',
          'VERCEL_ORG_ID',
          'VERCEL_PROJECT_ID',
          'DATABASE_URL',
          'GIT_DIR',
          'GIT_WORK_TREE',
        ]) {
          expect(call.env).not.toHaveProperty(key);
        }
      }
      expect(calls.filter((call) => call.command === process.execPath).every((call) => call.cwd !== repositoryRoot)).toBe(true);
      expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({ source_sha: candidateSha });
      expect(fs.readFileSync(path.join(repositoryRoot, 'untracked-generated-artifact.txt'), 'utf8')).toBe('preserve exactly\n');
    } finally {
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it('supports external requested output and cleans invocation worktree after inner failure', async () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-external-repo-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-external-output-'));
    const output = path.join(external, 'proof.json');
    const candidateSha = 'd'.repeat(40);
    fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{}\n');
    fs.writeFileSync(path.join(repositoryRoot, 'package-lock.json'), '{}\n');
    const calls: Array<{ command: string; args: string[] }> = [];
    let innerAttempts = 0;
    try {
      await runBootProofCleanRoom({
        repositoryRoot,
        output,
        candidateSha,
        stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
        runCommand: (command, args) => {
          calls.push({ command, args });
          if (command === process.execPath) {
            innerAttempts += 1;
            fs.writeFileSync(args[args.indexOf('--output') + 1], `${JSON.stringify(cleanRoomDocument(candidateSha))}\n`);
          }
          return { status: 0 };
        },
      });
      expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({ source_sha: candidateSha });
      await expect(runBootProofCleanRoom({
        repositoryRoot,
        output,
        candidateSha,
        stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
        runCommand: (command, args) => {
          calls.push({ command, args });
          if (command === process.execPath) innerAttempts += 1;
          return { status: command === process.execPath && innerAttempts === 2 ? 1 : 0 };
        },
      })).rejects.toThrow('clean-room execution');
      expect(calls.filter((call) => call.command === 'git' && call.args[1] === 'remove')).toHaveLength(2);
    } finally {
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it('isolates inherited npm cache paths inside disposable clean-room parent', async () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-cache-repo-'));
    const externalCache = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-cache-external-'));
    const output = path.join(repositoryRoot, 'proof.json');
    const candidateSha = 'd'.repeat(40);
    const repositoryCache = path.join(repositoryRoot, '.npm-cache');
    const repositorySentinel = path.join(repositoryCache, 'sentinel');
    const externalSentinel = path.join(externalCache, 'sentinel');
    fs.mkdirSync(repositoryCache, { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{}\n');
    fs.writeFileSync(path.join(repositoryRoot, 'package-lock.json'), '{}\n');
    fs.writeFileSync(repositorySentinel, 'repository cache unchanged\n');
    fs.writeFileSync(externalSentinel, 'external cache unchanged\n');
    const repositoryBefore = fs.readFileSync(repositorySentinel, 'utf8');
    const externalBefore = fs.readFileSync(externalSentinel, 'utf8');
    try {
      await runBootProofCleanRoom({
        repositoryRoot,
        output,
        candidateSha,
        environment: {
          PATH: '/clean-room-bin',
          NPM_CONFIG_CACHE: repositoryCache,
          npm_config_cache: externalCache,
        },
        stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
        runCommand: (command, args, options) => {
          if (command === 'npm') {
            const disposableCache = path.join(path.dirname(options.cwd), 'npm-cache');
            expect(options.env?.NPM_CONFIG_CACHE).toBe(disposableCache);
            expect(options.env?.npm_config_cache).toBe(disposableCache);
            expect(options.env?.NPM_CONFIG_CACHE).not.toBe(repositoryCache);
            expect(options.env?.npm_config_cache).not.toBe(externalCache);
          }
          if (command === process.execPath) {
            fs.writeFileSync(args[args.indexOf('--output') + 1], `${JSON.stringify(cleanRoomDocument(candidateSha))}\n`);
          }
          return { status: 0 };
        },
      });
      expect(fs.readFileSync(repositorySentinel, 'utf8')).toBe(repositoryBefore);
      expect(fs.readFileSync(externalSentinel, 'utf8')).toBe(externalBefore);
    } finally {
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
      fs.rmSync(externalCache, { recursive: true, force: true });
    }
  });

  it('keeps install credentials and arbitrary parent environment outside the clean room', async () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-env-repo-'));
    const output = path.join(repositoryRoot, 'proof.json');
    const candidateSha = 'f'.repeat(40);
    const calls: Array<{ command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }> = [];
    try {
      fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{}\n');
      fs.writeFileSync(path.join(repositoryRoot, 'package-lock.json'), '{}\n');
      await runBootProofCleanRoom({
        repositoryRoot,
        output,
        candidateSha,
        environment: {
          PATH: '/clean-room-bin',
          ARBITRARY_SECRET: 'must-not-cross-boundary',
          VERCEL_TOKEN: 'vercel-token-secret',
          VERCEL_ORG_ID: 'vercel-org-secret',
          VERCEL_PROJECT_ID: 'vercel-project-secret',
          NPM_CONFIG_CACHE: path.join(repositoryRoot, '.npm-cache'),
          npm_config_cache: path.join(os.tmpdir(), 'external-npm-cache'),
        },
        stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
        runCommand: (command, args, options) => {
          calls.push({ command, args, cwd: options?.cwd, env: options?.env });
          if (command === process.execPath) {
            fs.writeFileSync(args[args.indexOf('--output') + 1], `${JSON.stringify(cleanRoomDocument(candidateSha))}\n`);
          }
          return { status: 0 };
        },
      });

      const install = calls.find((call) => call.command === 'npm' && call.args[0] === 'ci');
      const inner = calls.find((call) => call.command === process.execPath);
      const disposableCache = path.join(path.dirname(install!.cwd!), 'npm-cache');
      expect(install?.env).toMatchObject({
        PATH: '/clean-room-bin',
        TZ: 'UTC',
        CI: '1',
        HUSKY: '0',
        NPM_CONFIG_CACHE: disposableCache,
        npm_config_cache: disposableCache,
      });
      for (const key of ['ARBITRARY_SECRET', 'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
        expect(install?.env).not.toHaveProperty(key);
      }
      expect(inner?.env).toMatchObject({
        VERCEL_TOKEN: 'vercel-token-secret',
        VERCEL_ORG_ID: 'vercel-org-secret',
        VERCEL_PROJECT_ID: 'vercel-project-secret',
        NPM_CONFIG_CACHE: disposableCache,
        npm_config_cache: disposableCache,
      });
      expect(inner?.env).not.toHaveProperty('ARBITRARY_SECRET');
    } finally {
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it('preserves prior requested output when clean-room cleanup fails', async () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-atomic-output-repo-'));
    const output = path.join(repositoryRoot, 'proof.json');
    const candidateSha = '0'.repeat(40);
    try {
      fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{}\n');
      fs.writeFileSync(path.join(repositoryRoot, 'package-lock.json'), '{}\n');
      fs.writeFileSync(output, 'prior\n');
      await expect(
        runBootProofCleanRoom({
          repositoryRoot,
          output,
          candidateSha,
          stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
          runCommand: (command, args) => {
            if (command === process.execPath) {
              fs.writeFileSync(args[args.indexOf('--output') + 1], `${JSON.stringify(cleanRoomDocument(candidateSha))}\n`);
            }
            if (command === 'git' && args[0] === 'worktree' && args[1] === 'remove') return { status: 1 };
            return { status: 0 };
          },
        })
      ).rejects.toThrow('clean-room worktree cleanup');
      expect(fs.readFileSync(output, 'utf8')).toBe('prior\n');
    } finally {
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ['package.json', 'manifest hash'],
    ['dirty-untracked-proof.txt', 'non-output fingerprint'],
  ])('fails closed when clean-room invocation changes original %s', async (filename) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-mutation-repo-'));
    const output = path.join(repositoryRoot, 'proof.json');
    const candidateSha = 'e'.repeat(40);
    fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{}\n');
    fs.writeFileSync(path.join(repositoryRoot, 'package-lock.json'), '{}\n');
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      await expect(runBootProofCleanRoom({
        repositoryRoot,
        output,
        candidateSha,
        stdout: { write: vi.fn() } as unknown as NodeJS.WriteStream,
        runCommand: (command, args) => {
          calls.push({ command, args });
          if (command === process.execPath) {
            fs.writeFileSync(path.join(repositoryRoot, filename), 'changed by forbidden original-root proof\n');
            fs.writeFileSync(args[args.indexOf('--output') + 1], `${JSON.stringify(cleanRoomDocument(candidateSha))}\n`);
          }
          return { status: 0 };
        },
      })).rejects.toThrow('changed original workspace manifest hashes or non-output fingerprint');
      expect(calls.at(-1)).toMatchObject({ command: 'git', args: ['worktree', 'remove', '--force', expect.any(String)] });
    } finally {
      fs.rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it('rejects caller source SHA when actual clean-room HEAD differs before credentials, collection, or write', async () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-head-mismatch-'));
    const output = path.join(outputDirectory, 'proof.json');
    const collectProofs = vi.fn();
    try {
      await expect(runBootProofInner({
        output,
        requireG3: true,
        sourceSha: 'f'.repeat(40),
        readSourceSha: () => 'a'.repeat(40),
        collectProofs,
        environment: { ...strictVercelEnvironment, VERCEL_PROJECT_ID: '' },
      })).rejects.toThrow('clean-room HEAD does not match expected source SHA');
      expect(collectProofs).not.toHaveBeenCalled();
      expect(fs.existsSync(output)).toBe(false);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it('executes guarded internal child invocation and fails closed on actual clean-room HEAD mismatch', () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-proof-internal-entry-'));
    const output = path.join(outputDirectory, 'proof.json');
    const script = path.join(process.cwd(), 'audit/surface-contract-matrix/scripts/boot-proof.mjs');
    try {
      const result = spawnSync(process.execPath, [
        script,
        '--internal-clean-room',
        '--source-sha', 'f'.repeat(40),
        '--output', output,
      ], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 5_000,
        env: { ...process.env, SURFACE_BOOT_PROOF_INTERNAL_CLEAN_ROOM: '1' },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('clean-room HEAD does not match expected source SHA');
      expect(result.stdout).toBe('');
      expect(fs.existsSync(output)).toBe(false);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
