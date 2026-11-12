import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  composeG3BootProof,
  writeG3BootProofComposition,
} from '../../../scripts/release/compose-g3-boot-proofs.mjs';
import { verifyG3BootProof } from '../../../scripts/release/verify-g3-boot-proofs.mjs';

const execFileAsync = promisify(execFile);
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const FUNCTION_ID = 'vercel-api|vercel_function';
const roots = [];

function temporary() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'g3-compose-test-')));
  roots.push(root);
  return root;
}

function evidence(label) {
  return {
    command_or_artifact: label,
    probe: label,
    result: label,
    observed_at: label,
  };
}

function localDocument() {
  return {
    schema_version: '1.1.0',
    source_sha: SHA,
    local_metadata: { preserve: true },
    proofs: [
      {
        deployment: 'vercel-api',
        runtime: 'make_app',
        boot_status: 'proven',
        boot_evidence: evidence('local make_app'),
        local_only: 'preserve',
      },
      {
        deployment: 'vercel-api',
        runtime: 'vercel_function',
        boot_status: 'unproven',
        boot_evidence: evidence('local placeholder'),
      },
      {
        deployment: 'railway-worker-fund-scenario-calc',
        runtime: 'worker_process',
        boot_status: 'proven',
        boot_evidence: evidence('fund worker'),
        worker_identity: {
          workerType: 'fund-scenario-calc',
          commit: SHA,
          deploymentId: 'fund-deployment',
        },
      },
      {
        deployment: 'railway-worker-capital-call-status',
        runtime: 'worker_process',
        boot_status: 'proven',
        boot_evidence: evidence('capital worker'),
        worker_identity: {
          workerType: 'capital-call-status',
          commit: SHA,
          deploymentId: 'capital-deployment',
        },
      },
    ],
  };
}

function functionDocument() {
  return {
    schema_version: '1.1.0',
    source_sha: SHA,
    proofs: [
      {
        deployment: 'vercel-api',
        runtime: 'vercel_function',
        boot_status: 'proven',
        boot_evidence: evidence('isolated generated function'),
        function_only: 'preserve',
      },
    ],
  };
}

function compose(local = localDocument(), external = functionDocument()) {
  return composeG3BootProof({
    localDocument: local,
    functionDocument: external,
    expectedSha: SHA,
  });
}

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe('G3 boot proof composition', () => {
  it('replaces only the local placeholder and passes the unchanged strict verifier', () => {
    const local = localDocument();
    const external = functionDocument();
    const composed = compose(local, external);

    expect(verifyG3BootProof(composed, SHA)).toEqual({
      sourceSha: SHA,
      proofCount: 4,
      workerCount: 2,
    });
    expect(composed).not.toBe(local);
    expect(composed.local_metadata).toEqual(local.local_metadata);
    expect(composed.proofs).toHaveLength(local.proofs.length);
    expect(
      composed.proofs.filter((proof) => `${proof.deployment}|${proof.runtime}` === FUNCTION_ID)
    ).toEqual(external.proofs);
    expect(
      composed.proofs.filter((proof) => `${proof.deployment}|${proof.runtime}` !== FUNCTION_ID)
    ).toEqual(
      local.proofs.filter((proof) => `${proof.deployment}|${proof.runtime}` !== FUNCTION_ID)
    );
    expect(local.proofs[1].boot_status).toBe('unproven');
  });

  it.each([
    ['local', () => ({ ...localDocument(), source_sha: OTHER_SHA })],
    ['function', () => ({ ...functionDocument(), source_sha: OTHER_SHA })],
  ])('requires exact expected SHA on the %s document', (_label, makeDocument) => {
    const local = localDocument();
    const external = functionDocument();
    if (_label === 'local')
      expect(() => compose(makeDocument(), external)).toThrow(/source SHA mismatch/i);
    else expect(() => compose(local, makeDocument())).toThrow(/source SHA mismatch/i);
  });

  it('validates both documents with the existing schema', () => {
    expect(() => compose({ ...localDocument(), schema_version: '1.0.0' })).toThrow(/schema/i);
    expect(() =>
      compose(localDocument(), { ...functionDocument(), proofs: [{ bad: true }] })
    ).toThrow(/schema/i);
  });

  it('rejects duplicate proof identities in either input', () => {
    const local = localDocument();
    local.proofs.push({ ...local.proofs[0] });
    expect(() => compose(local)).toThrow(/duplicate proof vercel-api\|make_app/i);

    const external = functionDocument();
    external.proofs.push({ ...external.proofs[0] });
    expect(() => compose(localDocument(), external)).toThrow(
      /duplicate proof vercel-api\|vercel_function/i
    );
  });

  it('requires exactly one unproven local function placeholder', () => {
    const missing = localDocument();
    missing.proofs = missing.proofs.filter(
      (proof) => `${proof.deployment}|${proof.runtime}` !== FUNCTION_ID
    );
    expect(() => compose(missing)).toThrow(/exactly one local Vercel function placeholder/i);

    const alreadyProven = localDocument();
    alreadyProven.proofs[1].boot_status = 'proven';
    expect(() => compose(alreadyProven)).toThrow(/expected unproven local function/i);
  });

  it('requires the function document to contain one matching proven row only', () => {
    const extra = functionDocument();
    extra.proofs.push({
      deployment: 'vercel-api',
      runtime: 'make_app',
      boot_status: 'proven',
      boot_evidence: evidence('extra'),
    });
    expect(() => compose(localDocument(), extra)).toThrow(/exactly one function proof row/i);

    const wrongIdentity = functionDocument();
    wrongIdentity.proofs[0].runtime = 'make_app';
    expect(() => compose(localDocument(), wrongIdentity)).toThrow(
      /matching Vercel function proof/i
    );

    const unproven = functionDocument();
    unproven.proofs[0].boot_status = 'unproven';
    expect(() => compose(localDocument(), unproven)).toThrow(/expected proven function proof/i);
  });

  it('retains strict worker identity verification after replacement', () => {
    const stale = localDocument();
    stale.proofs[2].worker_identity.commit = OTHER_SHA;
    expect(() => compose(stale)).toThrow(/schema|worker identity/i);
  });

  it('publishes a private new output atomically and never replaces existing output', async () => {
    const root = temporary();
    const localPath = path.join(root, 'local.json');
    const functionPath = path.join(root, 'function.json');
    const output = path.join(root, 'composed.json');
    fs.writeFileSync(localPath, JSON.stringify(localDocument()));
    fs.writeFileSync(functionPath, JSON.stringify(functionDocument()));

    const document = await writeG3BootProofComposition({
      local: localPath,
      function: functionPath,
      expectedSha: SHA,
      output,
    });
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toEqual(document);
    expect(fs.statSync(output).mode & 0o777).toBe(0o600);

    const sentinel = 'existing-output';
    fs.writeFileSync(output, sentinel);
    await expect(
      writeG3BootProofComposition({
        local: localPath,
        function: functionPath,
        expectedSha: SHA,
        output,
      })
    ).rejects.toThrow(/new file/i);
    expect(fs.readFileSync(output, 'utf8')).toBe(sentinel);
  });

  it('leaves prior output untouched when input is missing or invalid', async () => {
    const root = temporary();
    const localPath = path.join(root, 'local.json');
    const functionPath = path.join(root, 'function.json');
    const output = path.join(root, 'composed.json');
    fs.writeFileSync(localPath, JSON.stringify(localDocument()));
    fs.writeFileSync(functionPath, '{invalid');
    fs.writeFileSync(output, 'prior');

    await expect(
      writeG3BootProofComposition({
        local: localPath,
        function: functionPath,
        expectedSha: SHA,
        output,
      })
    ).rejects.toThrow();
    expect(fs.readFileSync(output, 'utf8')).toBe('prior');

    fs.rmSync(functionPath);
    await expect(
      writeG3BootProofComposition({
        local: localPath,
        function: functionPath,
        expectedSha: SHA,
        output,
      })
    ).rejects.toThrow();
    expect(fs.readFileSync(output, 'utf8')).toBe('prior');
  });

  it('accepts only the fixed CLI flag sequence', async () => {
    const root = temporary();
    const localPath = path.join(root, 'local.json');
    const functionPath = path.join(root, 'function.json');
    const output = path.join(root, 'composed.json');
    fs.writeFileSync(localPath, JSON.stringify(localDocument()));
    fs.writeFileSync(functionPath, JSON.stringify(functionDocument()));

    const success = await execFileAsync(
      process.execPath,
      [
        'scripts/release/compose-g3-boot-proofs.mjs',
        '--local',
        localPath,
        '--function',
        functionPath,
        '--expected-sha',
        SHA,
        '--output',
        output,
      ],
      { cwd: process.cwd() }
    );
    expect(success.stdout).toContain('G3_BOOT_PROOF_COMPOSED');
    expect(verifyG3BootProof(JSON.parse(fs.readFileSync(output, 'utf8')), SHA)).toMatchObject({
      proofCount: 4,
      workerCount: 2,
    });

    await expect(
      execFileAsync(
        process.execPath,
        [
          'scripts/release/compose-g3-boot-proofs.mjs',
          '--function',
          functionPath,
          '--local',
          localPath,
          '--expected-sha',
          SHA,
          '--output',
          path.join(root, 'wrong-order.json'),
        ],
        { cwd: process.cwd() }
      )
    ).rejects.toMatchObject({ stderr: expect.stringMatching(/Invalid arguments/) });
  });
});
