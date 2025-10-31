# PR #158 Security Fixes - Detailed Action Plan

**PR**: https://github.com/nikhillinit/Updog_restore/pull/158 **Status**:
REQUEST CHANGES (P1 Issues) **Estimated Effort**: 4-6 hours **Priority**: High
(Security)

---

## P1 Issues (Must Fix Before Merge)

### 1. SQL Injection Prevention in Migration (30 min)

**File**: `migrations/0001_ai_usage_ledger.sql`

**Changes Needed**:

```sql
-- Add explicit security context
CREATE OR REPLACE FUNCTION validate_ai_ledger_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER  -- Explicit (though this is default)
AS $$
BEGIN
  -- Validate state enum values explicitly
  IF NEW.state NOT IN ('reserved', 'settled', 'void') THEN
    RAISE EXCEPTION 'Invalid state value: %', NEW.state;
  END IF

  -- Existing transition logic...
  IF (OLD.state = 'reserved' AND NEW.state != 'settled' AND NEW.state != 'void') THEN
    RAISE EXCEPTION 'Invalid state transition from reserved to %', NEW.state;
  END IF

  -- ... rest of existing logic

  RETURN NEW;
END;
$$;

-- Add JSONB validation constraints
ALTER TABLE ai_usage_ledger
ADD CONSTRAINT check_models_is_array
CHECK (jsonb_typeof(models) = 'array');

ALTER TABLE ai_usage_ledger
ADD CONSTRAINT check_tags_is_array_or_null
CHECK (tags IS NULL OR jsonb_typeof(tags) = 'array');

ALTER TABLE ai_usage_ledger
ADD CONSTRAINT check_responses_is_array_or_null
CHECK (responses IS NULL OR jsonb_typeof(responses) = 'array');
```

---

### 2. Integrate Audit Schemas (45 min)

**File**: `shared/schema.ts`

**Changes**:

```typescript
// At end of file, after ai_usage_ledger definitions
export * from './schema/ai-audit.js';
```

**File**: `migrations/0001_ai_usage_ledger.sql`

**Add to migration**:

```sql
-- Link aiProposalAudit to aiUsageLedger
ALTER TABLE ai_proposal_audit
ADD COLUMN ledger_id uuid REFERENCES ai_usage_ledger(id);

CREATE INDEX idx_ai_proposal_audit_ledger
ON ai_proposal_audit(ledger_id);

COMMENT ON COLUMN ai_proposal_audit.ledger_id IS
'Links detailed proposal audit to usage ledger entry';
```

**Documentation**: Add to `docs/security/SECURITY_IMPLEMENTATION_SUMMARY.md`:

```markdown
## Audit System Architecture

The AI audit system uses two complementary tables:

1. **`aiUsageLedger`** (Reserve→Settle→Void pattern)
   - Tracks AI request lifecycle
   - Idempotency and budget control
   - Aggregate cost tracking

2. **`aiProposalAudit`** (Detailed audit trail)
   - Stores prompts/responses (truncated)
   - SHA-256 hashing for integrity
   - 7-year retention for compliance
   - Links to ledger via `ledger_id`

### Data Flow
```

AI Request ↓ Reserve ledger entry (aiUsageLedger) ↓ Create audit entry
(aiProposalAudit) → link via ledger_id ↓ Settle/Void ledger entry based on
success/failure

```

```

---

### 3. Harden Rate Limiter (1 hour)

**File**: `server/middleware/rate-limiter.ts`

**Changes**:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redis-factory.js';

// IP validation regex
const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F:]+)$|^unknown$/;

export const proposalRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,

  // Use Redis for distributed rate limiting
  store: new RedisStore({
    client: getRedisClient(),
    prefix: 'rl:proposal:',
  }),

  message: {
    error: 'Rate limit exceeded for AI proposals',
    limit: 10,
    windowHours: 1,
    retryAfter: null as number | null, // Will be set in handler
  },

  standardHeaders: true,
  legacyHeaders: false,

  // Validate and hash key components
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // Validate IP format
    const validIp = IP_PATTERN.test(ip) ? ip : 'invalid';

    // Hash user agent to prevent manipulation
    const uaHash = crypto
      .createHash('sha256')
      .update(userAgent.substring(0, 200))
      .digest('hex')
      .substring(0, 16);

    return `ip:${validIp}:${uaHash}`;
  },

  skip: (req: Request): boolean => {
    // Skip OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return true;
    }

    // Skip in test environment
    if (process.env['NODE_ENV'] === 'test') {
      return true;
    }

    return false;
  },

  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(60 * 60); // 1 hour in seconds

    // Set standard Retry-After header (RFC 6585)
    res.set('Retry-After', retryAfter.toString());

    res.status(429).json({
      error: 'Rate limit exceeded for AI proposals',
      limit: 10,
      windowHours: 1,
      retryAfter: retryAfter,
      message: `You have exceeded the limit of 10 AI proposal requests per hour. Please try again in ${retryAfter} seconds.`,
    });
  },
});
```

**New File**: `server/lib/redis-factory.ts` (if doesn't exist)

```typescript
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
      password: process.env['REDIS_PASSWORD'],
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
  }
  return redisClient;
}
```

---

### 4. Expand Error Sanitization (30 min)

**File**: `server/lib/ai-audit.ts`

**Replace** `sanitizeErrorMessage` function:

```typescript
export function sanitizeErrorMessage(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;

  let sanitized = message
    // OpenAI keys: sk-...
    .replace(/sk-[a-zA-Z0-9_-]{20,}/gi, '[API_KEY_REDACTED]')
    // Anthropic keys: sk-ant-...
    .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/gi, '[API_KEY_REDACTED]')
    // DeepSeek and other API keys
    .replace(
      /['\"]?(?:api[-_]?key|apikey|access[-_]?key)['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{10,}['\"]?/gi,
      'api_key=[REDACTED]'
    )
    // Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer [TOKEN_REDACTED]')
    // Base64 encoded secrets (common pattern)
    .replace(
      /['\"]?(?:secret|password|token)['\"]?\s*[:=]\s*['\"]?[A-Za-z0-9+/]{20,}={0,2}['\"]?/gi,
      'secret=[REDACTED]'
    )
    // Environment variable leakage
    .replace(
      /process\.env\[['\"]([A-Z_]+)['\"]]/gi,
      'process.env.[REDACTED_ENV_VAR]'
    )
    // Google API keys
    .replace(/AIza[0-9A-Za-z_-]{35}/gi, '[GOOGLE_API_KEY_REDACTED]');

  return truncateText(sanitized, 500);
}
```

**Add unit test** in `tests/unit/lib/ai-audit.test.ts`:

```typescript
describe('sanitizeErrorMessage', () => {
  it('should redact OpenAI API keys', () => {
    const error = 'Failed: sk-1234567890abcdefghij';
    expect(sanitizeErrorMessage(error)).not.toContain('sk-');
  });

  it('should redact Anthropic API keys', () => {
    const error = 'Auth failed: sk-ant-1234567890abcdefghij';
    expect(sanitizeErrorMessage(error)).not.toContain('sk-ant-');
  });

  it('should redact Bearer tokens', () => {
    const error = 'Bearer abc123.def456.ghi789';
    expect(sanitizeErrorMessage(error)).toContain('[TOKEN_REDACTED]');
  });

  it('should redact Google API keys', () => {
    const error = 'Google API key: AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe';
    expect(sanitizeErrorMessage(error)).toContain('[GOOGLE_API_KEY_REDACTED]');
  });
});
```

---

### 5. Add Migration Rollback (30 min)

**New File**: `migrations/0001_ai_usage_ledger_rollback.sql`

```sql
-- Rollback for 0001_ai_usage_ledger.sql
-- Execute this to safely revert the migration

-- Drop foreign key from ai_proposal_audit (if added in fix)
ALTER TABLE ai_proposal_audit DROP COLUMN IF EXISTS ledger_id;

-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ai_usage_daily_stats;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_validate_ai_ledger_state ON ai_usage_ledger;
DROP TRIGGER IF EXISTS trg_ai_usage_ledger_updated_at ON ai_usage_ledger;

-- Drop functions
DROP FUNCTION IF EXISTS validate_ai_ledger_state_transition();
DROP FUNCTION IF EXISTS update_ai_usage_ledger_updated_at();

-- Drop table
DROP TABLE IF EXISTS ai_usage_ledger;

-- Drop enum
DROP TYPE IF EXISTS ai_ledger_state;

-- Log rollback
DO $$
BEGIN
  RAISE NOTICE 'AI Usage Ledger migration rolled back successfully';
END $$;
```

---

### 6. Enforce Audit Validation (45 min)

**File**: `server/lib/ai-audit.ts`

**Add wrapper function**:

```typescript
import type { Database } from '@/lib/db';
import { aiProposalAudit, aiUsageLedger } from '@shared/schema';

/**
 * Insert audit entry with validation
 * @throws Error if validation fails
 */
export async function insertAuditEntry(
  db: Database,
  entry: InsertAiProposalAudit
): Promise<void> {
  // Validate before insertion
  const validation = validateAuditEntry(entry);
  if (!validation.valid) {
    throw new Error(`Invalid audit entry: ${validation.errors.join(', ')}`);
  }

  // Insert into database
  await db.insert(aiProposalAudit).values(entry);
}

/**
 * Create and insert audit entry in one operation
 */
export async function createAndInsertAuditEntry(
  db: Database,
  params: Parameters<typeof createAuditEntry>[0]
): Promise<void> {
  const entry = createAuditEntry(params);
  await insertAuditEntry(db, entry);
}
```

**Update integration example** in
`docs/security/SECURITY_IMPLEMENTATION_SUMMARY.md`:

```typescript
import { createAndInsertAuditEntry } from '@/lib/ai-audit';
import { db } from '@/lib/db';

// In route handler
const auditEntry = await createAndInsertAuditEntry(db, {
  requestId: generateId(),
  providerName: 'openai',
  modelName: 'gpt-4o-mini',
  prompt: userPrompt,
  response: aiResponse,
  userId: req.user?.id,
  proposalType: 'fund_strategy',
});
```

---

## Testing Plan

### Unit Tests (1 hour)

1. **Error Sanitization Tests**
   - Test all API key formats
   - Test Bearer token redaction
   - Test environment variable leakage

2. **Audit Validation Tests**
   - Test required fields validation
   - Test SHA-256 hash validation
   - Test retention date validation

3. **Rate Limiter Tests**
   - Test IP validation
   - Test user-agent hashing
   - Test CORS preflight skip

### Integration Tests (1 hour)

1. **Database Migration Tests**
   - Test migration up
   - Test rollback
   - Test constraints work as expected

2. **Audit System Integration**
   - Test ledger → audit linking
   - Test validation enforcement
   - Test error handling

3. **Rate Limiter Integration**
   - Test Redis store (requires Redis running)
   - Test distributed rate limiting
   - Test Retry-After header

---

## Deployment Checklist

- [ ] All P1 fixes implemented
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Migration tested on staging database
- [ ] Rollback script tested
- [ ] Redis configured for production
- [ ] Documentation updated
- [ ] Security review completed
- [ ] PR approved by 2+ reviewers

---

## Post-Merge Tasks

1. **Monitor rate limiting effectiveness** (Week 1)
2. **Review audit logs for anomalies** (Week 1-2)
3. **Verify TOS compliance quarterly** (Ongoing)
4. **Plan Month 2-3 enhancements** (Automated TOS monitoring)

---

## Estimated Timeline

| Task                   | Time         |
| ---------------------- | ------------ |
| SQL injection fixes    | 30 min       |
| Schema integration     | 45 min       |
| Rate limiter hardening | 1 hour       |
| Error sanitization     | 30 min       |
| Migration rollback     | 30 min       |
| Audit validation       | 45 min       |
| Unit tests             | 1 hour       |
| Integration tests      | 1 hour       |
| **Total**              | **~6 hours** |

---

**Ready to proceed? Start with P1-1 (SQL injection) as it's critical for
database security.**
