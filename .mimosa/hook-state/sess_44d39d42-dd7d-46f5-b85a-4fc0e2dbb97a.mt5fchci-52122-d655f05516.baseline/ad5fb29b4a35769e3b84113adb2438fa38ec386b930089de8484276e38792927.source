import type { Test } from 'supertest';

export const SESSION_COOKIE_NAME = 'updog.session';
export const CSRF_COOKIE_NAME = 'updog.csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

type HeaderCarrier = {
  headers: Record<string, string | string[] | undefined>;
};

export interface ParsedSetCookie {
  name: string;
  value: string;
  attributes: Map<string, string | true>;
  raw: string;
}

export function setCookieHeaders(response: HeaderCarrier): string[] {
  const value = response.headers['set-cookie'];
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

export function parseSetCookie(raw: string): ParsedSetCookie {
  const [nameValue = '', ...attributeParts] = raw.split(';');
  const separator = nameValue.indexOf('=');
  if (separator <= 0) {
    throw new Error(`Invalid Set-Cookie header: ${raw}`);
  }

  const name = nameValue.slice(0, separator).trim();
  const value = nameValue.slice(separator + 1).trim();
  const attributes = new Map<string, string | true>();

  for (const rawAttribute of attributeParts) {
    const attribute = rawAttribute.trim();
    if (!attribute) continue;
    const equals = attribute.indexOf('=');
    if (equals === -1) {
      attributes.set(attribute.toLowerCase(), true);
      continue;
    }
    attributes.set(
      attribute.slice(0, equals).trim().toLowerCase(),
      attribute.slice(equals + 1).trim()
    );
  }

  return { name, value, attributes, raw };
}

export function findSetCookie(response: HeaderCarrier, name: string): ParsedSetCookie {
  const parsed = setCookieHeaders(response).map(parseSetCookie);
  const cookie = parsed.find((candidate) => candidate.name === name);
  if (!cookie) {
    throw new Error(`Missing Set-Cookie header for ${name}`);
  }
  return cookie;
}

export function cookieHeader(...cookies: Array<{ name: string; value: string }>): string {
  return cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
}

export function withBrowserAuth(request: Test, sessionToken: string, csrfToken?: string): Test {
  const cookies = [{ name: SESSION_COOKIE_NAME, value: sessionToken }];
  if (csrfToken !== undefined) {
    cookies.push({ name: CSRF_COOKIE_NAME, value: csrfToken });
    request.set(CSRF_HEADER_NAME, csrfToken);
  }
  return request.set('Cookie', cookieHeader(...cookies));
}
