import { describe, expect, it } from 'vitest';

import {
  batchEtag,
  requestedObservationIds,
} from '../../../../server/services/financial-observations/import-batch-commit-service';

describe('requestedObservationIds', () => {
  it('maps singleton group keys to observation ids', () => {
    expect(requestedObservationIds(['source-observation:11', 'source-observation:12'])).toEqual([
      11, 12,
    ]);
  });

  it('rejects an empty request', () => {
    expect(() => requestedObservationIds([])).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_GROUP_INCOMPLETE' })
    );
  });

  it('rejects duplicate keys', () => {
    expect(() =>
      requestedObservationIds(['source-observation:11', 'source-observation:11'])
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_GROUP_KEY' }));
  });

  it('rejects a malformed key', () => {
    expect(() => requestedObservationIds(['observation:11'])).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_GROUP_KEY' })
    );
  });
});

describe('batchEtag', () => {
  it('is a weak etag stable per version', () => {
    expect(batchEtag(3)).toBe(batchEtag(3));
    expect(batchEtag(3)).not.toBe(batchEtag(4));
    expect(batchEtag(3)).toMatch(/^W\//);
  });
});
