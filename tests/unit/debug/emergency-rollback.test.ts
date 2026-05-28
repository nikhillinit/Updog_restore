// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkEmergencyRollback } from '@/debug/emergency-rollback';

type RollbackWindow = Window & {
  __FORCE_LEGACY_STATE?: boolean;
};

describe('emergency rollback bootstrap', () => {
  afterEach(() => {
    delete (window as RollbackWindow).__FORCE_LEGACY_STATE;
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('activates legacy state from the emergency rollback URL parameter', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.history.pushState({}, '', '/?emergency_rollback=true');

    checkEmergencyRollback();

    expect((window as RollbackWindow).__FORCE_LEGACY_STATE).toBe(true);
    expect(warn).toHaveBeenCalledWith('[CRITICAL] Emergency rollback activated via URL parameter');
  });

  it('activates legacy state from localStorage and shows the existing notification', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.setItem('emergency_rollback', 'true');

    checkEmergencyRollback();

    expect((window as RollbackWindow).__FORCE_LEGACY_STATE).toBe(true);
    expect(document.body.textContent).toContain('[CRITICAL] Emergency Mode Active');
    expect(document.body.textContent).toContain('Using legacy state system.');
  });
});
