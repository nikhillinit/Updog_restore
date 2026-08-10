import { readFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BootProofDocumentSchema } from '../../audit/surface-contract-matrix/matrix-schema.mjs';

const SHA = /^[a-f0-9]{40}$/;
export const REQUIRED_G3_PROOFS = Object.freeze([
  'vercel-api|make_app',
  'vercel-api|vercel_function',
  'railway-worker-fund-scenario-calc|worker_process',
  'railway-worker-capital-call-status|worker_process',
]);
export const REQUIRED_WORKERS = Object.freeze(['fund-scenario-calc', 'capital-call-status']);

function fail(message) {
  throw new Error(`G3 boot proof failed: ${message}`);
}

export function verifyG3BootProof(document, expectedSha) {
  if (!SHA.test(expectedSha ?? '')) fail('expected SHA must be a lowercase 40-character SHA');
  const parsed = BootProofDocumentSchema.safeParse(document);
  if (!parsed.success) fail(`boot proof document schema is invalid: ${parsed.error.issues[0]?.message ?? 'unknown schema error'}`);
  document = parsed.data;
  if (!document || document.source_sha !== expectedSha) fail('source_sha does not equal expected SHA');
  const proofs = Array.isArray(document.proofs) ? document.proofs : [];
  const proofId = (proof) => `${proof?.deployment ?? ''}|${proof?.runtime ?? ''}`;
  const seen = new Set();
  for (const proof of proofs) {
    const id = proofId(proof);
    if (seen.has(id)) fail(`duplicate proof ${id}`);
    seen.add(id);
  }
  for (const id of REQUIRED_G3_PROOFS) {
    const matching = proofs.filter((entry) => proofId(entry) === id);
    if (matching.length !== 1 || matching[0]?.boot_status !== 'proven') fail(`required proof ${id} is not uniquely proven`);
  }
  for (const workerType of REQUIRED_WORKERS) {
    const proof = proofs.find(
      (entry) => proofId(entry) === `railway-worker-${workerType}|worker_process`
    );
    const identity = proof?.worker_identity;
    if (
      !identity ||
      identity.workerType !== workerType ||
      identity.commit !== expectedSha ||
      typeof identity.deploymentId !== 'string' ||
      !identity.deploymentId
    ) {
      fail(`worker identity for ${workerType} does not match expected deployment`);
    }
  }
  return { sourceSha: expectedSha, proofCount: REQUIRED_G3_PROOFS.length, workerCount: REQUIRED_WORKERS.length };
}

async function main() {
  const args = process.argv.slice(2);
  const proofPath = args[args.indexOf('--input') + 1] ?? args[args.indexOf('--proof') + 1];
  const expectedSha = args[args.indexOf('--expected-sha') + 1];
  if (!proofPath || !expectedSha) fail('expected --input and --expected-sha');
  const result = verifyG3BootProof(JSON.parse(await readFile(proofPath, 'utf8')), expectedSha);
  console.log(`G3 boot proof passed: ${result.proofCount} proofs, ${result.workerCount} workers.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'G3 boot proof failed');
    process.exitCode = 1;
  });
}
