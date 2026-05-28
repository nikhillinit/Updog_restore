import { logger } from './logger.js';

type RouteLogLevel = 'error' | 'warn';
type RouteLogArgs = [unknown?, ...unknown[]];
type RouteLoggerTarget = {
  error: (_fields: Record<string, unknown>, _message: string) => void;
  warn: (_fields: Record<string, unknown>, _message: string) => void;
};

function getRouteLogger(route: string): RouteLoggerTarget {
  const rootLogger = logger as typeof logger & {
    child?: (_bindings: Record<string, unknown>) => RouteLoggerTarget;
  };

  return typeof rootLogger.child === 'function' ? rootLogger.child({ route }) : rootLogger;
}

function buildLogFields(args: unknown[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const details: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error && fields['err'] == null) {
      fields['err'] = arg;
    } else {
      details.push(arg);
    }
  }

  if (details.length === 1) {
    fields['detail'] = details[0];
  } else if (details.length > 1) {
    fields['details'] = details;
  }

  return fields;
}

function writeRouteLog(level: RouteLogLevel, route: string, args: RouteLogArgs): void {
  const [message, ...rest] = args;
  const log = getRouteLogger(route);

  if (typeof message === 'string') {
    log[level](buildLogFields(rest), message);
    return;
  }

  log[level](buildLogFields(args), 'route diagnostic');
}

export function createRouteLogger(route: string): {
  error: (...args: RouteLogArgs) => void;
  warn: (...args: RouteLogArgs) => void;
} {
  return {
    error: (...args: RouteLogArgs) => writeRouteLog('error', route, args),
    warn: (...args: RouteLogArgs) => writeRouteLog('warn', route, args),
  };
}
