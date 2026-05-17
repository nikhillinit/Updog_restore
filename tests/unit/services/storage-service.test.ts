import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStorageService } from '../../../server/services/storage-service';

describe('StorageService provider selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to local storage when s3 is selected without a bucket', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createStorageService({
      provider: 's3',
      localPath: './uploads/reports',
      baseUrl: '/api/files',
    });

    const signedUrl = await storage.getSignedUrl('reports/test.pdf', 3600);

    expect(signedUrl.url).toContain('/api/files/reports/test.pdf');
    expect(warnSpy).toHaveBeenCalledWith(
      '[StorageService] S3 bucket not configured, falling back to local storage'
    );
  });
});
