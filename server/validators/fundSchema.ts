import { z } from 'zod';
import {
  StageSchema,
  SectorProfileSchema,
  AllocationSchema,
  InvestmentStrategySchema,
  ExitRecyclingSchema,
  WaterfallSchema,
  CompleteFundSetupSchema
} from '@shared/types';

// Enhanced Fund Schema with cross-field validation
export const fundSchema = CompleteFundSetupSchema
  .refine(
    (data) => {
      // Validation Rule: Allocation sum ≤ 100%
      const totalAllocation = data.investmentStrategy.allocations
        .reduce((sum, alloc) => sum + alloc.percentage, 0);
      return totalAllocation <= 100;
    },
    {
      message: "Total allocation percentages cannot exceed 100%",
      path: ["investmentStrategy", "allocations"],
    }
  )
  .refine(
    (data) => {
      // Validation Rule: Each stage graduation + exit ≤ 100%
      return data.investmentStrategy.stages.every(stage => 
        (stage.graduationRate + stage.exitRate) <= 100
      );
    },
    {
      message: "For each stage, graduation rate + exit rate cannot exceed 100%",
      path: ["investmentStrategy", "stages"],
    }
  )
  .refine(
    (data) => {
      // Validation Rule: Last stage graduation rate must be 0
      const stages = data.investmentStrategy.stages;
      if (stages.length > 0) {
        const lastStage = stages[stages.length - 1];
        return lastStage.graduationRate === 0;
      }
      return true;
    },
    {
      message: "Last stage must have graduation rate of 0% (final stage)",
      path: ["investmentStrategy", "stages"],
    }
  )
  .refine(
    (data) => {
      // Validation Rule: Sector profile sum ≤ 100%
      const totalSectorAllocation = data.investmentStrategy.sectorProfiles
        .reduce((sum, sector) => sum + sector.targetPercentage, 0);
      return totalSectorAllocation <= 100;
    },
    {
      message: "Total sector allocation percentages cannot exceed 100%",
      path: ["investmentStrategy", "sectorProfiles"],
    }
  )
  .refine(
    (data) => {
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
    (data) => {
      // Validation Rule: Waterfall hurdle and catch-up logical relationship (only for EUROPEAN)
      if (data.waterfall.type === 'EUROPEAN') {
        return data.waterfall.catchUp >= data.waterfall.hurdle;
      }
      return true;
    },
    {
      message: "Catch-up rate must be greater than or equal to hurdle rate",
      path: ["waterfall", "catchUp"],
    }
  )
  .refine(
    (data) => {
      // Validation Rule: Fund life is required for closed-end funds
      return data.isEvergreen || !!data.lifeYears;
    },
    {
      message: "Fund life is required for closed-end funds",
      path: ["lifeYears"],
    }
  )
  .refine(
    (data) => {
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
    (data) => {
      const totalAllocation = data.allocations.reduce((sum, alloc) => sum + alloc.percentage, 0);
      return totalAllocation <= 100;
    },
    {
      message: "Total allocation percentages cannot exceed 100%",
      path: ["allocations"],
    }
  )
  .refine(
    (data) => {
      return data.stages.every(stage => (stage.graduationRate + stage.exitRate) <= 100);
    },
    {
      message: "For each stage, graduation rate + exit rate cannot exceed 100%",
      path: ["stages"],
    }
  )
  .refine(
    (data) => {
      if (data.stages.length > 0) {
        const lastStage = data.stages[data.stages.length - 1];
        return lastStage.graduationRate === 0;
      }
      return true;
    },
    {
      message: "Last stage must have graduation rate of 0% (final stage)",
      path: ["stages"],
    }
  );

export const exitRecyclingSchema = ExitRecyclingSchema.refine(
  (data) => {
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

export const waterfallSchema = WaterfallSchema.refine(
  (data) => {
    // Only validate hurdle/catch-up for EUROPEAN waterfall
    if (data.type === 'EUROPEAN') {
      return data.catchUp >= data.hurdle;
    }
    return true;
  },
  {
    message: "Catch-up rate must be greater than or equal to hurdle rate",
    path: ["catchUp"],
  }
);

// Type exports
export type FundSchema = z.infer<typeof fundSchema>;
export type InvestmentStrategyValidated = z.infer<typeof investmentStrategySchema>;
export type ExitRecyclingValidated = z.infer<typeof exitRecyclingSchema>;
export type WaterfallValidated = z.infer<typeof waterfallSchema>;