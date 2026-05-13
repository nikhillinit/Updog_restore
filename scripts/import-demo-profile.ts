import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DemoProfileImportError,
  assertDemoProfileImportEnabled,
  commitDemoProfileImport,
  loadDemoProfileBundleFromEnv,
  loadDemoProfileBundleFromPath,
  rollbackDemoProfileImport,
  runDemoProfileDryRun,
  safeDemoProfileError,
} from '../server/services/demo-profile-import-service';
import type { DemoProfileImportBundle } from '@shared/contracts/demo-profile-import.contract';
import { verifyDemoProfile } from './verify-demo-profile';

export interface ImportDemoProfileCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ImportDemoProfileCliStreams {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

interface ImportDemoProfileCliProcess {
  exitCode?: number;
}

interface CliOptions {
  fundId?: number;
  inputPath?: string;
  envPayload?: string;
  datasetId?: string;
  previewHash?: string;
  mode?: 'dry-run' | 'commit' | 'rollback';
  allowTestFundI: boolean;
  allowDefaultBaselineReplace: boolean;
  apiBaseUrl?: string;
  authToken?: string;
  authTokenEnv?: string;
  requireApi: boolean;
  expectedFundSize?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    allowTestFundI: false,
    allowDefaultBaselineReplace: false,
    requireApi: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--fund-id':
        options.fundId = Number.parseInt(requireValue(argv, ++index, arg), 10);
        break;
      case '--input':
        options.inputPath = requireValue(argv, ++index, arg);
        break;
      case '--env-payload':
        options.envPayload = requireValue(argv, ++index, arg);
        break;
      case '--dataset-id':
        options.datasetId = requireValue(argv, ++index, arg);
        break;
      case '--preview-hash':
        options.previewHash = requireValue(argv, ++index, arg);
        break;
      case '--dry-run':
        options.mode = setMode(options.mode, 'dry-run');
        break;
      case '--commit':
        options.mode = setMode(options.mode, 'commit');
        break;
      case '--rollback':
        options.mode = setMode(options.mode, 'rollback');
        break;
      case '--allow-test-fund-i':
        options.allowTestFundI = true;
        break;
      case '--allow-default-baseline-replace':
        options.allowDefaultBaselineReplace = true;
        break;
      case '--api-base-url':
        options.apiBaseUrl = requireValue(argv, ++index, arg);
        break;
      case '--auth-token':
        options.authToken = requireValue(argv, ++index, arg);
        break;
      case '--auth-token-env':
        options.authTokenEnv = requireValue(argv, ++index, arg);
        break;
      case '--require-api':
        options.requireApi = true;
        break;
      case '--expected-fund-size':
        options.expectedFundSize = parsePositiveNumber(requireValue(argv, ++index, arg), arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveNumber(value: string, flag: string): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (trimmed.length === 0 || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function setMode(
  current: CliOptions['mode'],
  next: NonNullable<CliOptions['mode']>
): NonNullable<CliOptions['mode']> {
  if (current !== undefined && current !== next) {
    throw new Error('Choose exactly one of --dry-run, --commit, or --rollback');
  }
  return next;
}

function requireFundId(options: CliOptions): number {
  if (options.fundId === undefined || !Number.isInteger(options.fundId) || options.fundId <= 0) {
    throw new Error('--fund-id must be a positive integer');
  }
  return options.fundId;
}

function loadBundle(options: CliOptions, env: NodeJS.ProcessEnv): DemoProfileImportBundle {
  if (options.inputPath !== undefined && options.envPayload !== undefined) {
    throw new Error('Choose only one input source: --input or --env-payload');
  }
  if (options.inputPath !== undefined) {
    return loadDemoProfileBundleFromPath(options.inputPath);
  }
  if (options.envPayload !== undefined) {
    return loadDemoProfileBundleFromEnv(env, options.envPayload);
  }
  throw new Error('Missing input source: provide --input or --env-payload');
}

function safeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readAuthToken(options: CliOptions, env: NodeJS.ProcessEnv): string | undefined {
  if (options.authToken !== undefined) return options.authToken;
  const variableName = options.authTokenEnv ?? 'DEMO_PROFILE_VERIFY_AUTH_TOKEN';
  return env[variableName];
}

export async function runImportDemoProfileCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<ImportDemoProfileCliResult> {
  try {
    const options = parseArgs(argv);
    assertDemoProfileImportEnabled(env);

    if (options.mode === undefined) {
      throw new Error('Choose exactly one of --dry-run, --commit, or --rollback');
    }

    if (options.mode === 'rollback') {
      const fundId = requireFundId(options);
      if (options.datasetId === undefined) {
        throw new Error('--rollback requires --dataset-id');
      }
      const summary = await rollbackDemoProfileImport({
        fundId,
        datasetId: options.datasetId,
      });
      return {
        exitCode: 0,
        stdout: safeJson({ mode: 'rollback', summary }),
        stderr: '',
      };
    }

    const fundId = requireFundId(options);
    const bundle = loadBundle(options, env);
    const preview = runDemoProfileDryRun(bundle);

    if (options.mode === 'dry-run') {
      return {
        exitCode: 0,
        stdout: safeJson({ mode: 'dry-run', preview }),
        stderr: '',
      };
    }

    if (options.previewHash === undefined) {
      throw new Error('--commit requires --preview-hash from a prior dry-run');
    }

    const summary = await commitDemoProfileImport(
      {
        fundId,
        bundle,
        previewHash: options.previewHash,
      },
      {
        allowTestFundI: options.allowTestFundI,
        allowDefaultBaselineReplace: options.allowDefaultBaselineReplace,
        env,
      }
    );

    const authToken = readAuthToken(options, env);
    const verification = await verifyDemoProfile({
      fundId,
      bundle,
      ...(options.apiBaseUrl !== undefined && { apiBaseUrl: options.apiBaseUrl }),
      ...(authToken !== undefined && { authToken }),
      requireApi: options.requireApi,
      ...(options.expectedFundSize !== undefined && { expectedFundSize: options.expectedFundSize }),
      env,
    });
    if (!verification.passed) {
      throw new DemoProfileImportError(
        409,
        'DEMO_PROFILE_IMPORT_VISIBILITY_FAILED',
        'Demo profile commit visibility verification failed.'
      );
    }

    return {
      exitCode: 0,
      stdout: safeJson({
        mode: 'commit',
        summary,
        previewHash: preview.previewHash,
        verification,
      }),
      stderr: '',
    };
  } catch (error) {
    const safeError =
      error instanceof Error && error.name === 'Error'
        ? { code: 'INVALID_CLI_ARGUMENTS', status: 400, message: error.message }
        : safeDemoProfileError(error);
    return {
      exitCode: safeError.status >= 500 ? 1 : 2,
      stdout: '',
      stderr: safeJson({ error: safeError }),
    };
  }
}

export async function runImportDemoProfileCliMain(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  streams: ImportDemoProfileCliStreams = process,
  processLike: ImportDemoProfileCliProcess = process
): Promise<void> {
  try {
    const result = await runImportDemoProfileCli(argv, env);
    if (result.stdout.length > 0) {
      streams.stdout.write(result.stdout);
    }
    if (result.stderr.length > 0) {
      streams.stderr.write(result.stderr);
    }
    processLike.exitCode = result.exitCode;
  } catch {
    processLike.exitCode = 1;
    try {
      streams.stderr.write(
        safeJson({
          error: {
            code: 'CLI_BOOTSTRAP_FAILED',
            status: 500,
            message: 'Demo profile import failed before producing a safe result.',
          },
        })
      );
    } catch {
      // If stderr is unavailable there is no safe fallback channel.
    }
  }
}

const invokedPath = process.argv[1] === undefined ? '' : path.resolve(process.argv[1]);
if (fileURLToPath(import.meta.url) === invokedPath) {
  void runImportDemoProfileCliMain();
}
