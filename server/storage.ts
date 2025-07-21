import { 
  funds, portfolioCompanies, investments, fundMetrics, activities, users,
  type Fund, type PortfolioCompany, type Investment, type FundMetrics, type Activity, type User,
  type InsertFund, type InsertPortfolioCompany, type InsertInvestment, 
  type InsertFundMetrics, type InsertActivity, type InsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Fund methods
  getAllFunds(): Promise<Fund[]>;
  getFund(id: number): Promise<Fund | undefined>;
  createFund(fund: InsertFund): Promise<Fund>;
  
  // Portfolio methods
  getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]>;
  getPortfolioCompany(id: number): Promise<PortfolioCompany | undefined>;
  createPortfolioCompany(company: InsertPortfolioCompany): Promise<PortfolioCompany>;
  
  // Investment methods
  getInvestments(fundId?: number): Promise<Investment[]>;
  getInvestment(id: number): Promise<Investment | undefined>;
  createInvestment(investment: any): Promise<Investment>;
  addInvestmentRound(investmentId: number, round: any): Promise<any>;
  addPerformanceCase(investmentId: number, performanceCase: any): Promise<any>;
  
  // Metrics methods
  getFundMetrics(fundId: number): Promise<FundMetrics[]>;
  createFundMetrics(metrics: InsertFundMetrics): Promise<FundMetrics>;
  
  // Activity methods
  getActivities(fundId?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
}

export class MemStorage implements IStorage {
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

  private initializeSampleData() {
    // Sample fund
    const sampleFund: Fund = {
      id: 1,
      name: "Press On Ventures Fund I",
      size: "100000000",
      deployedCapital: "67500000",
      managementFee: "0.025",
      carryPercentage: "0.20",
      vintageYear: 2020,
      status: "active",
      createdAt: new Date(),
    };
    this.funds.set(1, sampleFund);
    this.currentFundId = 2;

    // Sample portfolio companies
    const sampleCompanies: PortfolioCompany[] = [
      {
        id: 1,
        fundId: 1,
        name: "TechCorp",
        sector: "Fintech",
        stage: "Series B",
        investmentAmount: "5000000",
        currentValuation: "12500000",
        foundedYear: 2019,
        status: "Growing",
        description: "Leading fintech platform",
        createdAt: new Date(),
      },
      {
        id: 2,
        fundId: 1,
        name: "HealthAI",
        sector: "Healthcare",
        stage: "Series A",
        investmentAmount: "3200000",
        currentValuation: "8100000",
        foundedYear: 2020,
        status: "Growing",
        description: "AI-powered healthcare solutions",
        createdAt: new Date(),
      },
      {
        id: 3,
        fundId: 1,
        name: "DataFlow",
        sector: "SaaS",
        stage: "Series C",
        investmentAmount: "8500000",
        currentValuation: "25500000",
        foundedYear: 2018,
        status: "Scaling",
        description: "Enterprise data analytics platform",
        createdAt: new Date(),
      },
    ];
    
    sampleCompanies.forEach(company => {
      this.portfolioCompanies.set(company.id, company);
    });
    this.currentCompanyId = 4;

    // Sample activities
    const sampleActivities: Activity[] = [
      {
        id: 1,
        fundId: 1,
        companyId: 1,
        type: "investment",
        title: "Series B Investment - TechCorp",
        description: "$5M follow-on investment completed",
        amount: "5000000",
        activityDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        id: 2,
        fundId: 1,
        companyId: 2,
        type: "milestone",
        title: "New Deal Signed - HealthAI",
        description: "Series A term sheet executed",
        amount: "3200000",
        activityDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        id: 3,
        fundId: 1,
        companyId: 3,
        type: "update",
        title: "Portfolio Update - DataFlow",
        description: "Q3 metrics show 150% revenue growth",
        amount: null,
        activityDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
    ];

    sampleActivities.forEach(activity => {
      this.activities.set(activity.id, activity);
    });
    this.currentActivityId = 4;

    // Sample fund metrics
    const sampleMetrics: FundMetrics = {
      id: 1,
      fundId: 1,
      metricDate: new Date(),
      totalValue: "150000000",
      irr: "0.284",
      multiple: "2.22",
      dpi: "0.45",
      tvpi: "2.22",
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
    return Array.from(this.users.values()).find(user => user.username === username);
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

  async createFund(insertFund: InsertFund): Promise<Fund> {
    const id = this.currentFundId++;
    const fund: Fund = { 
      ...insertFund, 
      id, 
      createdAt: new Date(),
      deployedCapital: insertFund.deployedCapital || "0",
      status: insertFund.status || "active"
    };
    this.funds.set(id, fund);
    return fund;
  }

  // Portfolio methods
  async getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]> {
    const companies = Array.from(this.portfolioCompanies.values());
    return fundId ? companies.filter(c => c.fundId === fundId) : companies;
  }

  async getPortfolioCompany(id: number): Promise<PortfolioCompany | undefined> {
    return this.portfolioCompanies.get(id);
  }

  async createPortfolioCompany(insertCompany: InsertPortfolioCompany): Promise<PortfolioCompany> {
    const id = this.currentCompanyId++;
    const company: PortfolioCompany = { 
      ...insertCompany, 
      id, 
      createdAt: new Date(),
      status: insertCompany.status || "active",
      description: insertCompany.description || null,
      fundId: insertCompany.fundId || null,
      currentValuation: insertCompany.currentValuation || null,
      foundedYear: insertCompany.foundedYear || null
    };
    this.portfolioCompanies.set(id, company);
    return company;
  }

  // Investment methods
  async getInvestments(fundId?: number): Promise<Investment[]> {
    const investments = Array.from(this.investments.values());
    return fundId ? investments.filter(i => i.fundId === fundId) : investments;
  }

  async getInvestment(id: number): Promise<Investment | undefined> {
    return this.investments.get(id);
  }

  async createInvestment(insertInvestment: any): Promise<Investment> {
    const id = this.currentInvestmentId++;
    const investment: Investment = { 
      id, 
      name: insertInvestment.name,
      sector: insertInvestment.sector,
      geography: insertInvestment.geography,
      stage: insertInvestment.stage || insertInvestment.entryRound,
      investmentDate: new Date(insertInvestment.investmentDate),
      amount: parseFloat(insertInvestment.amount || "0"),
      ownershipPercentage: parseFloat(insertInvestment.ownership || "0"),
      valuationAtInvestment: parseFloat(insertInvestment.valuation || "0"),
      status: 'active',
      entryRound: insertInvestment.entryRound,
      leadInvestor: insertInvestment.leadInvestor,
      tags: insertInvestment.tags,
      rounds: [],
      performanceCases: [],
      createdAt: new Date(),
      fundId: insertInvestment.fundId || null,
      companyId: null
    };
    this.investments.set(id, investment);
    return investment;
  }

  async addInvestmentRound(investmentId: number, roundData: any): Promise<any> {
    const investment = this.investments.get(investmentId);
    if (!investment) {
      throw new Error('Investment not found');
    }
    
    const round = {
      id: Date.now(),
      name: roundData.name,
      date: roundData.date,
      valuation: parseFloat(roundData.valuation || "0"),
      amount: parseFloat(roundData.amount || "0"),
      ownership: parseFloat(roundData.ownership || "0"),
      leadInvestor: roundData.leadInvestor,
      status: roundData.status,
      type: roundData.type
    };
    
    if (!investment.rounds) {
      investment.rounds = [];
    }
    investment.rounds.push(round);
    this.investments.set(investmentId, investment);
    return round;
  }

  async addPerformanceCase(investmentId: number, caseData: any): Promise<any> {
    const investment = this.investments.get(investmentId);
    if (!investment) {
      throw new Error('Investment not found');
    }
    
    const performanceCase = {
      id: Date.now(),
      name: caseData.name,
      exitValuation: parseFloat(caseData.exitValuation || "0"),
      exitDate: caseData.exitDate,
      probability: parseFloat(caseData.probability || "0"),
      type: caseData.type,
      description: caseData.description
    };
    
    if (!investment.performanceCases) {
      investment.performanceCases = [];
    }
    investment.performanceCases.push(performanceCase);
    this.investments.set(investmentId, investment);
    return performanceCase;
  }

  // Metrics methods
  async getFundMetrics(fundId: number): Promise<FundMetrics[]> {
    return Array.from(this.fundMetrics.values()).filter(m => m.fundId === fundId);
  }

  async createFundMetrics(insertMetrics: InsertFundMetrics): Promise<FundMetrics> {
    const id = this.currentMetricsId++;
    const metrics: FundMetrics = { 
      ...insertMetrics, 
      id, 
      createdAt: new Date(),
      fundId: insertMetrics.fundId || null,
      irr: insertMetrics.irr || null,
      multiple: insertMetrics.multiple || null,
      dpi: insertMetrics.dpi || null,
      tvpi: insertMetrics.tvpi || null
    };
    this.fundMetrics.set(id, metrics);
    return metrics;
  }

  // Activity methods
  async getActivities(fundId?: number): Promise<Activity[]> {
    const activities = Array.from(this.activities.values());
    return fundId ? activities.filter(a => a.fundId === fundId) : activities;
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const id = this.currentActivityId++;
    const activity: Activity = { 
      ...insertActivity, 
      id, 
      createdAt: new Date(),
      description: insertActivity.description || null,
      fundId: insertActivity.fundId || null,
      companyId: insertActivity.companyId || null,
      amount: insertActivity.amount || null
    };
    this.activities.set(id, activity);
    return activity;
  }
}

// DatabaseStorage implementation using Drizzle ORM
export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getAllFunds(): Promise<Fund[]> {
    return await db.select().from(funds);
  }

  async getFund(id: number): Promise<Fund | undefined> {
    const [fund] = await db.select().from(funds).where(eq(funds.id, id));
    return fund || undefined;
  }

  async createFund(insertFund: InsertFund): Promise<Fund> {
    const [fund] = await db
      .insert(funds)
      .values({
        ...insertFund,
        size: insertFund.size.toString(),
        deployedCapital: (insertFund.deployedCapital || 0).toString(),
        managementFee: insertFund.managementFee.toString(),
        carryPercentage: insertFund.carryPercentage.toString(),
        status: insertFund.status || "active"
      })
      .returning();
    return fund;
  }

  async getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]> {
    if (fundId) {
      return await db.select().from(portfolioCompanies).where(eq(portfolioCompanies.fundId, fundId));
    }
    return await db.select().from(portfolioCompanies);
  }

  async getPortfolioCompany(id: number): Promise<PortfolioCompany | undefined> {
    const [company] = await db.select().from(portfolioCompanies).where(eq(portfolioCompanies.id, id));
    return company || undefined;
  }

  async createPortfolioCompany(insertCompany: InsertPortfolioCompany): Promise<PortfolioCompany> {
    const [company] = await db
      .insert(portfolioCompanies)
      .values({
        ...insertCompany,
        status: insertCompany.status || "active",
        description: insertCompany.description || null,
        fundId: insertCompany.fundId || null,
        currentValuation: insertCompany.currentValuation || null,
        foundedYear: insertCompany.foundedYear || null
      })
      .returning();
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

  async createInvestment(insertInvestment: any): Promise<Investment> {
    const [investment] = await db
      .insert(investments)
      .values({
        name: insertInvestment.name,
        sector: insertInvestment.sector,
        geography: insertInvestment.geography,
        stage: insertInvestment.stage || insertInvestment.entryRound,
        investmentDate: new Date(insertInvestment.investmentDate),
        amount: parseFloat(insertInvestment.amount || "0"),
        ownershipPercentage: parseFloat(insertInvestment.ownership || "0"),
        valuationAtInvestment: parseFloat(insertInvestment.valuation || "0"),
        status: 'active',
        fundId: insertInvestment.fundId || null,
        companyId: null
      })
      .returning();
    return investment;
  }

  async addInvestmentRound(investmentId: number, roundData: any): Promise<any> {
    // For database implementation, this would involve a separate rounds table
    // For now, we'll return mock data as the schema might need extending
    return {
      id: Date.now(),
      name: roundData.name,
      date: roundData.date,
      valuation: parseFloat(roundData.valuation || "0"),
      amount: parseFloat(roundData.amount || "0"),
      ownership: parseFloat(roundData.ownership || "0"),
      leadInvestor: roundData.leadInvestor,
      status: roundData.status,
      type: roundData.type
    };
  }

  async addPerformanceCase(investmentId: number, caseData: any): Promise<any> {
    // For database implementation, this would involve a separate performance_cases table
    // For now, we'll return mock data as the schema might need extending
    return {
      id: Date.now(),
      name: caseData.name,
      exitValuation: parseFloat(caseData.exitValuation || "0"),
      exitDate: caseData.exitDate,
      probability: parseFloat(caseData.probability || "0"),
      type: caseData.type,
      description: caseData.description
    };
  }

  async getFundMetrics(fundId: number): Promise<FundMetrics[]> {
    return await db.select().from(fundMetrics).where(eq(fundMetrics.fundId, fundId));
  }

  async createFundMetrics(insertMetrics: InsertFundMetrics): Promise<FundMetrics> {
    const [metrics] = await db
      .insert(fundMetrics)
      .values({
        ...insertMetrics,
        fundId: insertMetrics.fundId || null,
        irr: insertMetrics.irr || null,
        multiple: insertMetrics.multiple || null,
        dpi: insertMetrics.dpi || null,
        tvpi: insertMetrics.tvpi || null
      })
      .returning();
    return metrics;
  }

  async getActivities(fundId?: number): Promise<Activity[]> {
    if (fundId) {
      return await db.select().from(activities).where(eq(activities.fundId, fundId));
    }
    return await db.select().from(activities);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db
      .insert(activities)
      .values({
        ...insertActivity,
        description: insertActivity.description || null,
        fundId: insertActivity.fundId || null,
        companyId: insertActivity.companyId || null,
        amount: insertActivity.amount || null
      })
      .returning();
    return activity;
  }
}

// Use DatabaseStorage when DATABASE_URL is available, otherwise use MemStorage
export const storage = process.env.DATABASE_URL 
  ? new DatabaseStorage() 
  : new MemStorage();
