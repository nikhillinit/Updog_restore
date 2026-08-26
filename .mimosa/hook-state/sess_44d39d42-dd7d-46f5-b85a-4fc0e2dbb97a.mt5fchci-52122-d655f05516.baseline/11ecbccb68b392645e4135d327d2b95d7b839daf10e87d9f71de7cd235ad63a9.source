import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserLogger,
  isDevelopmentRuntime,
  type BrowserConsoleSink,
} from '@/lib/logger';

function createSink(): BrowserConsoleSink {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

describe('Wave 5 logger policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('emits info, warn, and debug only for development runtimes', () => {
    const sink = createSink();
    const logger = createBrowserLogger({ sink, isDevelopment: true });

    logger.info('booted', { route: '/funds' });
    logger.warn('slow request', { durationMs: 250 });
    logger.debug('wizard trace', { step: 'capital-structure' });
    logger.error('fatal', new Error('boom'));

    expect(sink.info).toHaveBeenCalledWith('[INFO] booted', { route: '/funds' }, '');
    expect(sink.warn).toHaveBeenCalledWith('[WARN] slow request', { durationMs: 250 }, '');
    expect(sink.debug).toHaveBeenCalledWith(
      '[DEBUG] wizard trace',
      { step: 'capital-structure' },
      ''
    );
    expect(sink.error).toHaveBeenCalledWith('[ERROR] fatal', 'boom', '');
  });

  it('suppresses non-error output outside development runtimes', () => {
    const sink = createSink();
    const logger = createBrowserLogger({ sink, isDevelopment: false });

    logger.info('booted');
    logger.warn('slow request');
    logger.debug('wizard trace');
    logger.error('fatal', 'boom', { route: '/funds' });

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.error).toHaveBeenCalledWith(
      '[ERROR] fatal',
      'boom',
      { route: '/funds' }
    );
  });

  it('treats localhost hostnames as development when MODE is not development', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });

    expect(isDevelopmentRuntime()).toBe(true);

    vi.stubGlobal('window', { location: { hostname: 'app.example.com' } });

    expect(isDevelopmentRuntime()).toBe(false);
  });
});
