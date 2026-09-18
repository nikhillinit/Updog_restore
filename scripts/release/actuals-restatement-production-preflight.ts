import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActualsRestatementMigrationResultV1Schema,
  type ActualsMigrationPreflightInput,
} from '../../shared/contracts/schema-reconcile-receipt-v1.contract';
import {
  actualsMigrationInputFromEnvironment,
  collectActualsMigrationPreflight,
} from './actuals-migration-preflight';

export async function assessActualsRestatementProductionPreflight(
  rawResult: unknown,
  input: ActualsMigrationPreflightInput,
  credentials: { githubToken: string; neonApiKey: string }
) {
  const result = ActualsRestatementMigrationResultV1Schema.parse(rawResult);
  if (result.applied || input.mode !== 'apply-actuals-restatement-0057') {
    throw new Error('0057 preflight requires its exact read-only mode');
  }
  const report = await collectActualsMigrationPreflight(input, credentials);
  if (result.targetFingerprint !== report.binding.targetFingerprint) {
    throw new Error('0057 before-state target differs from authenticated preflight target');
  }
  return report;
}

async function main() {
  const [inputPath, outputPath, ...extra] = process.argv.slice(2);
  if (!inputPath || !outputPath || extra.length > 0)
    throw new Error('Expected input and output JSON paths');
  const report = await assessActualsRestatementProductionPreflight(
    JSON.parse(await readFile(inputPath, 'utf8')),
    actualsMigrationInputFromEnvironment('apply-actuals-restatement-0057', process.env),
    { githubToken: process.env['GH_TOKEN'] ?? '', neonApiKey: process.env['NEON_API_KEY'] ?? '' }
  );
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stderr.write(
    `${report.evaluation}: ${report.observations
      .filter((item) => item.status !== 'verified')
      .map((item) => item.code)
      .join(', ')}\n`
  );
  process.exitCode = report.evaluation === 'pass' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('0057 production preflight failed; no apply capability granted\n');
    process.exitCode = 1;
  });
}
