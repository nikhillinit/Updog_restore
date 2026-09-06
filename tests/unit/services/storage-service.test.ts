import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStorageService } from '../../../server/services/storage-service';

describe('StorageService provider selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to local storage without exposing an unverifiable signed URL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createStorageService({
      provider: 's3',
      localPath: './uploads/reports',
      baseUrl: '/api/files',
    });

    await expect(storage.getSignedUrl('reports/test.pdf', 3600)).rejects.toThrow(
      'Signed download URLs are unavailable for local storage'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[StorageService] S3 bucket not configured, falling back to local storage'
    );
  });
});
