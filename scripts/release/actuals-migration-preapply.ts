import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActualsMigrationPreflightInputSchema } from '../../shared/contracts/schema-reconcile-receipt-v1.contract';
import {
  ActualsMigrationPreApplyRefusal,
  actualsMigrationInputFromEnvironment,
  revalidateActualsMigrationBeforeApply,
} from './actuals-migration-preflight';

async function main() {
  const [rawMode, priorReportPath, outputPath, ...extra] = process.argv.slice(2);
  if (!priorReportPath || !outputPath || extra.length > 0)
    throw new Error('Expected mode, prior report path, and output path');
  const mode = ActualsMigrationPreflightInputSchema.shape.mode.parse(rawMode);
  try {
    const report = await revalidateActualsMigrationBeforeApply(
      JSON.parse(await readFile(priorReportPath, 'utf8')),
      actualsMigrationInputFromEnvironment(mode, process.env),
      { githubToken: process.env['GH_TOKEN'] ?? '', neonApiKey: process.env['NEON_API_KEY'] ?? '' }
    );
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    const refusal =
      error instanceof ActualsMigrationPreApplyRefusal
        ? error
        : new ActualsMigrationPreApplyRefusal('binding');
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          status: 'blocked',
          code: refusal.code,
          stage: refusal.stage,
          observation: refusal.observation,
          report: refusal.report,
        },
        null,
        2
      )}\n`,
      { mode: 0o600 }
    );
    process.stderr.write(`${refusal.code}: ${refusal.stage}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Actuals migration pre-apply failed; no apply capability granted\n');
    process.exitCode = 1;
  });
}
