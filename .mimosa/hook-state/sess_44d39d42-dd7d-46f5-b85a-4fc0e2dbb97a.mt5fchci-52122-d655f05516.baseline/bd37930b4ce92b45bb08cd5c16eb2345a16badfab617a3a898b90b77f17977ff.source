/**
 * Domain-separated hash admission and result-hash preimage (Tranche 1 substrate).
 *
 * Admission accepts only validated JSON primitives, dense arrays, and plain
 * objects. It normalizes decimal strings ("1.10" -> "1.1", "-0" -> "0") and
 * Z-suffixed UTC timestamps (to millisecond-precision toISOString form), and
 * rejects undefined, sparse arrays, non-finite numbers, bigint, Date/Decimal/
 * other class instances, Map, Set, functions, and symbol-keyed properties.
 *
 * Preimage rules (versioned; changing any of them is a contract-version bump):
 * - domain tag `updog.calc-substrate.result-hash` separates this hash family
 *   from every other sha256 use in the repository;
 * - the preimage contains the validated basis and the admitted value;
 * - the resultHash itself is excluded by construction: it lives on the result
 *   object, outside both the basis and the value;
 * - undeclared basis fields are rejected by the strict CalcBasisSchema before
 *   hashing.
 *
 * Hashing itself reuses the repository canonical utility (sorted keys,
 * canonical JSON, sha256 hex) from shared/lib/canonical-hash.ts.
 */

import { canonicalSha256 } from '../../lib/canonical-hash';
import type { CALC_SUBSTRATE_CONTRACT_VERSION } from './calc-basis';
import { CalcBasisSchema, type CalcBasis } from './calc-basis';

export const RESULT_HASH_DOMAIN = 'updog.calc-substrate.result-hash';

const DECIMAL_STRING_RE = /^[+-]?\d+(\.\d+)?$/;
const ISO_UTC_STRING_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export class HashAdmissionError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`hash admission rejected value at ${path}: ${reason}`);
    this.name = 'HashAdmissionError';
    this.path = path;
  }
}

export function normalizeDecimalString(raw: string): string {
  if (!DECIMAL_STRING_RE.test(raw)) {
    throw new HashAdmissionError('$', `not a decimal string: ${raw}`);
  }
  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/^[+-]/, '');
  const [rawInt, rawFrac = ''] = unsigned.split('.');
  const intPart = rawInt!.replace(/^0+(?=\d)/, '');
  const fracPart = rawFrac.replace(/0+$/, '');
  const magnitude = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  if (/^0(\.0*)?$/.test(magnitude) || magnitude === '') {
    return '0';
  }
  return negative ? `-${magnitude}` : magnitude;
}

function normalizeUtcTimestamp(raw: string, path: string): string {
  const epochMs = Date.parse(raw);
  if (Number.isNaN(epochMs)) {
    throw new HashAdmissionError(path, `timestamp does not parse: ${raw}`);
  }
  const canonical = new Date(epochMs).toISOString();
  const normalizedInput = raw.includes('.')
    ? raw.replace(/(\.\d{1,3})Z$/, (_m, frac: string) => `.${frac.slice(1).padEnd(3, '0')}Z`)
    : raw.replace('Z', '.000Z');
  if (canonical !== normalizedInput) {
    throw new HashAdmissionError(path, `timestamp is not a real instant: ${raw}`);
  }
  return canonical;
}

function admit(value: unknown, path: string): unknown {
  if (value === undefined) {
    throw new HashAdmissionError(path, 'undefined is not admissible');
  }
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new HashAdmissionError(path, `non-finite number: ${String(value)}`);
      }
      return Object.is(value, -0) ? 0 : value;
    case 'string':
      if (DECIMAL_STRING_RE.test(value)) {
        return normalizeDecimalString(value);
      }
      if (ISO_UTC_STRING_RE.test(value)) {
        return normalizeUtcTimestamp(value, path);
      }
      return value;
    case 'bigint':
      throw new HashAdmissionError(path, 'bigint is not admissible; use a decimal string');
    case 'function':
      throw new HashAdmissionError(path, 'functions are not admissible');
    case 'symbol':
      throw new HashAdmissionError(path, 'symbols are not admissible');
    default:
      break;
  }

  if (Array.isArray(value)) {
    const admitted: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) {
        throw new HashAdmissionError(`${path}[${i}]`, 'sparse arrays are not admissible');
      }
      admitted.push(admit(value[i], `${path}[${i}]`));
    }
    return admitted;
  }

  if (value instanceof Date) {
    throw new HashAdmissionError(
      path,
      'Date instances are not admissible; pass an ISO-8601 UTC string'
    );
  }
  if (value instanceof Map || value instanceof Set) {
    throw new HashAdmissionError(path, 'Map/Set are not admissible; use arrays or plain objects');
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new HashAdmissionError(
      path,
      'class instances (including Decimal) are not admissible; serialize to JSON primitives first'
    );
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new HashAdmissionError(path, 'symbol-keyed properties are not admissible');
  }

  const record = value as Record<string, unknown>;
  const admitted: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      throw new HashAdmissionError(
        `${path}.${key}`,
        'undefined property values are not admissible'
      );
    }
    admitted[key] = admit(record[key], `${path}.${key}`);
  }
  return admitted;
}

/** Validate and normalize a value for hashing; throws HashAdmissionError on any forbidden class. */
export function admitForHashing(value: unknown): unknown {
  return admit(value, '$');
}

export interface ResultHashPreimage {
  domain: typeof RESULT_HASH_DOMAIN;
  contractVersion: typeof CALC_SUBSTRATE_CONTRACT_VERSION;
  basis: unknown;
  value: unknown;
}

export function buildResultHashPreimage(basis: CalcBasis, value: unknown): ResultHashPreimage {
  const validatedBasis = CalcBasisSchema.parse(basis);
  return {
    domain: RESULT_HASH_DOMAIN,
    contractVersion: validatedBasis.contractVersion,
    basis: admitForHashing(validatedBasis),
    value: admitForHashing(value),
  };
}

export function computeResultHash(basis: CalcBasis, value: unknown): string {
  return canonicalSha256(buildResultHashPreimage(basis, value));
}
