import { expect, test } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { resolveIntegrationBaseUrl, resolveIntegrationUrl } from '../base-url';

function getRawHeaders(urlStr: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
      },
      (res) => {
        const raw = res.rawHeaders; // [k1,v1,k2,v2,...]
        res.resume();
        resolve(raw);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function extractNonce(cspHeader: string): string | null {
  const match = cspHeader.match(/'nonce-([^']+)'/);
  return match ? match[1] : null;
}

test('security headers present', async () => {
  const r = await fetch(resolveIntegrationUrl('/'));
  const csp = r.headers.get('content-security-policy') || '';
  expect(csp).toMatch(/default-src/);
  expect(csp).toMatch(/script-src/);
  expect(csp).toMatch(/'nonce-/);
  expect(r.headers.get('strict-transport-security')).toContain('max-age');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('referrer-policy')).toBeTruthy();
});

test('emits exactly one CSP header', async () => {
  const raw = await getRawHeaders(resolveIntegrationUrl('/'));
  const cspCount = raw.reduce((acc, value, index) => {
    if (index % 2 === 0 && value.toLowerCase() === 'content-security-policy') {
      return acc + 1;
    }
    return acc;
  }, 0);

  expect(cspCount).toBe(1);
});

test('emits exactly one CSP header on API route', async () => {
  const raw = await getRawHeaders(resolveIntegrationUrl('/api/health'));
  const cspCount = raw.reduce((acc, value, index) => {
    if (index % 2 === 0 && value.toLowerCase() === 'content-security-policy') {
      return acc + 1;
    }
    return acc;
  }, 0);

  expect(cspCount).toBe(1);
});

test('CSP nonce changes across requests', async () => {
  const baseUrl = resolveIntegrationBaseUrl();
  const nonces = new Set<string>();

  for (let i = 0; i < 3; i += 1) {
    const r = await fetch(new URL('/', baseUrl).toString());
    const csp = r.headers.get('content-security-policy') || '';
    const nonce = extractNonce(csp);
    if (nonce) {
      nonces.add(nonce);
    }
  }

  expect(nonces.size).toBeGreaterThan(1);
});
