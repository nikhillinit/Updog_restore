#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const RYUK_IMAGE = 'testcontainers/ryuk:0.14.0';
export const REQUIRED_IMAGES = [
  'postgres:16-alpine',
  'redis:7-alpine',
  'pgvector/pgvector:pg16',
  RYUK_IMAGE,
];

const INFO_TIMEOUT_MS = 30_000;
const INSPECT_TIMEOUT_MS = 30_000;
const PULL_TIMEOUT_MS = 90_000;
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const MISSING_IMAGE_PATTERN = /(?:no such image|no such object)/i;

function defaultRun(command, args, options) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  });
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

function failureDetails(result) {
  return [
    result.error?.message,
    result.signal ? `signal ${result.signal}` : undefined,
    result.status === null || result.status === undefined ? undefined : `exit ${result.status}`,
    result.stderr?.trim(),
    result.stdout?.trim(),
  ]
    .filter(Boolean)
    .join('; ');
}

function assertCompleted(result, command, args, action) {
  if (result.error || result.status !== 0) {
    const details = failureDetails(result) || 'no subprocess diagnostics';
    throw new Error(`${action} failed (${commandLabel(command, args)}): ${details}`);
  }
}

function inspectImage(run, image) {
  const args = ['image', 'inspect', '--format', '{{.Id}}', image];
  const result = run('docker', args, {
    timeout: INSPECT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });

  if (result.error) {
    assertCompleted(result, 'docker', args, `Docker image inspect for ${image}`);
  }
  if (result.status !== 0) {
    if (MISSING_IMAGE_PATTERN.test(`${result.stderr ?? ''}\n${result.stdout ?? ''}`)) {
      return undefined;
    }
    assertCompleted(result, 'docker', args, `Docker image inspect for ${image}`);
  }

  const imageId = result.stdout?.trim();
  if (!imageId || !IMAGE_ID_PATTERN.test(imageId)) {
    throw new Error(
      `Docker image inspect for ${image} returned an invalid image ID: ${imageId || '<empty>'}`
    );
  }
  return imageId;
}

export async function prepareTestcontainers({
  run = defaultRun,
  env = process.env,
  log = (message) => process.stdout.write(`${message}\n`),
  images = REQUIRED_IMAGES,
} = {}) {
  if (env.TESTCONTAINERS_RYUK_DISABLED === 'true') {
    throw new Error('Testcontainers Ryuk cleanup must remain enabled');
  }
  if (env.RYUK_CONTAINER_IMAGE !== RYUK_IMAGE) {
    throw new Error(`RYUK_CONTAINER_IMAGE must equal ${RYUK_IMAGE}`);
  }

  const infoArgs = ['info', '--format', '{{json .ServerVersion}}'];
  const info = run('docker', infoArgs, {
    timeout: INFO_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  assertCompleted(info, 'docker', infoArgs, 'Docker daemon preflight');

  for (const image of images) {
    let imageId = inspectImage(run, image);
    if (!imageId) {
      const pullArgs = ['pull', image];
      const pull = run('docker', pullArgs, {
        timeout: PULL_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
      assertCompleted(pull, 'docker', pullArgs, `Docker image pull for ${image}`);
      imageId = inspectImage(run, image);
      if (!imageId) {
        throw new Error(`Docker image inspect for ${image} failed after pull: No such image`);
      }
    }
    log(`Testcontainers image ready: ${image} (${imageId})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  prepareTestcontainers().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
