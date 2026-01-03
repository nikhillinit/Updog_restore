import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Settings, Download, RefreshCw, TrendingUp, AlertTriangle, Target, Zap } from 'lucide-react';

// Independent Variables (Fund Construction Parameters)
const INDEPENDENT_VARIABLES = [
  {
    id: 'pre_seed_allocation',
    name: 'Pre-Seed Allocation %',
    category: 'Stage Allocation',
    min: 0,
    max: 50,
    default: 15,
    unit: '%',
    description: 'Percentage of capital allocated to Pre-Seed investments'
  },
  {
    id: 'seed_allocation',
    name: 'Seed Allocation %',
    category: 'Stage Allocation',
    min: 20,
    max: 60,
    default: 40,
    unit: '%',
    description: 'Percentage of capital allocated to Seed investments'
  },
  {
    id: 'series_a_allocation',
    name: 'Series A Allocation %',
    category: 'Stage Allocation',
    min: 15,
    max: 45,
    default: 30,
    unit: '%',
    description: 'Percentage of capital allocated to Series A investments'
  },
  {
    id: 'series_b_allocation',
    name: 'Series B+ Allocation %',
    category: 'Stage Allocation',
    min: 5,
    max: 25,
    default: 15,
    unit: '%',
    description: 'Percentage of capital allocated to Series B+ investments'
  },
  {
    id: 'follow_on_reserves',
    name: 'Follow-On Reserves %',
    category: 'Capital Allocation',
    min: 30,
    max: 70,
    default: 50,
    unit: '%',
    description: 'Percentage of capital reserved for follow-on investments'
  },
  {
    id: 'graduation_rate',
    name: 'Graduation Rate',
    category: 'Performance Assumptions',
    min: 0.2,
    max: 0.8,
    default: 0.5,
    unit: 'rate',
    description: 'Rate at which companies graduate to next funding round'
  },
  {
    id: 'exit_multiple',
    name: 'Average Exit Multiple',
    category: 'Performance Assumptions',
    min: 2,
    max: 15,
    default: 5,
    unit: 'x',
    description: 'Average multiple on invested capital at exit'
  },
  {
    id: 'management_fee',
    name: 'Management Fee %',
    category: 'Fund Economics',
    min: 1.5,
    max: 3.0,
    default: 2.5,
    unit: '%',
    description: 'Annual management fee percentage'
  },
  {
    id: 'carry_percentage',
    name: 'Carried Interest %',
    category: 'Fund Economics',
    min: 15,
    max: 30,
    default: 20,
    unit: '%',
    description: 'Carried interest percentage'
  }
];

// Dependent Variables (Return Metrics)
const DEPENDENT_VARIABLES = [
  {
    id: 'tvpi',
    name: 'TVPI',
    description: 'Total Value to Paid-In Capital',
    format: 'multiplier'
  },
  {
    id: 'net_irr',
    name: 'Net IRR',
    description: 'Net Internal Rate of Return',
    format: 'percentage'
  },
  {
    id: 'dpi',
    name: 'DPI',
    description: 'Distributions to Paid-In Capital',
    format: 'multiplier'
  },
  {
    id: 'moic',
    name: 'MOIC',
    description: 'Multiple on Invested Capital',
    format: 'multiplier'
  },
  {
    id: 'lp_multiple',
    name: 'LP Net Multiple',
    description: 'Limited Partner Net Multiple',
    format: 'multiplier'
  },
  {
    id: 'fund_multiple',
    name: 'Gross Fund Multiple',
    description: 'Gross Fund Multiple',
    format: 'multiplier'
  }
];

// Distribution Types for Monte Carlo
const DISTRIBUTION_TYPES = [
  { id: 'fixed', name: 'Fixed', description: 'Constant value across all scenarios' },
  { id: 'normal', name: 'Normal', description: 'Bell curve distribution around mean' },
  { id: 'uniform', name: 'Uniform', description: 'Equal probability across range' },
  { id: 'triangular', name: 'Triangular', description: 'Linear probability with peak at mode' },
  { id: 'lognormal', name: 'Log-Normal', description: 'Right-skewed with fat tail' }
];

// Sample sensitivity analysis data
const generateSensitivityData = (_input1: string, _input2: string, _output: string) => {
  const data = [];
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const x = i * 0.1;
      const y = j * 0.1;
      const value = 2.5 + x * 2 + y * 1.5 + Math.sin(x * Math.PI) * 0.5 + Math.cos(y * Math.PI) * 0.3;
      data.push({
        input1: x,
        input2: y,
        output: value,
        label: `${(x * 100).toFixed(0)}% / ${(y * 100).toFixed(0)}%`
      });
    }
  }
  return data;
};

// Sample Monte Carlo results
const MONTE_CARLO_RESULTS = [
  { scenario: 1, tvpi: 2.1, irr: 15.2, dpi: 1.8 },
  { scenario: 2, tvpi: 2.8, irr: 22.1, dpi: 2.1 },
  { scenario: 3, tvpi: 3.2, irr: 25.8, dpi: 2.4 },
  { scenario: 4, tvpi: 1.9, irr: 12.5, dpi: 1.6 },
  { scenario: 5, tvpi: 4.1, irr: 31.2, dpi: 3.1 },
  // ... more scenarios would be generated
];

export default function SensitivityAnalysis() {
  const [selectedInput1, setSelectedInput1] = useState('seed_allocation');
  const [selectedInput2, setSelectedInput2] = useState('graduation_rate');
  const [selectedOutput, setSelectedOutput] = useState('tvpi');
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('two-way');
  const [monteCarloIterations, setMonteCarloIterations] = useState(1000);
  const [_variableDistributions, _setVariableDistributions] = useState<Record<string, unknown>>({});

  const runSensitivityAnalysis = () => {
    setIsRunning(true);
    // Simulate analysis running
    setTimeout(() => setIsRunning(false), 2000);
  };

  const runMonteCarloAnalysis = () => {
    setIsRunning(true);
    // Simulate Monte Carlo running
    setTimeout(() => setIsRunning(false), 3000);
  };

  const sensitivityData = generateSensitivityData(selectedInput1, selectedInput2, selectedOutput);
  const input1Variable = INDEPENDENT_VARIABLES.find(v => v.id === selectedInput1);
  const input2Variable = INDEPENDENT_VARIABLES.find(v => v.id === selectedInput2);
  const outputVariable = DEPENDENT_VARIABLES.find(v => v.id === selectedOutput);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sensitivity Analysis</h1>
          <p className="text-gray-600 mt-1">Stress test fund parameters and evaluate downside potential through scenario modeling</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Results
          </Button>
          <Button variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </Button>
        </div>
      </div>

      {/* Analysis Type Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="two-way">Two-Way Sensitivity</TabsTrigger>
          <TabsTrigger value="one-way">One-Way Analysis</TabsTrigger>
          <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
          <TabsTrigger value="stress-test">Stress Testing</TabsTrigger>
        </TabsList>

        {/* Two-Way Sensitivity Analysis */}
        <TabsContent value="two-way" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Configuration Panel */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="input1">Input Variable 1</Label>
                    <Select value={selectedInput1} onValueChange={setSelectedInput1}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INDEPENDENT_VARIABLES.map((variable) => (
                          <SelectItem key={variable.id} value={variable.id}>
                            {variable.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {input1Variable && (
                      <p className="text-xs text-gray-500 mt-1">{input1Variable.description}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="input2">Input Variable 2</Label>
                    <Select value={selectedInput2} onValueChange={setSelectedInput2}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INDEPENDENT_VARIABLES.map((variable) => (
                          <SelectItem key={variable.id} value={variable.id}>
                            {variable.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {input2Variable && (
                      <p className="text-xs text-gray-500 mt-1">{input2Variable.description}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="output">Output Metric</Label>
                    <Select value={selectedOutput} onValueChange={setSelectedOutput}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPENDENT_VARIABLES.map((variable) => (
                          <SelectItem key={variable.id} value={variable.id}>
                            {variable.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {outputVariable && (
                      <p className="text-xs text-gray-500 mt-1">{outputVariable.description}</p>
                    )}
                  </div>

                  <Separator />

                  <Button 
                    onClick={runSensitivityAnalysis} 
                    disabled={isRunning} 
                    className="w-full"
                  >
                    {isRunning ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Run Sensitivity
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-3 space-y-6">
              {/* Module 1: Two-Way Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Target className="h-5 w-5" />
                    <span>Two-Way Sensitivity Matrix</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Heat Map Placeholder */}
                    <div className="bg-gray-50 rounded-lg p-6 flex items-center justify-center min-h-[300px]">
                      <div className="text-center">
                        <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Sensitivity Heat Map</p>
                        <p className="text-sm text-gray-500 mt-2">
                          {input1Variable?.name} vs {input2Variable?.name}
                        </p>
                      </div>
                    </div>

                    {/* Summary Table */}
                    <div className="space-y-4">
                      <h4 className="font-medium">Scenario Summary</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                          <span className="text-sm font-medium text-green-800">Best Case</span>
                          <span className="text-green-700">4.2x TVPI</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                          <span className="text-sm font-medium text-blue-800">Base Case</span>
                          <span className="text-blue-700">2.8x TVPI</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                          <span className="text-sm font-medium text-red-800">Worst Case</span>
                          <span className="text-red-700">1.4x TVPI</span>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Standard Deviation:</span>
                          <span className="font-medium">0.85x</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">95% Confidence Interval:</span>
                          <span className="font-medium">1.8x - 3.9x</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Probability &gt; 2.0x:</span>
                          <span className="font-medium text-green-600">78%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Module 2 & 3: Individual Variable Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{input1Variable?.name} Impact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sensitivityData.filter((_, i) => i % 11 === 0)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="input1" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="output" stroke="#3b82f6" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{input2Variable?.name} Impact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sensitivityData.filter(d => d.input1 === 0.5)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="input2" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="output" stroke="#10b981" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* One-Way Analysis */}
        <TabsContent value="one-way" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Single Variable Sensitivity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <Label>Select Variable to Analyze</Label>
                  <Select value={selectedInput1} onValueChange={setSelectedInput1}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDEPENDENT_VARIABLES.map((variable: any) => (
                        <SelectItem key={variable.id} value={variable.id}>
                          {variable.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <div className="space-y-3">
                    <h4 className="font-medium">Impact Ranking</h4>
                    {DEPENDENT_VARIABLES.map((dep, index) => (
                      <div key={dep.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{dep.name}</span>
                        <Badge variant={index < 2 ? 'default' : 'secondary'}>
                          {index === 0 ? 'High' : index === 1 ? 'Medium' : 'Low'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="lg:col-span-2">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sensitivityData.filter((_: any, i: any) => i % 11 === 0)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="input1" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="output" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monte Carlo Analysis */}
        <TabsContent value="monte-carlo" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Monte Carlo Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Number of Iterations</Label>
                    <Input
                      type="number"
                      value={monteCarloIterations}
                      onChange={(e) => setMonteCarloIterations(parseInt(e.target.value))}
                      min={100}
                      max={10000}
                      step={100}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-medium">Variable Distributions</h4>
                    <ScrollArea className="h-40">
                      {INDEPENDENT_VARIABLES.slice(0, 5).map((variable) => (
                        <div key={variable.id} className="space-y-2 mb-3">
                          <Label className="text-xs">{variable.name}</Label>
                          <Select defaultValue="normal">
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DISTRIBUTION_TYPES.map((dist) => (
                                <SelectItem key={dist.id} value={dist.id}>
                                  {dist.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>

                  <Button 
                    onClick={runMonteCarloAnalysis} 
                    disabled={isRunning} 
                    className="w-full"
                  >
                    {isRunning ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Run Monte Carlo
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Probability Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={MONTE_CARLO_RESULTS}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tvpi" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="scenario" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-600">87%</div>
                    <p className="text-sm text-gray-600">Probability &gt; 2.0x TVPI</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-blue-600">3.2x</div>
                    <p className="text-sm text-gray-600">Expected TVPI</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-orange-600">±1.4x</div>
                    <p className="text-sm text-gray-600">95% Confidence Range</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Stress Testing */}
        <TabsContent value="stress-test" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span>Downside Stress Testing</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Stress Test Scenarios</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'Market Crash', impact: 'TVPI: 2.8x → 1.2x', severity: 'high' },
                      { name: 'Reduced Graduation', impact: 'IRR: 18% → 8%', severity: 'medium' },
                      { name: 'Extended Timeline', impact: 'DPI Delay: +3 years', severity: 'medium' },
                      { name: 'Zero Exits', impact: 'DPI: 1.8x → 0.0x', severity: 'high' }
                    ].map((scenario, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{scenario.name}</p>
                          <p className="text-xs text-gray-600">{scenario.impact}</p>
                        </div>
                        <Badge variant={scenario.severity === 'high' ? 'destructive' : 'secondary'}>
                          {scenario.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Downside Protection</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { scenario: 'Base', value: 2.8 },
                        { scenario: 'Mild Stress', value: 2.1 },
                        { scenario: 'Severe Stress', value: 1.4 },
                        { scenario: 'Extreme Stress', value: 0.8 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="scenario" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
