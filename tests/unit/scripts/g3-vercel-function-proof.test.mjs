import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectG3VercelFunctionProof,
  writeG3VercelFunctionProof,
} from '../../../scripts/release/collect-g3-vercel-function-proof.mjs';

const SHA = 'a'.repeat(40);
const roots = [];
const temporary = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'g3-function-test-')));
  roots.push(root);
  return root;
};
const setup = () => {
  const candidateRoot = temporary();
  fs.writeFileSync(
    path.join(candidateRoot, 'vercel.json'),
    JSON.stringify({
      framework: 'vite',
      buildCommand: 'npm run build:web && node scripts/build-vercel-api.mjs',
      installCommand: 'npm ci --include=dev',
      outputDirectory: 'dist/public',
    })
  );
  return { candidateRoot, sourceSha: SHA };
};
const emit = (root, name = 'api/[...slug]', status = 200) => {
  const directory = path.join(root, '.vercel/output/functions', `${name}.func`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, '.vc-config.json'),
    JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs' })
  );
  fs.writeFileSync(
    path.join(directory, 'index.mjs'),
    `export default (req, res) => { res.statusCode = ${status}; res.end(); };`
  );
};
const runner = (root, names = ['api/[...slug]']) =>
  vi.fn(async () => {
    names.forEach((name) => emit(root, name));
    return { status: 0 };
  });
afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

describe('isolated Vercel function collector', () => {
  it('uses fixed build args, synthetic settings and an isolated allowlisted environment', async () => {
    const input = setup();
    vi.stubEnv('VERCEL_TOKEN', 'ambient-token');
    vi.stubEnv('NODE_OPTIONS', '--require=ambient');
    vi.stubEnv('HTTPS_PROXY', 'ambient-proxy');
    const runBuild = runner(input.candidateRoot, ['api/[...slug]', 'api/health']);
    const invokeFunction = vi.fn((entry) => ({
      name: entry.name,
      ok: true,
      result: 'handler-response-completed',
    }));
    const proof = await collectG3VercelFunctionProof({ ...input, runBuild, invokeFunction });
    expect(proof).toMatchObject({
      schema_version: '1.1.0',
      source_sha: SHA,
      proofs: [{ deployment: 'vercel-api', runtime: 'vercel_function', boot_status: 'proven' }],
    });
    expect(proof.proofs).toHaveLength(1);
    expect(invokeFunction.mock.calls.map(([entry]) => entry.name)).toEqual([
      'api/[...slug]',
      'api/health',
    ]);
    const [build] = runBuild.mock.calls[0];
    expect(build.argv).toEqual(['build', '--prod']);
    expect(build.cwd).toBe(input.candidateRoot);
    expect(build.timeoutMs).toBe(480000);
    expect(build.env).toMatchObject({
      CI: '1',
      TZ: 'UTC',
      VERCEL_TELEMETRY_DISABLED: '1',
      npm_config_offline: 'true',
      npm_config_ignore_scripts: 'true',
    });
    for (const key of [
      'VERCEL_TOKEN',
      'VERCEL_ORG_ID',
      'VERCEL_PROJECT_ID',
      'NODE_OPTIONS',
      'HTTPS_PROXY',
    ])
      expect(build.env).not.toHaveProperty(key);
    expect(build.env.HOME).not.toBe(process.env.HOME);
    expect(fs.existsSync(build.env.HOME)).toBe(false);
    const project = JSON.parse(
      fs.readFileSync(path.join(input.candidateRoot, '.vercel/project.json'))
    );
    expect(project.settings).toEqual({
      rootDirectory: null,
      nodeVersion: '22.x',
      framework: 'vite',
      buildCommand: 'npm run build:web && node scripts/build-vercel-api.mjs',
      installCommand: 'npm ci --include=dev',
      outputDirectory: 'dist/public',
    });
  });

  it.each(['directory', 'dangling symlink'])(
    'rejects pre-existing .vercel %s before invoking builder',
    async (kind) => {
      const input = setup();
      const target = path.join(input.candidateRoot, '.vercel');
      if (kind === 'directory') fs.mkdirSync(target);
      else fs.symlinkSync('/missing-g3-cache', target);
      const runBuild = runner(input.candidateRoot);
      await expect(collectG3VercelFunctionProof({ ...input, runBuild })).rejects.toThrow(
        /fresh build directory/
      );
      expect(runBuild).not.toHaveBeenCalled();
    }
  );

  it.each([1, null])('rejects failed or timed-out builds (%s) despite output', async (status) => {
    const input = setup();
    await expect(
      collectG3VercelFunctionProof({
        ...input,
        runBuild: async () => {
          emit(input.candidateRoot);
          return { status };
        },
      })
    ).rejects.toThrow(/Vercel build failed/);
  });

  it('rejects a successful build with no functions', async () => {
    await expect(
      collectG3VercelFunctionProof({ ...setup(), runBuild: async () => ({ status: 0 }) })
    ).rejects.toThrow(/no Vercel functions/);
  });

  it('requires the canonical catch-all, even if other functions pass', async () => {
    const input = setup();
    await expect(
      collectG3VercelFunctionProof({
        ...input,
        runBuild: runner(input.candidateRoot, ['api/health']),
      })
    ).rejects.toThrow(/canonical catch-all/);
  });

  it.each([201, 404, 503])('rejects actual catch-all status %s', async (status) => {
    const input = setup();
    await expect(
      collectG3VercelFunctionProof({
        ...input,
        runBuild: async () => {
          emit(input.candidateRoot, 'api/[...slug]', status);
          return { status: 0 };
        },
      })
    ).rejects.toThrow(/Vercel function probe failed/);
  });

  it('accepts the actual generated callable catch-all at 200', async () => {
    const input = setup();
    const result = await collectG3VercelFunctionProof({
      ...input,
      runBuild: runner(input.candidateRoot),
    });
    expect(result.proofs[0].boot_status).toBe('proven');
  });

  it.each(['output', 'functions', 'handler'])('rejects symlinked %s', async (part) => {
    const input = setup();
    const outside = temporary();
    const runBuild = async () => {
      if (part === 'output')
        fs.symlinkSync(outside, path.join(input.candidateRoot, '.vercel/output'));
      else if (part === 'functions') {
        fs.mkdirSync(path.join(input.candidateRoot, '.vercel/output'));
        fs.symlinkSync(outside, path.join(input.candidateRoot, '.vercel/output/functions'));
      } else {
        emit(input.candidateRoot);
        const handler = path.join(
          input.candidateRoot,
          '.vercel/output/functions/api/[...slug].func/index.mjs'
        );
        fs.unlinkSync(handler);
        fs.symlinkSync(path.join(outside, 'index.mjs'), handler);
      }
      return { status: 0 };
    };
    await expect(collectG3VercelFunctionProof({ ...input, runBuild })).rejects.toThrow();
  });

  it('rejects malformed SHA without building', async () => {
    const input = setup();
    const runBuild = runner(input.candidateRoot);
    await expect(
      collectG3VercelFunctionProof({ ...input, sourceSha: 'main', runBuild })
    ).rejects.toThrow(/SHA/);
    expect(runBuild).not.toHaveBeenCalled();
  });

  it('times out a builder that never resolves without publishing evidence', async () => {
    vi.useFakeTimers();
    const output = path.join(temporary(), 'proof.json');
    try {
      const operation = writeG3VercelFunctionProof({
        ...setup(),
        output,
        runBuild: () => new Promise(() => {}),
      });
      const rejection = expect(operation).rejects.toThrow('Vercel build failed');
      await vi.advanceTimersByTimeAsync(480001);
      await rejection;
      expect(fs.existsSync(output)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires every emitted handler to be callable', async () => {
    const input = setup();
    const runBuild = async () => {
      emit(input.candidateRoot);
      emit(input.candidateRoot, 'api/health');
      fs.writeFileSync(
        path.join(input.candidateRoot, '.vercel/output/functions/api/health.func/index.mjs'),
        'export default {};'
      );
      return { status: 0 };
    };
    await expect(collectG3VercelFunctionProof({ ...input, runBuild })).rejects.toThrow(
      'Vercel function probe failed'
    );
  });

  it('does not overwrite an output created while the builder runs', async () => {
    const input = setup();
    const output = path.join(temporary(), 'proof.json');
    const runBuild = async () => {
      emit(input.candidateRoot);
      fs.writeFileSync(output, 'concurrent proof');
      return { status: 0 };
    };
    await expect(writeG3VercelFunctionProof({ ...input, output, runBuild })).rejects.toThrow();
    expect(fs.readFileSync(output, 'utf8')).toBe('concurrent proof');
    expect(fs.readdirSync(path.dirname(output))).toEqual(['proof.json']);
  });

  it('never exposes builder error output', async () => {
    await expect(
      collectG3VercelFunctionProof({
        ...setup(),
        runBuild: async () => {
          throw new Error('sensitive-builder-output');
        },
      })
    ).rejects.toThrow(/^Vercel build failed$/);
  });

  it('publishes only a valid success to a new output path', async () => {
    const input = setup();
    const output = path.join(temporary(), 'proof.json');
    await writeG3VercelFunctionProof({ ...input, runBuild: runner(input.candidateRoot), output });
    expect(JSON.parse(fs.readFileSync(output)).proofs[0].boot_status).toBe('proven');
  });

  it.each([false, true])(
    'failure preserves output absence or previous bytes (exists=%s)',
    async (exists) => {
      const output = path.join(temporary(), 'proof.json');
      if (exists) fs.writeFileSync(output, 'previous proof');
      await expect(
        writeG3VercelFunctionProof({ ...setup(), output, runBuild: async () => ({ status: 1 }) })
      ).rejects.toThrow();
      expect(fs.existsSync(output)).toBe(exists);
      if (exists) expect(fs.readFileSync(output, 'utf8')).toBe('previous proof');
      expect(fs.readdirSync(path.dirname(output))).toEqual(exists ? ['proof.json'] : []);
    }
  );
});
