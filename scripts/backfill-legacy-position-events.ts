import { backfillLegacyPositionEvents } from '../server/services/investment-ledger/legacy-position-backfill-service';

interface CliOptions {
  mode: 'dry_run' | 'apply' | 'resume';
  fundIds?: number[];
  expectedSourceHashes?: Record<string, string>;
  actorId: number | null;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { mode: 'dry_run', actorId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      options.mode = 'apply';
    } else if (arg === '--resume') {
      options.mode = 'resume';
    } else if (arg === '--dry-run') {
      options.mode = 'dry_run';
    } else if (arg === '--fund-id') {
      const value = argv[++index];
      if (!value) throw new Error('--fund-id requires a value.');
      options.fundIds = [...(options.fundIds ?? []), Number(value)];
    } else if (arg === '--actor-id') {
      const value = argv[++index];
      if (!value) throw new Error('--actor-id requires a value.');
      options.actorId = Number(value);
    } else if (arg === '--expected-source-hash') {
      const value = argv[++index];
      if (!value) throw new Error('--expected-source-hash requires investmentId=sha256.');
      const [investmentId, hash] = value.split('=');
      if (!investmentId || !hash) {
        throw new Error('--expected-source-hash requires investmentId=sha256.');
      }
      options.expectedSourceHashes = {
        ...(options.expectedSourceHashes ?? {}),
        [investmentId]: hash,
      };
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/backfill-legacy-position-events.ts [--dry-run|--apply|--resume] [options]

Options:
  --resume                               Apply only missing rows from a prior dry-run plan
  --fund-id <id>                         Limit to one fund; repeatable
  --actor-id <id>                        User id recorded on created events
  --expected-source-hash <id=sha256>     Required for apply; repeatable
`);
}

export async function runLegacyPositionBackfillCli(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  const result = await backfillLegacyPositionEvents({
    actorId: options.actorId,
    request: {
      mode: options.mode,
      ...(options.fundIds !== undefined && { fundIds: options.fundIds }),
      ...(options.expectedSourceHashes !== undefined && {
        expectedSourceHashes: options.expectedSourceHashes,
      }),
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runLegacyPositionBackfillCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
