#!/usr/bin/env node

import { spawn } from 'node:child_process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import pg from 'pg';

import {
  appendBoundedOutput,
  buildDrizzleSpawnCommand,
  classifyDrizzlePushOutput,
  matchesDbError,
  parseDbPushArgs,
  shouldRunPostcheck,
  verifyPostPushSentinels,
} from './db-push-core.mjs';

const { Client } = pg;

export function runDrizzlePushChild({
  command,
  args,
  cwd = process.cwd(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  return new Promise((resolveResult) => {
    let settled = false;
    let dbErrorDetected = false;
    let outputContext = '';

    function settle(result) {
      if (settled) {
        return;
      }

      settled = true;
      resolveResult({
        dbErrorDetected,
        outputContext,
        ...result,
      });
    }

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      dbErrorDetected ||= matchesDbError(text);
      outputContext = appendBoundedOutput(outputContext, text);
      stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      dbErrorDetected ||= matchesDbError(text);
      outputContext = appendBoundedOutput(outputContext, text);
      stderr.write(chunk);
    });

    child.on('error', (error) => {
      settle({
        status: 1,
        spawnError: error,
      });
    });

    child.on('close', (status, signal) => {
      settle({
        status: status ?? 1,
        signal,
      });
    });
  });
}

export async function runDbPushCli({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { drizzleArgs, skipPostcheck } = parseDbPushArgs(argv, env);
  const drizzleCommand = buildDrizzleSpawnCommand({
    drizzleArgs,
    repoRoot: process.cwd(),
    platform: process.platform,
  });

  if (!existsSync(drizzleCommand.localBinary)) {
    console.error(`[db:push] local drizzle-kit binary not found: ${drizzleCommand.localBinary}`);
    console.error('[db:push] install dependencies before running db:push');
    return 1;
  }

  if (!existsSync(drizzleCommand.localEntrypoint)) {
    console.error(
      `[db:push] local drizzle-kit entrypoint not found: ${drizzleCommand.localEntrypoint}`
    );
    console.error('[db:push] install dependencies before running db:push');
    return 1;
  }

  const childResult = await runDrizzlePushChild({
    command: drizzleCommand.command,
    args: drizzleCommand.args,
    env,
  });

  if (childResult.spawnError) {
    console.error(`[db:push] failed to launch local drizzle-kit: ${childResult.spawnError.message}`);
    return 1;
  }

  const classification = classifyDrizzlePushOutput({
    status: childResult.status,
    dbErrorDetected: childResult.dbErrorDetected,
  });

  if (!classification.ok) {
    console.error(`[db:push] ${classification.message}`);
    if (classification.reason === 'database-error' && childResult.outputContext.trim()) {
      console.error('[db:push] recent drizzle-kit output:');
      console.error(childResult.outputContext.trim());
    }
    return 1;
  }

  const postcheck = shouldRunPostcheck({
    skipPostcheck,
    databaseUrlPresent: Boolean(env.DATABASE_URL),
  });

  if (postcheck.failure) {
    console.error(`[db:push] ${postcheck.message}`);
    return 1;
  }

  if (!postcheck.run) {
    return 0;
  }

  try {
    await verifyPostPushSentinels({
      connectionString: env.DATABASE_URL,
      clientFactory: ({ connectionString }) => new Client({ connectionString }),
    });
  } catch (error) {
    console.error(`[db:push] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  return 0;
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runDbPushCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
