import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useFundContext } from "@/contexts/FundContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, Edit3, Plus, Calendar, DollarSign, TrendingUp, 
  Target, Building, MapPin, Tag, Users, BarChart3, TrendingDown, Calculator 
} from "lucide-react";
import { Link } from "wouter";
import LiquidationPreferencesDialog from "@/components/investments/liquidation-preferences-dialog";
import PerformanceCaseTabs from "@/components/investments/performance-case-tabs";
import CapTableCalculator from "@/components/cap-table/cap-table-calculator";
import CapTableIntegration from "@/components/investments/cap-table-integration";

const roundSchema = z.object({
  name: z.string().min(1, "Round name is required"),
  date: z.string().min(1, "Date is required"),
  valuation: z.string().min(1, "Valuation is required"),
  amount: z.string().min(1, "Amount is required"),
  ownership: z.string().min(1, "Ownership is required"),
  leadInvestor: z.string().optional(),
  status: z.string().default("completed"),
  type: z.string().default("equity")
});

const performanceCaseSchema = z.object({
  name: z.string().min(1, "Case name is required"),
  exitValuation: z.string().min(1, "Exit valuation is required"),
  exitDate: z.string().min(1, "Exit date is required"),
  probability: z.string().min(1, "Probability is required"),
  type: z.string().default("exit"),
  description: z.string().optional()
});

type RoundData = z.infer<typeof roundSchema>;
type PerformanceCaseData = z.infer<typeof performanceCaseSchema>;

interface Investment {
  id: number;
  name: string;
  geography: string;
  sector: string;
  stage: string;
  amount: number;
  investmentDate: string;
  ownershipPercentage: number;
  valuationAtInvestment: number;
  leadInvestor?: string;
  rounds?: any[];
  performanceCases?: any[];
}

export default function InvestmentDetail() {
  const [, params] = useRoute("/investments/:id");
  const investmentId = params?.id ? parseInt(params.id) : null;
  const queryClient = useQueryClient();
  const [showRoundDialog, setShowRoundDialog] = useState(false);
  const [showCaseDialog, setShowCaseDialog] = useState(false);
  const [showLiqPrefsDialog, setShowLiqPrefsDialog] = useState(false);
  const [selectedPerformanceCase, setSelectedPerformanceCase] = useState<any>(null);
  const [showCapTableCalculator, setShowCapTableCalculator] = useState(false);

  const { data: investment, isLoading } = useQuery<Investment>({
    queryKey: ['/api/investments', investmentId],
    enabled: !!investmentId
  });

  const addRoundMutation = useMutation({
    mutationFn: (data: RoundData) => 
      apiRequest('POST', `/api/investments/${investmentId}/rounds`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/investments', investmentId] });
      setShowRoundDialog(false);
      roundForm.reset();
    }
  });

  const addCaseMutation = useMutation({
    mutationFn: (data: PerformanceCaseData) => 
      apiRequest('POST', `/api/investments/${investmentId}/cases`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/investments', investmentId] });
      setShowCaseDialog(false);
      caseForm.reset();
    }
  });

  const roundForm = useForm<RoundData>({
    resolver: zodResolver(roundSchema),
    defaultValues: {
      name: "",
      date: "",
      valuation: "",
      amount: "",
      ownership: "",
      leadInvestor: "",
      status: "completed",
      type: "equity"
    }
  });

  const caseForm = useForm<PerformanceCaseData>({
    resolver: zodResolver(performanceCaseSchema),
    defaultValues: {
      name: "",
      exitValuation: "",
      exitDate: "",
      probability: "",
      type: "exit",
      description: ""
    }
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!investment) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Investment Not Found</h2>
          <p className="text-muted-foreground mt-2">The requested investment could not be found.</p>
          <Link href="/investments">
            <Button className="mt-4">Back to Investments</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/investments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{investment.name}</h1>
            <p className="text-muted-foreground">{investment.geography} • {investment.sector}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => window.open('/cap-tables', '_blank')}>
            <Calculator className="h-4 w-4 mr-2" />
            Cap Table
          </Button>
          <Badge variant="secondary" className="text-sm">
            {investment.stage}
          </Badge>
        </div>
      </div>

      {/* Investment Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investment Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(investment.amount / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(investment.investmentDate), 'MMM dd, yyyy')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ownership</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{investment.ownershipPercentage}%</div>
            <p className="text-xs text-muted-foreground">Equity stake</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entry Valuation</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(investment.valuationAtInvestment / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">Post-money</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Status</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground">Portfolio company</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="rounds" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rounds">Investment Rounds</TabsTrigger>
          <TabsTrigger value="performance">Performance Cases</TabsTrigger>
          <TabsTrigger value="cap-table">Cap Table</TabsTrigger>
          <TabsTrigger value="future">Future</TabsTrigger>
          <TabsTrigger value="details">Investment Details</TabsTrigger>
        </TabsList>

        <TabsContent value="rounds" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Investment Rounds</h3>
              <p className="text-sm text-muted-foreground">Track all rounds for this investment</p>
            </div>
            <Dialog open={showRoundDialog} onOpenChange={setShowRoundDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Round
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Investment Round</DialogTitle>
                  <DialogDescription>
                    Add a new funding round for this investment
                  </DialogDescription>
                </DialogHeader>
                <Form {...roundForm}>
                  <form onSubmit={roundForm.handleSubmit((data) => addRoundMutation.mutate(data))} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={roundForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Round Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Series B" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={roundForm.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={roundForm.control}
                        name="valuation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valuation ($)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 50000000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={roundForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Round Amount ($)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 10000000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={roundForm.control}
                        name="ownership"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Our Ownership (%)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 12.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={roundForm.control}
                        name="leadInvestor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lead Investor</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Acme Capital" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={roundForm.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="in-progress">In Progress</SelectItem>
                                <SelectItem value="planned">Planned</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={roundForm.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="equity">Equity</SelectItem>
                                <SelectItem value="convertible">Convertible</SelectItem>
                                <SelectItem value="safe">SAFE</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setShowRoundDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addRoundMutation.isPending}>
                        {addRoundMutation.isPending ? "Adding..." : "Add Round"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-4">
            {investment.rounds && investment.rounds.length > 0 ? (
              investment.rounds.map((round: any) => (
                <Card key={round.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{round.name}</CardTitle>
                        <CardDescription>
                          {format(new Date(round.date), 'MMM dd, yyyy')} • {round.leadInvestor}
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={round.status === 'completed' ? 'default' : 'secondary'}>
                          {round.status}
                        </Badge>
                        <Button variant="outline" size="sm">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Investment: ${(round.amount / 1000000).toFixed(1)}M</span>
                        {round.status === 'projected' && (
                          <span className="text-muted-foreground">Reserved: ${(round.amount / 1000000).toFixed(1)}M</span>
                        )}
                        <span className="text-muted-foreground">Round: ${((round.valuation * 0.3) / 1000000).toFixed(1)}M</span>
                        <span className="text-muted-foreground">Pre-Money: ${((round.valuation - round.amount) / 1000000).toFixed(1)}M</span>
                        <span className="text-muted-foreground">Post-Money: ${(round.valuation / 1000000).toFixed(1)}M</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">MOIC: 1.00x</span>
                        <span className="text-muted-foreground">IRR: -</span>
                        <span className="text-muted-foreground">FMV: ${(round.valuation / 1000000).toFixed(1)}M</span>
                        <span className="text-muted-foreground">Ownership: {round.ownership}%</span>
                        <span className="text-muted-foreground">Return the Fund: $0.0mm</span>
                      </div>
                      <div className="flex space-x-2 pt-2">
                        <Button size="sm" variant="outline">
                          <Edit3 className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button size="sm" className="povc-bg-primary text-white hover:bg-blue-700">
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                        {round.status === 'projected' && (
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-600">
                            Pro-Rata
                          </Button>
                        )}
                      </div>
                      {round.status === 'projected' && round.stage === 'Series B' && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            Projected - 65% graduation rate
                          </p>
                        </div>
                      )}
                      {round.status === 'completed' && round.stage === 'Seed' && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            Co-investors in this round were YCombinator, a16z and Macdonald Ventures
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="text-center py-8">
                <CardContent>
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No rounds added yet</p>
                  <Button 
                    onClick={() => setShowRoundDialog(true)} 
                    className="mt-4"
                    variant="outline"
                  >
                    Add First Round
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceCaseTabs 
            investment={{
              id: investmentId?.toString() || "",
              company: investment?.name || "",
              amount: investment?.amount || 0
            }}
          />
        </TabsContent>

        <TabsContent value="performance-legacy" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Performance Cases (Legacy)</h3>
              <p className="text-sm text-muted-foreground">Model different exit scenarios</p>
            </div>
            <div className="flex space-x-2">
              <Button 
                variant="outline"
                onClick={() => setShowLiqPrefsDialog(true)}
                className="flex items-center space-x-2"
              >
                <TrendingDown className="h-4 w-4" />
                <span>Liq Prefs</span>
              </Button>
              <Dialog open={showCaseDialog} onOpenChange={setShowCaseDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Case
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Performance Case</DialogTitle>
                  <DialogDescription>
                    Model a potential exit scenario for this investment
                  </DialogDescription>
                </DialogHeader>
                <Form {...caseForm}>
                  <form onSubmit={caseForm.handleSubmit((data) => addCaseMutation.mutate(data))} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={caseForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Case Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Bull Case" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={caseForm.control}
                        name="probability"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Probability (%)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 30" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={caseForm.control}
                        name="exitValuation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exit Valuation ($)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 500000000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={caseForm.control}
                        name="exitDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Exit Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={caseForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe the scenario and assumptions..." 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setShowCaseDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addCaseMutation.isPending}>
                        {addCaseMutation.isPending ? "Adding..." : "Add Case"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="space-y-4">
            {investment.performanceCases && investment.performanceCases.length > 0 ? (
              investment.performanceCases.map((performanceCase: any) => (
                <Card key={performanceCase.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{performanceCase.name}</CardTitle>
                        <CardDescription>
                          Expected exit: {format(new Date(performanceCase.exitDate), 'MMM dd, yyyy')}
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">{performanceCase.probability}% probability</Badge>
                        {performanceCase.hasLiqPrefs && (
                          <Badge variant="destructive" className="text-xs">Liq Prefs Active</Badge>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedPerformanceCase(performanceCase);
                            setShowLiqPrefsDialog(true);
                          }}
                        >
                          <TrendingDown className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Exit Valuation</p>
                        <p className="font-medium">${(performanceCase.exitValuation / 1000000).toFixed(1)}M</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Expected Multiple</p>
                        <p className="font-medium">
                          {(performanceCase.exitValuation / investment.valuationAtInvestment).toFixed(1)}x
                        </p>
                      </div>
                    </div>
                    {performanceCase.description && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-muted-foreground">{performanceCase.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="text-center py-8">
                <CardContent>
                  <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No performance cases added yet</p>
                  <Button 
                    onClick={() => setShowCaseDialog(true)} 
                    className="mt-4"
                    variant="outline"
                  >
                    Add First Case
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="cap-table" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Cap Table Calculator</h3>
              <p className="text-sm text-muted-foreground">Model SAFE/Note conversions and analyze dilution scenarios for {investment.name}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => window.open('/cap-tables', '_blank')}>
                <Calculator className="h-4 w-4 mr-2" />
                Open in Cap Tables
              </Button>
              <Button onClick={() => setShowCapTableCalculator(!showCapTableCalculator)}>
                {showCapTableCalculator ? 'Hide Calculator' : 'Show Calculator'}
              </Button>
            </div>
          </div>

          <CapTableIntegration investment={investment} />
        </TabsContent>

        <TabsContent value="future" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Build Future Rounds</h3>
              <p className="text-sm text-muted-foreground">Automatically add future rounds from pre-defined sector profiles</p>
            </div>
            <Button className="povc-bg-primary hover:bg-blue-700">
              Build Future Rounds
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Future Round Builder</CardTitle>
              <CardDescription>
                Configure parameters to automatically generate projected future rounds based on sector profiles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Sector Profile</label>
                  <Select defaultValue="default">
                    <SelectTrigger>
                      <SelectValue placeholder="Select sector profile" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="fintech">FinTech</SelectItem>
                      <SelectItem value="saas">SaaS</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Starting Round</label>
                  <Select defaultValue="pre-seed">
                    <SelectTrigger>
                      <SelectValue placeholder="Select starting round" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre-seed">Pre-Seed</SelectItem>
                      <SelectItem value="seed">Seed</SelectItem>
                      <SelectItem value="series-a">Series A</SelectItem>
                      <SelectItem value="series-b">Series B</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Graduation Rate</label>
                  <Select defaultValue="sector-based">
                    <SelectTrigger>
                      <SelectValue placeholder="Select graduation rate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sector-based">Based on Sector</SelectItem>
                      <SelectItem value="custom">Custom Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Starting Date</label>
                  <Select defaultValue="custom">
                    <SelectTrigger>
                      <SelectValue placeholder="Select starting date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom Date</SelectItem>
                      <SelectItem value="auto">Auto-calculated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Date of Next Round</label>
                <Input type="date" defaultValue="2024-04-01" className="mt-1" />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline">Cancel</Button>
                <Button className="povc-bg-primary hover:bg-blue-700">Build</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Investment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Building className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="font-medium">{investment.name}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Geography</p>
                    <p className="font-medium">{investment.geography}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Sector</p>
                    <p className="font-medium">{investment.sector}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Stage</p>
                    <p className="font-medium">{investment.stage}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Investment Date</p>
                    <p className="font-medium">
                      {format(new Date(investment.investmentDate), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>

                {investment.leadInvestor && (
                  <div className="flex items-center space-x-3">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Lead Investor</p>
                      <p className="font-medium">{investment.leadInvestor}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Liquidation Preferences Dialog */}
      <LiquidationPreferencesDialog
        isOpen={showLiqPrefsDialog}
        onOpenChange={setShowLiqPrefsDialog}
        investment={{
          id: investmentId?.toString() || "",
          company: investment?.name || "",
          amount: investment?.amount || 0
        }}
        performanceCase={selectedPerformanceCase || { id: "default", name: "Base Case" }}
      />
    </div>
  );
}