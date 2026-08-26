import type { RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';

type RequestLoggingConfig = Pick<AppConfig, 'APP_VERSION' | 'NODE_ENV'>;

interface RequestLogger {
  info(attributes: Record<string, unknown>, message: string): void;
}

const internalEconomicsResponsePath =
  /^\/api\/funds\/[^/]+\/internal-economics\/runs(?:\/[^/]+)?\/?$/i;

export function isSensitiveFinancialResponsePath(path: string): boolean {
  return internalEconomicsResponsePath.test(path);
}

export function requestLoggingMiddleware(
  config: RequestLoggingConfig,
  log: RequestLogger
): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const path = req.path;
    const captureResponse = !isSensitiveFinancialResponsePath(path);
    let capturedJsonResponse: unknown;

    const originalResJson = res.json;
    res.json = function (bodyJson: Parameters<typeof originalResJson>[0]) {
      if (captureResponse) capturedJsonResponse = bodyJson;
      return originalResJson.call(res, bodyJson);
    };

    res.on('finish', () => {
      const duration = Date.now() - start;
      if (!path.startsWith('/api')) return;

      const version = config.APP_VERSION;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms [v${version}]`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = `${logLine.slice(0, 79)}…`;
      }

      log.info(
        {
          timestamp: new Date().toISOString(),
          service: 'fund-platform-api',
          version,
          environment: config.NODE_ENV,
          method: req.method,
          path,
          statusCode: res.statusCode,
          duration,
          requestId: req.requestId,
          ...(captureResponse ? { response: capturedJsonResponse } : {}),
        },
        logLine
      );
    });

    next();
  };
}
