import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';
import { traceWizard } from '@/debug/wizard-trace';

describe('Wave 5 wizard trace policy', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('logs through the shared logger only when the wizard debug flag is enabled', () => {
    traceWizard('step-change', { step: 'capital-structure' }, { component: 'WizardShell' });
    expect(debugSpy).not.toHaveBeenCalled();

    vi.stubEnv('VITE_WIZARD_DEBUG', '1');

    traceWizard('step-change', { step: 'capital-structure' }, { component: 'WizardShell' });

    expect(debugSpy).toHaveBeenCalledWith(
      'WIZARD',
      expect.objectContaining({
        event: 'step-change',
        component: 'WizardShell',
        detail: { step: 'capital-structure' },
      })
    );
  });

  it('truncates oversized payloads into a safe string instead of reparsing unsafe JSON', () => {
    vi.stubEnv('VITE_WIZARD_DEBUG', '1');

    traceWizard('autosave', { payload: 'x'.repeat(200) });

    const entry = debugSpy.mock.calls[0]?.[1] as { detail: unknown } | undefined;
    expect(typeof entry?.detail).toBe('string');
    expect(entry?.detail).toMatch(/\.\.\.$/);
  });
});
