import { describe, expect, it } from 'vitest';
import {
  projectActualsEffectiveBasis,
  type ActualsLedgerProjectionRecord,
  type ActualsValuationProjectionRecord,
  type ProjectActualsEffectiveBasisInput,
} from '../../../../server/services/lp-reporting/actuals-restatement-service';
import type {
  ActualsCorrectionProvenanceV1,
  ActualsOriginalPublicationV1,
} from '../../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';

type Row = { amount: string };
const asOfDate = '2026-09-08';
const commandId = '11111111-1111-4111-8111-111111111111';
const publication = (id: number): ActualsOriginalPublicationV1 => ({
  snapshotId: id,
  snapshotInputHash: canonicalSha256({ snapshot: id }),
  operationHash: canonicalSha256({ operation: id }),
});
const identity = (kind: 'ledger' | 'valuation', recordId: number) => ({
  kind,
  recordId,
  sourceHash: canonicalSha256({ kind, recordId, source: true }),
  contentHash: canonicalSha256({ kind, recordId, content: true }),
});
const ledger = (
  recordId: number,
  amount: string,
  supersedesEventId: number | null = null
): ActualsLedgerProjectionRecord<Row> => ({
  row: { amount },
  identity: identity('ledger', recordId),
  fundId: 7,
  effectiveDate: '2026-08-01',
  supersedesEventId,
  reversalOfEventId: null,
});
const mark = (
  recordId: number,
  amount: string,
  priorMarkId: number | null = null
): ActualsValuationProjectionRecord<Row> => ({
  row: { amount },
  identity: identity('valuation', recordId),
  fundId: 7,
  effectiveDate: asOfDate,
  priorMarkId,
  companyId: 1,
  vehicleId: 2,
  markPurpose: 'fair_value',
});

function fixture(
  kind: 'ledger' | 'valuation' = 'ledger'
): ProjectActualsEffectiveBasisInput<Row, Row> {
  const original = kind === 'ledger' ? ledger(1, '100.000000') : mark(1, '100.000000');
  const replacement = kind === 'ledger' ? ledger(2, '80.000000', 1) : mark(2, '80.000000', 1);
  const correction: ActualsCorrectionProvenanceV1 = {
    commandId,
    asOfDate,
    reason: 'Correct confirmed amount',
    actor: { userId: 9 },
    createdAt: '2026-09-08T12:00:00.000Z',
    items: [
      {
        target: original.identity,
        replacement: replacement.identity,
        originalPublication: publication(1),
      },
    ],
  };
  return {
    fundId: 7,
    asOfDate,
    ledgerRows:
      kind === 'ledger'
        ? [
            original as ActualsLedgerProjectionRecord<Row>,
            replacement as ActualsLedgerProjectionRecord<Row>,
          ]
        : [],
    valuationMarks:
      kind === 'valuation'
        ? [
            original as ActualsValuationProjectionRecord<Row>,
            replacement as ActualsValuationProjectionRecord<Row>,
          ]
        : [],
    admittedRecords: [
      { identity: original.identity, publication: publication(1), correctionCommandId: null },
      {
        identity: replacement.identity,
        publication: publication(2),
        correctionCommandId: commandId,
      },
    ],
    corrections: [correction],
    predecessorSnapshotInputHash: publication(1).snapshotInputHash,
  };
}

describe('receipt-backed actuals replacement projection', () => {
  it('projects a pending replacement without inventing its future publication identity', () => {
    const input = fixture();
    const replacement = input.admittedRecords[1]!;
    const result = projectActualsEffectiveBasis({
      ...input,
      admittedRecords: input.admittedRecords.slice(0, 1),
      pendingRecords: [
        { identity: replacement.identity, correctionCommandId: replacement.correctionCommandId },
      ],
    });
    expect(result.identities).toEqual([replacement.identity]);
    expect(result.ledgerRows).toEqual([{ amount: '80.000000' }]);
  });

  it('refuses a pending record as a correction target', () => {
    const input = fixture();
    const original = input.admittedRecords[0]!;
    expect(() =>
      projectActualsEffectiveBasis({
        ...input,
        admittedRecords: input.admittedRecords.slice(1),
        pendingRecords: [{ identity: original.identity, correctionCommandId: null }],
      })
    ).toThrow('exact source publication');
  });

  it.each(['ledger', 'valuation'] as const)(
    'counts only the effective %s replacement and preserves original objects',
    (kind) => {
      const input = fixture(kind);
      const before = structuredClone(input);
      const result = projectActualsEffectiveBasis(input);
      expect(kind === 'ledger' ? result.ledgerRows : result.valuationMarks).toEqual([
        { amount: '80.000000' },
      ]);
      expect(result.identities).toEqual([identity(kind, 2)]);
      expect(input).toEqual(before);
    }
  );

  it('keeps only the terminal replacement of a replacement', () => {
    const input = fixture();
    const final = ledger(3, '9007199254740993.123456', 2);
    const nextId = '22222222-2222-4222-8222-222222222222';
    const result = projectActualsEffectiveBasis({
      ...input,
      ledgerRows: [...input.ledgerRows, final],
      admittedRecords: [
        ...input.admittedRecords,
        { identity: final.identity, publication: publication(3), correctionCommandId: nextId },
      ],
      corrections: [
        ...input.corrections,
        {
          ...input.corrections[0]!,
          commandId: nextId,
          items: [
            {
              target: identity('ledger', 2),
              replacement: final.identity,
              originalPublication: publication(2),
            },
          ],
        },
      ],
    });
    expect(result.ledgerRows).toEqual([final.row]);
    expect(result.ledgerRows[0]).toBe(final.row);
    expect(result.effectiveBasis.ledgerRecordIds).toEqual([3]);
  });

  it.each([
    [
      'cross-fund row',
      (input: ProjectActualsEffectiveBasisInput<Row, Row>) => ({ ...input, fundId: 8 }),
    ],
    [
      'missing admission',
      (input: ProjectActualsEffectiveBasisInput<Row, Row>) => ({
        ...input,
        admittedRecords: input.admittedRecords.slice(0, 1),
      }),
    ],
    [
      'unbacked edge',
      (input: ProjectActualsEffectiveBasisInput<Row, Row>) => ({ ...input, corrections: [] }),
    ],
    [
      'duplicate target',
      (input: ProjectActualsEffectiveBasisInput<Row, Row>) => ({
        ...input,
        corrections: [
          {
            ...input.corrections[0]!,
            items: [...input.corrections[0]!.items, ...input.corrections[0]!.items],
          },
        ],
      }),
    ],
    [
      'hash mismatch',
      (input: ProjectActualsEffectiveBasisInput<Row, Row>) => ({
        ...input,
        ledgerRows: [
          {
            ...input.ledgerRows[0]!,
            identity: { ...input.ledgerRows[0]!.identity, contentHash: 'f'.repeat(64) },
          },
          input.ledgerRows[1]!,
        ],
      }),
    ],
    [
      'unrelated source publication',
      (input: ProjectActualsEffectiveBasisInput<Row, Row>) => ({
        ...input,
        corrections: [
          {
            ...input.corrections[0]!,
            items: [{ ...input.corrections[0]!.items[0]!, originalPublication: publication(99) }],
          },
        ],
      }),
    ],
  ])('refuses %s', (_name, alter) => {
    expect(() => projectActualsEffectiveBasis(alter(fixture()))).toThrow();
  });

  it('refuses an older-date valuation target or a changed valuation scope', () => {
    const input = fixture('valuation');
    const marks = input.valuationMarks;
    expect(() =>
      projectActualsEffectiveBasis({
        ...input,
        valuationMarks: [{ ...marks[0]!, effectiveDate: '2026-09-07' }, marks[1]!],
      })
    ).toThrow();
    expect(() =>
      projectActualsEffectiveBasis({
        ...input,
        valuationMarks: [marks[0]!, { ...marks[1]!, companyId: 8 }],
      })
    ).toThrow();
  });
});
