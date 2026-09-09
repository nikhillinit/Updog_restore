import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  freezeRestatementCommand,
  isRestatementOutcomeUncertain,
  persistRestatementCommand,
  recoverRestatementCommand,
  restoreRestatementFile,
} from '@/hooks/lp-reporting/useActualsRestatement';
import type { ActualsRestatementPublishRequestV1 } from '@shared/contracts/lp-reporting/actuals-restatement.contract';
import { ACTUALS_LEDGER_TEMPLATE_HEADER } from '@shared/contracts/lp-reporting/actuals-pilot-templates';

const csv = `${ACTUALS_LEDGER_TEMPLATE_HEADER}\nlp_contribution,2026-07-21,250.00,USD,,main,,,,,,corrected-ref\n`;
const payload = Buffer.from(csv).toString('base64');
const payloadHash = createHash('sha256').update(csv).digest('hex');

function commandRequest(): ActualsRestatementPublishRequestV1 {
  return {
    contractVersion: 'actuals-restatement/1.0.0',
    expectedBasis: {
      schemaId: 'financial-facts-basis-ref/1.0.0',
      fundId: 1,
      snapshotId: 41,
      snapshotInputHash: 'a'.repeat(64),
      sourceFactsInputHash: 'b'.repeat(64),
      policyVersion: 'financial-facts-policy/1.4.0',
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T00:00:00.000Z',
    },
    expectedETag: `"financial-facts:41:${'a'.repeat(64)}"`,
    ledger: {
      templateVersion: 'actuals-ledger/1.0.0',
      fileName: 'correction.csv',
      payload,
      expectedPayloadSha256: payloadHash,
      expectedCanonicalRowsHash: 'c'.repeat(64),
      expectedPreviewHash: 'd'.repeat(64),
    },
    valuation: null,
    items: [
      {
        target: {
          kind: 'ledger',
          recordId: 11,
          sourceHash: 'e'.repeat(64),
          contentHash: 'f'.repeat(64),
        },
        originalPublication: {
          snapshotId: 41,
          snapshotInputHash: 'a'.repeat(64),
          operationHash: '0'.repeat(64),
        },
        replacementExternalRef: 'corrected-ref',
        expectedReplacementContentHash: '1'.repeat(64),
      },
    ],
    reason: 'Correct the source amount.',
    expectedPreviewHash: '2'.repeat(64),
  };
}

describe('actuals correction command recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('crypto', {
      subtle: webcrypto.subtle,
      randomUUID: () => '91000000-0000-4000-8000-000000000001',
    });
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('stores only metadata and restores the exact reviewed body and key after reattachment', async () => {
    const original = await freezeRestatementCommand(1, commandRequest());
    persistRestatementCommand({ ...original, stored: { ...original.stored, status: 'uncertain' } });
    const stored = sessionStorage.getItem('actuals-restatement:v1:1')!;
    expect(stored).not.toContain(payload);
    expect(stored).not.toContain(csv);
    const recovered = recoverRestatementCommand(1);
    expect(recovered.corrupt).toBe(false);
    expect(recovered.command?.body).toBeNull();
    expect(recovered.command?.stored.status).toBe('uncertain');
    const restored = await restoreRestatementFile(
      recovered.command!,
      new File([csv], 'reattached.csv')
    );
    expect(restored.stored.key).toBe(original.stored.key);
    expect(restored.serializedBody).toBe(original.serializedBody);
  });

  it('rejects changed replacement bytes without overwriting the retained command', async () => {
    await freezeRestatementCommand(1, commandRequest());
    const recovered = recoverRestatementCommand(1).command!;
    const before = sessionStorage.getItem('actuals-restatement:v1:1');
    await expect(
      restoreRestatementFile(
        recovered,
        new File([csv.replace('250.00', '251.00')], 'correction.csv')
      )
    ).rejects.toThrow();
    expect(sessionStorage.getItem('actuals-restatement:v1:1')).toBe(before);
  });

  it('detects changed metadata before reattaching a saved command', async () => {
    await freezeRestatementCommand(1, commandRequest());
    const stored = JSON.parse(sessionStorage.getItem('actuals-restatement:v1:1')!);
    stored.body.reason = 'Another reason.';
    sessionStorage.setItem('actuals-restatement:v1:1', JSON.stringify(stored));
    await expect(
      restoreRestatementFile(
        recoverRestatementCommand(1).command!,
        new File([csv], 'correction.csv')
      )
    ).rejects.toThrow();
  });

  it('keeps corrupt stored metadata visible as a recovery blocker', () => {
    sessionStorage.setItem('actuals-restatement:v1:1', '{');
    expect(recoverRestatementCommand(1)).toMatchObject({ command: null, corrupt: true });
    expect(sessionStorage.getItem('actuals-restatement:v1:1')).toBe('{');
  });

  it('distinguishes unknown outcomes from explicit safe refusals', () => {
    expect(isRestatementOutcomeUncertain(new Error('Network unavailable'))).toBe(true);
    expect(
      isRestatementOutcomeUncertain(
        Object.assign(new Error(), { status: 503, code: 'MUTATION_OUTCOME_UNKNOWN' })
      )
    ).toBe(true);
    expect(
      isRestatementOutcomeUncertain(
        Object.assign(new Error(), { status: 200, code: 'CONTRACT_PARSE_ERROR' })
      )
    ).toBe(true);
    expect(
      isRestatementOutcomeUncertain(
        Object.assign(new Error(), { status: 409, code: 'ACTUALS_PUBLICATION_DISABLED' })
      )
    ).toBe(false);
    expect(
      isRestatementOutcomeUncertain(
        Object.assign(new Error(), { status: 503, code: 'PUBLISH_RETRY_EXHAUSTED' })
      )
    ).toBe(false);
  });
});
