// client/src/lib/telemetry.ts
// Simple telemetry for fund creation tracking

interface TelemetryEvent {
  name: string;
  properties: Record<string, any>;
  timestamp: string;
}

// In-memory store for development (replace with real analytics in production)
const events: TelemetryEvent[] = [];

export function track(eventName: string, properties: Record<string, any> = {}) {
  const event: TelemetryEvent = {
    name: eventName,
    properties: {
      ...properties,
      userAgent: navigator.userAgent,
      url: window.location.href,
    },
    timestamp: new Date().toISOString(),
  };
  
  events.push(event);
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Telemetry]', eventName, properties);
  }
  
  // In production, send to analytics service
  // Example: analytics.track(eventName, properties);
}

export function getEvents() {
  return [...events];
}

export function clearEvents() {
  events.length = 0;
}