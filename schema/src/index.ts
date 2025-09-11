// Core tables
export * from './tables';
export * from './reserves';
export * from './pipeline';
export * from './other';
export * from './fund-management';

// Legacy exports for compatibility
export type {
  // Use the New* types as InsertX types for backward compatibility
  NewFund as InsertFund,
  NewPortfolioCompany as InsertPortfolioCompany,
  NewInvestment as InsertInvestment,
  NewFundMetrics as InsertFundMetrics,
  NewActivity as InsertActivity,
  NewUser as InsertUser
} from './tables';

export type {
  NewDealOpportunity as InsertDealOpportunity,
  NewPipelineStage as InsertPipelineStage,
  NewDueDiligenceItem as InsertDueDiligenceItem,
  NewScoringModel as InsertScoringModel,
  NewPipelineActivity as InsertPipelineActivity,
  NewMarketResearch as InsertMarketResearch,
  NewFinancialProjection as InsertFinancialProjection
} from './pipeline';

export type {
  NewCustomField as InsertCustomField,
  NewCustomFieldValue as InsertCustomFieldValue,
  NewAuditLog as InsertAuditLog
} from './other';

export type {
  NewReserveDecision as InsertReserveDecision
} from './reserves';

export type {
  NewFundConfig as InsertFundConfig,
  NewFundSnapshot as InsertFundSnapshot,
  NewFundEvent as InsertFundEvent
} from './fund-management';

// Timeline-specific interfaces
export interface TimelineRecord {
  id: number;
  fundId: number;
  eventTime: Date;
  snapshotTime?: Date;
  operation?: string;
  entityType?: string;
  eventType?: string;
  type?: string;
  metadata?: any;
  payload?: any;
  state?: any;
  eventCount?: number;
  stateHash?: string;
  createdAt: Date;
}

export interface TimelineEvent {
  id: string;
  eventTime: Date;
  operation: string | null;
  entityType: string | null;
  fundId: number;
}

export interface TimelineSnapshot {
  id: number;
  snapshotTime: Date;
  state: any;
  eventCount: number | null;
  stateHash: string | null;
  fundId: number;
}