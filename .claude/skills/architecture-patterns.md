---
status: ACTIVE
last_updated: 2026-01-19
---

# Architecture Patterns

## Overview

Master proven backend architecture patterns including Clean Architecture,
Hexagonal Architecture, and Domain-Driven Design to build maintainable,
testable, and scalable VC fund modeling systems. This skill provides specific
guidance for implementing these patterns in the context of portfolio management,
waterfall calculations, reserve allocations, and Monte Carlo simulations.

## When to Use

- Designing new backend systems for fund/portfolio/scenario domains
- Refactoring monolithic calculation engines for better maintainability
- Establishing architecture standards for VC fund platform
- Migrating from tightly coupled to loosely coupled architectures
- Implementing domain-driven design for financial modeling
- Creating testable calculation engines with mockable dependencies
- Planning microservices decomposition for worker processes

## Core Concepts

### 1. Clean Architecture (Uncle Bob)

**Layers (dependency flows inward):**

- **Entities**: Core business models (Fund, Portfolio, Company, Waterfall)
- **Use Cases**: Application business rules (CalculateReserves, ProcessPacing,
  RunMonteCarlo)
- **Interface Adapters**: Controllers, presenters, repository implementations
- **Frameworks & Drivers**: Express, PostgreSQL, Redis, BullMQ

**Key Principles:**

- Dependencies point inward (domain never depends on infrastructure)
- Inner layers know nothing about outer layers
- Business logic independent of frameworks
- Testable without UI, database, or external services

**VC Fund Example:**

```
WaterfallEngine (domain) → IFundRepository (interface)
                        → PostgresFundRepository (adapter)
```

### 2. Hexagonal Architecture (Ports and Adapters)

**Components:**

- **Domain Core**: ReserveEngine, PacingEngine, CohortEngine
- **Ports**: IFundRepository, IMonteCarloService, INotificationService
- **Adapters**: PostgreSQL repositories, BullMQ workers, REST controllers

**Benefits:**

- Swap implementations easily (mock for testing, Redis vs Postgres)
- Technology-agnostic calculation engines
- Clear separation of financial logic from infrastructure

**VC Fund Example:**

```typescript
// Port (interface)
interface IWaterfallCalculator {
  calculate(waterfall: Waterfall, proceeds: number): Distribution;
}

// Adapter 1: In-memory calculator
class SynchronousWaterfallCalculator implements IWaterfallCalculator {
  calculate(waterfall: Waterfall, proceeds: number): Distribution {
    // Fast, synchronous calculation
  }
}

// Adapter 2: Worker-based calculator
class AsyncWaterfallCalculator implements IWaterfallCalculator {
  async calculate(
    waterfall: Waterfall,
    proceeds: number
  ): Promise<Distribution> {
    // BullMQ job for complex scenarios
  }
}
```

### 3. Domain-Driven Design (DDD)

**Strategic Patterns:**

- **Bounded Contexts**: Fund Management, Portfolio Tracking, Scenario Planning,
  Reserve Allocation
- **Context Mapping**: How Fund context relates to Scenario context
- **Ubiquitous Language**: LP, GP, carry, hurdle, DPI, TVPI, MOIC

**Tactical Patterns:**

- **Entities**: Fund, Portfolio, Company (have identity, mutable)
- **Value Objects**: Money, Waterfall, PacingSchedule (immutable, defined by
  attributes)
- **Aggregates**: Fund aggregate (includes Allocations, Reserves)
- **Repositories**: FundRepository, PortfolioRepository
- **Domain Events**: FundClosed, AllocationCreated, ReserveCalculated

**VC Fund Bounded Contexts:**

```
Fund Management Context:
  - Fund, Capital Calls, Distributions
  - GP, LP relationships
  - Fee calculations

Portfolio Context:
  - Companies, Valuations, Exits
  - Ownership percentages
  - Performance metrics

Scenario Planning Context:
  - What-if scenarios
  - Monte Carlo simulations
  - Comparison analytics
```

## Clean Architecture Pattern (VC Fund Implementation)

### Directory Structure (TypeScript)

```
server/
├── domain/                    # Entities & business rules
│   ├── entities/
│   │   ├── Fund.ts           # Fund aggregate root
│   │   ├── Portfolio.ts      # Portfolio entity
│   │   ├── Company.ts        # Company entity
│   │   └── Scenario.ts       # Scenario entity
│   ├── value-objects/
│   │   ├── Money.ts          # Immutable Money type
│   │   ├── Waterfall.ts      # Waterfall configuration
│   │   └── Percentage.ts     # Validated percentage (0-1)
│   └── interfaces/           # Abstract interfaces (ports)
│       ├── IFundRepository.ts
│       ├── IMonteCarloService.ts
│       └── INotificationService.ts
├── use-cases/                # Application business rules
│   ├── CalculateReserves.ts
│   ├── ProcessPacing.ts
│   ├── RunMonteCarlo.ts
│   └── CalculateWaterfall.ts
├── adapters/                 # Interface implementations
│   ├── repositories/
│   │   ├── PostgresFundRepository.ts
│   │   └── RedisCacheRepository.ts
│   ├── controllers/
│   │   └── FundController.ts
│   └── services/
│       ├── BullMQMonteCarloService.ts
│       └── SendGridNotificationService.ts
└── infrastructure/           # Framework & external concerns
    ├── database.ts
    ├── redis.ts
    └── queue.ts

client/src/core/              # Frontend calculation engines
├── ReserveEngine.ts          # Domain logic (framework-independent)
├── PacingEngine.ts
└── CohortEngine.ts
```

### Implementation Example: Waterfall Calculation

```typescript
// domain/value-objects/Waterfall.ts
// No framework dependencies - pure business logic
import { z } from 'zod';

export const WaterfallSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('AMERICAN'),
    hurdle: z.number().min(0).max(1),
    catchUp: z.number().min(0).max(1),
    carryPercent: z.number().min(0).max(0.3),
  }),
  z.object({
    type: z.literal('EUROPEAN'),
    hurdle: z.number().min(0).max(1),
    carryPercent: z.number().min(0).max(0.3),
    carryVesting: z.object({
      vestedPercent: z.number().min(0).max(1),
      vestingSchedule: z.string(),
    }),
  }),
]);

export type Waterfall = z.infer<typeof WaterfallSchema>;

// domain/value-objects/Distribution.ts
export interface Distribution {
  returnOfCapital: number;
  preferredReturn: number;
  catchUp: number;
  carryToGP: number;
  excessToLP: number;
  lpTotal: number;
  gpTotal: number;
}

// domain/interfaces/IWaterfallCalculator.ts
// Port: defines contract, no implementation
export interface IWaterfallCalculator {
  calculate(
    waterfall: Waterfall,
    proceeds: number,
    committedCapital: number
  ): Distribution;
}

// use-cases/CalculateWaterfall.ts
// Use case: orchestrates business logic
export class CalculateWaterfallUseCase {
  constructor(
    private readonly calculator: IWaterfallCalculator,
    private readonly fundRepository: IFundRepository
  ) {}

  async execute(fundId: string, proceeds: number): Promise<Distribution> {
    // Retrieve fund entity
    const fund = await this.fundRepository.findById(fundId);
    if (!fund) {
      throw new NotFoundError('Fund not found');
    }

    // Business validation
    if (proceeds < 0) {
      throw new ValidationError('Proceeds must be non-negative');
    }

    // Delegate to domain service
    const distribution = this.calculator.calculate(
      fund.waterfall,
      proceeds,
      fund.committedCapital
    );

    return distribution;
  }
}

// adapters/services/AmericanWaterfallCalculator.ts
// Adapter: Concrete implementation of port
export class AmericanWaterfallCalculator implements IWaterfallCalculator {
  calculate(
    waterfall: Waterfall,
    proceeds: number,
    committedCapital: number
  ): Distribution {
    if (waterfall.type !== 'AMERICAN') {
      throw new Error('Invalid waterfall type');
    }

    // Pure business logic - no framework dependencies
    const hurdleAmount = committedCapital * (1 + waterfall.hurdle);
    const returnOfCapital = Math.min(proceeds, committedCapital);
    const remainingAfterROC = Math.max(0, proceeds - committedCapital);

    const preferredReturn = Math.min(
      remainingAfterROC,
      committedCapital * waterfall.hurdle
    );
    const remainingAfterPref = Math.max(0, remainingAfterROC - preferredReturn);

    const catchUpCap =
      (preferredReturn * waterfall.carryPercent) / (1 - waterfall.carryPercent);
    const catchUp = Math.min(remainingAfterPref, catchUpCap);
    const remainingAfterCatchUp = Math.max(0, remainingAfterPref - catchUp);

    const carryToGP = catchUp + remainingAfterCatchUp * waterfall.carryPercent;
    const excessToLP = remainingAfterCatchUp * (1 - waterfall.carryPercent);

    const lpTotal = returnOfCapital + preferredReturn + excessToLP;
    const gpTotal = carryToGP;

    return {
      returnOfCapital,
      preferredReturn,
      catchUp,
      carryToGP,
      excessToLP,
      lpTotal,
      gpTotal,
    };
  }
}

// adapters/controllers/WaterfallController.ts
// Controller: handles HTTP concerns only
import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const CalculateWaterfallRequestSchema = z.object({
  fundId: z.string().uuid(),
  proceeds: z.number().positive(),
});

router.post('/api/waterfalls/calculate', async (req, res, next) => {
  try {
    // Validation
    const { fundId, proceeds } = CalculateWaterfallRequestSchema.parse(
      req.body
    );

    // Dependency injection (from DI container)
    const useCase = req.container.resolve<CalculateWaterfallUseCase>(
      'CalculateWaterfallUseCase'
    );

    // Execute use case
    const distribution = await useCase.execute(fundId, proceeds);

    // HTTP response
    res.json(distribution);
  } catch (error) {
    next(error);
  }
});

export default router;
```

## Hexagonal Architecture Pattern (VC Fund Example)

```typescript
// Core domain (hexagon center) - NO infrastructure dependencies
// client/src/core/ReserveEngine.ts
export class ReserveEngine {
  constructor(
    private readonly reserveRepository: IReserveRepository,
    private readonly allocationService: IAllocationService,
    private readonly notificationService: INotificationService
  ) {}

  async calculateReserves(
    fundId: string,
    portfolioCompanies: Company[]
  ): Promise<ReserveAllocation[]> {
    // Business logic (pure domain)
    const reserves: ReserveAllocation[] = [];

    for (const company of portfolioCompanies) {
      if (!company.requiresReserve()) {
        continue;
      }

      const allocation = this.allocationService.calculateOptimalAllocation(
        company.stage,
        company.ownership,
        company.valuation
      );

      reserves.push({
        companyId: company.id,
        amount: allocation.amount,
        confidenceLevel: allocation.confidence,
      });
    }

    // Use ports (interfaces)
    const savedReserves = await this.reserveRepository.saveAll(reserves);

    await this.notificationService.send({
      to: fundId,
      subject: 'Reserve calculation complete',
      body: `Calculated ${reserves.length} reserve allocations`,
    });

    return savedReserves;
  }
}

// Ports (interfaces) - Define contracts
export interface IReserveRepository {
  saveAll(reserves: ReserveAllocation[]): Promise<ReserveAllocation[]>;
  findByFundId(fundId: string): Promise<ReserveAllocation[]>;
}

export interface IAllocationService {
  calculateOptimalAllocation(
    stage: CompanyStage,
    ownership: number,
    valuation: number
  ): { amount: number; confidence: number };
}

export interface INotificationService {
  send(notification: {
    to: string;
    subject: string;
    body: string;
  }): Promise<void>;
}

// Adapters (implementations) - Connect to external systems
// adapters/repositories/PostgresReserveRepository.ts
export class PostgresReserveRepository implements IReserveRepository {
  constructor(private readonly db: Database) {}

  async saveAll(reserves: ReserveAllocation[]): Promise<ReserveAllocation[]> {
    // PostgreSQL-specific implementation
    const result = await this.db.transaction(async (tx) => {
      return Promise.all(
        reserves.map((reserve) =>
          tx.insert(reservesTable).values(reserve).returning()
        )
      );
    });

    return result.flat();
  }

  async findByFundId(fundId: string): Promise<ReserveAllocation[]> {
    return this.db
      .select()
      .from(reservesTable)
      .where(eq(reservesTable.fundId, fundId));
  }
}

// adapters/services/MockAllocationService.ts (for testing)
export class MockAllocationService implements IAllocationService {
  calculateOptimalAllocation(
    stage: CompanyStage,
    ownership: number,
    valuation: number
  ): { amount: number; confidence: number } {
    // Test adapter: no external dependencies
    return {
      amount: valuation * ownership * 0.2,
      confidence: 0.85,
    };
  }
}

// adapters/services/SendGridNotificationService.ts (production)
export class SendGridNotificationService implements INotificationService {
  constructor(private readonly sendgrid: SendGridClient) {}

  async send(notification: {
    to: string;
    subject: string;
    body: string;
  }): Promise<void> {
    await this.sendgrid.send({
      to: notification.to,
      from: 'noreply@fundplatform.com',
      subject: notification.subject,
      text: notification.body,
    });
  }
}
```

## Domain-Driven Design Pattern (VC Fund Domain)

### Value Objects (Immutable)

```typescript
// domain/value-objects/Money.ts
import { z } from 'zod';

export const MoneySchema = z.object({
  amount: z.number().int(), // cents
  currency: z.enum(['USD', 'EUR', 'GBP']),
});

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string
  ) {}

  static fromCents(cents: number, currency: string = 'USD'): Money {
    return new Money(cents, currency);
  }

  static fromDollars(dollars: number, currency: string = 'USD'): Money {
    return new Money(Math.round(dollars * 100), currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  toDollars(): number {
    return this.amount / 100;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}

// domain/value-objects/Percentage.ts
export class Percentage {
  private constructor(public readonly value: number) {
    if (value < 0 || value > 1) {
      throw new Error('Percentage must be between 0 and 1');
    }
  }

  static fromDecimal(value: number): Percentage {
    return new Percentage(value);
  }

  static fromPercent(percent: number): Percentage {
    return new Percentage(percent / 100);
  }

  toPercent(): number {
    return this.value * 100;
  }

  multiply(amount: number): number {
    return amount * this.value;
  }
}
```

### Entities (With Identity)

```typescript
// domain/entities/Fund.ts
import { z } from 'zod';
import { Money } from '../value-objects/Money';
import { Waterfall } from '../value-objects/Waterfall';

export class Fund {
  private _allocations: Allocation[] = [];
  private _events: DomainEvent[] = [];

  constructor(
    public readonly id: string,
    public name: string,
    public committedCapital: Money,
    public waterfall: Waterfall,
    public version: number = 0
  ) {}

  // Business logic in entity
  addAllocation(company: Company, amount: Money, stage: CompanyStage): void {
    // Business rule: cannot exceed committed capital
    const totalAllocated = this._allocations.reduce(
      (sum, a) => sum + a.amount.amount,
      0
    );

    if (totalAllocated + amount.amount > this.committedCapital.amount) {
      throw new Error('Allocation exceeds committed capital');
    }

    const allocation = new Allocation(company.id, amount, stage);
    this._allocations.push(allocation);

    // Domain event
    this._events.push(new AllocationCreatedEvent(this.id, allocation));
  }

  closeInvestmentPeriod(): void {
    // State transition with business rules
    if (this._allocations.length === 0) {
      throw new Error('Cannot close fund with no allocations');
    }

    this._events.push(new FundClosedEvent(this.id));
  }

  // Calculated property
  get totalDeployed(): Money {
    return this._allocations.reduce(
      (sum, a) => sum.add(a.amount),
      Money.fromCents(0)
    );
  }

  // Expose events for publishing
  get domainEvents(): DomainEvent[] {
    return [...this._events];
  }

  clearEvents(): void {
    this._events = [];
  }
}
```

### Aggregates (Consistency Boundary)

```typescript
// domain/aggregates/Portfolio.ts
export class Portfolio {
  private _companies: Map<string, Company> = new Map();
  private _valuations: Map<string, Valuation[]> = new Map();

  constructor(
    public readonly id: string,
    public readonly fundId: string
  ) {}

  // Aggregate enforces invariants
  addCompany(company: Company): void {
    if (this._companies.has(company.id)) {
      throw new Error('Company already exists in portfolio');
    }

    // Business rule: max 30 companies per portfolio
    if (this._companies.size >= 30) {
      throw new Error('Portfolio cannot exceed 30 companies');
    }

    this._companies.set(company.id, company);
    this._valuations.set(company.id, []);
  }

  recordValuation(companyId: string, valuation: Valuation): void {
    const company = this._companies.get(companyId);
    if (!company) {
      throw new Error('Company not found in portfolio');
    }

    // Business rule: valuations must be chronological
    const existing = this._valuations.get(companyId) || [];
    const lastValuation = existing[existing.length - 1];

    if (lastValuation && valuation.date <= lastValuation.date) {
      throw new Error('Valuation date must be after previous valuation');
    }

    existing.push(valuation);
  }

  calculateMOIC(): number {
    let totalInvested = 0;
    let totalValue = 0;

    for (const [companyId, company] of this._companies) {
      totalInvested += company.investedAmount;

      const valuations = this._valuations.get(companyId) || [];
      const latestValuation = valuations[valuations.length - 1];
      totalValue += latestValuation?.fairValue || company.investedAmount;
    }

    return totalValue / totalInvested;
  }
}
```

### Domain Events

```typescript
// domain/events/FundClosedEvent.ts
export class FundClosedEvent {
  public readonly occurredAt: Date;

  constructor(
    public readonly fundId: string,
    public readonly metadata?: Record<string, unknown>
  ) {
    this.occurredAt = new Date();
  }
}

// domain/events/AllocationCreatedEvent.ts
export class AllocationCreatedEvent {
  public readonly occurredAt: Date;

  constructor(
    public readonly fundId: string,
    public readonly allocation: Allocation
  ) {
    this.occurredAt = new Date();
  }
}
```

### Repository (Aggregate Persistence)

```typescript
// domain/interfaces/IFundRepository.ts
export interface IFundRepository {
  findById(fundId: string): Promise<Fund | null>;
  save(fund: Fund): Promise<Fund>;
  delete(fundId: string): Promise<boolean>;
}

// adapters/repositories/PostgresFundRepository.ts
export class PostgresFundRepository implements IFundRepository {
  constructor(
    private readonly db: Database,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async findById(fundId: string): Promise<Fund | null> {
    // Reconstitute aggregate from storage
    const row = await this.db
      .select()
      .from(fundsTable)
      .where(eq(fundsTable.id, fundId))
      .limit(1);

    if (!row[0]) return null;

    // Load allocations (part of aggregate)
    const allocations = await this.db
      .select()
      .from(allocationsTable)
      .where(eq(allocationsTable.fundId, fundId));

    return this.toEntity(row[0], allocations);
  }

  async save(fund: Fund): Promise<Fund> {
    // Persist aggregate and publish events
    await this.db.transaction(async (tx) => {
      // Update fund
      await tx
        .update(fundsTable)
        .set({
          name: fund.name,
          committedCapital: fund.committedCapital.amount,
          waterfall: fund.waterfall,
          version: fund.version + 1,
        })
        .where(eq(fundsTable.id, fund.id));

      // Publish domain events
      for (const event of fund.domainEvents) {
        await this.eventPublisher.publish(event);
      }
    });

    fund.clearEvents();
    return fund;
  }

  private toEntity(row: FundRow, allocations: AllocationRow[]): Fund {
    // Map database rows to domain entity
    const fund = new Fund(
      row.id,
      row.name,
      Money.fromCents(row.committedCapital),
      row.waterfall,
      row.version
    );

    // Reconstitute allocations without triggering events
    for (const allocation of allocations) {
      fund['_allocations'].push(this.toAllocation(allocation));
    }

    return fund;
  }
}
```

## Integration with VC Fund Platform

### Current Codebase Mapping

**Existing Patterns:**

```
client/src/core/ReserveEngine.ts   → Domain Logic (framework-independent)
client/src/core/PacingEngine.ts    → Domain Logic (framework-independent)
client/src/core/CohortEngine.ts    → Domain Logic (framework-independent)

server/routes/funds.ts             → Controllers (HTTP adapters)
shared/schemas/fund.ts             → Zod schemas (validation layer)
server/storage/                    → Repository adapters
```

**Recommended Refactoring:**

```
BEFORE:
server/routes/funds.ts (300 lines - business logic + HTTP)

AFTER:
server/domain/entities/Fund.ts           (business rules)
server/use-cases/CreateFund.ts           (orchestration)
server/adapters/controllers/FundController.ts (HTTP only)
```

### BullMQ Worker Pattern (Hexagonal)

```typescript
// domain/interfaces/IMonteCarloService.ts (port)
export interface IMonteCarloService {
  runSimulation(
    scenarioId: string,
    iterations: number
  ): Promise<SimulationResult>;
}

// adapters/workers/BullMQMonteCarloWorker.ts (adapter)
import { Worker } from 'bullmq';

export class BullMQMonteCarloWorker {
  private worker: Worker;

  constructor(
    private readonly monteCarloService: IMonteCarloService,
    private readonly redisConnection: RedisConnection
  ) {
    this.worker = new Worker(
      'monte-carlo-queue',
      async (job) => {
        const { scenarioId, iterations } = job.data;
        return await this.monteCarloService.runSimulation(
          scenarioId,
          iterations
        );
      },
      { connection: this.redisConnection }
    );
  }
}

// use-cases/RunMonteCarloSimulation.ts (use case)
export class RunMonteCarloSimulationUseCase {
  constructor(
    private readonly monteCarloService: IMonteCarloService,
    private readonly scenarioRepository: IScenarioRepository
  ) {}

  async execute(scenarioId: string, iterations: number): Promise<string> {
    // Validate scenario exists
    const scenario = await this.scenarioRepository.findById(scenarioId);
    if (!scenario) {
      throw new NotFoundError('Scenario not found');
    }

    // Queue job (async processing)
    const jobId = await this.monteCarloService.runSimulation(
      scenarioId,
      iterations
    );

    return jobId;
  }
}
```

## Best Practices for VC Fund Platform

### 1. Dependency Rule

- **Domain layer** (entities, value objects) has ZERO dependencies on
  infrastructure
- **Use case layer** depends only on domain + interfaces
- **Adapter layer** implements interfaces defined in domain

### 2. Immutable Value Objects

- `Money`, `Percentage`, `Waterfall` are immutable
- Use factory methods for construction
- Encapsulate validation logic

### 3. Rich Domain Models

- Business logic lives in entities (`Fund.addAllocation()`)
- Avoid anemic domain models (DTOs with no behavior)
- Use domain events for side effects

### 4. Repository Pattern

- One repository per aggregate root
- Return domain entities, not database rows
- Handle transaction boundaries

### 5. Testing Strategy

```typescript
// Domain tests: No mocks needed (pure functions)
describe('Money', () => {
  it('should add two amounts with same currency', () => {
    const m1 = Money.fromDollars(100);
    const m2 = Money.fromDollars(50);
    expect(m1.add(m2)).toEqual(Money.fromDollars(150));
  });
});

// Use case tests: Mock adapters (interfaces)
describe('CreateFundUseCase', () => {
  it('should create fund with valid input', async () => {
    const mockRepo = createMock<IFundRepository>();
    const useCase = new CreateFundUseCase(mockRepo);

    const result = await useCase.execute({
      name: 'Fund I',
      committedCapital: 100_000_000,
    });

    expect(mockRepo.save).toHaveBeenCalledOnce();
  });
});
```

## Integration with Other Skills

### With api-design-principles

- **Clean Architecture endpoints**: Controllers delegate to use cases
- **Zod validation**: Happens in adapter layer, not domain
- **Optimistic locking**: Version field on entities

### With systematic-debugging

- **Layer isolation**: Identify which layer has the bug
- **Domain bugs**: Pure logic, easy to reproduce in tests
- **Adapter bugs**: Infrastructure issues (database, Redis)

### With pattern-recognition

- **Detect anemic domain**: Entities with only getters/setters
- **Repository pattern violations**: Direct database queries in controllers
- **Missing abstractions**: Concrete dependencies in use cases

## Common Pitfalls

### Anemic Domain Model

```typescript
// BAD: No business logic
class Fund {
  id: string;
  name: string;
  committedCapital: number;
}

// GOOD: Business logic in entity
class Fund {
  id: string;
  name: string;
  committedCapital: Money;

  addAllocation(company: Company, amount: Money): void {
    // Validation + business rules
  }
}
```

### Framework Coupling

```typescript
// BAD: Domain depends on Express
import { Request, Response } from 'express';

class Fund {
  toJSON(res: Response): void {
    /* ... */
  }
}

// GOOD: Domain is framework-agnostic
class Fund {
  toDTO(): FundDTO {
    return { id: this.id, name: this.name };
  }
}
```

### Fat Controllers

```typescript
// BAD: Business logic in controller
router.post('/api/funds', async (req, res) => {
  const fund = await db.insert(fundsTable).values(req.body);
  const allocations = await calculateAllocations(fund); // Business logic!
  res.json(fund);
});

// GOOD: Delegate to use case
router.post('/api/funds', async (req, res) => {
  const useCase = container.resolve(CreateFundUseCase);
  const fund = await useCase.execute(req.body);
  res.json(fund);
});
```

## Resources

**Project Documentation:**

- `DECISIONS.md` - Architectural decisions
- `cheatsheets/api-design-principles.md` - REST API patterns
- `client/src/lib/waterfall.ts` - Waterfall update helpers (domain logic)

**Testing Examples:**

- `client/src/lib/__tests__/waterfall.test.ts` - Domain logic tests
- `tests/api/` - Integration tests (adapter layer)

**External References:**

- Clean Architecture (Robert C. Martin)
- Domain-Driven Design (Eric Evans)
- Hexagonal Architecture (Alistair Cockburn)

## Summary

**Key Takeaways:**

1. **Clean Architecture**: Dependencies flow inward (domain is isolated)
2. **Hexagonal Architecture**: Ports (interfaces) + Adapters (implementations)
3. **Domain-Driven Design**: Rich domain models with business logic
4. **VC Fund Context**: Fund, Portfolio, Scenario as bounded contexts
5. **Testing**: Domain (pure functions), Use Cases (mocked adapters),
   Integration (end-to-end)

**When to Apply:**

- New feature with complex business rules → Use cases + domain entities
- Calculation engine → Hexagonal (port for sync/async adapters)
- Multi-entity operations → Aggregates with consistency boundaries
- Infrastructure changes → Adapters hide implementation details

**Start Small:**

1. Identify one complex business rule (e.g., waterfall calculation)
2. Extract to domain entity or value object
3. Define interface (port) for external dependencies
4. Implement adapter (PostgreSQL, Redis, BullMQ)
5. Write tests for domain logic (no mocks needed)
6. Gradually expand to other features
