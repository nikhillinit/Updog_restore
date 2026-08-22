import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  companyListCursorPredicate,
  decodeCompanyListCursor,
  encodeCompanyListCursor,
  isAfterCompanyListCursor,
  isCompanyListCursorCompatible,
  type CompanyListSortBy,
} from '../../../../server/services/allocations/company-list-cursor';

function cursorFor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('allocation company-list cursor', () => {
  it.each([
    { payload: { k: 27500, id: 31 }, expected: { k: 27500, id: 31 } },
    { payload: { k: 'Alpha', id: 19 }, expected: { k: 'Alpha', id: 19 } },
    { payload: { k: null, id: 7 }, expected: { k: null, id: 7 } },
  ])('round-trips supported cursor payload $payload', ({ payload, expected }) => {
    const encoded = cursorFor(payload);

    expect(decodeCompanyListCursor(encoded)).toEqual(expected);
  });

  it.each([
    'not+base64url',
    cursorFor({ id: 1 }),
    cursorFor({ k: 1, id: 0 }),
    cursorFor({ k: 1, id: Number.MAX_SAFE_INTEGER + 1 }),
    cursorFor({ k: true, id: 1 }),
    Buffer.from('[]').toString('base64url'),
  ])('rejects malformed cursor %s', (cursor) => {
    expect(decodeCompanyListCursor(cursor)).toBeNull();
  });

  it.each([
    { sortBy: 'exit_moic_desc', key: 25000, compatible: true },
    { sortBy: 'exit_moic_desc', key: null, compatible: true },
    { sortBy: 'exit_moic_desc', key: 'Alpha', compatible: false },
    { sortBy: 'planned_reserves_desc', key: 500_000_00, compatible: true },
    { sortBy: 'planned_reserves_desc', key: null, compatible: false },
    { sortBy: 'name_asc', key: 'Alpha', compatible: true },
    { sortBy: 'name_asc', key: 25000, compatible: false },
  ] satisfies Array<{ sortBy: CompanyListSortBy; key: string | number | null; compatible: boolean }>) (
    'requires $sortBy cursor key type compatibility for $key',
    ({ sortBy, key, compatible }) => {
      expect(isCompanyListCursorCompatible({ k: key, id: 11 }, sortBy)).toBe(compatible);
    }
  );

  it.each([
    {
      sortBy: 'exit_moic_desc',
      row: { id: 9, name: 'Alpha', exitMoicBps: 24000 },
      payload: { k: 24000, id: 9 },
    },
    {
      sortBy: 'planned_reserves_desc',
      row: { id: 8, name: 'Alpha', plannedReservesCents: 900_000_00 },
      payload: { k: 900_000_00, id: 8 },
    },
    { sortBy: 'name_asc', row: { id: 7, name: 'Beta' }, payload: { k: 'Beta', id: 7 } },
  ] satisfies Array<{
    sortBy: CompanyListSortBy;
    row: { id: number; name: string; plannedReservesCents?: number; exitMoicBps?: number | null };
    payload: { k: string | number | null; id: number };
  }>)('encodes active $sortBy key plus id', ({ sortBy, row, payload }) => {
    expect(encodeCompanyListCursor(row, sortBy)).toBe(cursorFor(payload));
  });

  it('keeps memory null-tail and tie-break behavior aligned with exit MOIC ordering', () => {
    expect(
      isAfterCompanyListCursor(
        { id: 9, name: 'Null tail', exitMoicBps: null },
        { k: 25000, id: 10 },
        'exit_moic_desc'
      )
    ).toBe(true);
    expect(
      isAfterCompanyListCursor(
        { id: 9, name: 'Tie after', exitMoicBps: 25000 },
        { k: 25000, id: 10 },
        'exit_moic_desc'
      )
    ).toBe(true);
    expect(
      isAfterCompanyListCursor(
        { id: 11, name: 'Tie before', exitMoicBps: 25000 },
        { k: 25000, id: 10 },
        'exit_moic_desc'
      )
    ).toBe(false);
    expect(
      isAfterCompanyListCursor(
        { id: 9, name: 'Null tail', exitMoicBps: null },
        { k: null, id: 10 },
        'exit_moic_desc'
      )
    ).toBe(true);
  });

  it.each([
    {
      sortBy: 'planned_reserves_desc',
      cursor: { k: 500_000_00, id: 17 },
      sql: '("portfoliocompanies"."planned_reserves_cents", "portfoliocompanies"."id") < ($1, $2)',
      params: [500_000_00, 17],
    },
    {
      sortBy: 'name_asc',
      cursor: { k: 'Beta', id: 17 },
      sql: '("portfoliocompanies"."name", -"portfoliocompanies"."id") > ($1, $2)',
      params: ['Beta', -17],
    },
    {
      sortBy: 'exit_moic_desc',
      cursor: { k: 25000, id: 17 },
      sql: '(("portfoliocompanies"."exit_moic_bps", "portfoliocompanies"."id") < ($1, $2) OR "portfoliocompanies"."exit_moic_bps" IS NULL)',
      params: [25000, 17],
    },
    {
      sortBy: 'exit_moic_desc',
      cursor: { k: null, id: 17 },
      sql: '"portfoliocompanies"."exit_moic_bps" IS NULL AND "portfoliocompanies"."id" < $1',
      params: [17],
    },
  ] satisfies Array<{
    sortBy: CompanyListSortBy;
    cursor: { k: string | number | null; id: number };
    sql: string;
    params: unknown[];
  }>)('preserves $sortBy database keyset predicate', ({ sortBy, cursor, sql, params }) => {
    const rendered = new PgDialect().sqlToQuery(companyListCursorPredicate(cursor, sortBy));

    expect(rendered).toEqual({ sql, params, typings: expect.any(Array) });
  });
});
