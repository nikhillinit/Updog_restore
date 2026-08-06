import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import {
  requireAnyRole,
  requireCapability,
  requireRole,
  requireWriteRole,
} from '../../../server/lib/auth/jwt';

type AuthSurface = 'context' | 'user';

function requestWithRole(role: string, surface: AuthSurface): Request {
  if (surface === 'context') return { context: { role } } as unknown as Request;
  return { user: { role } } as unknown as Request;
}

function invoke(
  middleware: (req: Request, res: Response, next: () => void) => unknown,
  req: Request
) {
  const response = { sendStatus: () => undefined } as unknown as Response;
  let nextCalls = 0;
  middleware(req, response, () => {
    nextCalls += 1;
  });
  return nextCalls;
}

describe('role guards', () => {
  it.each(['user', 'context'] as const)(
    'normalizes legacy operator to partner on the %s auth surface',
    (surface) => {
      const req = requestWithRole('operator', surface);

      expect(invoke(requireRole('partner'), req)).toBe(1);
      expect(invoke(requireAnyRole(['partner']), req)).toBe(1);
      expect(invoke(requireWriteRole(['partner']), req)).toBe(1);
    }
  );

  it.each(['user', 'context'] as const)(
    'normalizes legacy viewer to analyst on the %s auth surface',
    (surface) => {
      const req = requestWithRole('viewer', surface);

      expect(invoke(requireRole('analyst'), req)).toBe(1);
      expect(invoke(requireAnyRole(['analyst']), req)).toBe(1);
      expect(invoke(requireWriteRole(['analyst']), req)).toBe(1);
    }
  );

  it.each(['user', 'context'] as const)('checks capabilities on the %s auth surface', (surface) => {
    expect(invoke(requireCapability('flag_admin'), requestWithRole('admin', surface))).toBe(1);
    expect(invoke(requireCapability('flag_admin'), requestWithRole('flag_admin', surface))).toBe(0);
    expect(invoke(requireCapability('reserve_admin'), requestWithRole('operator', surface))).toBe(
      1
    );
  });

  it('keeps requireRole exact-effective-match semantics', () => {
    expect(invoke(requireRole('partner'), requestWithRole('admin', 'user'))).toBe(0);
    expect(invoke(requireAnyRole(['partner']), requestWithRole('admin', 'context'))).toBe(0);
  });

  it('rejects unknown or missing roles', () => {
    expect(invoke(requireRole('partner'), {} as Request)).toBe(0);
    expect(invoke(requireWriteRole(['partner']), requestWithRole('flag_admin', 'user'))).toBe(0);
  });
});
