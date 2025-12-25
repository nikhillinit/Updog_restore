# API Integration Testing Rubric

**Domain:** REST API endpoints, validation, error handling, security
**Estimated Time:** 60 minutes
**Prerequisites:** API documentation, Postman/curl, authentication tokens

---

## Overview

This rubric covers all 48 backend API routes, focusing on request validation, response formats, error handling, authentication/authorization, rate limiting, and idempotency.

**API Architecture:**
- RESTful endpoints (Express.js)
- Zod schema validation
- Consistent error responses (`{success, error, details}`)
- JWT authentication
- Cursor-based pagination
- Optimistic locking (version conflicts)
- Idempotency keys for POST operations
- Rate limiting (429 responses)

**HTTP Status Codes:**
- 200: Success (GET, PUT, PATCH)
- 201: Created (POST)
- 400: Bad Request (validation error)
- 401: Unauthorized (missing/invalid token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (version mismatch, duplicate)
- 429: Too Many Requests (rate limit exceeded)
- 500: Internal Server Error

---

## Test Cases

### TC-API-001: Authentication - JWT Tokens
**Objective:** Verify API authentication with JWT
**Steps:**

**Test 1a: Login and Obtain Token**
1. POST `/api/auth/login`
   ```json
   {
     "email": "test@example.com",
     "password": "test_password"
   }
   ```
2. Verify response 200:
   ```json
   {
     "success": true,
     "data": {
       "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "user": {
         "id": 1,
         "email": "test@example.com",
         "role": "gp"
       }
     }
   }
   ```
3. Verify token format: `header.payload.signature`

**Test 1b: Access Protected Endpoint with Token**
1. GET `/api/funds`
2. Include header: `Authorization: Bearer {token}`
3. Verify response 200 with fund data

**Test 1c: Access Without Token**
1. GET `/api/funds` (no Authorization header)
2. Verify response 401:
   ```json
   {
     "success": false,
     "error": "Authentication required"
   }
   ```

**Test 1d: Access with Invalid Token**
1. GET `/api/funds`
2. Header: `Authorization: Bearer invalid_token`
3. Verify response 401:
   ```json
   {
     "success": false,
     "error": "Invalid or expired token"
   }
   ```

**Test 1e: Token Expiry**
1. Wait for token expiration (e.g., 24 hours)
2. Attempt API call with expired token
3. Verify response 401: "Token expired"

**Time:** 8 minutes

---

### TC-API-002: Request Validation - Zod Schemas
**Objective:** Verify Zod schema validation on all endpoints
**Steps:**

**Test 2a: Missing Required Fields**
1. POST `/api/portfolio/companies`
   ```json
   {
     "sector": "Software"
   }
   ```
   (Missing required field: `name`)
2. Verify response 400:
   ```json
   {
     "success": false,
     "error": "Invalid request",
     "details": [
       {
         "path": ["name"],
         "message": "Required"
       }
     ]
   }
   ```

**Test 2b: Invalid Field Types**
1. POST `/api/portfolio/investments`
   ```json
   {
     "companyId": "not-a-number",
     "amount": "invalid"
   }
   ```
2. Verify response 400:
   ```json
   {
     "success": false,
     "error": "Invalid request",
     "details": [
       {
         "path": ["companyId"],
         "message": "Expected number, received string"
       },
       {
         "path": ["amount"],
         "message": "Expected number, received string"
       }
     ]
   }
   ```

**Test 2c: Range Validation**
1. POST `/api/funds`
   ```json
   {
     "name": "Test Fund",
     "size": -1000000
   }
   ```
2. Verify response 400:
   ```json
   {
     "details": [
       {
         "path": ["size"],
         "message": "Fund size must be greater than $0"
       }
     ]
   }
   ```

**Test 2d: String Length Validation**
1. POST `/api/portfolio/companies`
   ```json
   {
     "name": "AB"
   }
   ```
   (Name too short, min length 3)
2. Verify response 400 with message about min length

**Test 2e: Enum Validation**
1. POST `/api/portfolio/companies`
   ```json
   {
     "name": "Test Co",
     "status": "invalid_status"
   }
   ```
2. Verify response 400:
   ```json
   {
     "details": [
       {
         "path": ["status"],
         "message": "Invalid enum value. Expected 'active' | 'exited' | 'written-off'"
       }
     ]
   }
   ```

**Time:** 10 minutes

---

### TC-API-003: Response Format Consistency
**Objective:** Verify all API responses follow consistent structure
**Steps:**

**Test 3a: Success Response Structure (GET)**
1. GET `/api/funds/1`
2. Verify response 200:
   ```json
   {
     "success": true,
     "data": {
       "id": 1,
       "name": "Test Fund I",
       "size": 50000000,
       ...
     }
   }
   ```
3. Verify `success: true` and `data` field present

**Test 3b: Success Response Structure (POST)**
1. POST `/api/portfolio/companies` (valid data)
2. Verify response 201:
   ```json
   {
     "success": true,
     "data": {
       "id": 5,
       "name": "New Company",
       "createdAt": "2024-12-23T10:00:00Z"
     }
   }
   ```

**Test 3c: Error Response Structure**
1. GET `/api/funds/99999` (non-existent)
2. Verify response 404:
   ```json
   {
     "success": false,
     "error": "Fund not found"
   }
   ```
3. Verify `success: false` and `error` field present

**Test 3d: Validation Error Response**
1. POST `/api/funds` (invalid data)
2. Verify response 400 includes `details` array with validation errors

**Test 3e: Timestamp Fields**
1. GET `/api/portfolio/companies/1`
2. Verify all timestamp fields use ISO 8601 format:
   - `createdAt`: "2024-01-15T10:00:00Z"
   - `updatedAt`: "2024-12-23T10:00:00Z"

**Time:** 6 minutes

---

### TC-API-004: Cursor Pagination
**Objective:** Verify cursor-based pagination (not offset-based)
**Steps:**

**Test 4a: First Page Request**
1. GET `/api/portfolio/companies?limit=10`
2. Verify response includes:
   ```json
   {
     "success": true,
     "data": {
       "items": [ /* 10 companies */ ],
       "nextCursor": "uuid-cursor-value",
       "hasMore": true
     }
   }
   ```

**Test 4b: Next Page Request**
1. GET `/api/portfolio/companies?limit=10&cursor={nextCursor}`
2. Verify response returns next 10 items
3. Verify `nextCursor` updated to next page cursor
4. Verify `hasMore` indicates if more pages exist

**Test 4c: Last Page**
1. Paginate to last page
2. Verify `hasMore: false`
3. Verify `nextCursor: null`

**Test 4d: Invalid Cursor**
1. GET `/api/portfolio/companies?cursor=invalid-cursor`
2. Verify response 400:
   ```json
   {
     "success": false,
     "error": "Invalid cursor format"
   }
   ```

**Test 4e: Non-Existent Cursor**
1. GET `/api/portfolio/companies?cursor=uuid-that-does-not-exist`
2. Verify response 400:
   ```json
   {
     "success": false,
     "error": "Cursor not found or expired"
   }
   ```

**Time:** 7 minutes

---

### TC-API-005: Idempotency - POST Operations
**Objective:** Verify idempotency keys prevent duplicate operations
**Steps:**

**Test 5a: First Request with Idempotency Key**
1. POST `/api/portfolio/investments`
   ```json
   {
     "companyId": 1,
     "amount": 1000000
   }
   ```
   Header: `Idempotency-Key: unique-key-12345`
2. Verify response 201 (created)
3. Note investment ID returned

**Test 5b: Duplicate Request (Same Idempotency Key)**
1. POST `/api/portfolio/investments` (exact same request + key)
2. Verify response 200 (not 201)
3. Verify returns same investment ID (no duplicate created)
4. Verify database only has 1 investment record

**Test 5c: Different Request (Same Idempotency Key)**
1. POST `/api/portfolio/investments`
   ```json
   {
     "companyId": 2,
     "amount": 2000000
   }
   ```
   Header: `Idempotency-Key: unique-key-12345` (same key as 5a)
2. Verify response 409 Conflict:
   ```json
   {
     "success": false,
     "error": "Idempotency key already used for different request"
   }
   ```

**Test 5d: Idempotency Key Expiry**
1. Use idempotency key older than 24 hours
2. Attempt POST with expired key
3. Verify request processes as new (key expired)

**Time:** 6 minutes

---

### TC-API-006: Optimistic Locking - Version Conflicts
**Objective:** Verify version field prevents concurrent update conflicts
**Steps:**

**Test 6a: Successful Update with Correct Version**
1. GET `/api/funds/1`
2. Note `version: 5`
3. PUT `/api/funds/1`
   ```json
   {
     "name": "Updated Name",
     "version": 5
   }
   ```
4. Verify response 200
5. Verify returned `version: 6` (incremented)

**Test 6b: Update with Stale Version**
1. GET `/api/funds/1`
2. Note `version: 6`
3. Simulate concurrent update (another user updates fund to version 7)
4. Attempt PUT `/api/funds/1`
   ```json
   {
     "name": "My Update",
     "version": 6
   }
   ```
   (Stale version)
5. Verify response 409 Conflict:
   ```json
   {
     "success": false,
     "error": "Version conflict. Resource has been modified by another user.",
     "currentVersion": 7
   }
   ```

**Test 6c: Missing Version Field**
1. PUT `/api/funds/1`
   ```json
   {
     "name": "Update Without Version"
   }
   ```
   (No `version` field)
2. Verify response 400:
   ```json
   {
     "success": false,
     "error": "Version field required for updates"
   }
   ```

**Time:** 5 minutes

---

### TC-API-007: Rate Limiting
**Objective:** Verify API rate limits enforce request throttling
**Steps:**

**Test 7a: Normal Usage (Under Limit)**
1. Make 50 API calls to `/api/funds` within 1 minute
2. Verify all return 200 (under limit of 100/min)

**Test 7b: Exceed Rate Limit**
1. Make 101 API calls to `/api/funds` within 1 minute
2. Verify 101st request returns 429:
   ```json
   {
     "success": false,
     "error": "Rate limit exceeded. Try again in 60 seconds."
   }
   ```
3. Verify response headers:
   - `X-RateLimit-Limit: 100`
   - `X-RateLimit-Remaining: 0`
   - `Retry-After: 60`

**Test 7c: Rate Limit Reset**
1. After receiving 429, wait 60 seconds
2. Attempt API call again
3. Verify response 200 (limit reset)

**Test 7d: Different Endpoints (Separate Limits)**
1. Exceed limit on `/api/funds` → 429
2. Immediately call `/api/portfolio/companies`
3. Verify response 200 (different endpoint, different limit)

**Time:** 8 minutes (includes wait time)

---

### TC-API-008: Error Handling - 404 Not Found
**Objective:** Verify 404 responses for non-existent resources
**Steps:**

**Test 8a: Non-Existent Resource ID**
1. GET `/api/funds/99999`
2. Verify response 404:
   ```json
   {
     "success": false,
     "error": "Fund not found"
   }
   ```

**Test 8b: Non-Existent Nested Resource**
1. GET `/api/funds/1/companies/99999`
2. Verify response 404:
   ```json
   {
     "success": false,
     "error": "Company not found in this fund"
   }
   ```

**Test 8c: Invalid Route**
1. GET `/api/nonexistent-endpoint`
2. Verify response 404:
   ```json
   {
     "success": false,
     "error": "Endpoint not found"
   }
   ```

**Time:** 3 minutes

---

### TC-API-009: Authorization - Role-Based Access Control
**Objective:** Verify RBAC prevents unauthorized actions
**Steps:**

**Test 9a: GP Access (Full Permissions)**
1. Login as GP user
2. POST `/api/funds` (create fund)
3. Verify response 201 (allowed)

**Test 9b: LP Access (Restricted)**
1. Login as LP user
2. POST `/api/funds`
3. Verify response 403:
   ```json
   {
     "success": false,
     "error": "Insufficient permissions. GP role required."
   }
   ```

**Test 9c: LP Read-Only Access**
1. Login as LP user
2. GET `/api/lp/capital-account`
3. Verify response 200 (LP can view own data)
4. GET `/api/lp/capital-account/{other-lp-id}`
5. Verify response 403 (LP cannot view other LP data)

**Time:** 4 minutes

---

### TC-API-010: Content Negotiation
**Objective:** Verify API handles different content types
**Steps:**

**Test 10a: JSON Request**
1. POST `/api/funds`
   Header: `Content-Type: application/json`
   Body: JSON payload
2. Verify response 201

**Test 10b: Unsupported Content Type**
1. POST `/api/funds`
   Header: `Content-Type: application/xml`
   Body: XML payload
2. Verify response 415 Unsupported Media Type:
   ```json
   {
     "success": false,
     "error": "Content-Type must be application/json"
   }
   ```

**Test 10c: Missing Content-Type**
1. POST `/api/funds` (no Content-Type header)
2. Verify response 400 or defaults to JSON parsing

**Time:** 3 minutes

---

### TC-API-011: CORS - Cross-Origin Requests
**Objective:** Verify CORS headers allow frontend access
**Steps:**

**Test 11a: Preflight Request (OPTIONS)**
1. OPTIONS `/api/funds`
   Header: `Origin: http://localhost:5173`
2. Verify response 204
3. Verify CORS headers:
   - `Access-Control-Allow-Origin: http://localhost:5173`
   - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE`
   - `Access-Control-Allow-Headers: Content-Type, Authorization`

**Test 11b: Actual Request with Origin**
1. GET `/api/funds`
   Header: `Origin: http://localhost:5173`
2. Verify response 200
3. Verify header: `Access-Control-Allow-Origin: http://localhost:5173`

**Test 11c: Unauthorized Origin**
1. GET `/api/funds`
   Header: `Origin: http://malicious-site.com`
2. Verify CORS headers NOT present (origin blocked)

**Time:** 4 minutes

---

### TC-API-012: SQL Injection Prevention
**Objective:** Verify API prevents SQL injection attacks
**Steps:**

**Test 12a: SQL Injection in Query Params**
1. GET `/api/funds?name='; DROP TABLE funds; --`
2. Verify response 400 or 200 with no results
3. Verify `funds` table still exists (not dropped)

**Test 12b: SQL Injection in POST Body**
1. POST `/api/portfolio/companies`
   ```json
   {
     "name": "'; DELETE FROM portfolio_companies; --"
   }
   ```
2. Verify company created with literal name (not executed as SQL)
3. Verify no data deleted

**Test 12c: Parameterized Queries**
1. Review API code
2. Verify all database queries use Drizzle ORM (parameterized)
3. Verify no raw SQL concatenation (e.g., `WHERE id = ${userId}`)

**Time:** 4 minutes

---

### TC-API-013: XSS Prevention
**Objective:** Verify API sanitizes inputs to prevent XSS
**Steps:**

**Test 13a: XSS in Text Field**
1. POST `/api/portfolio/companies`
   ```json
   {
     "name": "<script>alert('XSS')</script>"
   }
   ```
2. Verify company created
3. GET `/api/portfolio/companies/{id}`
4. Verify response sanitizes script:
   - Escaped: `&lt;script&gt;alert('XSS')&lt;/script&gt;`
   - OR rejected during validation

**Test 13b: XSS in Rich Text Fields**
1. POST `/api/notes`
   ```json
   {
     "content": "<img src=x onerror=alert('XSS')>"
   }
   ```
2. Verify dangerous HTML stripped or escaped

**Time:** 3 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] JWT authentication required for protected endpoints
- [ ] Zod validation enforces all field constraints
- [ ] Response format consistent (`{success, data/error}`)
- [ ] Cursor pagination works (no offset-based)
- [ ] Idempotency keys prevent duplicate POSTs
- [ ] Optimistic locking detects version conflicts
- [ ] Rate limiting returns 429 after exceeding limits
- [ ] 404 errors for non-existent resources
- [ ] RBAC enforces role-based permissions
- [ ] CORS headers allow frontend access
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (sanitized inputs)

---

## Anti-Pattern Verification

**Reference:** [cheatsheets/anti-pattern-prevention.md](../../cheatsheets/anti-pattern-prevention.md)

Verify the following anti-patterns are NOT present:

- [ ] No in-memory idempotency (must use database)
- [ ] No missing version field on updates
- [ ] No integer-based cursor pagination
- [ ] No unbounded list endpoints (must have limit)
- [ ] No missing timeout on BullMQ jobs
- [ ] No raw SQL concatenation (use Drizzle ORM)
- [ ] No unvalidated user inputs (Zod required)

---

## Performance Benchmarks

| Endpoint                     | Target Response Time | Current Performance |
|------------------------------|----------------------|---------------------|
| GET /api/funds               | <100ms               | TBD                 |
| GET /api/portfolio/companies | <200ms               | TBD                 |
| POST /api/portfolio/investments | <300ms            | TBD                 |
| GET /api/reports/performance | <500ms               | TBD                 |
| POST /api/monte-carlo/run    | <5000ms (background) | TBD                 |

---

## Testing Tools

**Recommended:**
- **Postman** - Manual API testing, collections
- **curl** - Command-line testing
- **Vitest** - Automated integration tests
- **Supertest** - HTTP assertion library

**Example curl Request:**
```bash
curl -X POST http://localhost:5000/api/funds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "name": "Test Fund II",
    "size": 50000000,
    "vintage": 2024
  }'
```

---

## Related Documentation

- [server/routes/](../../server/routes/) - API route implementations
- [shared/schemas/](../../shared/schemas/) - Zod validation schemas
- [cheatsheets/api-conventions.md](../../cheatsheets/api-conventions.md) - API design patterns
- [cheatsheets/anti-pattern-prevention.md](../../cheatsheets/anti-pattern-prevention.md) - Anti-patterns to avoid
