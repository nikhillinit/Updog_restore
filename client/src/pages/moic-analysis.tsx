import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Target,
  Calculator,
  Info,
  Award,
  AlertTriangle,
  BarChart3,
  PieChart as PieChartIcon,
  Activity
} from "lucide-react";

interface MOICMetric {
  company: string;
  currentMOIC: number;
  currentMOICOnInitial: number;
  currentMOICOnDeployedReserves: number;
  exitMOIC: number;
  exitMOICOnInitial: number;
  exitMOICOnFollowOns: number;
  exitMOICOnPlannedReserves: number;
  totalInvestment: number;
  initialInvestment: number;
  deployedReserves: number;
  plannedReserves: number;
  sector: string;
  stage: string;
}

interface MOICComparison {
  metric: string;
  question: string;
  calculation: string;
  category: 'performance' | 'planning';
}

export default function MOICAnalysisPage() {
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [selectedView, setSelectedView] = useState<'table' | 'chart' | 'comparison'>('table');
  const [selectedMOICType, setSelectedMOICType] = useState<string>("exitMOICOnPlannedReserves");

  // Sample MOIC data based on your documentation
  const moicData: MOICMetric[] = [
    {
      company: "Company H",
      currentMOIC: 3.2,
      currentMOICOnInitial: 4.1,
      currentMOICOnDeployedReserves: 2.8,
      exitMOIC: 7.06,
      exitMOICOnInitial: 8.2,
      exitMOICOnFollowOns: 6.1,
      exitMOICOnPlannedReserves: 7.06,
      totalInvestment: 2500000,
      initialInvestment: 1000000,
      deployedReserves: 800000,
      plannedReserves: 700000,
      sector: "AI/ML",
      stage: "Series B"
    },
    {
      company: "Company L",
      currentMOIC: 2.8,
      currentMOICOnInitial: 3.5,
      currentMOICOnDeployedReserves: 2.2,
      exitMOIC: 6.21,
      exitMOICOnInitial: 7.1,
      exitMOICOnFollowOns: 5.4,
      exitMOICOnPlannedReserves: 6.21,
      totalInvestment: 1800000,
      initialInvestment: 750000,
      deployedReserves: 600000,
      plannedReserves: 450000,
      sector: "Fintech",
      stage: "Series A"
    },
    {
      company: "Company J",
      currentMOIC: 1.9,
      currentMOICOnInitial: 2.4,
      currentMOICOnDeployedReserves: 1.6,
      exitMOIC: 3.24,
      exitMOICOnInitial: 3.8,
      exitMOICOnFollowOns: 2.9,
      exitMOICOnPlannedReserves: 3.24,
      totalInvestment: 1200000,
      initialInvestment: 500000,
      deployedReserves: 400000,
      plannedReserves: 300000,
      sector: "Healthcare",
      stage: "Seed"
    },
    {
      company: "Company B",
      currentMOIC: 1.7,
      currentMOICOnInitial: 2.1,
      currentMOICOnDeployedReserves: 1.4,
      exitMOIC: 3.13,
      exitMOICOnInitial: 3.6,
      exitMOICOnFollowOns: 2.7,
      exitMOICOnPlannedReserves: 3.13,
      totalInvestment: 2000000,
      initialInvestment: 800000,
      deployedReserves: 650000,
      plannedReserves: 550000,
      sector: "Enterprise",
      stage: "Series A"
    },
    {
      company: "Company D",
      currentMOIC: 1.5,
      currentMOICOnInitial: 1.8,
      currentMOICOnDeployedReserves: 1.2,
      exitMOIC: 3.12,
      exitMOICOnInitial: 3.5,
      exitMOICOnFollowOns: 2.8,
      exitMOICOnPlannedReserves: 3.12,
      totalInvestment: 1500000,
      initialInvestment: 600000,
      deployedReserves: 500000,
      plannedReserves: 400000,
      sector: "Consumer",
      stage: "Seed"
    },
    {
      company: "Company X",
      currentMOIC: 1.3,
      currentMOICOnInitial: 1.6,
      currentMOICOnDeployedReserves: 1.1,
      exitMOIC: 2.80,
      exitMOICOnInitial: 3.2,
      exitMOICOnFollowOns: 2.4,
      exitMOICOnPlannedReserves: 2.80,
      totalInvestment: 1800000,
      initialInvestment: 700000,
      deployedReserves: 600000,
      plannedReserves: 500000,
      sector: "SaaS",
      stage: "Series B"
    },
    {
      company: "Company A",
      currentMOIC: 0.8,
      currentMOICOnInitial: 0.9,
      currentMOICOnDeployedReserves: 0.7,
      exitMOIC: 0.53,
      exitMOICOnInitial: 0.6,
      exitMOICOnFollowOns: 0.4,
      exitMOICOnPlannedReserves: 0.53,
      totalInvestment: 2200000,
      initialInvestment: 900000,
      deployedReserves: 750000,
      plannedReserves: 550000,
      sector: "Hardware",
      stage: "Series C"
    },
    {
      company: "Company Y",
      currentMOIC: 0.6,
      currentMOICOnInitial: 0.7,
      currentMOICOnDeployedReserves: 0.5,
      exitMOIC: 0.45,
      exitMOICOnInitial: 0.5,
      exitMOICOnFollowOns: 0.3,
      exitMOICOnPlannedReserves: 0.45,
      totalInvestment: 1600000,
      initialInvestment: 650000,
      deployedReserves: 550000,
      plannedReserves: 400000,
      sector: "Biotech",
      stage: "Series A"
    }
  ];

  const moicTypes: MOICComparison[] = [
    {
      metric: "Current MOIC",
      question: "What is the return on $1 of investment so far?",
      calculation: "Unrealized FMV today + Realized Proceeds / Total Investment to Date",
      category: "performance"
    },
    {
      metric: "Current MOIC on Initial",
      question: "What is the return on $1 of initial investment so far?",
      calculation: "Current Share Price / Purchase Price at Entry Round",
      category: "performance"
    },
    {
      metric: "Current MOIC on Deployed Reserves",
      question: "What is the return on $1 of follow-on investments so far?",
      calculation: "Current Share Price / Weighted Average Follow-On Share Price",
      category: "performance"
    },
    {
      metric: "Exit MOIC",
      question: "What is the expected return on $1 of investment?",
      calculation: "Expected Exit Proceeds / Expected Total Invested Capital By Exit",
      category: "planning"
    },
    {
      metric: "Exit MOIC on Initial",
      question: "What is the expected return on $1 of initial investment?",
      calculation: "Expected Exit Share Price / Purchase Price at Entry Round",
      category: "planning"
    },
    {
      metric: "Exit MOIC on Follow-Ons",
      question: "What is the expected return on $1 of follow-on investment?",
      calculation: "Expected Exit Share Price / Weighted Average Follow-On Share Price",
      category: "planning"
    },
    {
      metric: "Exit MOIC on Planned Reserves",
      question: "What is the expected return on $1 of future follow-on investment?",
      calculation: "Expected Exit Share Price / Weighted Average Follow-On Share Price",
      category: "planning"
    }
  ];

  const chartData = moicData.map(company => ({
    name: company.company,
    currentMOIC: company.currentMOIC,
    exitMOIC: company.exitMOIC,
    exitMOICOnPlannedReserves: company.exitMOICOnPlannedReserves,
    currentMOICOnInitial: company.currentMOICOnInitial,
    exitMOICOnInitial: company.exitMOICOnInitial
  }));

  const getMOICColor = (moic: number) => {
    if (moic >= 3.0) return 'text-green-600';
    if (moic >= 2.0) return 'text-blue-600';
    if (moic >= 1.0) return 'text-yellow-600';
    return 'text-red-500';
  };

  const getMOICBadgeVariant = (moic: number) => {
    if (moic >= 3.0) return 'default';
    if (moic >= 2.0) return 'secondary';
    if (moic >= 1.0) return 'outline';
    return 'destructive';
  };

  const filteredData = selectedCompany === "all" ? moicData : moicData.filter(d => d.company === selectedCompany);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Advanced MOIC Analysis</h1>
          <p className="text-muted-foreground">
            Moving beyond simple MOIC - analyze 7 different types of MOIC calculations
          </p>
        </div>
        <div className="flex space-x-2">
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {moicData.map(company => (
                <SelectItem key={company.company} value={company.company}>
                  {company.company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Insight */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-blue-900">
            <Info className="h-5 w-5" />
            <span>Moving Beyond Simple MOIC</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-blue-800">
            MOICs are more than just a reporting metric - they can be a very useful <strong>planning</strong> metric, 
            especially for reserve deployment. This analysis shows 7 different MOIC calculations that each answer 
            different questions and help develop a more nuanced understanding of deal performance.
          </p>
        </CardContent>
      </Card>

      {/* Chart View - Main Focus */}
      <Card>
        <CardHeader>
          <CardTitle>Expected Exit MOIC Analysis</CardTitle>
          <CardDescription>
            Portfolio companies ranked by expected return on planned reserves (the key planning metric)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.sort((a, b) => b.exitMOICOnPlannedReserves - a.exitMOICOnPlannedReserves)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis 
                  label={{ value: 'MOIC (x)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value.toFixed(2)}x`, 'Exit MOIC on Planned Reserves']}
                />
                <Bar 
                  dataKey="exitMOICOnPlannedReserves"
                  fill="#3b82f6"
                  name="Exit MOIC on Planned Reserves"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* MOIC Types Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-gray-800">Performance to Date</CardTitle>
            <CardDescription>Current returns on investments made</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredData.slice(0, 3).map((company) => (
                <div key={company.company} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{company.company}</div>
                    <div className="text-sm text-muted-foreground">Current MOIC</div>
                  </div>
                  <div className={`font-bold text-lg ${getMOICColor(company.currentMOIC)}`}>
                    {company.currentMOIC.toFixed(2)}x
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-blue-800">Expected Performance at Exit</CardTitle>
            <CardDescription>Projected returns including future rounds</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredData
                .sort((a, b) => b.exitMOICOnPlannedReserves - a.exitMOICOnPlannedReserves)
                .slice(0, 3)
                .map((company) => (
                <div key={company.company} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <div className="font-medium">{company.company}</div>
                    <div className="text-sm text-muted-foreground">Exit MOIC on Planned Reserves</div>
                  </div>
                  <div className={`font-bold text-lg ${getMOICColor(company.exitMOICOnPlannedReserves)}`}>
                    {company.exitMOICOnPlannedReserves.toFixed(2)}x
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-green-800">
              <TrendingUp className="h-5 w-5" />
              <span>Top Exit MOIC</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {moicData
                .sort((a, b) => b.exitMOIC - a.exitMOIC)
                .slice(0, 3)
                .map((company) => (
                <div key={company.company} className="flex items-center justify-between">
                  <span className="font-medium">{company.company}</span>
                  <span className="text-green-700 font-bold">{company.exitMOIC.toFixed(2)}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-blue-800">
              <Target className="h-5 w-5" />
              <span>Best Planned Reserves</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {moicData
                .sort((a, b) => b.exitMOICOnPlannedReserves - a.exitMOICOnPlannedReserves)
                .slice(0, 3)
                .map((company) => (
                <div key={company.company} className="flex items-center justify-between">
                  <span className="font-medium">{company.company}</span>
                  <span className="text-blue-700 font-bold">{company.exitMOICOnPlannedReserves.toFixed(2)}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <span>Underperforming</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {moicData
                .filter(c => c.exitMOIC < 1.0)
                .map((company) => (
                <div key={company.company} className="flex items-center justify-between">
                  <span className="font-medium">{company.company}</span>
                  <span className="text-red-700 font-bold">{company.exitMOIC.toFixed(2)}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Special Mention */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-yellow-800">
            <Award className="h-5 w-5" />
            <span>Exit MOIC on Planned Reserves - Special Mention</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-yellow-800 mb-3">
            The <strong>Exit MOIC on Planned Reserves</strong> deserves special mention as it is a very useful metric in optimizing reserves. 
            By summarizing the future follow-on performance it enables us to compare one company's reserves with another.
          </p>
          <p className="text-sm text-yellow-800">
            When optimizing follow-on reserves, comparing this metric can guide future follow-on deployments. 
            Tactyc automatically calculates and ranks all of your portfolio companies based on this metric.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}