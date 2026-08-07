import { describe, expect, it } from 'vitest';
import { assertDriverLogsClean } from '../../../scripts/assert-vercel-driver-log-clean.mjs';

describe('Vercel driver log gate', () => {
  it('accepts unrelated JSONL messages', () => {
    expect(assertDriverLogsClean('{"message":"health probe complete"}\n')).toEqual({ lines: 1 });
  });

  for (const signature of [
    'Neon pool error',
    'fetch failed',
    'No transactions support in neon-http driver',
  ]) {
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
  }
});
