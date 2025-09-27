import { beforeEach, afterEach, vi } from 'vitest';

type ConsoleBag = {
  error: any[][];
  warn: any[][];
  log: any[][];
};

export function useConsoleCapture(opts: { captureLog?: boolean } = {}) {
  const bag: ConsoleBag = { error: [], warn: [], log: [] };
  let restores: Array<() => void> = [];

  beforeEach(() => {
    bag.error = [];
    bag.warn = [];
    bag.log = [];
    
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      bag.error.push(args);
    });
    
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      bag.warn.push(args);
    });
    
    restores = [
      () => errorSpy.mockRestore(),
      () => warnSpy.mockRestore()
    ];

    if (opts.captureLog) {
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        bag.log.push(args);
      });
      restores.push(() => logSpy.mockRestore());
    }
  });

  afterEach(() => {
    // Always restore; leave vi.restoreAllMocks() to your global teardown if you have one
    for (const restore of restores) {
      restore();
    }
    restores = [];
  });

  // Your tests can read from `bag.*`
  return bag;
}

// Legacy compatibility helper
export function useConsoleCaptureCompat() {
  const bag = useConsoleCapture();
  
  const read = () => {
    const errs = bag.error.flat().join('\n').toLowerCase();
    const warns = bag.warn.flat().join('\n').toLowerCase();
    return `${errs}\n${warns}`;
  };

  return { read, ...bag };
}