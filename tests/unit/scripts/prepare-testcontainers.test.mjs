import { createRequire } from 'node:module';
import picomatch from 'picomatch';
import YAML from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import integrationConfig from '../../../vitest.config.int.ts';

const ryuk = 'testcontainers/ryuk:0.14.0';
const imageId = `sha256:${'a'.repeat(64)}`;
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const missing = { status: 1, stdout: '', stderr: 'Error: No such image' };
const { readFileSync } = await vi.importActual('node:fs');

async function prepare(run, env = { RYUK_CONTAINER_IMAGE: ryuk }) {
  const { prepareTestcontainers } = await import('../../../scripts/prepare-testcontainers.mjs');
  return prepareTestcontainers({ run, env, log: vi.fn() });
}

describe('Testcontainers image preflight', () => {
  it('pulls an absent Ryuk image even when other images came from cache, then verifies it', async () => {
    let pulled = false;
    const run = vi.fn((_command, args) => {
      if (args[0] === 'pull') {
        pulled = true;
        return ok();
      }
      if (args[0] === 'image' && args.at(-1) === ryuk && !pulled) return missing;
      return ok(args[0] === 'image' ? imageId : 'Docker ready');
    });
    await prepare(run);
    expect(
      run.mock.calls.filter(([, args]) => args[0] === 'pull').map(([, args]) => args[1])
    ).toEqual([ryuk]);
    const ryukCalls = run.mock.calls.filter(([, args]) => args.at(-1) === ryuk);
    expect(ryukCalls.map(([, args]) => args[0])).toEqual(['image', 'pull', 'image']);
    expect(run.mock.calls.some(([, args]) => args.at(-1) === 'pgvector/pgvector:pg16')).toBe(true);
    for (const [, , options] of run.mock.calls) {
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(120_000);
      expect(options.killSignal).toBe('SIGKILL');
    }
  });

  it('fails when the Docker daemon is unavailable before inspecting images', async () => {
    const run = vi.fn(() => ({ status: 1, stdout: '', stderr: 'daemon unavailable' }));
    await expect(prepare(run)).rejects.toThrow(/daemon preflight.*daemon unavailable/);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual(['info', '--format', '{{json .ServerVersion}}']);
  });

  it('fails when pull succeeds but the image is still unavailable', async () => {
    const run = vi.fn((_command, args) => (args[0] === 'image' ? missing : ok()));
    await expect(prepare(run)).rejects.toThrow(/inspect.*No such image/);
  });

  it('fails on pull errors without retrying the suite or claiming availability', async () => {
    const run = vi.fn((_command, args) =>
      args[0] === 'image'
        ? missing
        : args[0] === 'pull'
          ? { status: 1, stderr: 'registry denied' }
          : ok()
    );
    await expect(prepare(run)).rejects.toThrow(/pull.*registry denied/);
    expect(run.mock.calls.filter(([, args]) => args[0] === 'pull')).toHaveLength(1);
  });

  it('does not treat inspect transport errors as missing images', async () => {
    const run = vi.fn((_command, args) =>
      args[0] === 'image' ? { status: 1, stderr: 'Cannot connect to Docker daemon' } : ok()
    );
    await expect(prepare(run)).rejects.toThrow(/Cannot connect/);
    expect(run.mock.calls.some(([, args]) => args[0] === 'pull')).toBe(false);
  });

  it('fails closed on a timed out Docker operation', async () => {
    const run = vi.fn(() => ({
      status: null,
      error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }),
    }));
    await expect(prepare(run)).rejects.toThrow(/timed out/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects successful inspect output without an image ID', async () => {
    await expect(prepare(vi.fn(() => ok()))).rejects.toThrow(/image ID/);
  });

  it.each([
    {},
    { RYUK_CONTAINER_IMAGE: 'testcontainers/ryuk:latest' },
    { RYUK_CONTAINER_IMAGE: ryuk, TESTCONTAINERS_RYUK_DISABLED: 'true' },
  ])('rejects missing Ryuk identity or disabled cleanup before Docker calls', async (env) => {
    const run = vi.fn();
    await expect(prepare(run, env)).rejects.toThrow(/Ryuk|RYUK/);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('required characterization coverage and preflight wiring', () => {
  it('retains characterization in the integration feeder of CI Gate Status', () => {
    const path = 'tests/integration/release-canary-residue-characterization.test.ts';
    expect(picomatch(integrationConfig.test.include)(path)).toBe(true);
    expect(picomatch(integrationConfig.test.exclude)(path)).toBe(false);
    const workflow = YAML.parse(readFileSync('.github/workflows/ci-unified.yml', 'utf8'));
    expect(workflow.jobs.gate.needs).toContain('test-full');
    expect(
      workflow.jobs['test-full'].steps.find((step) => step.name === 'Run tests').run
    ).toContain('npm run test:integration');
    const preflight = workflow.jobs['test-full'].steps.find(
      (step) => step.run === 'node scripts/prepare-testcontainers.mjs'
    );
    expect(preflight).toBeDefined();
    expect(preflight.if).toBe("matrix.group == 'integration'");
    expect(workflow.jobs['test-full'].steps.indexOf(preflight)).toBeLessThan(
      workflow.jobs['test-full'].steps.findIndex((step) => step.name === 'Run tests')
    );
  });

  it('uses the same explicit Ryuk identity for preflight and runtime in both workflows', () => {
    const require = createRequire(import.meta.url);
    expect(require('testcontainers/build/reaper/reaper.js').REAPER_IMAGE).toBe(ryuk);
    for (const [file, job] of [
      ['ci-unified.yml', 'test-full'],
      ['testcontainers-ci.yml', 'testcontainers'],
    ]) {
      const workflow = YAML.parse(readFileSync(`.github/workflows/${file}`, 'utf8'));
      expect(workflow.jobs[job].env.RYUK_CONTAINER_IMAGE).toBe(ryuk);
      const preflight = workflow.jobs[job].steps.find(
        (step) => step.run === 'node scripts/prepare-testcontainers.mjs'
      );
      expect(preflight).toBeDefined();
      expect(preflight['continue-on-error']).not.toBe(true);
      expect(preflight['timeout-minutes']).toBeLessThanOrEqual(10);
      if (file === 'testcontainers-ci.yml') {
        expect(workflow.jobs[job].steps.indexOf(preflight)).toBeGreaterThan(
          workflow.jobs[job].steps.findIndex((step) => step.name === 'Load cached Docker images')
        );
      }
    }
  });

  it('runs standalone Testcontainers CI when the preflight helper changes', () => {
    const filters = YAML.parse(readFileSync('.github/path-filters.yml', 'utf8'));
    expect(picomatch(filters.schema_tests)('scripts/prepare-testcontainers.mjs')).toBe(true);
  });
});
