import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { deflateSync, gzipSync } from 'node:zlib';

import bodyParser from 'body-parser';
import express from 'express';
import semver from 'semver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// Dependency coverage for GHSA-27r3-jxmh-p828; this is not a crash reproduction.
describe('body-parser dependency resolution', () => {
  it.each([
    ['direct', require],
    ['Express', createRequire(require.resolve('express'))],
  ] as const)('%s resolves a patched body-parser', (_name, resolve) => {
    const { version } = resolve('body-parser/package.json');
    expect(semver.gte(version, '2.4.0'), `body-parser ${version}`).toBe(true);
  });
});

describe.each([
  ['makeApp', () => [express.json({ limit: '256kb' })]],
  [
    'server',
    () => [
      bodyParser.json({ limit: '10mb', type: ['application/json', 'application/csp-report'] }),
      express.urlencoded({ extended: false, limit: '10mb' }),
    ],
  ],
] as const)('%s compressed JSON compatibility', (_name, parsers) => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const app = express();
    app.set('env', 'test');
    app.use(...parsers());
    app.post('/', (req, res) => res.json(req.body));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    url = `http://127.0.0.1:${address.port}/`;
  });

  afterAll(async () => {
    server?.closeAllConnections();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it.each([
    ['gzip', gzipSync],
    ['deflate', deflateSync],
  ] as const)('accepts %s JSON and recovers after invalid JSON', async (encoding, compress) => {
    const post = (body: string) =>
      new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const client = request(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding },
          },
          (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
              responseBody += chunk;
            });
            response.once('error', reject);
            response.once('end', () =>
              resolve({ status: response.statusCode, body: responseBody })
            );
          }
        );
        client.once('error', reject);
        client.setTimeout(2000, () => client.destroy(new Error('Request timed out')));
        client.end(compress(Buffer.from(body)));
      });

    const valid = await post('{"a":1}');
    expect(valid.status).toBe(200);
    expect(JSON.parse(valid.body)).toEqual({ a: 1 });

    const invalid = await post('{"a":');
    expect(invalid.status).toBe(400);

    const next = await post('{"a":2}');
    expect(next.status).toBe(200);
    expect(JSON.parse(next.body)).toEqual({ a: 2 });
  });
});
