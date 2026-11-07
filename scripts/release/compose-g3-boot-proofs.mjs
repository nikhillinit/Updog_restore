import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { BootProofDocumentSchema } from '../../audit/surface-contract-matrix/matrix-schema.mjs';
import { verifyG3BootProof } from './verify-g3-boot-proofs.mjs';

const SHA = /^[a-f0-9]{40}$/;
const FUNCTION_PROOF_ID = 'vercel-api|vercel_function';

function fail(message) {
  throw new Error(`G3 boot proof composition failed: ${message}`);
}

function proofId(proof) {
  return `${proof?.deployment ?? ''}|${proof?.runtime ?? ''}`;
}

function parseDocument(document, label) {
  const parsed = BootProofDocumentSchema.safeParse(document);
  if (!parsed.success) {
    fail(
      `${label} document schema is invalid: ${parsed.error.issues[0]?.message ?? 'unknown schema error'}`
    );
  }
  return parsed.data;
}

function assertUniqueProofs(document, label) {
  const seen = new Set();
  for (const proof of document.proofs) {
    const id = proofId(proof);
    if (seen.has(id)) fail(`${label} document has duplicate proof ${id}`);
    seen.add(id);
  }
}

export function composeG3BootProof({ localDocument, functionDocument, expectedSha }) {
  if (!SHA.test(expectedSha ?? '')) fail('expected SHA must be a lowercase 40-character SHA');
  if (localDocument?.source_sha !== expectedSha) fail('local document source SHA mismatch');
  if (functionDocument?.source_sha !== expectedSha) fail('function document source SHA mismatch');

  const local = parseDocument(localDocument, 'local');
  const external = parseDocument(functionDocument, 'function');

  assertUniqueProofs(local, 'local');
  assertUniqueProofs(external, 'function');

  const localFunctionRows = local.proofs.filter((proof) => proofId(proof) === FUNCTION_PROOF_ID);
  if (localFunctionRows.length !== 1)
    fail('expected exactly one local Vercel function placeholder');
  if (localFunctionRows[0].boot_status !== 'unproven') {
    fail('expected unproven local function placeholder');
  }

  if (external.proofs.length !== 1) fail('expected exactly one function proof row');
  const functionProof = external.proofs[0];
  if (proofId(functionProof) !== FUNCTION_PROOF_ID) fail('expected matching Vercel function proof');
  if (functionProof.boot_status !== 'proven') fail('expected proven function proof');

  const composed = {
    ...localDocument,
    schema_version: local.schema_version,
    source_sha: local.source_sha,
    proofs: local.proofs.map((proof) =>
      proofId(proof) === FUNCTION_PROOF_ID ? functionProof : proof
    ),
  };
  verifyG3BootProof(composed, expectedSha);
  return composed;
}

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function resolveNewOutput(output) {
  if (typeof output !== 'string' || !output) fail('output path is required');
  const requestedParent = path.dirname(path.resolve(output));
  const parentStat = fs.lstatSync(requestedParent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail('invalid output parent');
  const parent = fs.realpathSync(requestedParent);
  const resolved = path.join(parent, path.basename(output));
  if (exists(resolved)) fail('proof output must be a new file');
  return { parent, output: resolved };
}

async function readJson(input, label) {
  if (typeof input !== 'string' || !input) fail(`${label} input path is required`);
  return JSON.parse(await readFile(input, 'utf8'));
}

export async function writeG3BootProofComposition({
  local,
  function: functionPath,
  expectedSha,
  output,
}) {
  const localDocument = await readJson(local, 'local');
  const functionDocument = await readJson(functionPath, 'function');
  const document = composeG3BootProof({ localDocument, functionDocument, expectedSha });
  const destination = resolveNewOutput(output);
  const temporary = path.join(destination.parent, `.g3-compose-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    fs.linkSync(temporary, destination.output);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return document;
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 8 ||
    args[0] !== '--local' ||
    args[2] !== '--function' ||
    args[4] !== '--expected-sha' ||
    args[6] !== '--output'
  ) {
    throw new Error('Invalid arguments');
  }
  await writeG3BootProofComposition({
    local: args[1],
    function: args[3],
    expectedSha: args[5],
    output: args[7],
  });
  console.log('G3_BOOT_PROOF_COMPOSED');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'G3 boot proof composition failed');
    process.exitCode = 1;
  });
}
