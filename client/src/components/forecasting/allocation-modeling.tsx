/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  DollarSign, 
  Target, 
  Calendar,
  BarChart3,
  PieChart,
  ArrowRight
} from "lucide-react";

interface AllocationModelingProps {
  fundData: {
    id: string;
    name: string;
    size: number;
    investableCapital: number;
  };
}

interface Allocation {
  id: string;
  name: string;
  type: 'seed' | 'series-a' | 'series-b' | 'growth';
  totalCapital: number;
  initialCapital: number;
  followOnCapital: number;
  cadenceMonths: number;
  averageCheckSize: number;
  graduationRate: number;
  exitRate: number;
  averageExitMultiple: number;
  currentDeployed: number;
  projectedInvestments: number;
}

interface ForecastStep {
  step: number;
  title: string;
  description: string;
  isComplete: boolean;
}

export default function AllocationModeling({ fundData }: AllocationModelingProps) {
  const [activeStep, setActiveStep] = useState(0);

  // Sample allocation data based on Tactyc methodology
  const allocations: Allocation[] = [
    {
      id: "seed",
      name: "Seed Investments",
      type: "seed",
      totalCapital: 12000000,
      initialCapital: 8000000,
      followOnCapital: 4000000,
      cadenceMonths: 3,
      averageCheckSize: 500000,
      graduationRate: 65,
      exitRate: 25,
      averageExitMultiple: 8.5,
      currentDeployed: 3500000,
      projectedInvestments: 16
    },
    {
      id: "series-a",
      name: "Series A Investments", 
      type: "series-a",
      totalCapital: 20000000,
      initialCapital: 15000000,
      followOnCapital: 5000000,
      cadenceMonths: 6,
      averageCheckSize: 1500000,
      graduationRate: 75,
      exitRate: 40,
      averageExitMultiple: 4.2,
      currentDeployed: 6000000,
      projectedInvestments: 10
    },
    {
      id: "series-b",
      name: "Series B Investments",
      type: "series-b", 
      totalCapital: 15000000,
      initialCapital: 12000000,
      followOnCapital: 3000000,
      cadenceMonths: 12,
      averageCheckSize: 3000000,
      graduationRate: 80,
      exitRate: 60,
      averageExitMultiple: 2.8,
      currentDeployed: 3000000,
      projectedInvestments: 4
    },
    {
      id: "growth",
      name: "Growth Investments",
      type: "growth",
      totalCapital: 8000000,
      initialCapital: 6000000,
      followOnCapital: 2000000,
      cadenceMonths: 18,
      averageCheckSize: 2000000,
      graduationRate: 85,
      exitRate: 75,
      averageExitMultiple: 2.1,
      currentDeployed: 2000000,
      projectedInvestments: 3
    }
  ];

  const forecastSteps: ForecastStep[] = [
    {
      step: 1,
      title: "Determine Investable Capital",
      description: "Net fees and expenses from committed capital, include exit recycling proceeds",
      isComplete: true
    },
    {
      step: 2,
      title: "Create Allocations",
      description: "Segment investable capital into Initial and Follow-On allocations by stage",
      isComplete: true
    },
    {
      step: 3,
      title: "Project Initial Investments",
      description: "Monthly straight-line projections based on allocation cadence",
      isComplete: false
    },
    {
      step: 4,
      title: "Project Follow-On Investments",
      description: "Weight follow-on checks by graduation rates for probabilistic modeling",
      isComplete: false
    },
    {
      step: 5,
      title: "Project Exits and Failures",
      description: "Weight exit values by exit rates, assume failures at 0.0x multiple",
      isComplete: false
    },
    {
      step: 6,
      title: "Compute Return Metrics",
      description: "Calculate proceeds through waterfall to determine IRR, TVPI, and multiples",
      isComplete: false
    }
  ];

  const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.totalCapital, 0);
  const totalDeployed = allocations.reduce((sum, alloc) => sum + alloc.currentDeployed, 0);
  const deploymentProgress = (totalDeployed / totalAllocated) * 100;

  const getStageColor = (type: string) => {
    switch (type) {
      case 'seed': return 'bg-green-500';
      case 'series-a': return 'bg-blue-500';
      case 'series-b': return 'bg-purple-500';
      case 'growth': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const calculateProjectedReturns = (allocation: Allocation) => {
    const totalInvestments = allocation.projectedInvestments;
    const successfulExits = totalInvestments * (allocation.exitRate / 100);
    const projectedExitValue = successfulExits * allocation.averageCheckSize * allocation.averageExitMultiple;
    const projectedTVPI = projectedExitValue / allocation.totalCapital;
    return { projectedExitValue, projectedTVPI };
  };

  return (
    <div className="space-y-6">
      {/* Fund Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Fund Construction Methodology</span>
          </CardTitle>
          <CardDescription>
            Portfolio construction based on Tactyc forecasting logic
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Fund Size</p>
              <p className="text-2xl font-bold">${(fundData.size / 1000000).toFixed(0)}M</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Investable Capital</p>
              <p className="text-2xl font-bold">${(fundData.investableCapital / 1000000).toFixed(0)}M</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Allocated</p>
              <p className="text-2xl font-bold">${(totalAllocated / 1000000).toFixed(0)}M</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Deployed</p>
              <p className="text-2xl font-bold">${(totalDeployed / 1000000).toFixed(1)}M</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Deployment Progress</span>
              <span>{deploymentProgress.toFixed(1)}%</span>
            </div>
            <Progress value={deploymentProgress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Construction Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Forecasting Methodology Steps</CardTitle>
          <CardDescription>Six-step process for portfolio construction modeling</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {forecastSteps.map((step, index) => (
              <div key={step.step} className="flex items-start space-x-4">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step.isComplete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}
                `}>
                  {step.step}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                {step.isComplete && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Complete
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Allocation Analysis */}
      <div className="grid gap-4">
        {allocations.map((allocation) => {
          const { projectedExitValue, projectedTVPI } = calculateProjectedReturns(allocation);
          const deploymentRate = (allocation.currentDeployed / allocation.totalCapital) * 100;

          return (
            <Card key={allocation.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded ${getStageColor(allocation.type)}`} />
                    <CardTitle className="text-lg">{allocation.name}</CardTitle>
                  </div>
                  <Badge variant="outline">
                    {allocation.projectedInvestments} investments
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Capital</p>
                    <p className="font-semibold">${(allocation.totalCapital / 1000000).toFixed(1)}M</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Initial Capital</p>
                    <p className="font-semibold">${(allocation.initialCapital / 1000000).toFixed(1)}M</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Follow-On Capital</p>
                    <p className="font-semibold">${(allocation.followOnCapital / 1000000).toFixed(1)}M</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Check Size</p>
                    <p className="font-semibold">${(allocation.averageCheckSize / 1000).toFixed(0)}k</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Graduation Rate</p>
                    <p className="font-semibold">{allocation.graduationRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exit Rate</p>
                    <p className="font-semibold">{allocation.exitRate}%</p>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Currently Deployed</p>
                    <p className="font-semibold">${(allocation.currentDeployed / 1000000).toFixed(1)}M</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Deployment Rate</p>
                    <p className="font-semibold">{deploymentRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Projected Exit Value</p>
                    <p className="font-semibold">${(projectedExitValue / 1000000).toFixed(1)}M</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Projected TVPI</p>
                    <p className="font-semibold">{projectedTVPI.toFixed(2)}x</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Capital Deployment</span>
                    <span>{deploymentRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={deploymentRate} className="h-2" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <Button variant="outline">
          <PieChart className="h-4 w-4 mr-2" />
          View Allocation Chart
        </Button>
        <Button>
          <ArrowRight className="h-4 w-4 mr-2" />
          Run Forecast Model
        </Button>
      </div>
    </div>
  );
}
