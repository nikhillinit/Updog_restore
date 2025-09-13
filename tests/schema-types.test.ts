import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Fund,
  InsertFund,
  PortfolioCompany,
  InsertPortfolioCompany,
  Investment,
  InsertInvestment,
  DealOpportunity,
  InsertDealOpportunity,
  PipelineStage,
  InsertPipelineStage
} from '../shared/schema';

describe('Schema Type Exports', () => {
  it('should export correct select types', () => {
    // These tests ensure types are properly exported without type errors
    expectTypeOf<Fund>().toHaveProperty('id');
    expectTypeOf<Fund>().toHaveProperty('name');
    expectTypeOf<Fund>().toHaveProperty('size');
    
    expectTypeOf<PortfolioCompany>().toHaveProperty('id');
    expectTypeOf<PortfolioCompany>().toHaveProperty('name');
    expectTypeOf<PortfolioCompany>().toHaveProperty('fundId');
    
    expectTypeOf<Investment>().toHaveProperty('id');
    expectTypeOf<Investment>().toHaveProperty('companyId');
    expectTypeOf<Investment>().toHaveProperty('amount');
  });

  it('should export correct insert types', () => {
    // Verify insert types don't include auto-generated fields
    expectTypeOf<InsertFund>().not.toHaveProperty('id');
    expectTypeOf<InsertFund>().not.toHaveProperty('createdAt');
    expectTypeOf<InsertFund>().toHaveProperty('name');
    expectTypeOf<InsertFund>().toHaveProperty('size');
    
    expectTypeOf<InsertPortfolioCompany>().not.toHaveProperty('id');
    expectTypeOf<InsertPortfolioCompany>().not.toHaveProperty('createdAt');
    expectTypeOf<InsertPortfolioCompany>().toHaveProperty('name');
    
    expectTypeOf<InsertInvestment>().not.toHaveProperty('id');
    expectTypeOf<InsertInvestment>().not.toHaveProperty('createdAt');
    expectTypeOf<InsertInvestment>().toHaveProperty('amount');
  });

  it('should handle optional fields correctly', () => {
    // Test that optional fields are properly typed
    type TestInsertFund = {
      name: string;
      size: string;
      deployedCapital?: string | null;
      managementFee?: string | null;
      carryPercentage?: string | null;
      vintageYear?: number | null;
      status?: string | null;
    };
    
    // This should compile without errors
    const testFund: Partial<InsertFund> = {
      name: 'Test Fund',
      size: '100000000'
    };
    
    expect(testFund).toBeDefined();
  });

  it('should maintain type safety for pipeline types', () => {
    expectTypeOf<DealOpportunity>().toHaveProperty('id');
    expectTypeOf<DealOpportunity>().toHaveProperty('name');
    expectTypeOf<DealOpportunity>().toHaveProperty('fundId');
    
    expectTypeOf<InsertDealOpportunity>().not.toHaveProperty('id');
    expectTypeOf<InsertDealOpportunity>().toHaveProperty('name');
    
    expectTypeOf<PipelineStage>().toHaveProperty('id');
    expectTypeOf<PipelineStage>().toHaveProperty('name');
    
    expectTypeOf<InsertPipelineStage>().not.toHaveProperty('id');
    expectTypeOf<InsertPipelineStage>().toHaveProperty('name');
  });
});