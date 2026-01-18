---
type: reflection
id: REFL-015
title: PostgreSQL Service Missing Test Database
status: DRAFT
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: [ECONNREFUSED, database_does_not_exist]
components: [ci, database, postgresql, github-actions]
keywords: [postgresql, test-database, ci, github-actions, docker, service-container]
test_file: tests/regressions/REFL-015.test.ts
superseded_by: null
---

# Reflection: PostgreSQL Service Missing Test Database

## 1. The Anti-Pattern (The Trap)

**Context:** CI workflows assume PostgreSQL service containers have a `test` database pre-created, but GitHub Actions PostgreSQL service only creates the default `postgres` database.

**How to Recognize This Trap:**
1.  **Error Signal:** `FATAL: database "test" does not exist` in CI; tests pass locally but fail in GitHub Actions
2.  **Code Pattern:** CI configuration using PostgreSQL without database initialization:
    ```yaml
    # ANTI-PATTERN
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        # No POSTGRES_DB specified, uses default "postgres"
    ```
3.  **Mental Model:** "PostgreSQL service is ready after healthcheck." The healthcheck only verifies the server is running, not that required databases exist.

**Financial Impact:** CI failures block all PRs, halting development velocity. Time spent debugging "works locally" issues.

> **DANGER:** Do NOT assume PostgreSQL service containers have application databases pre-created.

## 2. The Verified Fix (The Principle)

**Principle:** Explicitly create required databases in CI setup or use environment variables.

**Implementation Pattern:**
1.  Set `POSTGRES_DB` environment variable to create database on startup
2.  Or add explicit database creation step before tests
3.  Or use template database pattern

```yaml
# VERIFIED IMPLEMENTATION

# Option 1: Set POSTGRES_DB environment variable (simplest)
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: test  # Creates "test" database on startup
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

# Option 2: Explicit creation step
jobs:
  test:
    steps:
      - name: Setup test database
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE test;"
        env:
          PGPASSWORD: postgres

      - name: Run tests
        run: npm test

# Option 3: Use init script (for complex setup)
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- scripts/init-db.sql
CREATE DATABASE test;
CREATE DATABASE test_shadow;
GRANT ALL PRIVILEGES ON DATABASE test TO postgres;
```

**Key Learnings:**
1. `POSTGRES_DB` is the simplest solution for single database
2. Init scripts needed for multiple databases or complex schemas
3. Local Docker Compose may mask this issue if it uses different setup

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-015.test.ts` validates database existence check
*   **Source Session:** Jan 8-18 2026 - CI failure analysis
*   **Related Files:** `.github/workflows/ci.yml`
