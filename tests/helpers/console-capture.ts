import { beforeEach, afterEach, vi } from 'vitest';

export function useConsoleCapture() {
  let restore: Array<() => void> = [];

  beforeEach(() => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    restore = [() => err.mockRestore(), () => warn.mockRestore()];
  });

  afterEach(() => {
    restore.forEach(fn => fn());
  });

  const read = () => {
    // @ts-expect-error vitest mock
    const errs = ((console.error as any).mock?.calls ?? []).flat().join('\n').toLowerCase();
    // @ts-expect-error vitest mock
    const warns = ((console.warn as any).mock?.calls ?? []).flat().join('\n').toLowerCase();
    return `${errs}\n${warns}`;
  };

  return { read };
}