import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HTTPServer } from 'http';

const {
  DevDashboardCtor,
  PortfolioMetricsCtor,
  mockDevDashboardInstance,
  mockPortfolioMetricsInstance,
  setPortfolioMetricsWSMock,
  mockLogger,
} = vi.hoisted(() => {
  const mockDevDashboardInstance = { cleanup: vi.fn() };
  const mockPortfolioMetricsInstance = { cleanup: vi.fn() };

  const DevDashboardCtor = vi.fn(() => mockDevDashboardInstance);
  const PortfolioMetricsCtor = vi.fn(() => mockPortfolioMetricsInstance);
  const setPortfolioMetricsWSMock = vi.fn();
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    DevDashboardCtor,
    PortfolioMetricsCtor,
    mockDevDashboardInstance,
    mockPortfolioMetricsInstance,
    setPortfolioMetricsWSMock,
    mockLogger,
  };
});

vi.mock('../../../server/websocket/dev-dashboard.js', () => ({
  default: DevDashboardCtor,
}));

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
    delete process.env.NODE_ENV;
  });

  it('always sets up portfolio metrics websocket and skips dev dashboard outside development', async () => {
    process.env.NODE_ENV = 'production';
    const { setupWebSocketServers, cleanupWebSocketServers } =
      await import('../../../server/websocket/index');

    const result = setupWebSocketServers({} as HTTPServer);

    expect(PortfolioMetricsCtor).toHaveBeenCalledTimes(1);
    expect(DevDashboardCtor).not.toHaveBeenCalled();
    expect(setPortfolioMetricsWSMock).toHaveBeenCalledWith(mockPortfolioMetricsInstance);
    expect(result).toEqual({
      devDashboard: null,
      portfolioMetrics: mockPortfolioMetricsInstance,
    });

    cleanupWebSocketServers();

    expect(mockPortfolioMetricsInstance.cleanup).toHaveBeenCalledTimes(1);
    expect(mockDevDashboardInstance.cleanup).not.toHaveBeenCalled();
  });

  it('sets up and cleans up both websocket servers in development', async () => {
    process.env.NODE_ENV = 'development';
    const { setupWebSocketServers, cleanupWebSocketServers } =
      await import('../../../server/websocket/index');

    const result = setupWebSocketServers({} as HTTPServer);

    expect(DevDashboardCtor).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      devDashboard: mockDevDashboardInstance,
      portfolioMetrics: mockPortfolioMetricsInstance,
    });

    cleanupWebSocketServers();

    expect(mockPortfolioMetricsInstance.cleanup).toHaveBeenCalledTimes(1);
    expect(mockDevDashboardInstance.cleanup).toHaveBeenCalledTimes(1);
  });
});
