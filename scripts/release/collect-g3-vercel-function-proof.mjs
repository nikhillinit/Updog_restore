import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BootProofDocumentSchema } from '../../audit/surface-contract-matrix/matrix-schema.mjs';
import {
  vercelBuildOutputFunctions,
  invokeVercelFunctionInIsolatedChild,
  vercelFunctionProofEnvironment,
} from '../../audit/surface-contract-matrix/scripts/boot-proof.mjs';

const BUILD_TIMEOUT_MS = 480_000;
const COLLECTOR_TIMEOUT_MS = 600_000;
const CLI = '/opt/g3/node_modules/vercel/dist/index.js';

const exists = (filename) => {
  try {
    fs.lstatSync(filename);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

// Inspect every ancestor: realpath alone would silently accept symlinked output.
const realPath = (filename, type) => {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  const segments = absolute.slice(current.length).split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (index < segments.length - 1 && !stat.isDirectory())) {
      throw new Error('Vercel proof path must not contain symlinks');
    }
    if (index === segments.length - 1 && !(type === 'file' ? stat.isFile() : stat.isDirectory())) {
      throw new Error('Vercel proof path has invalid type');
    }
  }
  return absolute;
};

const BUILD_FAILURE_CODES = Object.freeze([
  'NPM_CONFIG_COLLISION',
  'OFFLINE_CACHE_MISS',
  'NETWORK_UNAVAILABLE',
  'PROVIDER_AUTH_REQUIRED',
  'BUILD_TIMEOUT',
  'BUILD_INPUT_MISSING',
  'BUILD_EXIT_NONZERO',
]);
export const classifyVercelBuildFailure = (result) => {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (/double-loading config/.test(output)) return 'NPM_CONFIG_COLLISION';
  if (/ENOTCACHED/.test(output)) return 'OFFLINE_CACHE_MISS';
  if (/ENETUNREACH|EAI_AGAIN|ENOTFOUND/.test(output)) return 'NETWORK_UNAVAILABLE';
  if (/No existing credentials|requires? (?:an? )?(?:auth|token)|not logged in/i.test(output))
    return 'PROVIDER_AUTH_REQUIRED';
  if (result.error?.code === 'ETIMEDOUT') return 'BUILD_TIMEOUT';
  if (/ENOENT|Cannot find module/.test(output)) return 'BUILD_INPUT_MISSING';
  return 'BUILD_EXIT_NONZERO';
};

const runInstalledBuilder = ({ cwd, argv, env, timeoutMs }) => {
  const result = spawnSync(process.execPath, [CLI, ...argv], {
    cwd,
    env,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: result.error ? null : result.status,
    failureCode: classifyVercelBuildFailure(result),
  };
};

export async function collectG3VercelFunctionProof({
  candidateRoot,
  sourceSha,
  runBuild = runInstalledBuilder,
  invokeFunction = invokeVercelFunctionInIsolatedChild,
}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) throw new Error('Invalid source SHA');
  // Temporary directories on macOS may live below /var -> /private/var.
  // Canonicalize the caller root, but never accept a symlink as the root itself.
  if (fs.lstatSync(candidateRoot).isSymbolicLink()) throw new Error('Invalid candidate root');
  candidateRoot = realPath(fs.realpathSync(candidateRoot), 'directory');
  const vercelRoot = path.join(candidateRoot, '.vercel');
  if (exists(vercelRoot)) throw new Error('Expected a fresh build directory without .vercel');
  const config = JSON.parse(
    fs.readFileSync(realPath(path.join(candidateRoot, 'vercel.json'), 'file'), 'utf8')
  );
  const settings = { rootDirectory: null, nodeVersion: '22.x' };
  for (const key of ['framework', 'buildCommand', 'installCommand', 'outputDirectory']) {
    if (typeof config[key] !== 'string' || !config[key].trim())
      throw new Error('Invalid tracked Vercel configuration');
    settings[key] = config[key];
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'g3-vercel-home-'));
  const deadline = Date.now() + COLLECTOR_TIMEOUT_MS;
  let timer;
  try {
    fs.mkdirSync(path.join(home, 'config'));
    fs.mkdirSync(path.join(home, 'cache'));
    fs.mkdirSync(vercelRoot);
    fs.writeFileSync(
      path.join(vercelRoot, 'project.json'),
      JSON.stringify({
        projectId: 'prj_g3_isolated',
        orgId: 'team_g3_isolated',
        settings,
      }),
      { flag: 'wx', mode: 0o600 }
    );
    const env = Object.fromEntries(
      Object.entries({
        ...vercelFunctionProofEnvironment({ PATH: '/usr/local/bin:/usr/bin:/bin' }),
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, 'config'),
        XDG_CACHE_HOME: path.join(home, 'cache'),
        CI: '1',
        TZ: 'UTC',
        VERCEL_TELEMETRY_DISABLED: '1',
        npm_config_offline: 'true',
        npm_config_ignore_scripts: 'true',
        npm_config_cache: '/opt/npm-cache',
        npm_config_update_notifier: 'false',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_userconfig: '/dev/null',
        npm_config_globalconfig: path.join(home, 'global.npmrc'),
      }).filter(([, value]) => value !== undefined)
    );
    let build;
    try {
      build = await Promise.race([
        runBuild({
          cwd: candidateRoot,
          argv: ['build', '--prod'],
          env,
          timeoutMs: BUILD_TIMEOUT_MS,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), BUILD_TIMEOUT_MS);
        }),
      ]);
    } catch {
      throw new Error('Vercel build failed');
    } finally {
      clearTimeout(timer);
    }
    if (build?.status !== 0) {
      const code = BUILD_FAILURE_CODES.includes(build?.failureCode) ? `: ${build.failureCode}` : '';
      throw new Error(`Vercel build failed${code}`);
    }
    const functionsRoot = path.join(vercelRoot, 'output/functions');
    if (!exists(functionsRoot)) throw new Error('Build emitted no Vercel functions');
    realPath(functionsRoot, 'directory');
    const functions = vercelBuildOutputFunctions(functionsRoot);
    if (!functions.length) throw new Error('Build emitted no Vercel functions');
    if (functions.some((entry) => entry.error || !entry.entry))
      throw new Error('Invalid Vercel function output');
    if (!functions.some((entry) => entry.name === 'api/[...slug]'))
      throw new Error('Missing canonical catch-all');
    for (const entry of functions) {
      realPath(entry.entry, 'file');
      const relative = path.relative(functionsRoot, entry.entry);
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('Invalid Vercel function containment');
      const remaining = deadline - Date.now();
      if (remaining <= 1000) throw new Error('Vercel function probe failed');
      let invocation;
      try {
        invocation = await Promise.race([
          invokeFunction({ ...entry, responseTimeout: Math.min(20_000, remaining - 1000) }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), Math.min(21_000, remaining));
          }),
        ]);
      } catch {
        throw new Error('Vercel function probe failed');
      } finally {
        clearTimeout(timer);
      }
      if (
        invocation?.name !== entry.name ||
        invocation.ok !== true ||
        invocation.result !== 'handler-response-completed'
      ) {
        throw new Error('Vercel function probe failed');
      }
    }
    const bootEvidence = {
      command_or_artifact: 'vercel@55.0.0 build --prod; fresh .vercel/output/functions',
      probe: 'invoke every generated callable handler; api/[...slug]: GET /api/version exact 200',
      result: `invoked ${functions.length} generated functions; catch-all GET /api/version=200`,
    };
    return BootProofDocumentSchema.parse({
      schema_version: '1.1.0',
      source_sha: sourceSha,
      proofs: [
        {
          deployment: 'vercel-api',
          runtime: 'vercel_function',
          boot_status: 'proven',
          boot_evidence: {
            ...bootEvidence,
            observed_at: `proof:${createHash('sha256')
              .update(JSON.stringify({ sourceSha, ...bootEvidence }))
              .digest('hex')}`,
          },
        },
      ],
    });
  } finally {
    clearTimeout(timer);
    fs.rmSync(home, { recursive: true, force: true });
  }
}

export async function writeG3VercelFunctionProof({ output, ...options }) {
  const parent = realPath(fs.realpathSync(path.dirname(output)), 'directory');
  if (fs.lstatSync(path.dirname(output)).isSymbolicLink()) throw new Error('Invalid output parent');
  output = path.join(parent, path.basename(output));
  if (exists(output)) throw new Error('Proof output must be a new file');
  const document = await collectG3VercelFunctionProof(options);
  const temporary = path.join(parent, `.g3-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    // link is an atomic create-if-absent; rename would overwrite a racing writer.
    fs.linkSync(temporary, output);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return document;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--expected-sha' || args[2] !== '--output')
    throw new Error('Invalid arguments');
  await writeG3VercelFunctionProof({
    candidateRoot: '/candidate',
    sourceSha: args[1],
    output: args[3],
  });
  console.log('G3_FUNCTION_PROOF_PUBLISHED');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    const code = BUILD_FAILURE_CODES.find(
      (value) => error.message === `Vercel build failed: ${value}`
    );
    console.error(code ? `G3_FUNCTION_PROOF_FAILED ${code}` : 'G3_FUNCTION_PROOF_FAILED');
    process.exitCode = 1;
  });
}
