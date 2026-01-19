---
status: ACTIVE
last_updated: 2026-01-19
---

# Project Standards and Conventions

## Core Architecture Decisions

### Database & Migrations
- **Source of Truth**: Raw SQL migrations with UP/DOWN pairs
- **Location**: `server/db/migrations/*.sql` and `server/db/migrations/rollback/*.sql`
- **ORM**: Drizzle for client queries, but SQL migrations are authoritative
- **Versioning**: Sequential numbering (0001, 0002, etc.)

### Authentication & Security
- **Context Source**: JWT claims only (no header trust)
- **RLS Enforcement**: Request-scoped transactions with `SET LOCAL app.current_*`
- **Multi-tenancy**: Enforced at database level via RLS policies
- **Session Management**: JWT with secure HttpOnly cookies

### API Contracts
- **Contract Definition**: OpenAPI 3.0 specifications
- **Type Generation**: Auto-generated TypeScript types from OpenAPI
- **Validation**: CI diff check to prevent breaking changes
- **Location**: `server/openapi/*.yaml`

### Observability
- **Metrics**: Prometheus with `prom-client`
- **Endpoint**: `/metrics` for scraping
- **Alerts**: Defined in `observability/alerts.yml`
- **Logging**: Structured JSON with correlation IDs

### AI/BMAD Integration
- **Role**: CI helpers with strict guardrails
- **Constraints**: Timeouts, budget limits, dry-run by default
- **Location**: `packages/*-agent/` and `scripts/ai-tools/`
- **Activation**: Feature-flagged and progressively rolled out

## Development Workflow

### Code Quality Gates
1. TypeScript strict mode (`npm run check`)
2. ESLint with zero warnings (`npm run lint`)
3. Feature flag validation (`npm run flags:lint`)
4. Schema validation (`npm run schema:check`)
5. OpenAPI contract validation (`npm run api:lint`)

### Concurrency Control
- **Optimistic Locking**: If-Match/ETag headers (RFC 7232)
- **Pessimistic Locking**: PostgreSQL advisory locks for fund operations
- **Idempotency**: Required for all mutating operations

### Testing Requirements
- **Unit Tests**: Required for business logic
- **Integration Tests**: Required for API endpoints
- **Performance Tests**: p95 < 250ms for critical paths
- **Security Tests**: RLS validation for all tenant operations

## Deployment Standards

### Feature Rollout
- **Hierarchy**: user > fund > org > global flags
- **Stages**: internal_test → friendly_gp → beta → ga
- **Monitoring**: Metrics required before promotion

### Performance Budgets
- **API Response**: p95 < 250ms
- **Bundle Size**: < 350KB gzipped per asset
- **Time to Interactive**: < 3s on 3G
- **Error Rate**: < 0.5%

### Rollback Procedures
- **Database**: Every migration must have tested DOWN script
- **Features**: Kill switch via feature flags
- **Deployments**: Blue-green with instant revert capability

## Compliance & Security

### Data Handling
- **PII**: Marked columns with retention policies
- **Audit Trail**: Every mutation logged with correlation ID
- **Access Control**: Row-level security enforced at DB
- **Encryption**: At rest and in transit

### Regulatory
- **GDPR**: Data export and deletion capabilities
- **SOC2**: Audit logging and access controls
- **HIPAA**: Not applicable (no health data)

## Team Responsibilities

| Area | Owner | Backup |
|------|-------|--------|
| RLS & Security | Backend | Platform |
| API Contracts | Platform | Backend |
| BMAD/AI | DevEx | Platform |
| Observability | Platform | SRE |
| Feature Flags | Backend | Frontend |
| Performance | Platform | Backend |

## References
- [RLS Implementation](./security/rls-guide.md)
- [API Development](./api/openapi-guide.md)
- [BMAD Integration](./ai/bmad-guide.md)
- [Deployment Playbooks](./runbooks/)