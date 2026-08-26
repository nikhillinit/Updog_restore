/**
 * handleCredentialRenewalMarker: a committed creation/finalize response that
 * carries credentialRenewal: 'reauth_required' must activate the session gate
 * (auth session cache -> null) and report true so callers stop follow-on
 * writes. Ordinary responses must leave the session cache untouched.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { handleCredentialRenewalMarker } from '@/services/funds';
import { queryClient } from '@/lib/queryClient';
import { AUTH_SESSION_QUERY_KEY } from '@/lib/auth-session';

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('handleCredentialRenewalMarker', () => {
  beforeEach(() => {
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, { user: { id: '12' } });
  });

  it('nulls the auth session cache and returns true on reauth_required', async () => {
    const handled = handleCredentialRenewalMarker({
      success: true,
      data: { id: 42 },
      credentialRenewal: 'reauth_required',
    });

    expect(handled).toBe(true);
    await flushMicrotasks();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });

  it('leaves the session cache untouched for ordinary responses', async () => {
    const handled = handleCredentialRenewalMarker({ success: true, data: { id: 42 } });

    expect(handled).toBe(false);
    await flushMicrotasks();
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual({ user: { id: '12' } });
  });
});
