// Client-project coverage for the browser Web Crypto implementation.
import { describe, expect, it } from 'vitest';

import { sha256Bytes } from '@/lib/hash';

const vectors = [
  {
    name: 'empty input',
    bytes: new TextEncoder().encode(''),
    digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    name: 'ASCII',
    bytes: new TextEncoder().encode('Press On Ventures'),
    digest: '390e3b5bad2ddaf734588061585fe595e91261768a468fea30883a93b276459a',
  },
  {
    name: 'multi-byte UTF-8',
    bytes: new TextEncoder().encode('café • 投资'),
    digest: '076571e26b405b2e947eb7e8a27220656a33a3c0412e91381c39a98b163bee00',
  },
  {
    name: 'BOM-prefixed string',
    bytes: new TextEncoder().encode('\uFEFFevent_type'),
    digest: '4f4d815b2c87e19933eabbb727e82eca65e7405dbde746ac16ac6289fb1fd2c6',
  },
] as const;

describe('sha256Bytes cross-runtime vectors (Web Crypto)', () => {
  it.each(vectors)('matches the pinned digest for $name', async ({ bytes, digest }) => {
    expect(await sha256Bytes(bytes)).toBe(digest);
  });
});
