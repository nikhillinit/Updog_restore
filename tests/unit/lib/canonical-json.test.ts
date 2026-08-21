/**
 * Characterization tests for the pure canonical JSON helper extracted from
 * report-package-json-export-service.ts (Task 10). The serialized forms and
 * SHA-256 vectors below are pinned: they must never change, or every stored
 * report-package content hash silently stops verifying.
 */

// Default import on purpose: the shared node-setup vi.mock('fs') stubs the
// named exports but leaves the default export real.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson } from '@shared/lib/canonical-json';
import {
  canonicalJson as reExportedCanonicalJson,
  sha256CanonicalJson as reExportedSha256CanonicalJson,
} from '../../../server/services/lp-reporting/report-package-json-export-service';

describe('canonicalJson', () => {
  it('serializes objects with deterministic sorted key order', () => {
    expect(
      canonicalJson({
        b: 2,
        a: 1,
        nested: { z: 'last', a: 'first' },
        list: [1, 'two', true, null],
      })
    ).toBe('{"a":1,"b":2,"list":[1,"two",true,null],"nested":{"a":"first","z":"last"}}');
  });

  it('supports primitives and arrays', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('text')).toBe('"text"');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(false)).toBe('false');
    expect(canonicalJson(0)).toBe('0');
    expect(canonicalJson(-1.5)).toBe('-1.5');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson([[1], [2, 3]])).toBe('[[1],[2,3]]');
    expect(canonicalJson({})).toBe('{}');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow('Cannot canonicalize non-finite numbers.');
    expect(() => canonicalJson(Infinity)).toThrow('Cannot canonicalize non-finite numbers.');
    expect(() => canonicalJson(-Infinity)).toThrow('Cannot canonicalize non-finite numbers.');
  });

  it('rejects undefined fields, undefined values, and other non-JSON primitives', () => {
    expect(() => canonicalJson({ present: 1, missing: undefined })).toThrow(
      'Cannot canonicalize undefined field "missing".'
    );
    expect(() => canonicalJson(undefined)).toThrow('Cannot canonicalize undefined values.');
    expect(() => canonicalJson(10n)).toThrow('Cannot canonicalize bigint values.');
    expect(() => canonicalJson(Symbol('x'))).toThrow('Cannot canonicalize symbol values.');
    expect(() => canonicalJson(() => 1)).toThrow('Cannot canonicalize function values.');
  });

  it('rejects non-plain objects', () => {
    expect(() => canonicalJson(new Date(0))).toThrow('Cannot canonicalize non-plain objects.');
    expect(() => canonicalJson(new Map())).toThrow('Cannot canonicalize non-plain objects.');
    class Custom {}
    expect(() => canonicalJson(new Custom())).toThrow('Cannot canonicalize non-plain objects.');
    expect(canonicalJson(Object.create(null))).toBe('{}');
  });
});

describe('sha256CanonicalJson', () => {
  it('preserves the pinned SHA-256 characterization vectors', () => {
    expect(
      sha256CanonicalJson({
        b: 2,
        a: 1,
        nested: { z: 'last', a: 'first' },
        list: [1, 'two', true, null],
      })
    ).toBe('8727edb1ff0811a8619154c3ead019fcd97f9bbf5118b386d2b7ee60a88d7f1b');
    expect(sha256CanonicalJson({})).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
    );
    expect(sha256CanonicalJson([1, 2, 3])).toBe(
      'a615eeaee21de5179de080de8c3052c8da901138406ba71c38c032845f7d54f4'
    );
    expect(sha256CanonicalJson('release-canary')).toBe(
      '580801f264e5ad253764b872bcaa4cddd7f87e1ecc70288ba3c2110598a198a5'
    );
    expect(sha256CanonicalJson(1_250_000)).toBe(
      'f0d0684b111b4511f2e151a0065852129b79cf0c3e12b20ed59117e81a3f7fb8'
    );
  });

  it('is key-order independent', () => {
    expect(sha256CanonicalJson({ a: 1, b: 2 })).toBe(sha256CanonicalJson({ b: 2, a: 1 }));
  });
});

describe('module purity', () => {
  it('re-exports from the original server service remain the same functions', () => {
    expect(reExportedCanonicalJson).toBe(canonicalJson);
    expect(reExportedSha256CanonicalJson).toBe(sha256CanonicalJson);
  });

  it('imports nothing beyond node:crypto (no database, environment, network, or file access)', () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL('../../../shared/lib/canonical-json.ts', import.meta.url)),
      'utf8'
    );
    const imports = [...source.matchAll(/^import\s[^;]*from\s+'([^']+)';/gm)].map(
      (match) => match[1]
    );
    expect(imports).toEqual(['node:crypto']);
    for (const forbidden of [
      'process.env',
      'fetch(',
      'node:fs',
      'node:http',
      'node:net',
      'drizzle',
      '../../db',
    ]) {
      expect(source, `canonical-json.ts must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });
});
