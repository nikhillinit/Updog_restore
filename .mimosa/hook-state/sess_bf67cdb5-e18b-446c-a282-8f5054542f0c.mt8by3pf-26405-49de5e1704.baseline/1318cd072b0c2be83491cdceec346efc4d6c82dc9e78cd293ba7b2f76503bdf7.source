#!/usr/bin/env npx tsx

import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

type CliStreams = {
  stdout: { write(message: string): unknown };
  stderr: { write(message: string): unknown };
};

type CliOptions = {
  cwd?: string;
  now?: () => Date;
  streams?: CliStreams;
};

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

export async function runInitMemoryManagerCli(
  args = process.argv.slice(2),
  options: CliOptions = {}
): Promise<number> {
  const streams = options.streams ?? process;
  const sessionId = readFlagValue(args, '--session-id') ?? randomUUID();
  const useDatabase = args.includes('--use-database');
  const startedAt = (options.now ?? (() => new Date()))().toISOString();
  const sessionInfoPath = path.join(options.cwd ?? process.cwd(), '.session-memory.json');

  const sessionInfo = {
    sessionId,
    userId: 'codex-workspace-session',
    agentId: 'repo-context',
    startedAt,
    mode: 'repo-context-only',
    memoriesLoaded: 0,
    memorySource: 'codex-workspace',
    packageBackedMemory: 'retired',
    databaseRequested: useDatabase,
  };

  await writeFile(sessionInfoPath, JSON.stringify(sessionInfo, null, 2), 'utf-8');

  streams.stdout.write(
    '[INIT] Memory Manager package is retired; wrote package-free session context.\n'
  );
  if (useDatabase) {
    streams.stdout.write(
      '[INFO] --use-database ignored because package-backed memory is decoupled.\n'
    );
  }
  streams.stdout.write(`[INFO] Session info saved to ${sessionInfoPath}\n`);
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (path.resolve(fileURLToPath(import.meta.url)) === invokedPath) {
  runInitMemoryManagerCli()
    .then((exitCode) => process.exit(exitCode))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[init-memory-manager] Failed to write session context: ${message}\n`);
      process.exit(1);
    });
}
