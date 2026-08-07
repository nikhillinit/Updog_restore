import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const FORBIDDEN_DRIVER_SIGNATURES = Object.freeze([
  'Neon pool error',
  'fetch failed',
  'No transactions support in neon-http driver',
]);

export function assertDriverLogsClean(jsonLines) {
  const lines = String(jsonLines)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  for (const line of lines) {
    let searchable = line;
    try {
      const parsed = JSON.parse(line);
      searchable = [parsed.message, parsed.text]
        .filter((value) => typeof value === 'string')
        .join('\n');
    } catch {
      searchable = line;
    }

    const signature = FORBIDDEN_DRIVER_SIGNATURES.find((candidate) =>
      searchable.toLowerCase().includes(candidate.toLowerCase())
    );
    if (signature) {
      throw new Error(`Vercel runtime log contains forbidden driver signature: ${signature}`);
    }
  }

  return { lines: lines.length };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Expected Vercel JSONL file path');

  const result = assertDriverLogsClean(await readFile(inputPath, 'utf8'));
  console.log(`Vercel driver log scan passed: ${result.lines} lines.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
