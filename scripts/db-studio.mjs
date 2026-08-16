#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { buildDrizzleSpawnCommand, shouldRefuseProdDbPush } from './db-push-core.mjs';

export function runDbStudioCli({ env = process.env, spawn = spawnSync } = {}) {
  const guard = shouldRefuseProdDbPush({ databaseUrl: env.DATABASE_URL, env });
  if (!env.DATABASE_URL || guard.refuse) {
    console.error(
      '[db:studio] Refusing database studio without an explicit local DATABASE_URL; remote targets are mechanically blocked'
    );
    return 1;
  }

  const command = buildDrizzleSpawnCommand({ drizzleArgs: ['studio'] });
  const result = spawn(command.command, command.args, {
    env,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  process.exitCode = runDbStudioCli();
}
