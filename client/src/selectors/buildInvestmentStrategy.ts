// Pure builder used by Step 3 – no hooks, no set(), no side effects
export type StrategyInputs = {
  stages: Array<{
    id: string;
    name: string;
    graduate: number;
    exit: number;
    months: number;
  }>;
  sectorProfiles: Array<{
    id: string;
    name: string;
    targetPercentage: number;
    description: string;
  }>;
  allocations: Array<{
    id: string;
    category: string;
    percentage: number;
    description: string;
  }>;
};

export type InvestmentStrategy = {
  stages: Array<{
    id: string;
    name: string;
    graduationRate: number;
    exitRate: number;
    remainRate: number;
  }>;
  sectorProfiles: Array<{
    id: string;
    name: string;
    targetPercentage: number;
    description: string;
  }>;
  allocations: Array<{
    id: string;
    category: string;
    percentage: number;
    description: string;
  }>;
  totalSectorAllocation: number;
  totalAllocation: number;
  validation: {
    stages: Array<string | null>;
    sectors: Array<string | null>;
    allocations: Array<string | null>;
    allValid: boolean;
  };
};

// Defensive input validation
function validateInputs(inputs: StrategyInputs): boolean {
  if (!inputs || typeof inputs !== 'object') return false;
  if (!Array.isArray(inputs.stages)) return false;
  if (!Array.isArray(inputs.sectorProfiles)) return false;
  if (!Array.isArray(inputs.allocations)) return false;
  return true;
}

export function buildInvestmentStrategy(inputs: StrategyInputs): InvestmentStrategy {
  // Performance profiling instrumentation
  if (import.meta.env.DEV) {
    performance.mark('strategy:start');
  }
  
  // Guard against malformed inputs
  if (!validateInputs(inputs)) {
    if (import.meta.env.DEV) {
      performance.mark('strategy:end');
      performance.measure('strategy', 'strategy:start', 'strategy:end');
    }
    return {
      stages: [],
      sectorProfiles: [],
      allocations: [],
      totalSectorAllocation: 0,
      totalAllocation: 0,
      validation: { stages: [], sectors: [], allocations: [], allValid: false }
    };
  }

  // Pure computation - no side effects
  const stages = inputs.stages.map(s => ({
    id: s.id,
    name: s.name,
    graduationRate: s.graduate,
    exitRate: s.exit,
    remainRate: Math.max(0, 100 - s.graduate - s.exit)
  }));

  const sectorProfiles = inputs.sectorProfiles.map(sp => ({ ...sp }));
  const allocations = inputs.allocations.map(a => ({ ...a }));

  // Calculate totals
  const totalSectorAllocation = sectorProfiles.reduce((sum, sector) => sum + sector.targetPercentage, 0);
  const totalAllocation = allocations.reduce((sum, alloc) => sum + alloc.percentage, 0);

  // Validation
  const stageValidation = stages.map((stage, i) => {
    if (!stage.name?.trim()) return 'Stage name required';
    if (stage.graduationRate + stage.exitRate > 100) return 'Graduate + Exit must be ≤ 100%';
    if (i === stages.length - 1 && stage.graduationRate !== 0) return 'Last stage must have 0% graduation';
    return null;
  });

  const sectorValidation = sectorProfiles.map(sector => {
    if (!sector.name?.trim()) return 'Sector name required';
    if (sector.targetPercentage < 0 || sector.targetPercentage > 100) return 'Invalid percentage';
    return null;
  });

  const allocationValidation = allocations.map(allocation => {
    if (!allocation.category?.trim()) return 'Category required';
    if (allocation.percentage < 0 || allocation.percentage > 100) return 'Invalid percentage';
    return null;
  });

  const allValid = [...stageValidation, ...sectorValidation, ...allocationValidation].every(e => !e);

  // Performance profiling end mark
  if (import.meta.env.DEV) {
    performance.mark('strategy:end');
    performance.measure('strategy', 'strategy:start', 'strategy:end');
  }

  return {
    stages,
    sectorProfiles,
    allocations,
    totalSectorAllocation,
    totalAllocation,
    validation: {
      stages: stageValidation,
      sectors: sectorValidation,
      allocations: allocationValidation,
      allValid
    }
  };
}