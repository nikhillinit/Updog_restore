import { describe, expect, it } from 'vitest';
import {
  ActualsDraftSaveRequestV1Schema,
  ActualsDraftHistoryQuerySchema,
  ActualsDraftIfMatchSchema,
} from '../../../../shared/contracts/lp-reporting/actuals-draft.contract';

const input = {
  contractVersion: 'actuals-draft-save/1.0.0',
  classification: 'provisional',
  asOfDate: null,
  sourceNote: 'Owner estimates, not canonical facts.',
  correctionReason: 'Initial incomplete entry.',
  ledger: { templateVersion: 'actuals-ledger/1.0.0', fileName: 'draft.csv', payload: '' },
  valuation: null,
};
describe('actuals draft contracts', () => {
  it('admits incomplete empty bytes and null cutoff without claiming publication readiness', () => {
    expect(ActualsDraftSaveRequestV1Schema.parse(input)).toEqual(input);
    expect(
      ActualsDraftSaveRequestV1Schema.parse({
        ...input,
        ledger: { ...input.ledger, payload: Buffer.from('not a valid CSV').toString('base64') },
      })
    ).toBeDefined();
  });
  it.each([
    { sourceNote: '' },
    { correctionReason: ' ' },
    { classification: 'canonical' },
    { asOfDate: '2026-02-30' },
    { unknown: true },
    { ledger: { ...input.ledger, fileName: '../draft.csv' } },
    { ledger: { ...input.ledger, payload: '?' } },
    { ledger: { ...input.ledger, payload: Buffer.alloc(122884).toString('base64') } },
    { valuation: { templateVersion: 'actuals-ledger/1.0.0', fileName: 'v.csv', payload: '' } },
  ])('refuses invalid wire input %j', (change) => {
    expect(ActualsDraftSaveRequestV1Schema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it.each(['0', '01', '-1', '1.0', '2147483648', ['2', '3']])(
    'refuses malformed beforeRevision %j',
    (beforeRevision) => {
      expect(ActualsDraftHistoryQuerySchema.safeParse({ beforeRevision }).success).toBe(false);
    }
  );
  it('requires bounded canonical cursors and strong draft If-Match', () => {
    expect(ActualsDraftHistoryQuerySchema.parse({ beforeRevision: '21' })).toEqual({
      beforeRevision: 21,
    });
    expect(ActualsDraftHistoryQuerySchema.safeParse({ limit: '200' }).success).toBe(false);
    expect(ActualsDraftIfMatchSchema.safeParse('"actuals-draft:7:none"').success).toBe(true);
    expect(ActualsDraftIfMatchSchema.safeParse('W/"actuals-draft:7:none"').success).toBe(false);
  });
});
