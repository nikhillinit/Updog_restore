import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend
} from 'recharts';
import {
  Copy,
  Trash2,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { spreadIfDefined } from '@/lib/spreadIfDefined';
import type { PortfolioState } from "@/pages/portfolio-constructor";

interface Scenario {
  id: string;
  name: string;
  description: string;
  parameters: {
    deploymentSpeed: number; // 0-100%
    riskTolerance: number; // 1-10
    sectorFocus: string;
    reserveRatio: number; // 0-1
    targetReturns: number; // multiple
    exitTimeline: number; // years
  };
  projections: {
    irr: number;
    multiple: number;
    riskScore: number;
    timeToFullDeployment: number;
    probabilityOfSuccess: number;
  };
  color: string;
  isBaseline?: boolean;
}

interface ScenarioComparisonProps {
  portfolioState: PortfolioState;
  onUpdate: (updates: Partial<PortfolioState>) => void;
  isCalculating: boolean;
}

const defaultScenarios: Scenario[] = [
  {
    id: 'baseline',
    name: 'Current Strategy',
    description: 'Current portfolio allocation and strategy',
    parameters: {
      deploymentSpeed: 75,
      riskTolerance: 6,
      sectorFocus: 'balanced',
      reserveRatio: 0.35,
      targetReturns: 2.8,
      exitTimeline: 5
    },
    projections: {
      irr: 0.22,
      multiple: 2.8,
      riskScore: 6.2,
      timeToFullDeployment: 3.2,
      probabilityOfSuccess: 0.72
    },
    color: '#2563eb',
    isBaseline: true
  },
  {
    id: 'aggressive',
    name: 'Aggressive Growth',
    description: 'Higher risk, faster deployment, growth-focused',
    parameters: {
      deploymentSpeed: 90,
      riskTolerance: 8,
      sectorFocus: 'growth',
      reserveRatio: 0.25,
      targetReturns: 3.5,
      exitTimeline: 4
    },
    projections: {
      irr: 0.28,
      multiple: 3.2,
      riskScore: 8.1,
      timeToFullDeployment: 2.1,
      probabilityOfSuccess: 0.58
    },
    color: '#dc2626'
  },
  {
    id: 'conservative',
    name: 'Conservative Approach',
    description: 'Lower risk, steady deployment, value-focused',
    parameters: {
      deploymentSpeed: 55,
      riskTolerance: 4,
      sectorFocus: 'value',
      reserveRatio: 0.45,
      targetReturns: 2.2,
      exitTimeline: 7
    },
    projections: {
      irr: 0.18,
      multiple: 2.4,
      riskScore: 4.3,
      timeToFullDeployment: 4.8,
      probabilityOfSuccess: 0.85
    },
    color: '#059669'
  }
];

const sectorFocusOptions = [
  { value: 'balanced', label: 'Balanced Portfolio' },
  { value: 'growth', label: 'Growth Focus' },
  { value: 'value', label: 'Value Focus' },
  { value: 'sector-specific', label: 'Sector Specific' },
  { value: 'stage-agnostic', label: 'Stage Agnostic' }
];

export function ScenarioComparison({
  portfolioState,
  onUpdate,
  isCalculating
}: ScenarioComparisonProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>(defaultScenarios);
  const [selectedScenario, setSelectedScenario] = useState<string>('baseline');
  const [comparisonMetric, setComparisonMetric] = useState<'irr' | 'multiple' | 'risk' | 'timeline'>('irr');

  const selectedScenarioData = scenarios.find(s => s.id === selectedScenario);

  // Generate time series data for comparison
  const timeSeriesData = useMemo(() => {
    const years = Array.from({ length: 8 }, (_: any, i: any) => i);

    return years.map(year => {
      const dataPoint: any = { year: `Y${year}` };

      scenarios.forEach(scenario => {
        // Simulate different growth curves based on scenario parameters
        const baseGrowth = Math.pow(1 + scenario.projections.irr, year);
        const volatility = (scenario.projections.riskScore / 10) * 0.1;
        const randomness = (Math.random() - 0.5) * volatility;

        dataPoint[scenario.name] = Math.max(0, baseGrowth + randomness);
      });

      return dataPoint;
    });
  }, [scenarios]);

  // Generate radar chart data
  const radarData = useMemo(() => {
    const metrics = [
      { metric: 'IRR', field: 'irr', max: 0.35 },
      { metric: 'Multiple', field: 'multiple', max: 4 },
      { metric: 'Risk (inv)', field: 'riskScore', max: 10, invert: true },
      { metric: 'Success Prob', field: 'probabilityOfSuccess', max: 1 },
      { metric: 'Speed', field: 'timeToFullDeployment', max: 6, invert: true }
    ];

    return metrics.map(({ metric, field, max, invert }) => {
      const dataPoint: any = { metric };

      scenarios.forEach(scenario => {
        let value = (scenario.projections as any)[field];
        if (invert) {
          value = max - value;
        }
        dataPoint[scenario.name] = (value / max) * 100;
      });

      return dataPoint;
    });
  }, [scenarios]);

  const addNewScenario = () => {
    const newScenario: Scenario = {
      id: `scenario-${Date.now()}`,
      name: `New Scenario`,
      description: 'Custom scenario',
      parameters: {
        deploymentSpeed: 70,
        riskTolerance: 6,
        sectorFocus: 'balanced',
        reserveRatio: 0.35,
        targetReturns: 2.5,
        exitTimeline: 5
      },
      projections: {
        irr: 0.20,
        multiple: 2.5,
        riskScore: 6.0,
        timeToFullDeployment: 3.5,
        probabilityOfSuccess: 0.70
      },
      color: '#7c3aed'
    };
    setScenarios(prev => [...prev, newScenario]);
  };

  const duplicateScenario = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const newScenario = {
      ...scenario,
      id: `scenario-${Date.now()}`,
      name: `${scenario.name} Copy`,
      isBaseline: false
    };
    setScenarios(prev => [...prev, newScenario]);
  };

  const removeScenario = (scenarioId: string) => {
    setScenarios(prev => prev.filter(s => s.id !== scenarioId));
    if (selectedScenario === scenarioId) {
      setSelectedScenario(scenarios[0]?.id || '');
    }
  };

  const updateScenarioParameter = (scenarioId: string, parameter: string, value: any) => {
    setScenarios(prev => prev.map(scenario => {
      if (scenario.id !== scenarioId) return scenario;

      const updatedScenario = {
        ...scenario,
        parameters: {
          ...scenario.parameters,
          [parameter]: value
        }
      };

      // Recalculate projections based on parameters (simplified)
      const risk = updatedScenario.parameters.riskTolerance;
      const speed = updatedScenario.parameters.deploymentSpeed / 100;
      const reserve = updatedScenario.parameters.reserveRatio;

      updatedScenario.projections = {
        irr: Math.max(0.1, Math.min(0.35, 0.15 + (risk * 0.02) + (speed * 0.05))),
        multiple: Math.max(1.5, Math.min(4.0, 2.0 + (risk * 0.15) + (speed * 0.1))),
        riskScore: risk + (speed * 2) - (reserve * 5),
        timeToFullDeployment: Math.max(1, 6 - speed * 4),
        probabilityOfSuccess: Math.max(0.3, Math.min(0.9, 0.8 - (risk * 0.05) + (reserve * 0.3)))
      };

      return updatedScenario;
    }));
  };

  const applyScenario = (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    onUpdate({
      reserveRatio: scenario.parameters.reserveRatio,
      projectedIRR: scenario.projections.irr,
      targetReturns: scenario.projections.multiple,
      riskScore: scenario.projections.riskScore
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey}: <span className="font-medium">{entry.value.toFixed(2)}x</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
        <div>
          <h3 className="text-lg font-semibold">Scenario Analysis</h3>
          <p className="text-sm text-gray-600">Compare different strategic approaches</p>
        </div>

        <div className="flex items-center space-x-3">
          <Select value={comparisonMetric} onValueChange={(value: any) => setComparisonMetric(value)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Compare by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="irr">IRR</SelectItem>
              <SelectItem value="multiple">Multiple</SelectItem>
              <SelectItem value="risk">Risk Score</SelectItem>
              <SelectItem value="timeline">Timeline</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={addNewScenario}
            className="flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Scenario
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Scenarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {scenarios.map(scenario => (
              <div
                key={scenario.id}
                className={cn(
                  "p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md",
                  selectedScenario === scenario.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                )}
                onClick={() => setSelectedScenario(scenario.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: scenario.color }}
                    />
                    <div>
                      <p className="font-medium text-sm">{scenario.name}</p>
                      <p className="text-xs text-gray-500">{scenario.description}</p>
                    </div>
                  </div>

                  {scenario.isBaseline && (
                    <Badge variant="secondary" className="text-xs">
                      Baseline
                    </Badge>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">IRR:</span>
                    <span className="ml-1 font-medium">{(scenario.projections.irr * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Multiple:</span>
                    <span className="ml-1 font-medium">{scenario.projections.multiple.toFixed(1)}x</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Risk:</span>
                    <span className="ml-1 font-medium">{scenario.projections.riskScore.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Success:</span>
                    <span className="ml-1 font-medium">{(scenario.projections.probabilityOfSuccess * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="mt-3 flex justify-end space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e: any) => {
                      e.stopPropagation();
                      duplicateScenario(scenario.id);
                    }}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>

                  {!scenario.isBaseline && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        removeScenario(scenario.id);
                      }}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e: any) => {
                      e.stopPropagation();
                      applyScenario(scenario.id);
                    }}
                    className="h-6 text-xs px-2"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Scenario Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedScenarioData?.name} Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedScenarioData && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="scenario-name">Scenario Name</Label>
                    <Input
                      id="scenario-name"
                      value={selectedScenarioData.name}
                      onChange={(e: any) => {
                        setScenarios(prev => prev.map(s =>
                          s.id === selectedScenario
                            ? { ...s, name: e.target.value }
                            : s
                        ));
                      }}
                      disabled={selectedScenarioData.isBaseline}
                    />
                  </div>
                  <div>
                    <Label htmlFor="scenario-description">Description</Label>
                    <Input
                      id="scenario-description"
                      value={selectedScenarioData.description}
                      onChange={(e: any) => {
                        setScenarios(prev => prev.map(s =>
                          s.id === selectedScenario
                            ? { ...s, description: e.target.value }
                            : s
                        ));
                      }}
                      disabled={selectedScenarioData.isBaseline}
                    />
                  </div>
                </div>

                {/* Parameters */}
                <div className="space-y-4">
                  <h4 className="font-medium">Strategy Parameters</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Deployment Speed */}
                    <div className="space-y-2">
                      <Label>Deployment Speed</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[selectedScenarioData.parameters.deploymentSpeed]}
                          onValueChange={([value]) => updateScenarioParameter(selectedScenario, 'deploymentSpeed', value)}
                          max={100}
                          step={5}
                          disabled={selectedScenarioData.isBaseline ?? false}
                        />
                        <div className="text-sm text-gray-600">
                          {selectedScenarioData.parameters.deploymentSpeed}% of target pace
                        </div>
                      </div>
                    </div>

                    {/* Risk Tolerance */}
                    <div className="space-y-2">
                      <Label>Risk Tolerance</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[selectedScenarioData.parameters.riskTolerance]}
                          onValueChange={([value]) => updateScenarioParameter(selectedScenario, 'riskTolerance', value)}
                          min={1}
                          max={10}
                          step={0.5}
                          disabled={selectedScenarioData.isBaseline ?? false}
                        />
                        <div className="text-sm text-gray-600">
                          {selectedScenarioData.parameters.riskTolerance}/10 (Conservative → Aggressive)
                        </div>
                      </div>
                    </div>

                    {/* Reserve Ratio */}
                    <div className="space-y-2">
                      <Label>Reserve Ratio</Label>
                      <div className="space-y-2">
                        <Slider
                          value={[selectedScenarioData.parameters.reserveRatio * 100]}
                          onValueChange={([value]) => updateScenarioParameter(selectedScenario, 'reserveRatio', (value ?? 0) / 100)}
                          max={50}
                          step={2.5}
                          {...spreadIfDefined("disabled", selectedScenarioData.isBaseline)}
                        />
                        <div className="text-sm text-gray-600">
                          {(selectedScenarioData.parameters.reserveRatio * 100).toFixed(1)}% held in reserves
                        </div>
                      </div>
                    </div>

                    {/* Sector Focus */}
                    <div className="space-y-2">
                      <Label>Sector Focus</Label>
                      <Select
                        value={selectedScenarioData.parameters.sectorFocus}
                        onValueChange={(value: any) => updateScenarioParameter(selectedScenario, 'sectorFocus', value)}
                        {...spreadIfDefined("disabled", selectedScenarioData.isBaseline)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sectorFocusOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Projections */}
                <div className="space-y-3">
                  <h4 className="font-medium">Projected Outcomes</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">IRR</p>
                      <p className="text-lg font-bold text-blue-600">
                        {(selectedScenarioData.projections.irr * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Multiple</p>
                      <p className="text-lg font-bold text-green-600">
                        {selectedScenarioData.projections.multiple.toFixed(1)}x
                      </p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Risk Score</p>
                      <p className="text-lg font-bold text-orange-600">
                        {selectedScenarioData.projections.riskScore.toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Success Prob</p>
                      <p className="text-lg font-bold text-purple-600">
                        {(selectedScenarioData.projections.probabilityOfSuccess * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time Series Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Portfolio Value Projection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value: any) => `${value.toFixed(1)}x`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {scenarios.map(scenario => (
                    <Line
                      key={scenario.id}
                      type="monotone"
                      dataKey={scenario.name}
                      stroke={scenario.color}
                      strokeWidth={scenario.isBaseline ? 3 : 2}
                      strokeDasharray={scenario.isBaseline ? "0" : "5 5"}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Radar Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Multi-Factor Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
                  {scenarios.map(scenario => (
                    <Radar
                      key={scenario.id}
                      name={scenario.name}
                      dataKey={scenario.name}
                      stroke={scenario.color}
                      fill={scenario.color}
                      fillOpacity={scenario.isBaseline ? 0.3 : 0.1}
                      strokeWidth={scenario.isBaseline ? 3 : 2}
                    />
                  ))}
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}