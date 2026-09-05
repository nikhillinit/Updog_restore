import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

const servers: Server[] = [];

function listen(
  server: Server,
  options: { host: string; port: number; ipv6Only?: boolean }
): Promise<void> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(close));
});

describe('Supertest loopback address selection', () => {
  it('reaches an IPv6 listener when IPv4 owns the same port', async () => {
    let ipv4Requests = 0;
    let ipv6Requests = 0;
    const ipv4Trap = createServer((_req, res) => {
      ipv4Requests += 1;
      res.statusCode = 418;
      res.end('ipv4-trap');
    });
    await listen(ipv4Trap, { host: '127.0.0.1', port: 0 });

    const address = ipv4Trap.address();
    if (!address || typeof address === 'string') {
      throw new Error('IPv4 trap did not expose a numeric port');
    }

    const ipv6Target = createServer((req, res) => {
      ipv6Requests += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ url: req.url, listener: 'ipv6' }));
    });
    await listen(ipv6Target, {
      host: '::1',
      port: address.port,
      ipv6Only: true,
    });

    const response = await request(ipv6Target).get('/loopback/path?source=supertest');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: '/loopback/path?source=supertest',
      listener: 'ipv6',
    });
    expect(ipv6Requests).toBe(1);
    expect(ipv4Requests).toBe(0);
  });

  it('preserves IPv4 listener routing and path/query', async () => {
    let requests = 0;
    const ipv4Target = createServer((req, res) => {
      requests += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ url: req.url, listener: 'ipv4' }));
    });
    await listen(ipv4Target, { host: '127.0.0.1', port: 0 });

    const response = await request(ipv4Target).get('/ipv4/path?source=supertest');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: '/ipv4/path?source=supertest',
      listener: 'ipv4',
    });
    expect(requests).toBe(1);
  });
});
