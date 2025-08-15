/**
 * Telemetry utilities with correlation and version tracking
 */

// Define TelemetryEvent type for use in the admin dashboard
export interface TelemetryEvent {
  event: string;
  timestamp: string;
  [key: string]: any;
}

// Function to read telemetry events from storage
export function readTelemetry(): TelemetryEvent[] {
  try {
    const stored = localStorage.getItem('__telemetry_events');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to read telemetry:', e);
    return [];
  }
}

// Generate or retrieve session ID
export function getOrCreateSessionId(): string {
  const key = 'telemetry_session_id';
  let sessionId = localStorage.getItem(key);
  
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(key, sessionId);
  }
  
  return sessionId;
}

// Generate request ID for correlation
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Base telemetry context for all events
export function baseTelemetryContext() {
  return {
    env: import.meta.env.MODE || 'development',
    app_version: import.meta.env.VITE_APP_VERSION || 'unknown',
    git_sha: import.meta.env.VITE_GIT_SHA || 'unknown',
    session_id: getOrCreateSessionId(),
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

// Track telemetry event
export function track(eventName: string, properties: Record<string, any> = {}) {
  const event = {
    event: eventName,
    ...baseTelemetryContext(),
    properties
  };
  
  // Log to console in development
  if (import.meta.env.DEV) {
    console.log('[Telemetry]', event);
  }
  
  // TODO: Send to analytics service in production
  // fetch('/api/telemetry', { method: 'POST', body: JSON.stringify(event) })
  
  return event;
}

// Track fund creation with idempotency status
export function trackFundCreation(status: 'attempt' | 'success' | 'failure' | 'conflict', details?: any) {
  return track(`fund_create_${status}`, {
    idempotency_status: status,
    request_id: generateRequestId(),
    ...details
  });
}

// Track API errors with correlation
export function trackApiError(endpoint: string, error: any, requestId?: string) {
  return track('api_error', {
    endpoint,
    error_message: error.message || String(error),
    error_code: error.code,
    request_id: requestId || generateRequestId(),
    status_code: error.response?.status
  });
}

// Export for use in API calls
export const TELEMETRY_HEADERS = {
  'X-Session-ID': getOrCreateSessionId(),
  'X-App-Version': import.meta.env.VITE_APP_VERSION || 'unknown',
  'X-Git-SHA': import.meta.env.VITE_GIT_SHA || 'unknown'
};