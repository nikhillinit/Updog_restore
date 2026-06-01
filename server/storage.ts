import {
  funds,
  portfolioCompanies,
  investments,
  fundMetrics,
  activities,
  users,
  fundConfigs,
  type Fund,
  type FundConfig as StoredFundConfig,
  type PortfolioCompany,
  type Investment,
  type FundMetrics,
  type Activity,
  type User,
  type InsertFund,
  type InsertPortfolioCompany,
  type InsertInvestment,
  type InsertFundMetrics,
  type InsertActivity,
  type InsertUser,
} from '../schema/src/index.js';
import { db } from './db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  getProfessionalDemoRuntimeConfigurationError,
  getStorageConfigurationError,
  resolveStorageBootMode,
} from './storage-runtime-policy';

// Round and performance case types (simplified versions without schema definition)
export interface InvestmentRound {
  id: number;
  name: string;
  date: string;
  valuation: number;
  amount: number;
  ownership: number;
  leadInvestor?: string;
  status?: string;
  type?: string;
}

export interface PerformanceCase {
  id: number;
  name: string;
  exitValuation: number;
  exitDate: string;
  probability: number;
  type?: string;
  description?: string;
}

export type StorageKind = 'memory' | 'database';

export interface StorageCapabilities {
  investmentScenarioWrites: boolean;
}

export interface StorageRuntimeState {
  kind: StorageKind;
  capabilities: StorageCapabilities;
  mockDatabase: boolean;
}

export class UnsupportedStorageOperationError extends Error {
  readonly code = 'UNSUPPORTED_STORAGE_OPERATION';

  constructor(operation: string) {
    super(`${operation} is not supported by the current storage implementation`);
    this.name = 'UnsupportedStorageOperationError';
  }
}

export interface IStorage {
  readonly kind: StorageKind;
  readonly capabilities: StorageCapabilities;

  // Health check methods
  ping(): Promise<boolean>;
  isRedisHealthy?(): Promise<boolean>;

  // User methods
  getUser(_id: number): Promise<User | undefined>;
  getUserByUsername(_username: string): Promise<User | undefined>;
  createUser(_user: InsertUser): Promise<User>;

  // Fund methods
  getAllFunds(): Promise<Fund[]>;
  getFund(_id: number): Promise<Fund | undefined>;
  getFundConfig(_fundId: number): Promise<StoredFundConfig | undefined>;
  createFund(_fund: InsertFund): Promise<Fund>;

  // Portfolio methods
  getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]>;
  getPortfolioCompany(_id: number): Promise<PortfolioCompany | undefined>;
  createPortfolioCompany(_company: InsertPortfolioCompany): Promise<PortfolioCompany>;

  // Investment methods
  getInvestments(fundId?: number): Promise<Investment[]>;
  getInvestment(_id: number): Promise<Investment | undefined>;
  createInvestment(_investment: InsertInvestment): Promise<Investment>;
  addInvestmentRound(
    _investmentId: number,
    _round: Partial<InvestmentRound>
  ): Promise<InvestmentRound>;
  addPerformanceCase(
    _investmentId: number,
    _performanceCase: Partial<PerformanceCase>
  ): Promise<PerformanceCase>;

  // Metrics methods
  getFundMetrics(_fundId: number): Promise<FundMetrics[]>;
  createFundMetrics(_metrics: InsertFundMetrics): Promise<FundMetrics>;

  // Activity methods
  getActivities(fundId?: number | number[]): Promise<Activity[]>;
  createActivity(_activity: InsertActivity): Promise<Activity>;
}

type NormalizedInsertPortfolioCompany = {
  fundId?: number | null;
  name: string;
  sector: string;
  stage: string;
  investmentAmount: string | number;
  currentValuation?: string | number | null;
  foundedYear?: number | null;
  status?: string | null;
  description?: string | null;
  dealTags?: string[] | null;
};

export class MemStorage implements IStorage {
  readonly kind = 'memory' as const;
  readonly capabilities = {
    investmentScenarioWrites: false,
  } as const satisfies StorageCapabilities;

  private users: Map<number, User>;
  private funds: Map<number, Fund>;
  private portfolioCompanies: Map<number, PortfolioCompany>;
  private investments: Map<number, Investment>;
  private fundMetrics: Map<number, FundMetrics>;
  private activities: Map<number, Activity>;
  private currentUserId: number;
  private currentFundId: number;
  private currentCompanyId: number;
  private currentInvestmentId: number;
  private currentMetricsId: number;
  private currentActivityId: number;

  constructor() {
    this.users = new Map();
    this.funds = new Map();
    this.portfolioCompanies = new Map();
    this.investments = new Map();
    this.fundMetrics = new Map();
    this.activities = new Map();
    this.currentUserId = 1;
    this.currentFundId = 1;
    this.currentCompanyId = 1;
    this.currentInvestmentId = 1;
    this.currentMetricsId = 1;
    this.currentActivityId = 1;

    // Initialize with sample data
    this.initializeSampleData();
  }

  async ping(): Promise<boolean> {
    // In-memory storage is always available
    return true;
  }

  async isRedisHealthy(): Promise<boolean> {
    // Redis is optional, return false for in-memory storage
    return false;
  }

  private initializeSampleData() {
    // Sample fund
    const sampleFund: Fund = {
      id: 1,
      name: 'Press On Ventures Fund I',
      size: '100000000',
      deployedCapital: '67500000',
      managementFee: '0.025',
      carryPercentage: '0.20',
      vintageYear: 2020,
      status: 'active',
      engineResults: null,
      createdAt: new Date(),
    };
    this.funds.set(1, sampleFund);
    this.currentFundId = 2;

    // Sample portfolio companies
    const sampleCompanies: PortfolioCompany[] = [
      {
        id: 1,
        fundId: 1,
        name: 'TechCorp',
        sector: 'Fintech',
        stage: 'Series B',
        investmentAmount: '5000000',
        currentValuation: '12500000',
        foundedYear: 2019,
        status: 'Growing',
        description: 'Leading fintech platform',
        dealTags: ['B2B', 'SaaS', 'Fintech'],
        createdAt: new Date(),
      },
      {
        id: 2,
        fundId: 1,
        name: 'HealthAI',
        sector: 'Healthcare',
        stage: 'Series A',
        investmentAmount: '3200000',
        currentValuation: '8100000',
        foundedYear: 2020,
        status: 'Growing',
        description: 'AI-powered healthcare solutions',
        dealTags: ['Healthcare', 'AI', 'B2B'],
        createdAt: new Date(),
      },
      {
        id: 3,
        fundId: 1,
        name: 'DataFlow',
        sector: 'SaaS',
        stage: 'Series C',
        investmentAmount: '8500000',
        currentValuation: '25500000',
        foundedYear: 2018,
        status: 'Scaling',
        description: 'Enterprise data analytics platform',
        dealTags: ['SaaS', 'Analytics', 'Enterprise'],
        createdAt: new Date(),
      },
    ];

    sampleCompanies.forEach((company) => {
      this.portfolioCompanies.set(company.id, company);
    });
    this.currentCompanyId = 4;

    // Sample activities
    const sampleActivities: Activity[] = [
      {
        id: 1,
        fundId: 1,
        companyId: 1,
        type: 'investment',
        title: 'Series B Investment - TechCorp',
        description: '$5M follow-on investment completed',
        amount: '5000000',
        activityDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        id: 2,
        fundId: 1,
        companyId: 2,
        type: 'milestone',
        title: 'New Deal Signed - HealthAI',
        description: 'Series A term sheet executed',
        amount: '3200000',
        activityDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        id: 3,
        fundId: 1,
        companyId: 3,
        type: 'update',
        title: 'Portfolio Update - DataFlow',
        description: 'Q3 metrics show 150% revenue growth',
        amount: null,
        activityDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
    ];

    sampleActivities.forEach((activity) => {
      this.activities.set(activity.id, activity);
    });
    this.currentActivityId = 4;

    // Sample fund metrics
    const sampleMetrics: FundMetrics = {
      id: 1,
      fundId: 1,
      metricDate: new Date(),
      asOfDate: new Date(),
      totalValue: '150000000',
      irr: '0.284',
      multiple: '2.22',
      dpi: '0.45',
      tvpi: '2.22',
      runId: null,
      configId: null,
      configVersion: null,
      createdAt: new Date(),
    };
    this.fundMetrics.set(1, sampleMetrics);
    this.currentMetricsId = 2;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Fund methods
  async getAllFunds(): Promise<Fund[]> {
    return Array.from(this.funds.values());
  }

  async getFund(id: number): Promise<Fund | undefined> {
    return this.funds.get(id);
  }

  async getFundConfig(_fundId: number): Promise<StoredFundConfig | undefined> {
    return undefined;
  }

  async createFund(insertFund: InsertFund): Promise<Fund> {
    const id = this.currentFundId++;
    const fund: Fund = {
      id,
      name: insertFund.name,
      size: String(insertFund.size),
      deployedCapital: '0', // Default value from schema
      managementFee: String(insertFund.managementFee),
      carryPercentage: String(insertFund.carryPercentage),
      vintageYear: insertFund.vintageYear,
      status: 'active', // Default value from schema
      engineResults: insertFund.engineResults ?? null,
      createdAt: new Date(),
    };
    this.funds.set(id, fund);
    return fund;
  }

  // Portfolio methods
  async getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]> {
    const companies = Array.from(this.portfolioCompanies.values());
    return fundId ? companies.filter((c) => c.fundId === fundId) : companies;
  }

  async getPortfolioCompany(id: number): Promise<PortfolioCompany | undefined> {
    return this.portfolioCompanies.get(id);
  }

  async createPortfolioCompany(insertCompany: InsertPortfolioCompany): Promise<PortfolioCompany> {
    const normalizedCompany = insertCompany as NormalizedInsertPortfolioCompany;
    const id = this.currentCompanyId++;
    const company: PortfolioCompany = {
      id,
      fundId: normalizedCompany.fundId ?? null,
      name: normalizedCompany.name,
      sector: normalizedCompany.sector,
      stage: normalizedCompany.stage,
      investmentAmount: String(normalizedCompany.investmentAmount),
      currentValuation:
        normalizedCompany.currentValuation != null
          ? String(normalizedCompany.currentValuation)
          : null,
      foundedYear: normalizedCompany.foundedYear ?? null,
      createdAt: new Date(),
      status: normalizedCompany.status ?? 'active',
      description: normalizedCompany.description ?? null,
      dealTags: normalizedCompany.dealTags ?? null,
    };
    this.portfolioCompanies.set(id, company);
    return company;
  }

  // Investment methods
  async getInvestments(fundId?: number): Promise<Investment[]> {
    const investments = Array.from(this.investments.values());
    return fundId ? investments.filter((i) => i.fundId === fundId) : investments;
  }

  async getInvestment(id: number): Promise<Investment | undefined> {
    return this.investments.get(id);
  }

  async createInvestment(insertInvestment: InsertInvestment): Promise<Investment> {
    const id = this.currentInvestmentId++;
    const investment: Investment = {
      id,
      fundId: null, // Optional field
      companyId: null, // Optional field
      investmentDate: insertInvestment.investmentDate,
      amount: String(insertInvestment.amount),
      round: insertInvestment.round,
      ownershipPercentage: null, // Optional field
      valuationAtInvestment: null, // Optional field
      dealTags: null, // Optional field
      createdAt: new Date(),
    };
    this.investments.set(id, investment);
    return investment;
  }

  async addInvestmentRound(
    _investmentId: number,
    _roundData: Partial<InvestmentRound>
  ): Promise<InvestmentRound> {
    throw new UnsupportedStorageOperationError('addInvestmentRound');
  }

  async addPerformanceCase(
    _investmentId: number,
    _caseData: Partial<PerformanceCase>
  ): Promise<PerformanceCase> {
    throw new UnsupportedStorageOperationError('addPerformanceCase');
  }

  // Metrics methods
  async getFundMetrics(fundId: number): Promise<FundMetrics[]> {
    return Array.from(this.fundMetrics.values()).filter((m) => m.fundId === fundId);
  }

  async createFundMetrics(insertMetrics: InsertFundMetrics): Promise<FundMetrics> {
    const id = this.currentMetricsId++;
    const metrics: FundMetrics = {
      ...insertMetrics,
      id,
      createdAt: new Date(),
      fundId: null, // Optional field
      irr: null, // Optional field
      multiple: null, // Optional field
      dpi: null, // Optional field
      tvpi: null, // Optional field
      runId: null, // Optional field
      configId: null, // Optional field
      configVersion: null, // Optional field
    };
    this.fundMetrics.set(id, metrics);
    return metrics;
  }

  // Activity methods
  async getActivities(fundId?: number | number[]): Promise<Activity[]> {
    const activities = Array.from(this.activities.values());
    if (Array.isArray(fundId)) {
      if (fundId.length === 0) return [];
      const ids = new Set(fundId);
      return activities.filter((a) => a.fundId != null && ids.has(a.fundId));
    }
    return fundId ? activities.filter((a) => a.fundId === fundId) : activities;
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const id = this.currentActivityId++;
    const activity: Activity = {
      ...insertActivity,
      id,
      createdAt: new Date(),
      description: null, // Optional field
      fundId: null, // Optional field
      companyId: null, // Optional field
      amount: null, // Optional field
    };
    this.activities.set(id, activity);
    return activity;
  }
}

// DatabaseStorage implementation using Drizzle ORM
export class DatabaseStorage implements IStorage {
  readonly kind = 'database' as const;
  readonly capabilities = {
    investmentScenarioWrites: false,
  } as const satisfies StorageCapabilities;

  async ping(): Promise<boolean> {
    try {
      // Lightweight O(1) database connectivity check using Drizzle sql template
      await db.execute(sql`SELECT 1`);
      return true;
    } catch (error) {
      console.error('Database ping failed:', error);
      return false;
    }
  }

  async isRedisHealthy(): Promise<boolean> {
    // Redis is optional - return false for database-only storage
    return false;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async getAllFunds(): Promise<Fund[]> {
    return await db.select().from(funds);
  }

  async getFund(id: number): Promise<Fund | undefined> {
    const [fund] = await db.select().from(funds).where(eq(funds.id, id));
    return fund || undefined;
  }

  async getFundConfig(fundId: number): Promise<StoredFundConfig | undefined> {
    const config = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)),
      orderBy: desc(fundConfigs.version),
    });

    return config || undefined;
  }

  async createFund(insertFund: InsertFund): Promise<Fund> {
    const [fund] = await db
      .insert(funds)
      .values({
        name: insertFund.name,
        size: insertFund.size.toString(),
        managementFee: insertFund.managementFee.toString(),
        carryPercentage: insertFund.carryPercentage.toString(),
        vintageYear: insertFund.vintageYear,
        ...(insertFund.engineResults != null && { engineResults: insertFund.engineResults }),
      })
      .returning();
    if (!fund) throw new Error('Failed to create fund');
    return fund;
  }

  async getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]> {
    if (fundId) {
      return await db
        .select()
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId));
    }
    return await db.select().from(portfolioCompanies);
  }

  async getPortfolioCompany(id: number): Promise<PortfolioCompany | undefined> {
    const [company] = await db
      .select()
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.id, id));
    return company || undefined;
  }

  async createPortfolioCompany(insertCompany: InsertPortfolioCompany): Promise<PortfolioCompany> {
    const [company] = await db.insert(portfolioCompanies).values(insertCompany).returning();
    if (!company) throw new Error('Failed to create portfolio company');
    return company;
  }

  async getInvestments(fundId?: number): Promise<Investment[]> {
    if (fundId) {
      return await db.select().from(investments).where(eq(investments.fundId, fundId));
    }
    return await db.select().from(investments);
  }

  async getInvestment(id: number): Promise<Investment | undefined> {
    const [investment] = await db.select().from(investments).where(eq(investments.id, id));
    return investment || undefined;
  }

  async createInvestment(insertInvestment: InsertInvestment): Promise<Investment> {
    const result = await db.insert(investments).values(insertInvestment).returning();
    const investment = result[0]!;
    if (!investment) {
      throw new Error('Failed to create investment');
    }
    return investment;
  }

  async addInvestmentRound(
    _investmentId: number,
    _roundData: Partial<InvestmentRound>
  ): Promise<InvestmentRound> {
    throw new UnsupportedStorageOperationError('addInvestmentRound');
  }

  async addPerformanceCase(
    _investmentId: number,
    _caseData: Partial<PerformanceCase>
  ): Promise<PerformanceCase> {
    throw new UnsupportedStorageOperationError('addPerformanceCase');
  }

  async getFundMetrics(fundId: number): Promise<FundMetrics[]> {
    return await db.select().from(fundMetrics).where(eq(fundMetrics.fundId, fundId));
  }

  async createFundMetrics(insertMetrics: InsertFundMetrics): Promise<FundMetrics> {
    const result = await db.insert(fundMetrics).values(insertMetrics).returning();
    const metrics = result[0]!;
    if (!metrics) {
      throw new Error('Failed to create fund metrics');
    }
    return metrics;
  }

  async getActivities(fundId?: number | number[]): Promise<Activity[]> {
    if (Array.isArray(fundId)) {
      if (fundId.length === 0) return [];
      return await db.select().from(activities).where(inArray(activities.fundId, fundId));
    }
    if (fundId) {
      return await db.select().from(activities).where(eq(activities.fundId, fundId));
    }
    return await db.select().from(activities);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const result = await db.insert(activities).values(insertActivity).returning();
    const activity = result[0]!;
    if (!activity) {
      throw new Error('Failed to create activity');
    }
    return activity;
  }
}

export function createStorageFromEnvironment(env: NodeJS.ProcessEnv = process.env): IStorage {
  const professionalDemoError = getProfessionalDemoRuntimeConfigurationError(env);
  if (professionalDemoError !== null) {
    throw new Error(professionalDemoError);
  }

  const mode = resolveStorageBootMode(env);
  if (mode === 'database') {
    return new DatabaseStorage();
  }

  if (mode === 'test-mock-db' || mode === 'explicit-memory') {
    return new MemStorage();
  }

  throw new Error(getStorageConfigurationError(env));
}

export function getStorageRuntimeState(
  instance: IStorage = storage,
  env: NodeJS.ProcessEnv = process.env
): StorageRuntimeState {
  return {
    kind: instance.kind,
    capabilities: {
      ...instance.capabilities,
    },
    mockDatabase:
      instance.kind === 'database' &&
      ((env['DATABASE_URL']?.includes('mock') ?? false) ||
        (env['NEON_DATABASE_URL']?.includes('mock') ?? false)),
  };
}

// Use DatabaseStorage when DATABASE_URL is available, otherwise use MemStorage
export const storage = createStorageFromEnvironment();
