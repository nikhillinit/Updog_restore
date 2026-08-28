import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { portfolioCompanies } from '@shared/schema';

const COMPANY_LIST_CURSOR_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type CompanyListSortBy = 'exit_moic_desc' | 'planned_reserves_desc' | 'name_asc';
export type CompanyListCursorKey = string | number | null;

export interface CompanyListCursor {
  k: CompanyListCursorKey;
  id: number;
}

export interface CompanyListCursorRow {
  id: number;
  name: string;
  plannedReservesCents?: number | bigint | null;
  exitMoicBps?: number | null;
}

export function decodeCompanyListCursor(cursor: string): CompanyListCursor | null {
  if (!COMPANY_LIST_CURSOR_BASE64URL_PATTERN.test(cursor)) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const payload = parsed as Record<string, unknown>;
    const id = payload['id'];
    const key = payload['k'];

    if (!Object.prototype.hasOwnProperty.call(payload, 'k')) {
      return null;
    }

    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      return null;
    }

    if (
      key !== null &&
      typeof key !== 'string' &&
      (typeof key !== 'number' || !Number.isFinite(key))
    ) {
      return null;
    }

    return { k: key as CompanyListCursorKey, id };
  } catch {
    return null;
  }
}

export function isCompanyListCursorCompatible(
  cursor: CompanyListCursor,
  sortBy: CompanyListSortBy
): boolean {
  if (sortBy === 'name_asc') {
    return typeof cursor.k === 'string';
  }

  if (sortBy === 'planned_reserves_desc') {
    return typeof cursor.k === 'number';
  }

  return cursor.k === null || typeof cursor.k === 'number';
}

function plannedReservesSortValue(company: CompanyListCursorRow): number {
  if ('plannedReservesCents' in company) {
    return Number(company.plannedReservesCents ?? 0);
  }

  return 0;
}

function exitMoicSortKey(company: CompanyListCursorRow): number | null {
  if ('exitMoicBps' in company) {
    if (company.exitMoicBps == null) {
      return null;
    }
    const value = Number(company.exitMoicBps);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function companyListSortKey(
  company: CompanyListCursorRow,
  sortBy: CompanyListSortBy
): CompanyListCursorKey {
  if (sortBy === 'name_asc') {
    return company.name;
  }

  if (sortBy === 'planned_reserves_desc') {
    return plannedReservesSortValue(company);
  }

  return exitMoicSortKey(company);
}

function compareNullableNumberDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return right - left;
}

export function compareCompanyListRows(
  left: CompanyListCursorRow,
  right: CompanyListCursorRow,
  sortBy: CompanyListSortBy
): number {
  if (sortBy === 'name_asc') {
    return left.name.localeCompare(right.name) || right.id - left.id;
  }

  if (sortBy === 'planned_reserves_desc') {
    return plannedReservesSortValue(right) - plannedReservesSortValue(left) || right.id - left.id;
  }

  return (
    compareNullableNumberDesc(exitMoicSortKey(left), exitMoicSortKey(right)) || right.id - left.id
  );
}

export function isAfterCompanyListCursor(
  company: CompanyListCursorRow,
  cursor: CompanyListCursor,
  sortBy: CompanyListSortBy
): boolean {
  const key = companyListSortKey(company, sortBy);

  if (sortBy === 'name_asc') {
    return (
      typeof key === 'string' &&
      typeof cursor.k === 'string' &&
      (key.localeCompare(cursor.k) > 0 || (key === cursor.k && company.id < cursor.id))
    );
  }

  if (sortBy === 'planned_reserves_desc') {
    return (
      typeof key === 'number' &&
      typeof cursor.k === 'number' &&
      (key < cursor.k || (key === cursor.k && company.id < cursor.id))
    );
  }

  if (cursor.k === null) {
    return key === null && company.id < cursor.id;
  }

  return (
    typeof cursor.k === 'number' &&
    (key === null ||
      (typeof key === 'number' && (key < cursor.k || (key === cursor.k && company.id < cursor.id))))
  );
}

export function encodeCompanyListCursor(
  company: CompanyListCursorRow,
  sortBy: CompanyListSortBy
): string {
  return Buffer.from(
    JSON.stringify({ k: companyListSortKey(company, sortBy), id: company.id })
  ).toString('base64url');
}

function requireCompanyListCursorNumberKey(cursor: CompanyListCursor): number {
  if (typeof cursor.k !== 'number') {
    throw new Error('Invalid numeric company-list cursor key');
  }
  return cursor.k;
}

function requireCompanyListCursorStringKey(cursor: CompanyListCursor): string {
  if (typeof cursor.k !== 'string') {
    throw new Error('Invalid string company-list cursor key');
  }
  return cursor.k;
}

export function companyListCursorPredicate(
  cursor: CompanyListCursor,
  sortBy: CompanyListSortBy
): SQL {
  if (sortBy === 'planned_reserves_desc') {
    const key = requireCompanyListCursorNumberKey(cursor);
    return sql`(${portfolioCompanies.plannedReservesCents}, ${portfolioCompanies.id}) < (${key}, ${cursor.id})`;
  }

  if (sortBy === 'name_asc') {
    const key = requireCompanyListCursorStringKey(cursor);
    return sql`(${portfolioCompanies.name}, -${portfolioCompanies.id}) > (${key}, ${-cursor.id})`;
  }

  if (cursor.k === null) {
    return sql`${portfolioCompanies.exitMoicBps} IS NULL AND ${portfolioCompanies.id} < ${cursor.id}`;
  }

  const key = requireCompanyListCursorNumberKey(cursor);
  return sql`((${portfolioCompanies.exitMoicBps}, ${portfolioCompanies.id}) < (${key}, ${cursor.id}) OR ${portfolioCompanies.exitMoicBps} IS NULL)`;
}
