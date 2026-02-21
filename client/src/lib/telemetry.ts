/**
 * Telemetry v1 - GP Modernization
 *
 * Ring buffer implementation with strict event allowlist.
 * Storage: localStorage key 'telemetry_buffer_v1'
 * Max events: 500 (FIFO rotation)
 * Max event size: 2KB
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'telemetry_buffer_v1';
const MAX_EVENTS = 500;
const MAX_EVENT_SIZE_BYTES = 2048; // 2KB

// Legacy storage key (for migration/reading old data)
const LEGACY_STORAGE_KEY = '__telemetry_events';

// ============================================================================
// EVENT ALLOWLIST - Strict enum payloads only
// ============================================================================

/**
 * Allowed events and their payload schemas.
 * Any event or payload field not on this list will be REJECTED.
 */
const ALLOWED_EVENTS = {
  // Tour events
  tour_started: {
    allowedFields: ['version'],
    validators: {
      version: (v: unknown) => v === 'gp_v1',
    },
  },
  tour_step_viewed: {
    allowedFields: ['stepIndex'],
    validators: {
      stepIndex: (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0,
    },
  },
  tour_completed: {
    allowedFields: ['version'],
    validators: {
      version: (v: unknown) => v === 'gp_v1',
    },
  },

  // Navigation events
  nav_clicked: {
    allowedFields: ['navItem'],
    validators: {
      navItem: (v: unknown) =>
        ['overview', 'portfolio', 'model', 'operate', 'report'].includes(v as string),
    },
  },

  // Portfolio events
  portfolio_tab_changed: {
    allowedFields: ['tab'],
    validators: {
      tab: (v: unknown) => ['overview', 'allocations', 'reallocation'].includes(v as string),
    },
  },

  // Empty state events
  empty_state_cta_clicked: {
    allowedFields: ['surface'],
    validators: {
      surface: (v: unknown) =>
        ['portfolio_overview', 'model_empty', 'operate_empty'].includes(v as string),
    },
  },

  // Progressive disclosure events
  advanced_section_toggled: {
    allowedFields: ['section', 'state'],
    validators: {
      section: (v: unknown) => ['allocation_advanced', 'scenario_advanced'].includes(v as string),
      state: (v: unknown) => ['open', 'close'].includes(v as string),
    },
  },

  // Legacy events (kept for backward compatibility)
  fund_create_attempt: { allowedFields: ['idempotency_status', 'request_id'], validators: {} },
  fund_create_success: { allowedFields: ['idempotency_status', 'request_id'], validators: {} },
  fund_create_failure: { allowedFields: ['idempotency_status', 'request_id'], validators: {} },
  fund_create_conflict: { allowedFields: ['idempotency_status', 'request_id'], validators: {} },
  api_error: {
    allowedFields: ['endpoint', 'error_message', 'error_code', 'request_id', 'status_code'],
    validators: {},
  },
} as const;

type AllowedEventName = keyof typeof ALLOWED_EVENTS;

// ============================================================================
// TYPES
// ============================================================================

export interface TelemetryEvent {
  event: string;
  timestamp: string;
  session_id: string;
  properties: Record<string, unknown>;
  // Index signature for backward compatibility with legacy field access
  [key: string]: unknown;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ============================================================================
// RING BUFFER OPERATIONS
// ============================================================================

/**
 * Read telemetry events from the v1 ring buffer.
 */
export function readTelemetry(): TelemetryEvent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Try legacy storage for migration
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      return JSON.parse(legacy);
    }

    return [];
  } catch (e) {
    console.error('[Telemetry] Failed to read buffer:', e);
    return [];
  }
}

/**
 * Write event to the ring buffer with FIFO rotation.
 */
function writeToBuffer(event: TelemetryEvent): void {
  try {
    const events = readTelemetry();

    // Add new event
    events.push(event);

    // FIFO rotation: remove oldest events if over limit
    while (events.length > MAX_EVENTS) {
      events.shift();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    console.error('[Telemetry] Failed to write to buffer:', e);
  }
}

/**
 * Clear the telemetry buffer.
 */
export function clearTelemetry(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    console.error('[Telemetry] Failed to clear buffer:', e);
  }
}

// ============================================================================
// SESSION & REQUEST IDS
// ============================================================================

export function getOrCreateSessionId(): string {
  const key = 'telemetry_session_id';
  let sessionId = localStorage.getItem(key);

  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(key, sessionId);
  }

  return sessionId;
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate event name against allowlist.
 */
function validateEventName(eventName: string): ValidationResult {
  if (!(eventName in ALLOWED_EVENTS)) {
    return {
      valid: false,
      reason: `Event '${eventName}' is not in the allowlist`,
    };
  }
  return { valid: true };
}

/**
 * Validate event payload against schema.
 */
function validatePayload(
  eventName: AllowedEventName,
  properties: Record<string, unknown>
): ValidationResult {
  const schema = ALLOWED_EVENTS[eventName];

  // Check for disallowed fields
  const propertyKeys = Object.keys(properties);
  for (const key of propertyKeys) {
    if (!(schema.allowedFields as readonly string[]).includes(key)) {
      return {
        valid: false,
        reason: `Field '${key}' is not allowed for event '${eventName}'`,
      };
    }
  }

  // Run validators
  for (const [field, validator] of Object.entries(schema.validators)) {
    const value = properties[field];
    if (value !== undefined && !validator(value)) {
      return {
        valid: false,
        reason: `Invalid value for field '${field}' in event '${eventName}'`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if event size exceeds limit.
 */
function checkEventSize(event: TelemetryEvent): ValidationResult {
  const size = new Blob([JSON.stringify(event)]).size;
  if (size > MAX_EVENT_SIZE_BYTES) {
    return {
      valid: false,
      reason: `Event size ${size} bytes exceeds limit of ${MAX_EVENT_SIZE_BYTES} bytes`,
    };
  }
  return { valid: true };
}

// ============================================================================
// MAIN TRACKING FUNCTION
// ============================================================================

/**
 * Track a telemetry event with strict validation.
 *
 * Events not on the allowlist will be REJECTED (fail closed).
 * Payload fields not in the per-event schema will be REJECTED.
 *
 * @returns The event if valid and tracked, or null if rejected
 */
export function track(
  eventName: string,
  properties: Record<string, unknown> = {}
): TelemetryEvent | null {
  // Validate event name
  const nameValidation = validateEventName(eventName);
  if (!nameValidation.valid) {
    if (import.meta.env.DEV) {
      console.warn(`[Telemetry] REJECTED: ${nameValidation.reason}`);
    }
    return null;
  }

  // Validate payload
  const payloadValidation = validatePayload(eventName as AllowedEventName, properties);
  if (!payloadValidation.valid) {
    if (import.meta.env.DEV) {
      console.warn(`[Telemetry] REJECTED: ${payloadValidation.reason}`);
    }
    return null;
  }

  // Create event
  const event: TelemetryEvent = {
    event: eventName,
    timestamp: new Date().toISOString(),
    session_id: getOrCreateSessionId(),
    properties,
  };

  // Check size
  const sizeValidation = checkEventSize(event);
  if (!sizeValidation.valid) {
    if (import.meta.env.DEV) {
      console.warn(`[Telemetry] REJECTED: ${sizeValidation.reason}`);
    }
    return null;
  }

  // Log in development
  if (import.meta.env.DEV) {
    console.log('[Telemetry]', event);
  }

  // Write to ring buffer
  writeToBuffer(event);

  return event;
}

// ============================================================================
// BASE CONTEXT (for backward compatibility)
// ============================================================================

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
      height: window.innerHeight,
    },
  };
}

// Export for use in API calls
export const TELEMETRY_HEADERS = {
  'X-Session-ID': getOrCreateSessionId(),
  'X-App-Version': import.meta.env.VITE_APP_VERSION || 'unknown',
  'X-Git-SHA': import.meta.env.VITE_GIT_SHA || 'unknown',
};

// ============================================================================
// BUFFER INFO (for admin dashboard)
// ============================================================================

export function getTelemetryBufferInfo() {
  const events = readTelemetry();
  return {
    eventCount: events.length,
    maxEvents: MAX_EVENTS,
    storageKey: STORAGE_KEY,
    oldestEvent: events[0]?.timestamp || null,
    newestEvent: events[events.length - 1]?.timestamp || null,
  };
}
