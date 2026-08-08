import { describe, expect, it } from 'vitest';
import {
  assertDriverLogsClean,
  FORBIDDEN_DRIVER_SIGNATURES,
} from '../../../scripts/assert-vercel-driver-log-clean.mjs';

const LITERAL_SIGNATURES = [
  'Neon pool error',
  'fetch failed',
  'No transactions support in neon-http driver',
];

describe('Vercel driver log gate', () => {
  it('pins the forbidden signature list', () => {
    expect([...FORBIDDEN_DRIVER_SIGNATURES]).toEqual(LITERAL_SIGNATURES);
  });

  it('accepts unrelated JSONL messages', () => {
    expect(assertDriverLogsClean('{"message":"health probe complete"}\n')).toEqual({ lines: 1 });
  });

  it('rejects a forbidden signature after more than 100 unrelated entries', () => {
    const entries = Array.from({ length: 101 }, (_, index) =>
      JSON.stringify({ message: `health probe complete ${index}` })
    );
    entries.push(JSON.stringify({ message: 'request failed: Neon pool error' }));

    expect(() => assertDriverLogsClean(entries.join('\n'))).toThrow(/Neon pool error/i);
  });

  for (const signature of LITERAL_SIGNATURES) {
    it(`rejects ${signature} without returning raw log text`, () => {
      const sensitiveMarker = 'redacted-payload';

      expect(() =>
        assertDriverLogsClean(
          JSON.stringify({ message: `request ${sensitiveMarker} ${signature}` })
        )
      ).toThrow(new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

      try {
        assertDriverLogsClean(
          JSON.stringify({ message: `request ${sensitiveMarker} ${signature}` })
        );
      } catch (error) {
        expect(String(error)).not.toContain(sensitiveMarker);
      }
    });

    it(`rejects ${signature} when nested in logs without leaking nested log content`, () => {
      const sensitiveMarker = 'redacted-payload';
      const token = 'token=secret-token';
      const url = 'https://example.test/private?token=secret-token';
      const nestedLog = `request ${sensitiveMarker} ${token} ${url} ${signature}`;

      let thrown;
      try {
        assertDriverLogsClean(
          JSON.stringify({
            message: 'safe top-level message',
            text: 'safe top-level text',
            logs: [{ message: nestedLog }],
          })
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(String(thrown)).toContain(signature);
      expect(String(thrown)).not.toContain(nestedLog);
      expect(String(thrown)).not.toContain(sensitiveMarker);
      expect(String(thrown)).not.toContain(token);
      expect(String(thrown)).not.toContain(url);
    });
  }
});
