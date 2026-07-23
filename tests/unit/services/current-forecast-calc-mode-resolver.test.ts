import { describe, expect, it, vi } from 'vitest';

import {
  CURRENT_FORECAST_CALCULATION_KEY,
  dispatchCurrentForecastServing,
  resolveCurrentForecastCalculationMode,
  resolveCurrentForecastModeResolution,
  type CurrentForecastModeReader,
  type CurrentForecastModeRow,
} from '../../../server/services/current-forecast-calc-mode-resolver';

const reader =
  (row: CurrentForecastModeRow | null): CurrentForecastModeReader =>
  async () =>
    row;

/** Pre-cutover: no activation event has been written. */
const PRE = { activatedAt: null, cutoverReferenceId: null };
/** Post-cutover: activation pinned reference 41 as the served-pointer head. */
const POST = { activatedAt: new Date('2026-07-01T00:00:00Z'), cutoverReferenceId: 41 };

describe('resolveCurrentForecastCalculationMode (pre-cutover legacy map)', () => {
  it('defaults to off when no row exists', async () => {
    expect(await resolveCurrentForecastCalculationMode(1, reader(null))).toBe('off');
  });

  it('returns shadow when configuredMode is shadow', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'shadow', killSwitchActive: false, ...PRE })
      )
    ).toBe('shadow');
  });

  it('returns on when configuredMode is on', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'on', killSwitchActive: false, ...PRE })
      )
    ).toBe('on');
  });

  it('collapses to off when the kill switch is active pre-cutover', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'on', killSwitchActive: true, ...PRE })
      )
    ).toBe('off');
  });

  it('fails safe to off on an unexpected configuredMode', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'bogus', killSwitchActive: false, ...PRE })
      )
    ).toBe('off');
  });

  it('exposes the current-forecast calculation key', () => {
    expect(CURRENT_FORECAST_CALCULATION_KEY).toBe('current_forecast');
  });
});

describe('resolveCurrentForecastModeResolution (R24/D9 held-state map)', () => {
  it('pre-cutover kill resolves off with no pointer', async () => {
    expect(
      await resolveCurrentForecastModeResolution(
        1,
        reader({ configuredMode: 'on', killSwitchActive: true, ...PRE })
      )
    ).toEqual({ mode: 'off', cutoverReferenceId: null });
  });

  it('pre-cutover shadow resolves shadow', async () => {
    expect(
      await resolveCurrentForecastModeResolution(
        1,
        reader({ configuredMode: 'shadow', killSwitchActive: false, ...PRE })
      )
    ).toEqual({ mode: 'shadow', cutoverReferenceId: null });
  });

  it('post-cutover effective on resolves on and carries the pointer head', async () => {
    expect(
      await resolveCurrentForecastModeResolution(
        1,
        reader({ configuredMode: 'on', killSwitchActive: false, ...POST })
      )
    ).toEqual({ mode: 'on', cutoverReferenceId: 41 });
  });

  it('post-cutover kill resolves held, never legacy off', async () => {
    expect(
      await resolveCurrentForecastModeResolution(
        1,
        reader({ configuredMode: 'on', killSwitchActive: true, ...POST })
      )
    ).toEqual({ mode: 'held', cutoverReferenceId: 41 });
  });

  it('post-cutover configured off resolves held', async () => {
    expect(
      await resolveCurrentForecastModeResolution(
        1,
        reader({ configuredMode: 'off', killSwitchActive: false, ...POST })
      )
    ).toEqual({ mode: 'held', cutoverReferenceId: 41 });
  });

  it('post-cutover configured shadow resolves held', async () => {
    expect(
      await resolveCurrentForecastModeResolution(
        1,
        reader({ configuredMode: 'shadow', killSwitchActive: false, ...POST })
      )
    ).toEqual({ mode: 'held', cutoverReferenceId: 41 });
  });

  it('held serves the served-pointer head from the mode row, not any other lookup', async () => {
    const modeReader = vi.fn(async (): Promise<CurrentForecastModeRow> => ({
      configuredMode: 'off',
      killSwitchActive: true,
      activatedAt: '2026-07-01T00:00:00Z',
      cutoverReferenceId: 41,
    }));

    const resolution = await resolveCurrentForecastModeResolution(1, modeReader);

    expect(resolution).toEqual({ mode: 'held', cutoverReferenceId: 41 });
    expect(modeReader).toHaveBeenCalledTimes(1);
  });

  it('legacy wrapper surfaces held post-cutover', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'off', killSwitchActive: false, ...POST })
      )
    ).toBe('held');
  });
});

describe('dispatchCurrentForecastServing', () => {
  const seams = () => ({
    runLegacy: vi.fn(async () => 'legacy' as const),
    runV2: vi.fn(async () => 'v2' as const),
    serveHeld: vi.fn(async () => 'held' as const),
  });

  it('off serves the legacy lane', async () => {
    const s = seams();

    await expect(
      dispatchCurrentForecastServing({ mode: 'off', cutoverReferenceId: null }, s)
    ).resolves.toBe('legacy');
    expect(s.runV2).not.toHaveBeenCalled();
    expect(s.serveHeld).not.toHaveBeenCalled();
  });

  it('shadow serves the legacy lane (observation is a separate plane)', async () => {
    const s = seams();

    await expect(
      dispatchCurrentForecastServing({ mode: 'shadow', cutoverReferenceId: null }, s)
    ).resolves.toBe('legacy');
  });

  it('held serves the pointer head and NEVER invokes the legacy calculator', async () => {
    const s = seams();

    await expect(
      dispatchCurrentForecastServing({ mode: 'held', cutoverReferenceId: 41 }, s)
    ).resolves.toBe('held');
    expect(s.serveHeld).toHaveBeenCalledWith(41);
    // ProjectedMetricsCalculator seam: post-cutover under kill the legacy lane
    // must never run (R24/D9); the resolver yields held and dispatch pins it.
    expect(s.runLegacy).not.toHaveBeenCalled();
    expect(s.runV2).not.toHaveBeenCalled();
  });

  it('post-cutover V2 failure degrades to held, never legacy', async () => {
    const s = seams();
    s.runV2.mockRejectedValueOnce(new Error('v2 exploded'));

    await expect(
      dispatchCurrentForecastServing({ mode: 'on', cutoverReferenceId: 41 }, s)
    ).resolves.toBe('held');
    expect(s.serveHeld).toHaveBeenCalledWith(41);
    expect(s.runLegacy).not.toHaveBeenCalled();
  });

  it('pre-cutover on with a V2 failure rethrows (no pointer to hold on, no legacy fallback)', async () => {
    const s = seams();
    s.runV2.mockRejectedValueOnce(new Error('v2 exploded'));

    await expect(
      dispatchCurrentForecastServing({ mode: 'on', cutoverReferenceId: null }, s)
    ).rejects.toThrow('v2 exploded');
    expect(s.runLegacy).not.toHaveBeenCalled();
    expect(s.serveHeld).not.toHaveBeenCalled();
  });

  it('held with a missing pointer head throws instead of falling back', async () => {
    const s = seams();

    await expect(
      dispatchCurrentForecastServing({ mode: 'held', cutoverReferenceId: null }, s)
    ).rejects.toThrow(/served-pointer head/);
    expect(s.runLegacy).not.toHaveBeenCalled();
  });
});
