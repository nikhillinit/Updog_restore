import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HTTPServer } from 'http';

const {
  PortfolioMetricsCtor,
  mockPortfolioMetricsInstance,
  setPortfolioMetricsWSMock,
  mockLogger,
} = vi.hoisted(() => {
  const mockPortfolioMetricsInstance = { cleanup: vi.fn() };

  const PortfolioMetricsCtor = vi.fn(function () {
    return mockPortfolioMetricsInstance;
  });
  const setPortfolioMetricsWSMock = vi.fn();
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    PortfolioMetricsCtor,
    mockPortfolioMetricsInstance,
    setPortfolioMetricsWSMock,
    mockLogger,
  };
});

vi.mock('../../../server/websocket/portfolio-metrics.js', () => ({
  default: PortfolioMetricsCtor,
  setPortfolioMetricsWS: setPortfolioMetricsWSMock,
}));

vi.mock('../../../server/logger', () => ({
  logger: mockLogger,
}));

describe('websocket/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sets up and cleans up portfolio metrics websocket', async () => {
    const { setupWebSocketServers, cleanupWebSocketServers } =
      await import('../../../server/websocket/index');

    const result = setupWebSocketServers({} as HTTPServer);

    expect(PortfolioMetricsCtor).toHaveBeenCalledTimes(1);
    expect(setPortfolioMetricsWSMock).toHaveBeenCalledWith(mockPortfolioMetricsInstance);
    expect(result).toEqual({
      portfolioMetrics: mockPortfolioMetricsInstance,
    });

    cleanupWebSocketServers();

    expect(mockPortfolioMetricsInstance.cleanup).toHaveBeenCalledTimes(1);
  });
});
