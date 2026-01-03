import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import {
  Calculator,
  Target,
  TrendingUp,
  PieChart as PieChartIcon,
  Settings,
  Play,
  Save,
  BarChart3,
  Calendar,
  DollarSign,
  Percent,
  Globe,
  AlertTriangle
} from 'lucide-react';
import { StatCard, StatCardGrid } from '@/components/analytics/StatCard';
import { useFundData } from '@/hooks/use-fund-data';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

// Mock data and types
export interface CheckSizeConfig {
  min: number;
  target: number;
  max: number;
}

export interface AllocationConfig {
  [key: string]: number;
}

export interface ScenarioConfig {
  name: string;
  type: 'base_case' | 'optimistic' | 'pessimistic' | 'stress_test';
  marketEnvironment: 'bull' | 'normal' | 'bear' | 'recession';
  dealFlowMultiplier: number;
  valuationMultiplier: number;
  exitMultiplier: number;
}

export interface PortfolioStrategy {
  id?: string;
  name: string;
  fundSize: number;
  totalFundSize: number; // Alias for fundSize for backward compatibility
  deploymentPeriodMonths: number;
  targetPortfolioSize: number;
  checkSizes: CheckSizeConfig;
  sectorAllocation: AllocationConfig;
  stageAllocation: AllocationConfig;
  geographicAllocation: AllocationConfig;
  reservePercentage: number;
  reserveRatio: number; // Alias for reservePercentage for backward compatibility
  allocatedCapital?: number; // Optional property for tracking allocated capital
  projectedIRR?: number; // Optional property for projected IRR
  targetReturns?: number; // Optional property for target returns
  riskScore?: number; // Optional property for risk score
  scenarios: ScenarioConfig[];
}

// Type alias for backward compatibility
export type PortfolioState = PortfolioStrategy;

// Color schemes for charts
const SECTOR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const STAGE_COLORS = ['#1E40AF', '#059669', '#DC2626', '#7C2D12'];

// Mock sector and stage options
const SECTORS = [
  'FinTech', 'HealthTech', 'EdTech', 'SaaS', 'E-commerce',
  'Enterprise Software', 'Consumer Apps', 'AI/ML', 'Cybersecurity', 'CleanTech'
];

const STAGES = ['Pre-Seed', 'Seed', 'Series A', 'Series B'];

const GEOGRAPHIES = ['North America', 'Europe', 'Asia-Pacific', 'Other'];

export default function PortfolioConstructor() {
  const { funds, primaryFund, isLoading: fundsLoading } = useFundData();
  const queryClient = useQueryClient();

  // Strategy state
  const [strategy, setStrategy] = useState<PortfolioStrategy>({
    name: 'Default Strategy',
    fundSize: 50000000, // $50M
    totalFundSize: 50000000, // Same as fundSize for backward compatibility
    deploymentPeriodMonths: 36,
    targetPortfolioSize: 25,
    checkSizes: {
      min: 500000,
      target: 1000000,
      max: 2000000
    },
    sectorAllocation: {
      'FinTech': 0.3,
      'SaaS': 0.25,
      'HealthTech': 0.2,
      'AI/ML': 0.15,
      'Other': 0.1
    },
    stageAllocation: {
      'Seed': 0.4,
      'Series A': 0.45,
      'Series B': 0.15
    },
    geographicAllocation: {
      'North America': 0.7,
      'Europe': 0.2,
      'Asia-Pacific': 0.1
    },
    reservePercentage: 50,
    reserveRatio: 0.5, // Convert percentage to ratio for backward compatibility
    allocatedCapital: 0, // Initialize allocated capital
    scenarios: [
      {
        name: 'Base Case',
        type: 'base_case',
        marketEnvironment: 'normal',
        dealFlowMultiplier: 1.0,
        valuationMultiplier: 1.0,
        exitMultiplier: 1.0
      },
      {
        name: 'Optimistic',
        type: 'optimistic',
        marketEnvironment: 'bull',
        dealFlowMultiplier: 1.3,
        valuationMultiplier: 0.85,
        exitMultiplier: 1.4
      },
      {
        name: 'Pessimistic',
        type: 'pessimistic',
        marketEnvironment: 'bear',
        dealFlowMultiplier: 0.7,
        valuationMultiplier: 1.3,
        exitMultiplier: 0.6
      }
    ]
  });

  const [activeScenario, setActiveScenario] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);

  // Calculated metrics
  const calculatedMetrics = useMemo(() => {
    const initialCapital = strategy.fundSize * (1 - strategy.reservePercentage / 100);
    const reserveCapital = strategy.fundSize * (strategy.reservePercentage / 100);
    const avgCheckSize = strategy.checkSizes.target;
    const estimatedDeals = Math.floor(initialCapital / avgCheckSize);

    // Simple IRR calculation based on scenario
    const currentScenario = strategy.scenarios[activeScenario];
    const baseIRR = 0.25; // 25% base IRR
    const scenarioMultiplier = currentScenario?.exitMultiplier || 1.0;
    const projectedIRR = baseIRR * scenarioMultiplier;

    const projectedMultiple = 3.0 * scenarioMultiplier;
    const projectedDPI = 1.8 * scenarioMultiplier;
    const projectedTVPI = 2.5 * scenarioMultiplier;

    return {
      initialCapital,
      reserveCapital,
      avgCheckSize,
      estimatedDeals,
      projectedIRR,
      projectedMultiple,
      projectedDPI,
      projectedTVPI,
      deploymentPerQuarter: initialCapital / (strategy.deploymentPeriodMonths / 3)
    };
  }, [strategy, activeScenario]);

  // Mock API calls
  const saveStrategy = useMutation({
    mutationFn: async (strategyData: PortfolioStrategy) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { id: Date.now().toString(), ...strategyData };
    },
    onSuccess: () => {
      toast({
        title: "Strategy Saved",
        description: "Portfolio strategy has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['portfolio-strategies'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save strategy. Please try again.",
        variant: "destructive",
      });
    }
  });

  const runSimulation = useMutation({
    mutationFn: async (strategyData: PortfolioStrategy) => {
      setIsSimulating(true);
      // Simulate Monte Carlo simulation
      await new Promise(resolve => setTimeout(resolve, 3000));
      return {
        scenarios: strategyData.scenarios.map(scenario => ({
          ...scenario,
          results: {
            irr: calculatedMetrics.projectedIRR + (Math.random() - 0.5) * 0.1,
            multiple: calculatedMetrics.projectedMultiple + (Math.random() - 0.5) * 0.5,
            dpi: calculatedMetrics.projectedDPI + (Math.random() - 0.5) * 0.3
          }
        }))
      };
    },
    onSuccess: () => {
      setIsSimulating(false);
      toast({
        title: "Simulation Complete",
        description: "Monte Carlo simulation has completed successfully.",
      });
    },
    onError: () => {
      setIsSimulating(false);
      toast({
        title: "Simulation Failed",
        description: "Failed to run simulation. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Helper functions
  const updateStrategy = <K extends keyof PortfolioStrategy>(field: K, value: PortfolioStrategy[K]) => {
    setStrategy(prev => {
      const updated = { ...prev, [field]: value };

      // Maintain consistency between original and alias properties
      if (field === 'fundSize') {
        updated.totalFundSize = value as number;
      } else if (field === 'totalFundSize') {
        updated.fundSize = value as number;
      } else if (field === 'reservePercentage') {
        updated.reserveRatio = (value as number) / 100; // Convert percentage to ratio
      } else if (field === 'reserveRatio') {
        updated.reservePercentage = (value as number) * 100; // Convert ratio to percentage
      }

      return updated;
    });
  };

  const updateCheckSizes = (field: keyof CheckSizeConfig, value: number) => {
    setStrategy(prev => ({
      ...prev,
      checkSizes: { ...prev.checkSizes, [field]: value }
    }));
  };

  const updateAllocation = (type: 'sectorAllocation' | 'stageAllocation' | 'geographicAllocation', key: string, value: number) => {
    setStrategy(prev => ({
      ...prev,
      [type]: { ...prev[type], [key]: value }
    }));
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Prepare chart data
  const sectorChartData = Object.entries(strategy.sectorAllocation).map(([sector, percentage]) => ({
    name: sector,
    value: percentage,
    amount: strategy.fundSize * percentage
  }));

  const stageChartData = Object.entries(strategy.stageAllocation).map(([stage, percentage]) => ({
    name: stage,
    value: percentage,
    amount: strategy.fundSize * percentage
  }));

  const deploymentScheduleData = Array.from({ length: strategy.deploymentPeriodMonths }, (_, i) => ({
    month: i + 1,
    cumulative: (calculatedMetrics.initialCapital * (i + 1)) / strategy.deploymentPeriodMonths,
    quarterly: i % 3 === 2 ? calculatedMetrics.deploymentPerQuarter : 0
  }));

  if (fundsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portfolio Constructor</h1>
          <p className="text-gray-600 mt-1">Build and optimize your fund's portfolio strategy</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => saveStrategy.mutate(strategy)}
            disabled={saveStrategy.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {saveStrategy.isPending ? 'Saving...' : 'Save Strategy'}
          </Button>
          <Button
            onClick={() => runSimulation.mutate(strategy)}
            disabled={isSimulating}
          >
            <Play className="w-4 h-4 mr-2" />
            {isSimulating ? 'Simulating...' : 'Run Simulation'}
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <StatCardGrid>
        <StatCard
          title="Fund Size"
          value={formatCurrency(strategy.fundSize)}
          icon={DollarSign}
          description="Total fund capital"
        />
        <StatCard
          title="Initial Capital"
          value={formatCurrency(calculatedMetrics.initialCapital)}
          icon={Target}
          description={`${100 - strategy.reservePercentage}% for initial investments`}
        />
        <StatCard
          title="Reserve Capital"
          value={formatCurrency(calculatedMetrics.reserveCapital)}
          icon={Percent}
          description={`${strategy.reservePercentage}% for follow-ons`}
        />
        <StatCard
          title="Projected IRR"
          value={formatPercentage(calculatedMetrics.projectedIRR)}
          icon={TrendingUp}
          description={`${strategy.scenarios[activeScenario]?.name || 'Base'} scenario`}
          trend={{
            value: (calculatedMetrics.projectedIRR - 0.25) * 100,
            label: 'vs 25% target',
            direction: calculatedMetrics.projectedIRR > 0.25 ? 'up' : 'down'
          }}
        />
      </StatCardGrid>

      <Tabs defaultValue="strategy" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-fit">
          <TabsTrigger value="strategy">Strategy Builder</TabsTrigger>
          <TabsTrigger value="scenarios">Scenario Modeling</TabsTrigger>
          <TabsTrigger value="metrics">Projections</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Strategy Builder Tab */}
        <TabsContent value="strategy" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fund Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Fund Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fundSize">Fund Size ($)</Label>
                    <Input
                      id="fundSize"
                      type="number"
                      value={strategy.fundSize}
                      onChange={(e) => updateStrategy('fundSize', Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="portfolioSize">Target Portfolio Size</Label>
                    <Input
                      id="portfolioSize"
                      type="number"
                      value={strategy.targetPortfolioSize}
                      onChange={(e) => updateStrategy('targetPortfolioSize', Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="deploymentPeriod">Deployment Period (Months)</Label>
                  <Input
                    id="deploymentPeriod"
                    type="number"
                    value={strategy.deploymentPeriodMonths}
                    onChange={(e) => updateStrategy('deploymentPeriodMonths', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Reserve Percentage: {strategy.reservePercentage}%</Label>
                  <Slider
                    value={[strategy.reservePercentage]}
                    onValueChange={([value]) => updateStrategy('reservePercentage', value)}
                    max={70}
                    min={20}
                    step={5}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>20%</span>
                    <span>70%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Check Size Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Check Size Range
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="minCheck">Minimum Check ($)</Label>
                  <Input
                    id="minCheck"
                    type="number"
                    value={strategy.checkSizes.min}
                    onChange={(e) => updateCheckSizes('min', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="targetCheck">Target Check ($)</Label>
                  <Input
                    id="targetCheck"
                    type="number"
                    value={strategy.checkSizes.target}
                    onChange={(e) => updateCheckSizes('target', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="maxCheck">Maximum Check ($)</Label>
                  <Input
                    id="maxCheck"
                    type="number"
                    value={strategy.checkSizes.max}
                    onChange={(e) => updateCheckSizes('max', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>

                <div className="pt-2">
                  <div className="text-sm text-gray-600">
                    Estimated Initial Deals: <span className="font-medium">{calculatedMetrics.estimatedDeals}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Average Check: <span className="font-medium">{formatCurrency(calculatedMetrics.avgCheckSize)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Allocation Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sector Allocation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5" />
                  Sector Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={(props) => `${props.name || ''} ${formatPercentage(props.value || 0)}`}
                        labelLine={false}
                      >
                        {sectorChartData.map((entry, index) => (
                          <Cell key={`sector-${index}`} fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatPercentage(Number(value) || 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {Object.entries(strategy.sectorAllocation).map(([sector, percentage]) => (
                    <div key={sector} className="flex items-center justify-between">
                      <span className="text-sm">{sector}</span>
                      <Badge variant="outline">{formatPercentage(percentage)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Stage Allocation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Stage Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => formatPercentage(Number(value) || 0)} />
                      <Tooltip formatter={(value) => formatPercentage(Number(value) || 0)} />
                      <Bar dataKey="value" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {Object.entries(strategy.stageAllocation).map(([stage, percentage]) => (
                    <div key={stage} className="flex items-center justify-between">
                      <span className="text-sm">{stage}</span>
                      <Badge variant="outline">{formatPercentage(percentage)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Geographic Allocation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Geographic Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(strategy.geographicAllocation).map(([region, percentage]) => (
                    <div key={region}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">{region}</span>
                        <Badge variant="outline">{formatPercentage(percentage)}</Badge>
                      </div>
                      <Progress value={percentage * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Scenario Modeling Tab */}
        <TabsContent value="scenarios" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scenario Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Scenario Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {strategy.scenarios.map((scenario, index) => (
                      <Button
                        key={index}
                        variant={activeScenario === index ? "default" : "outline"}
                        onClick={() => setActiveScenario(index)}
                        className="flex-1"
                      >
                        {scenario.name}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label>Market Environment</Label>
                      <Select
                        value={strategy.scenarios[activeScenario]?.marketEnvironment ?? 'normal'}
                        onValueChange={(value: string) => {
                          const updatedScenarios = [...strategy.scenarios];
                          const current = updatedScenarios[activeScenario];
                          if (!current) {
                            console.warn(`[PortfolioConstructor] Invalid scenario index: ${activeScenario}, scenarios.length: ${updatedScenarios.length}`);
                            return;
                          }
                          updatedScenarios[activeScenario] = {
                            ...current,
                            marketEnvironment: value as 'bull' | 'normal' | 'bear' | 'recession'
                          };
                          updateStrategy('scenarios', updatedScenarios);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bull">Bull Market</SelectItem>
                          <SelectItem value="normal">Normal Market</SelectItem>
                          <SelectItem value="bear">Bear Market</SelectItem>
                          <SelectItem value="recession">Recession</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Deal Flow Multiplier: {strategy.scenarios[activeScenario]?.dealFlowMultiplier.toFixed(1)}x</Label>
                      <Slider
                        value={[strategy.scenarios[activeScenario]?.dealFlowMultiplier || 1.0]}
                        onValueChange={([value]) => {
                          const updatedScenarios = [...strategy.scenarios];
                          const current = updatedScenarios[activeScenario];
                          if (!current) {
                            console.warn(`[PortfolioConstructor] Invalid scenario index: ${activeScenario}, scenarios.length: ${updatedScenarios.length}`);
                            return;
                          }
                          updatedScenarios[activeScenario] = {
                            ...current,
                            dealFlowMultiplier: value ?? 1
                          };
                          updateStrategy('scenarios', updatedScenarios);
                        }}
                        max={2.0}
                        min={0.5}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label>Valuation Multiplier: {strategy.scenarios[activeScenario]?.valuationMultiplier.toFixed(1)}x</Label>
                      <Slider
                        value={[strategy.scenarios[activeScenario]?.valuationMultiplier || 1.0]}
                        onValueChange={([value]) => {
                          const updatedScenarios = [...strategy.scenarios];
                          const current = updatedScenarios[activeScenario];
                          if (!current) {
                            console.warn(`[PortfolioConstructor] Invalid scenario index: ${activeScenario}, scenarios.length: ${updatedScenarios.length}`);
                            return;
                          }
                          updatedScenarios[activeScenario] = {
                            ...current,
                            valuationMultiplier: value ?? 1
                          };
                          updateStrategy('scenarios', updatedScenarios);
                        }}
                        max={2.0}
                        min={0.5}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label>Exit Multiplier: {strategy.scenarios[activeScenario]?.exitMultiplier.toFixed(1)}x</Label>
                      <Slider
                        value={[strategy.scenarios[activeScenario]?.exitMultiplier || 1.0]}
                        onValueChange={([value]) => {
                          const updatedScenarios = [...strategy.scenarios];
                          const current = updatedScenarios[activeScenario];
                          if (!current) {
                            console.warn(`[PortfolioConstructor] Invalid scenario index: ${activeScenario}, scenarios.length: ${updatedScenarios.length}`);
                            return;
                          }
                          updatedScenarios[activeScenario] = {
                            ...current,
                            exitMultiplier: value ?? 1
                          };
                          updateStrategy('scenarios', updatedScenarios);
                        }}
                        max={2.0}
                        min={0.3}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scenario Results */}
            <Card>
              <CardHeader>
                <CardTitle>Scenario Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {strategy.scenarios.map((scenario, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        activeScenario === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{scenario.name}</h4>
                        <Badge
                          variant={scenario.marketEnvironment === 'bull' ? 'default' :
                                  scenario.marketEnvironment === 'recession' ? 'destructive' : 'secondary'}
                        >
                          {scenario.marketEnvironment}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Projected IRR:</span>
                          <div className="font-medium">{formatPercentage(calculatedMetrics.projectedIRR * scenario.exitMultiplier)}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Multiple:</span>
                          <div className="font-medium">{(calculatedMetrics.projectedMultiple * scenario.exitMultiplier).toFixed(1)}x</div>
                        </div>
                        <div>
                          <span className="text-gray-600">DPI:</span>
                          <div className="font-medium">{(calculatedMetrics.projectedDPI * scenario.exitMultiplier).toFixed(1)}x</div>
                        </div>
                        <div>
                          <span className="text-gray-600">TVPI:</span>
                          <div className="font-medium">{(calculatedMetrics.projectedTVPI * scenario.exitMultiplier).toFixed(1)}x</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Projections Tab */}
        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fund Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Projected Fund Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Target IRR</div>
                      <div className="text-2xl font-bold text-green-600">
                        {formatPercentage(calculatedMetrics.projectedIRR)}
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Fund Multiple</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {calculatedMetrics.projectedMultiple.toFixed(1)}x
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">DPI</div>
                      <div className="text-2xl font-bold text-purple-600">
                        {calculatedMetrics.projectedDPI.toFixed(1)}x
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">TVPI</div>
                      <div className="text-2xl font-bold text-orange-600">
                        {calculatedMetrics.projectedTVPI.toFixed(1)}x
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Risk Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <span className="text-sm">Concentration Risk</span>
                    <Badge variant="outline">Medium</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span className="text-sm">Diversification</span>
                    <Badge variant="outline">Good</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <span className="text-sm">Market Risk</span>
                    <Badge variant="outline">Low</Badge>
                  </div>

                  <div className="pt-2">
                    <h4 className="font-medium mb-2">Key Risk Factors:</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• High allocation to early-stage investments</li>
                      <li>• Geographic concentration in North America</li>
                      <li>• Sector concentration in technology</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Capital Deployment Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={deploymentScheduleData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => formatCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="#3B82F6"
                      fill="#3B82F6"
                      fillOpacity={0.3}
                      name="Cumulative Deployment"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Deployment Period</div>
                  <div className="text-lg font-bold">{strategy.deploymentPeriodMonths} months</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Quarterly Deployment</div>
                  <div className="text-lg font-bold">{formatCurrency(calculatedMetrics.deploymentPerQuarter)}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Final Portfolio</div>
                  <div className="text-lg font-bold">{calculatedMetrics.estimatedDeals} companies</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simulation Status */}
      {isSimulating && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <div>
                <div className="font-medium">Running Monte Carlo Simulation</div>
                <div className="text-sm text-gray-600">Analyzing 10,000 scenarios across market conditions...</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
