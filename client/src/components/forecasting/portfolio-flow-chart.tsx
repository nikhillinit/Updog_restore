/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowRight,
  TrendingUp,
  Play,
  Pause,
  RotateCcw
} from "lucide-react";

interface PortfolioFlowChartProps {
  fundData: {
    id: string;
    name: string;
    totalDeals: number;
    monthlyInvestmentRate: number;
  };
}

interface Stage {
  id: string;
  name: string;
  color: string;
  graduationRate: number;
  exitRate: number;
  currentDeals: number;
  monthlyGraduations: number;
  monthlyExits: number;
}

interface FlowStep {
  month: number;
  preSeedInvestments: number;
  seedGraduations: number;
  seriesAGraduations: number;
  seriesBGraduations: number;
  totalExits: number;
}

export default function PortfolioFlowChart({ fundData }: PortfolioFlowChartProps) {
  const [currentMonth, setCurrentMonth] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [flowData, setFlowData] = useState<FlowStep[]>([]);

  const stages: Stage[] = [
    {
      id: "pre-seed",
      name: "Pre-Seed",
      color: "bg-gray-500",
      graduationRate: 35, // 35% graduate to Seed
      exitRate: 0, // No exits at pre-seed
      currentDeals: 54,
      monthlyGraduations: 0.5,
      monthlyExits: 0
    },
    {
      id: "seed",
      name: "Seed", 
      color: "bg-blue-500",
      graduationRate: 50, // 50% graduate to Series A
      exitRate: 5, // 5% exit at seed
      currentDeals: 18,
      monthlyGraduations: 0.25,
      monthlyExits: 0.05
    },
    {
      id: "series-a",
      name: "Series A",
      color: "bg-green-500", 
      graduationRate: 60, // 60% graduate to Series B
      exitRate: 15, // 15% exit at Series A
      currentDeals: 9,
      monthlyGraduations: 0.15,
      monthlyExits: 0.15
    },
    {
      id: "series-b",
      name: "Series B",
      color: "bg-purple-500",
      graduationRate: 0, // Final stage
      exitRate: 25, // 25% exit at Series B
      currentDeals: 5,
      monthlyGraduations: 0,
      monthlyExits: 0.25
    }
  ];

  // Simulate portfolio flow over time
  useEffect(() => {
    if (isRunning && currentMonth <= 36) {
      const timer = setTimeout(() => {
        const newStep: FlowStep = {
          month: currentMonth,
          preSeedInvestments: fundData.monthlyInvestmentRate,
          seedGraduations: stages[0]?.monthlyGraduations ?? 0,
          seriesAGraduations: stages[1]?.monthlyGraduations ?? 0, 
          seriesBGraduations: stages[2]?.monthlyGraduations ?? 0,
          totalExits: stages.reduce((sum: any, stage: any) => sum + stage.monthlyExits, 0)
        };
        
        setFlowData(prev => [...prev, newStep]);
        setCurrentMonth(prev => prev + 1);
      }, 500); // 500ms per month for demo

      return () => clearTimeout(timer);
    } else if (currentMonth > 36) {
      setIsRunning(false);
    }
  }, [currentMonth, isRunning, fundData.monthlyInvestmentRate, stages]);

  const resetFlow = () => {
    setCurrentMonth(1);
    setFlowData([]);
    setIsRunning(false);
  };

  const toggleFlow = () => {
    setIsRunning(!isRunning);
  };

  const calculateCumulativeStats = () => {
    const totalInvested = flowData.reduce((sum: any, step: any) => sum + step.preSeedInvestments, 0);
    const totalExits = flowData.reduce((sum: any, step: any) => sum + step.totalExits, 0);
    const totalGraduations = flowData.reduce((sum: any, step: any) => 
      sum + step.seedGraduations + step.seriesAGraduations + step.seriesBGraduations, 0);
    
    return { totalInvested, totalExits, totalGraduations };
  };

  const { totalInvested, totalExits, totalGraduations } = calculateCumulativeStats();

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Portfolio Construction Flow</span>
              </CardTitle>
              <CardDescription>
                Monthly investment cadence and stage progression modeling
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={resetFlow}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={toggleFlow} size="sm">
                {isRunning ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {isRunning ? 'Pause' : 'Start'} Flow
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Month</p>
              <p className="text-2xl font-bold">{currentMonth}/36</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Invested</p>
              <p className="text-2xl font-bold">{totalInvested.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Graduations</p>
              <p className="text-2xl font-bold">{totalGraduations.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Exits</p>
              <p className="text-2xl font-bold">{totalExits.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Investment Flow Visualization</CardTitle>
          <CardDescription>
            {fundData.totalDeals} pre-seed deals • {fundData.monthlyInvestmentRate} deals/month • Repeated for 36 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {/* Month Indicator */}
            <div className="text-center">
              <Badge variant="outline" className="text-lg px-4 py-2">
                Month {currentMonth} Investment
              </Badge>
            </div>

            {/* Flow Diagram */}
            <div className="relative">
              {/* Stages Row */}
              <div className="grid grid-cols-4 gap-6">
                {stages.map((stage: any, index: any) => (
                  <div key={stage.id} className="text-center space-y-4">
                    {/* Stage Header */}
                    <div>
                      <h3 className="font-semibold text-lg">{stage.name}</h3>
                      {index < stages.length - 1 && (
                        <div className="text-sm text-muted-foreground mt-1">
                          <span className="text-blue-600">{stage.name} Graduation %</span>
                        </div>
                      )}
                    </div>

                    {/* Stage Card */}
                    <Card className="border-2 hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className={`w-full h-16 ${stage.color} rounded-lg flex items-center justify-center text-white font-bold text-lg mb-3`}>
                          {index === 0 ? `${fundData.monthlyInvestmentRate} deals` : 
                           index === stages.length - 1 ? `${stage.monthlyExits.toFixed(2)} exits` :
                           `${stage.monthlyGraduations.toFixed(2)} grads`}
                        </div>

                        <div className="space-y-2 text-sm">
                          {index < stages.length - 1 && (
                            <div className="text-center">
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                {stage.graduationRate}% grad rate
                              </Badge>
                            </div>
                          )}
                          
                          {stage.exitRate > 0 && (
                            <div className="text-center">
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                {stage.exitRate}% exit rate
                              </Badge>
                            </div>
                          )}

                          <div className="text-center pt-2">
                            <p className="text-xs text-muted-foreground">Current Portfolio</p>
                            <p className="font-semibold">{stage.currentDeals} companies</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Arrow to next stage */}
                    {index < stages.length - 1 && (
                      <div className="flex justify-center">
                        <ArrowRight className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Timeline Visualization */}
              <div className="mt-8 pt-6 border-t">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold">36-Month Investment Cycle</h4>
                  <Progress value={(currentMonth / 36) * 100} className="w-1/3 h-2" />
                </div>

                <div className="grid grid-cols-12 gap-1">
                  {Array.from({ length: 36 }, (_: any, i: any) => (
                    <div 
                      key={i}
                      className={`h-8 rounded flex items-center justify-center text-xs font-medium ${
                        i + 1 <= currentMonth ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow Statistics */}
      {flowData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Flow Statistics</CardTitle>
            <CardDescription>Cumulative metrics from {flowData.length} months of investments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{totalInvested.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Total Deals Invested</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{totalGraduations.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Total Graduations</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{totalExits.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Total Exits</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {totalInvested > 0 ? ((totalExits / totalInvested) * 100).toFixed(1) : 0}%
                </div>
                <div className="text-sm text-muted-foreground">Exit Rate</div>
              </div>
            </div>

            <Separator className="my-6" />

            {/* Recent Flow Data */}
            <div className="space-y-2">
              <h5 className="font-medium">Recent Monthly Activity</h5>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {flowData.slice(-6).reverse().map((step: any) => (
                  <div key={step.month} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                    <span className="font-medium">Month {step.month}</span>
                    <div className="flex space-x-4">
                      <span className="text-blue-600">{step.preSeedInvestments} invested</span>
                      <span className="text-green-600">{step.totalExits.toFixed(2)} exits</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
