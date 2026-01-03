import type { z } from 'zod';
import {
  InvestmentStrategySchema,
  ExitRecyclingSchema,
  WaterfallSchema,
  CompleteFundSetupSchema
} from '@shared/types';

// Type for the fund setup data
type FundSetupData = z.infer<typeof CompleteFundSetupSchema>;
type InvestmentStrategy = z.infer<typeof InvestmentStrategySchema>;
type Allocation = { percentage: number };
type Stage = { graduationRate: number; exitRate: number };
type SectorProfile = { targetPercentage: number };

// Enhanced Fund Schema with cross-field validation
export const fundSchema = CompleteFundSetupSchema
  .refine(
    (data: FundSetupData) => {
      // Validation Rule: Allocation sum ≤ 100%
      const totalAllocation = data.investmentStrategy.allocations
        .reduce((sum: number, alloc: Allocation) => sum + alloc.percentage, 0);
      return totalAllocation <= 100;
    },
    {
      message: "Total allocation percentages cannot exceed 100%",
      path: ["investmentStrategy", "allocations"],
    }
  )
  .refine(
    (data: FundSetupData) => {
      // Validation Rule: Each stage graduation + exit ≤ 100%
      return data.investmentStrategy.stages.every((stage: Stage) =>
        (stage.graduationRate + stage.exitRate) <= 100
      );
    },
    {
      message: "For each stage, graduation rate + exit rate cannot exceed 100%",
      path: ["investmentStrategy", "stages"],
    }
  )
  .refine(
    (data: FundSetupData) => {
      // Validation Rule: Last stage graduation rate must be 0
      const stages = data.investmentStrategy.stages;
      if (stages.length > 0) {
        const lastStage = stages[stages.length - 1];
        return lastStage?.graduationRate === 0;
      }
      return true;
    },
    {
      message: "Last stage must have graduation rate of 0% (final stage)",
      path: ["investmentStrategy", "stages"],
    }
  )
  .refine(
    (data: FundSetupData) => {
      // Validation Rule: Sector profile sum ≤ 100%
      const totalSectorAllocation = data.investmentStrategy.sectorProfiles
        .reduce((sum: number, sector: SectorProfile) => sum + sector.targetPercentage, 0);
      return totalSectorAllocation <= 100;
    },
    {
      message: "Total sector allocation percentages cannot exceed 100%",
      path: ["investmentStrategy", "sectorProfiles"],
    }
  )
  .refine(
    (data: FundSetupData) => {
      // Validation Rule: If exit recycling enabled, percentage must be > 0
      if (data.exitRecycling.enabled) {
        return data.exitRecycling.recyclePercentage > 0;
      }
      return true;
    },
    {
      message: "When exit recycling is enabled, recycle percentage must be greater than 0%",
      path: ["exitRecycling", "recyclePercentage"],
    }
  )

  .refine(
    (data: FundSetupData) => {
      // Validation Rule: Fund life is required for closed-end funds
      return data.isEvergreen || !!data.lifeYears;
    },
    {
      message: "Fund life is required for closed-end funds",
      path: ["lifeYears"],
    }
  )
  .refine(
    (data: FundSetupData) => {
      // Validation Rule: Investment horizon cannot exceed fund life for closed-end funds
      if (!data.isEvergreen && data.lifeYears) {
        return data.investmentHorizonYears <= data.lifeYears;
      }
      return true;
    },
    {
      message: "Investment horizon cannot exceed fund life",
      path: ["investmentHorizonYears"],
    }
  );

// Individual schema exports for component-level validation
export const investmentStrategySchema = InvestmentStrategySchema
  .refine(
    (data: InvestmentStrategy) => {
      const totalAllocation = data.allocations.reduce((sum: number, alloc: Allocation) => sum + alloc.percentage, 0);
      return totalAllocation <= 100;
    },
    {
      message: "Total allocation percentages cannot exceed 100%",
      path: ["allocations"],
    }
  )
  .refine(
    (data: InvestmentStrategy) => {
      return data.stages.every((stage: Stage) => (stage.graduationRate + stage.exitRate) <= 100);
    },
    {
      message: "For each stage, graduation rate + exit rate cannot exceed 100%",
      path: ["stages"],
    }
  )
  .refine(
    (data: InvestmentStrategy) => {
      if (data.stages.length > 0) {
        const lastStage = data.stages[data.stages.length - 1];
        return lastStage?.graduationRate === 0;
      }
      return true;
    },
    {
      message: "Last stage must have graduation rate of 0% (final stage)",
      path: ["stages"],
    }
  );

type ExitRecycling = z.infer<typeof ExitRecyclingSchema>;
export const exitRecyclingSchema = ExitRecyclingSchema.refine(
  (data: ExitRecycling) => {
    if (data.enabled) {
      return data.recyclePercentage > 0;
    }
    return true;
  },
  {
    message: "When exit recycling is enabled, recycle percentage must be greater than 0%",
    path: ["recyclePercentage"],
  }
);

export const waterfallSchema = WaterfallSchema;

// Type exports
export type FundSchema = z.infer<typeof fundSchema>;
export type InvestmentStrategyValidated = z.infer<typeof investmentStrategySchema>;
export type ExitRecyclingValidated = z.infer<typeof exitRecyclingSchema>;
export type WaterfallValidated = z.infer<typeof waterfallSchema>;
