import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFundContext } from "@/contexts/FundContext";
import { CheckCircle, Circle, ArrowRight, ArrowLeft, Building2 } from "lucide-react";
import BudgetCreator from "@/components/budget/budget-creator";
import InvestmentStrategyStep from "./InvestmentStrategyStep";
import ExitRecyclingStep from "./ExitRecyclingStep";
import WaterfallStep from "./WaterfallStep";
import type { InvestmentStrategy, ExitRecycling, Waterfall } from "@shared/types";
import type { Fund as DatabaseFund } from "@shared/schema";
import type { Fund } from "@/contexts/FundContext";

type WizardStep = 'fund-basics' | 'committed-capital' | 'investment-strategy' | 'exit-recycling' | 'waterfall' | 'advanced-settings' | 'review';

const WIZARD_STEPS: { id: WizardStep; label: string; description: string; icon: string }[] = [
  { id: 'fund-basics', label: 'Fund Name, Currency and Life', description: 'Some basic facts on your fund', icon: 'F' },
  { id: 'committed-capital', label: 'Committed Capital', description: 'The total capital committed from Limited and General Partners', icon: 'C' },
  { id: 'investment-strategy', label: 'Investment Strategy', description: 'Define stages, sectors, and capital allocation', icon: 'I' },
  { id: 'exit-recycling', label: 'Exit Recycling', description: 'Configure exit proceeds recycling', icon: 'E' },
  { id: 'waterfall', label: 'Waterfall', description: 'Set distribution waterfall and carry terms', icon: 'W' },
  { id: 'advanced-settings', label: 'Advanced Settings', description: 'Traditional fund or SPV', icon: 'A' },
  { id: 'review', label: 'Review', description: 'Review and create fund', icon: 'R' },
];

// Helper function to convert database fund to context fund type
const convertDatabaseFundToContextFund = (dbFund: DatabaseFund): Fund => ({
  id: dbFund.id,
  name: dbFund.name,
  size: parseFloat(dbFund.size || "0"),
  managementFee: parseFloat(dbFund.managementFee || "0"),
  carryPercentage: parseFloat(dbFund.carryPercentage || "0"),
  vintageYear: dbFund.vintageYear,
  deployedCapital: parseFloat(dbFund.deployedCapital || "0"),
  status: dbFund.status,
  createdAt: dbFund.createdAt?.toISOString() || new Date().toISOString(),
  updatedAt: new Date().toISOString(), // API doesn't return updatedAt, so use current time
});

export default function FundSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setCurrentFund } = useFundContext();
  const [currentStep, setCurrentStep] = useState<WizardStep>('fund-basics');
  
  const [fundData, setFundData] = useState({
    // Fund Basics
    name: "",
    currency: "USD",
    startDate: "2023-04-15",
    endDate: "2033-04-15",
    hasEndDate: true,
    isEvergreen: false,
    lifeYears: 10,
    investmentHorizonYears: 5,
    capitalCallFrequency: "Monthly",
    
    // Committed Capital
    totalCommittedCapital: "100000000",
    gpCommitmentPercent: "2",
    gpCommitment: "2",
    gpCommitmentAmount: "2000000",
    lpCommitmentAmount: "98000000",
    lpCommitmentCloses: [
      { month: 1, percentage: 100 }
    ],
    
    // Investment Parameters
    investmentStage: "seed",
    followOnStrategy: "maintain_ownership",
    checkSizeMin: "100000",
    checkSizeMax: "2000000",
    followOnRate: "50",
    allocations: [
      { id: 'alloc-1', name: 'Initial Investments', stage: 'seed', allocation: '60', sector: 'Generalist' },
      { id: 'alloc-2', name: 'Follow-On', stage: 'series_a', allocation: '40', sector: 'Generalist' }
    ],
    
    // Cashless GP Commit (Optional)
    cashlessGPPercent: "0",
    
    // Capital Call Schedule
    capitalCallSchedule: "12",
    
    // GP Commitment in Management Fees
    includeGPInManagementFees: false,
    
    // Investment Strategy
    investmentStrategy: {
      stages: [
        { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
        { id: 'stage-2', name: 'Series A', graduationRate: 40, exitRate: 25 },
        { id: 'stage-3', name: 'Series B+', graduationRate: 0, exitRate: 35 }
      ],
      sectorProfiles: [
        { id: 'sector-1', name: 'FinTech', targetPercentage: 40, description: 'Financial technology companies' },
        { id: 'sector-2', name: 'HealthTech', targetPercentage: 30, description: 'Healthcare technology companies' },
        { id: 'sector-3', name: 'Enterprise SaaS', targetPercentage: 30, description: 'B2B software solutions' }
      ],
      allocations: [
        { id: 'alloc-1', category: 'New Investments', percentage: 75, description: 'Fresh capital for new portfolio companies' },
        { id: 'alloc-2', category: 'Reserves', percentage: 20, description: 'Follow-on investments for existing portfolio' },
        { id: 'alloc-3', category: 'Operating Expenses', percentage: 5, description: 'Fund management and operations' }
      ]
    } as InvestmentStrategy,
    
    // Exit Recycling
    exitRecycling: {
      enabled: false,
      recyclePercentage: 0,
      recycleWindowMonths: 24,
      restrictToSameSector: false,
      restrictToSameStage: false
    } as ExitRecycling,
    
    // Waterfall
    waterfall: {
      type: 'EUROPEAN' as const,
      hurdle: 0.08, // 8%
      catchUp: 0.08, // 8%
      carryVesting: {
        cliffYears: 0,
        vestingYears: 4
      }
    } as Waterfall,
    
    // Advanced Settings
    vehicleStructure: "traditional_fund", // traditional_fund or spv
    
    // Fees and Expenses
    fundExpenses: [
      { id: 'exp-1', name: 'Legal Fees', amount: '200000', timing: 'upfront', category: 'Legal Fees', monthlyAmount: '16667', startMonth: '1', endMonth: '12' },
      { id: 'exp-2', name: 'Audit & Tax', amount: '50000', timing: 'annual', category: 'Audit & Tax', monthlyAmount: '4167', startMonth: '1', endMonth: '120' },
      { id: 'exp-3', name: 'Administration', amount: '100000', timing: 'annual', category: 'Administration', monthlyAmount: '8333', startMonth: '1', endMonth: '120' }
    ],
    feeStructure: "2.0",
    feeStepDown: false,
    feeStepDownYear: "5",
    feeStepDownRate: "1.5",
    
    // Exit Recycling Fields
    exitRecyclingRate: "50",
    exitRecyclingCap: "100",
    exitRecyclingTerm: "5",
    
    // Waterfall Fields
    waterfallType: "EUROPEAN",
    
    // Preferred Return
    preferredReturn: false,
    preferredReturnRate: "8",
    
    // Limited Partners
    limitedPartners: [] as Array<{
      id: string;
      name: string;
      investment: string;
      feeProfile: string;
      profitSplit: string;
    }>,
    
    // Default values for fund creation
    size: "100000000",
    managementFee: "2.0",
    carryPercentage: "20",
    vintageYear: "2023",
    fundLife: "10",
    investmentPeriod: "5",
    status: "active",
    deployedCapital: 0
  });

  const createFundMutation = useMutation<Fund, Error, any>({
    mutationFn: async (data: any): Promise<Fund> => {
      // Extract only the fields required by CompleteFundSetupSchema
      const fundPayload = {
        name: data.name,
        size: parseFloat(data.size || data.totalCommittedCapital),
        deployedCapital: 0,
        managementFee: parseFloat(data.managementFee) / 100,
        carryPercentage: parseFloat(data.carryPercentage) / 100,
        vintageYear: parseInt(data.vintageYear),
        isEvergreen: data.isEvergreen || false,
        lifeYears: data.isEvergreen ? undefined : parseInt(data.lifeYears || data.fundLife || "10"),
        investmentHorizonYears: parseInt(data.investmentHorizonYears || data.investmentPeriod || "5"),
        investmentStrategy: data.investmentStrategy,
        exitRecycling: data.exitRecycling,
        waterfall: data.waterfall
      };
      
      const response = await apiRequest('POST', '/api/funds', fundPayload);
      const databaseFund = await response.json() as DatabaseFund;
      return convertDatabaseFundToContextFund(databaseFund);
    },
    onSuccess: (newFund: Fund) => {
      queryClient.invalidateQueries({ queryKey: ['/api/funds'] });
      setCurrentFund(newFund);
      toast({
        title: "Fund Created Successfully",
        description: "Your fund has been set up and you can now access all features.",
      });
      setLocation('/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Fund",
        description: error.message || "Failed to create fund. Please try again.",
        variant: "destructive",
      });
    }
  });

  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  // Initialize fund life calculation on component mount
  useEffect(() => {
    if (fundData.hasEndDate && fundData.startDate && fundData.endDate) {
      const updatedData = calculateFundLifeFromDates(fundData);
      if (updatedData !== fundData) {
        setFundData(updatedData);
      }
    }
  }, []); // Empty dependency array to run only on mount

  const handleInputChange = (field: string, value: string | boolean | number) => {
    setFundData(prev => {
      // Ensure proper type handling for boolean fields
      let processedValue = value;
      const booleanFields = ['hasEndDate', 'isEvergreen', 'includeGPInManagementFees', 'feeStepDown', 'preferredReturn'];
      
      if (booleanFields.includes(field)) {
        processedValue = Boolean(value);
      }
      
      const updated = { ...prev, [field]: processedValue };
      
      // Auto-calculate dependent fields
      if (field === 'totalCommittedCapital' || field === 'gpCommitmentPercent') {
        return updateCalculatedFields(updated);
      }
      
      // Auto-calculate fund life when dates change
      if (field === 'startDate' || field === 'endDate') {
        return calculateFundLifeFromDates(updated);
      }
      
      return updated;
    });
  };

  const handleComplexDataChange = (field: string, value: any) => {
    setFundData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    const stepOrder: WizardStep[] = ['fund-basics', 'committed-capital', 'investment-strategy', 'exit-recycling', 'waterfall', 'advanced-settings', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder: WizardStep[] = ['fund-basics', 'committed-capital', 'investment-strategy', 'exit-recycling', 'waterfall', 'advanced-settings', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const calculateFundLifeFromDates = (data: any) => {
    if (data.startDate && data.endDate && data.hasEndDate) {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      
      if (endDate <= startDate) {
        toast({
          title: "Invalid Date Range",
          description: "Fund end date must be after the start date.",
          variant: "destructive",
        });
        return data;
      }
      
      const diffInMs = endDate.getTime() - startDate.getTime();
      const diffInYears = diffInMs / (1000 * 60 * 60 * 24 * 365.25);
      const fundLifeYears = Math.round(diffInYears);
      
      return {
        ...data,
        lifeYears: fundLifeYears,
        vintageYear: startDate.getFullYear().toString()
      };
    }
    
    return {
      ...data,
      vintageYear: data.startDate ? new Date(data.startDate).getFullYear().toString() : data.vintageYear
    };
  };

  const updateCalculatedFields = (data: any) => {
    const totalCommitted = parseFloat(data.totalCommittedCapital || "0");
    const gpPercent = parseFloat(data.gpCommitmentPercent || "0");
    const gpAmount = (totalCommitted * gpPercent / 100).toString();
    const lpAmount = (totalCommitted - parseFloat(gpAmount)).toString();
    
    return {
      ...data,
      gpCommitmentAmount: gpAmount,
      lpCommitmentAmount: lpAmount,
      size: data.totalCommittedCapital,
      vintageYear: new Date(data.startDate).getFullYear().toString()
    };
  };

  const canSkipStep = () => {
    return currentStep === 'advanced-settings'; // Only advanced settings can be skipped
  };

  const handleSave = () => {
    createFundMutation.mutate(fundData);
  };

  const isFormValid = fundData.name && fundData.totalCommittedCapital && parseFloat(fundData.totalCommittedCapital) > 0;
  const canProceed = currentStep === 'fund-basics' ? isFormValid : true;

  return (
    <div className="min-h-screen bg-gray-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 break-words">Press On Ventures Construction Wizard</h1>
          <p className="text-gray-600">Set up your fund with essential information</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((step, index) => (
              <div key={step.id} className="flex-1 relative">
                <div className={`flex items-center ${index < WIZARD_STEPS.length - 1 ? 'w-full' : ''}`}>
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      index <= currentStepIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-300 text-gray-600'
                    }`}
                  >
                    {step.icon}
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 ${
                        index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
                <div className="absolute top-12 left-0 right-0 text-center">
                  <p className="text-sm font-medium text-gray-900">{step.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card className="shadow-lg border-0 mt-16">
          <CardHeader className="bg-white border-b border-gray-200 rounded-t-lg">
            <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900 break-words">
              {WIZARD_STEPS[currentStepIndex].label}
            </CardTitle>
            <p className="text-gray-600 text-sm mt-1">
              {WIZARD_STEPS[currentStepIndex].description}
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8 max-h-none overflow-visible">
            {/* Fund Basics Step */}
            {currentStep === 'fund-basics' && (
              <div className="space-y-8">
                {/* Fund Name */}
                <div className="space-y-3">
                  <Label htmlFor="fundName" className="text-base font-medium text-gray-900">
                    Fund Name
                  </Label>
                  <Input
                    id="fundName"
                    value={fundData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder=""
                    className="h-11 border-gray-300"
                  />
                </div>

                {/* Fund Currency */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Fund Currency
                  </Label>
                  <Select value={fundData.currency} onValueChange={(value) => handleInputChange('currency', value)}>
                    <SelectTrigger className="h-11 border-gray-300">
                      <SelectValue placeholder="United States Dollar ($)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">United States Dollar ($)</SelectItem>
                      <SelectItem value="EUR">Euro (€)</SelectItem>
                      <SelectItem value="GBP">British Pound (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Fund Start Date */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Fund Start Date
                  </Label>
                  <Input
                    type="date"
                    value={fundData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className="h-11 border-gray-300"
                  />
                </div>

                {/* Fund End Date */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Fund End Date
                  </Label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        id="hasEndDate"
                        checked={fundData.hasEndDate}
                        onChange={(e) => {
                          handleInputChange('hasEndDate', e.target.checked);
                          if (!e.target.checked) {
                            // Clear the calculated life years when switching to evergreen
                            setFundData(prev => ({ ...prev, lifeYears: 10 }));
                          }
                        }}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <Label htmlFor="hasEndDate" className="text-sm text-gray-700">
                        Fund has end date
                      </Label>
                    </div>
                    {fundData.hasEndDate && (
                      <Input
                        type="date"
                        value={fundData.endDate}
                        onChange={(e) => handleInputChange('endDate', e.target.value)}
                        className="h-11 border-gray-300 w-full min-w-0"
                        min={fundData.startDate}
                      />
                    )}
                  </div>
                  {fundData.hasEndDate && fundData.startDate && fundData.endDate && (
                    <p className="text-sm text-gray-600">
                      Fund life: {(() => {
                        const start = new Date(fundData.startDate);
                        const end = new Date(fundData.endDate);
                        const years = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
                        return years;
                      })()} years
                    </p>
                  )}
                </div>

                {/* Capital Call Frequency */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    How often will you call capital?
                  </Label>
                  <Select value={fundData.capitalCallFrequency} onValueChange={(value) => handleInputChange('capitalCallFrequency', value)}>
                    <SelectTrigger className="h-11 border-gray-300">
                      <SelectValue placeholder="Monthly" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="Semi-Annually">Semi-Annually</SelectItem>
                      <SelectItem value="Annually">Annually</SelectItem>
                      <SelectItem value="Upfront">Upfront</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Evergreen Toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="evergreen-toggle" className="text-base font-medium text-gray-900">
                      Ever-green fund?
                    </Label>
                    <Switch
                      id="evergreen-toggle"
                      checked={fundData.isEvergreen}
                      onCheckedChange={(checked) => handleInputChange('isEvergreen', checked)}
                    />
                  </div>
                  <p className="text-sm text-gray-600">
                    Evergreen funds have no fixed life and can invest indefinitely
                  </p>
                </div>

                {/* Conditional Fund Life - Only show for closed-end funds */}
                {!fundData.isEvergreen && (
                  <div className="space-y-3">
                    <Label htmlFor="fundLife" className="text-base font-medium text-gray-900">
                      Fund Life (Years)
                    </Label>
                    <Input
                      id="fundLife"
                      type="number"
                      min="3"
                      max="20"
                      value={fundData.lifeYears}
                      onChange={(e) => handleInputChange('lifeYears', e.target.value)}
                      className={`h-11 border-gray-300 ${
                        fundData.hasEndDate && fundData.startDate && fundData.endDate 
                          ? 'bg-gray-100 cursor-not-allowed' 
                          : ''
                      }`}
                      placeholder="10"
                      readOnly={Boolean(fundData.hasEndDate && fundData.startDate && fundData.endDate)}
                    />
                    <p className="text-sm text-gray-600">
                      {fundData.hasEndDate && fundData.startDate && fundData.endDate 
                        ? 'Automatically calculated from start and end dates'
                        : 'Total fund duration (typically 10-12 years)'}
                    </p>
                  </div>
                )}

                {/* Investment Horizon */}
                <div className="space-y-3">
                  <Label htmlFor="investmentHorizon" className="text-base font-medium text-gray-900">
                    Investment Horizon (Years)
                  </Label>
                  <Input
                    id="investmentHorizon"
                    type="number"
                    min="1"
                    max={fundData.lifeYears || 20}
                    value={fundData.investmentHorizonYears}
                    onChange={(e) => handleInputChange('investmentHorizonYears', e.target.value)}
                    className="h-11 border-gray-300"
                    placeholder="5"
                  />
                  <p className="text-sm text-gray-600">
                    Period for making new investments (typically 3-5 years)
                  </p>
                </div>
              </div>
            )}

            {/* Committed Capital Step */}
            {currentStep === 'committed-capital' && (
              <div className="space-y-8">
                {/* Total Committed Capital */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Total Committed Capital
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <Input
                      type="number"
                      value={fundData.totalCommittedCapital}
                      onChange={(e) => handleInputChange('totalCommittedCapital', e.target.value)}
                      placeholder="100,000,000"
                      className="h-11 pl-8 border-gray-300 w-full min-w-0"
                    />
                  </div>
                </div>

                {/* GP Commitment */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    GP Commitment (%)
                  </Label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={fundData.gpCommitmentPercent}
                        onChange={(e) => handleInputChange('gpCommitmentPercent', e.target.value)}
                        placeholder="2"
                        className="h-11 pr-8 border-gray-300 w-full min-w-0"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                    </div>
                    <Button variant="outline" className="h-11 px-4">
                      Enter Amount
                    </Button>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>GP Commitment is ${parseFloat(fundData.gpCommitmentAmount || "0").toLocaleString()}</p>
                    <p>LP Commitment is ${parseFloat(fundData.lpCommitmentAmount || "0").toLocaleString()}</p>
                  </div>
                </div>

                {/* Capital Call Schedule */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Capital Call Schedule
                  </Label>
                  <div className="max-w-xs">
                    <Select 
                      value={fundData.capitalCallSchedule} 
                      onValueChange={(value) => handleInputChange('capitalCallSchedule', value)}
                    >
                      <SelectTrigger className="h-11 border-gray-300 w-full">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">Annual (12 months)</SelectItem>
                        <SelectItem value="6">Semi-Annual (6 months)</SelectItem>
                        <SelectItem value="3">Quarterly (3 months)</SelectItem>
                        <SelectItem value="1">Monthly (1 month)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-gray-600">Frequency of capital calls to investors</p>
                </div>

                {/* Cashless GP Commit */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Cashless GP Commitment (%)
                  </Label>
                  <div className="relative max-w-xs">
                    <Input
                      type="number"
                      value={fundData.cashlessGPPercent}
                      onChange={(e) => handleInputChange('cashlessGPPercent', e.target.value)}
                      placeholder="0"
                      className="h-11 pr-8 border-gray-300 w-full min-w-0"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-sm text-gray-600">Percentage of GP commitment that is cashless (default: 0%)</p>
                </div>
              </div>
            )}

            {/* Investment Strategy Step */}
            {currentStep === 'investment-strategy' && (
              <InvestmentStrategyStep
                data={fundData.investmentStrategy}
                onChange={(data) => handleComplexDataChange('investmentStrategy', data)}
              />
            )}

            {/* Exit Recycling Step */}
            {currentStep === 'exit-recycling' && (
              <ExitRecyclingStep
                data={fundData.exitRecycling}
                onChange={(data) => handleComplexDataChange('exitRecycling', data)}
              />
            )}

            {/* Waterfall Step */}
            {currentStep === 'waterfall' && (
              <WaterfallStep
                data={fundData.waterfall}
                onChange={(data) => handleComplexDataChange('waterfall', data)}
              />
            )}

            {/* Advanced Settings Step */}
            {currentStep === 'advanced-settings' && (
              <div className="space-y-8">
                {/* Vehicle Structure */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    Vehicle Structure
                  </Label>
                  <Select value={fundData.vehicleStructure} onValueChange={(value) => handleInputChange('vehicleStructure', value)}>
                    <SelectTrigger className="h-11 border-2 border-blue-400">
                      <SelectValue placeholder="Traditional Fund (recommended)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="traditional_fund">Traditional Fund (recommended)</SelectItem>
                      <SelectItem value="spv">SPV (no construction)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Vehicle Structure Description */}
                <div className="bg-gray-50 rounded-lg p-6">
                  {fundData.vehicleStructure === 'traditional_fund' ? (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Traditional Fund (recommended)</h4>
                      <p className="text-sm text-gray-600">
                        The construction wizard will present sections that enable you to model a full projection with future investments. 
                        The model will also automatically project future investments, associated cash flows and generally operate the 
                        vehicle as if it will be building a future portfolio of investments.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">SPV (no construction yet)</h4>
                      <p className="text-sm text-gray-600">
                        The model will not automatically forecast future investments, instead you will need to manually add 
                        investments to build a portfolio of deals.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="space-y-8">
                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Fund Structure & Terms</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="vintageYear" className="text-sm font-medium text-gray-700">
                        Vintage Year
                      </Label>
                      <Select value={fundData.vintageYear} onValueChange={(value) => handleInputChange('vintageYear', value)}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select vintage year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2025">2025</SelectItem>
                          <SelectItem value="2024">2024</SelectItem>
                          <SelectItem value="2023">2023</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">Typically when your fund is launched</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate" className="text-sm font-medium text-gray-700">
                        Start Date
                      </Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={fundData.startDate}
                        onChange={(e) => handleInputChange('startDate', e.target.value)}
                        className="h-11"
                      />
                      <p className="text-xs text-gray-500">Fund launch date</p>
                    </div>
                  </div>
                </div>

                <div className="border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">GP Commitment</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="gpCommitment" className="text-sm font-medium text-gray-700">
                        GP Commitment %
                      </Label>
                      <div className="relative">
                        <Input
                          id="gpCommitment"
                          type="number"
                          step="0.1"
                          value={fundData.gpCommitmentPercent}
                          onChange={(e) => handleInputChange('gpCommitmentPercent', e.target.value)}
                          placeholder="2.0"
                          className="h-11 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                      </div>
                      <p className="text-xs text-gray-500">Percentage from GPs (typically 1-2.5%)</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">
                        GP Commitment Amount
                      </Label>
                      <div className="h-11 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 flex items-center">
                        <span className="text-gray-900 font-medium">
                          {fundData.totalCommittedCapital && fundData.gpCommitmentPercent 
                            ? `$${((parseFloat(fundData.totalCommittedCapital) * parseFloat(fundData.gpCommitmentPercent)) / 100 / 1000000).toFixed(1)}M`
                            : '$0M'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Calculated GP investment amount</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Fund Timeline</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="fundLife" className="text-sm font-medium text-gray-700">
                        Fund Life (Years)
                      </Label>
                      <Input
                        id="fundLife"
                        type="number"
                        value={fundData.fundLife}
                        onChange={(e) => handleInputChange('fundLife', e.target.value)}
                        placeholder="10"
                        className="h-11"
                      />
                      <p className="text-xs text-gray-500">Total fund duration</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investmentPeriod" className="text-sm font-medium text-gray-700">
                        Investment Period (Years)
                      </Label>
                      <Input
                        id="investmentPeriod"
                        type="number"
                        value={fundData.investmentPeriod}
                        onChange={(e) => handleInputChange('investmentPeriod', e.target.value)}
                        placeholder="5"
                        className="h-11"
                      />
                      <p className="text-xs text-gray-500">Active investment period</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Features Step */}
            {currentStep === 'advanced-settings' && (
              <div className="space-y-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800">
                    <strong>Investment Strategy & Features:</strong> Configure your fund's investment approach and advanced features.
                  </p>
                </div>

                {/* Investment Strategy */}
                <div className="border-b border-gray-200 pb-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Investment Strategy</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Primary Investment Stage *</Label>
                      <Select value={fundData.investmentStage} onValueChange={(value) => handleInputChange('investmentStage', value)}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                          <SelectItem value="seed">Seed</SelectItem>
                          <SelectItem value="series_a">Series A</SelectItem>
                          <SelectItem value="series_b">Series B</SelectItem>
                          <SelectItem value="series_c">Series C+</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="multi_stage">Multi-Stage</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">Primary stage for your investments</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Follow-On Strategy *</Label>
                      <Select value={fundData.followOnStrategy} onValueChange={(value) => handleInputChange('followOnStrategy', value)}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="maintain_ownership">Maintain Ownership %</SelectItem>
                          <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                          <SelectItem value="pro_rata">Pro-Rata Only</SelectItem>
                          <SelectItem value="selective">Selective Follow-On</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">How you'll approach follow-on investments</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Min Check Size *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                        <Input
                          type="number"
                          value={fundData.checkSizeMin}
                          onChange={(e) => handleInputChange('checkSizeMin', e.target.value)}
                          placeholder="100000"
                          className="h-11 pl-8"
                        />
                      </div>
                      <p className="text-xs text-gray-500">Minimum initial investment</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Max Check Size *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                        <Input
                          type="number"
                          value={fundData.checkSizeMax}
                          onChange={(e) => handleInputChange('checkSizeMax', e.target.value)}
                          placeholder="2000000"
                          className="h-11 pl-8"
                        />
                      </div>
                      <p className="text-xs text-gray-500">Maximum initial investment</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Follow-On Rate *</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={fundData.followOnRate}
                          onChange={(e) => handleInputChange('followOnRate', e.target.value)}
                          placeholder="50"
                          className="h-11 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                      </div>
                      <p className="text-xs text-gray-500">Expected follow-on participation</p>
                    </div>
                  </div>
                </div>

                {/* Investment Allocations Section */}
                <div className="border-b border-gray-200 pb-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Investment Allocations *</h3>
                  <p className="text-sm text-gray-600 mb-4">Define how capital is allocated across different investment types</p>
                  
                  <div className="space-y-4">
                    {fundData.allocations.map((allocation, index) => (
                      <div key={allocation.id} className="bg-gray-50 rounded-lg p-4 border">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Allocation Name</Label>
                            <Input
                              value={allocation.name}
                              onChange={(e) => {
                                const newAllocations = [...fundData.allocations];
                                newAllocations[index].name = e.target.value;
                                handleComplexDataChange('allocations', newAllocations);
                              }}
                              placeholder="e.g., Seed Investments"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Stage</Label>
                            <Select 
                              value={allocation.stage} 
                              onValueChange={(value) => {
                                const newAllocations = [...fundData.allocations];
                                newAllocations[index].stage = value;
                                handleComplexDataChange('allocations', newAllocations);
                              }}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select stage" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                                <SelectItem value="seed">Seed</SelectItem>
                                <SelectItem value="series_a">Series A</SelectItem>
                                <SelectItem value="series_b">Series B</SelectItem>
                                <SelectItem value="growth">Growth</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Allocation %</Label>
                            <Input
                              type="number"
                              value={allocation.allocation}
                              onChange={(e) => {
                                const newAllocations = [...fundData.allocations];
                                newAllocations[index].allocation = e.target.value;
                                handleComplexDataChange('allocations', newAllocations);
                              }}
                              placeholder="80"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Sector</Label>
                            <Select 
                              value={allocation.sector} 
                              onValueChange={(value) => {
                                const newAllocations = [...fundData.allocations];
                                newAllocations[index].sector = value;
                                handleComplexDataChange('allocations', newAllocations);
                              }}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select sector" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="technology">Technology</SelectItem>
                                <SelectItem value="healthcare">Healthcare</SelectItem>
                                <SelectItem value="fintech">Fintech</SelectItem>
                                <SelectItem value="saas">SaaS</SelectItem>
                                <SelectItem value="consumer">Consumer</SelectItem>
                                <SelectItem value="enterprise">Enterprise</SelectItem>
                                <SelectItem value="biotech">Biotech</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        const newAllocation = {
                          id: `alloc-${Date.now()}`,
                          name: "",
                          sector: "technology",
                          allocation: "0",
                          stage: "seed"
                        };
                        const newAllocations = [...fundData.allocations, newAllocation];
                        handleComplexDataChange('allocations', newAllocations);
                      }}
                      className="text-blue-600 border-blue-200"
                    >
                      + Add Another Allocation
                    </Button>
                  </div>
                </div>

                {/* Fund Expenses */}
                <div className="border-b border-gray-200 pb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">Fund Expenses *</h3>
                      <p className="text-sm text-gray-600">Define expected fund operating expenses</p>
                    </div>
                    <BudgetCreator 
                      fundSize={parseFloat(fundData.size) || 200000000}
                      onBudgetCreate={(budget) => {
                        const newExpenses = budget.map((item, index) => ({
                          id: `exp-${Date.now()}-${index}`,
                          category: item.category,
                          monthlyAmount: Math.round(item.lifetimeExpense / item.term).toString(),
                          startMonth: "1",
                          endMonth: item.term.toString()
                        }));
                        handleComplexDataChange('fundExpenses', newExpenses);
                        toast({
                          title: "Budget Created",
                          description: `Successfully created budget with ${budget.length} expense categories`,
                        });
                      }}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    {fundData.fundExpenses.map((expense, index) => (
                      <div key={expense.id} className="bg-gray-50 rounded-lg p-4 border">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Expense Category</Label>
                            <Input
                              value={expense.category}
                              onChange={(e) => {
                                const newExpenses = [...fundData.fundExpenses];
                                newExpenses[index].category = e.target.value;
                                handleComplexDataChange('fundExpenses', newExpenses);
                              }}
                              placeholder="e.g., Legal & Compliance"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Monthly Amount</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                              <Input
                                type="number"
                                value={expense.monthlyAmount}
                                onChange={(e) => {
                                  const newExpenses = [...fundData.fundExpenses];
                                  newExpenses[index].monthlyAmount = e.target.value;
                                  handleComplexDataChange('fundExpenses', newExpenses);
                                }}
                                placeholder="10000"
                                className="h-10 pl-8"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Start Month</Label>
                            <Input
                              type="number"
                              value={expense.startMonth}
                              onChange={(e) => {
                                const newExpenses = [...fundData.fundExpenses];
                                newExpenses[index].startMonth = e.target.value;
                                handleComplexDataChange('fundExpenses', newExpenses);
                              }}
                              placeholder="1"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">End Month</Label>
                            <Input
                              type="number"
                              value={expense.endMonth}
                              onChange={(e) => {
                                const newExpenses = [...fundData.fundExpenses];
                                newExpenses[index].endMonth = e.target.value;
                                handleComplexDataChange('fundExpenses', newExpenses);
                              }}
                              placeholder="120"
                              className="h-10"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        const newExpense = {
                          id: `exp-${Date.now()}`,
                          category: "",
                          monthlyAmount: "0",
                          startMonth: "1",
                          endMonth: "120"
                        };
                        const newExpenses = [...fundData.fundExpenses, newExpense];
                        handleComplexDataChange('fundExpenses', newExpenses);
                      }}
                      className="text-blue-600 border-blue-200"
                    >
                      + Add Another Expense
                    </Button>
                  </div>
                </div>

                {/* Advanced Fee Structure */}
                <div className="border-b border-gray-200 pb-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Advanced Fee Structure *</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                      <Label htmlFor="managementFee" className="text-sm font-medium text-gray-700">
                        Management Fee
                      </Label>
                      <div className="relative">
                        <Input
                          id="managementFee"
                          type="number"
                          step="0.1"
                          value={fundData.managementFee}
                          onChange={(e) => handleInputChange('managementFee', e.target.value)}
                          placeholder="2.0"
                          className="h-11 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                      </div>
                      <p className="text-xs text-gray-500">Annual management fee percentage</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="feeStructure" className="text-sm font-medium text-gray-700">
                        Fee Basis Method
                      </Label>
                      <Select value={fundData.feeStructure} onValueChange={(value) => handleInputChange('feeStructure', value)}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select fee basis" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="committed_capital">Committed Capital</SelectItem>
                          <SelectItem value="called_capital">Called Capital Each Period</SelectItem>
                          <SelectItem value="gross_cumulative">Gross Cumulative Called Capital</SelectItem>
                          <SelectItem value="net_cumulative">Net Cumulative Called Capital</SelectItem>
                          <SelectItem value="invested_capital">Cumulative Invested Capital</SelectItem>
                          <SelectItem value="fair_market_value">Fair Market Value</SelectItem>
                          <SelectItem value="unrealized">Unrealized Investments</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">How management fees are calculated</p>
                    </div>
                  </div>

                  {/* GP Commitment in Management Fees */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        id="includeGPInManagementFees"
                        checked={fundData.includeGPInManagementFees}
                        onChange={(e) => handleInputChange('includeGPInManagementFees', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Label htmlFor="includeGPInManagementFees" className="text-sm font-medium text-gray-700">
                        Include GP Commitment in Management Fee Calculation
                      </Label>
                    </div>
                    <p className="text-xs text-gray-500">
                      {fundData.includeGPInManagementFees 
                        ? "Management fees will be calculated on total committed capital including GP contribution"
                        : "Management fees will be calculated only on LP committed capital, excluding GP contribution"
                      }
                    </p>
                  </div>

                  {/* Fee Step-Down */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        id="feeStepDown"
                        checked={fundData.feeStepDown}
                        onChange={(e) => handleInputChange('feeStepDown', e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <Label htmlFor="feeStepDown" className="text-sm font-medium text-gray-700">
                        Enable fee step-down
                      </Label>
                    </div>
                    {fundData.feeStepDown && (
                      <div className="grid grid-cols-2 gap-4 ml-6">
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Step-down after year</Label>
                          <Input
                            type="number"
                            value={fundData.feeStepDownYear}
                            onChange={(e) => handleInputChange('feeStepDownYear', e.target.value)}
                            placeholder="5"
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">New fee rate (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={fundData.feeStepDownRate}
                            onChange={(e) => handleInputChange('feeStepDownRate', e.target.value)}
                            placeholder="1.5"
                            className="h-10"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Exit Recycling */}
                <div className="border-b border-gray-200 pb-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Exit Recycling</h3>
                  <p className="text-sm text-gray-600 mb-4">Allow exit proceeds to be re-invested into new investments</p>
                  
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            id="exitRecycling"
                            checked={Boolean(fundData.exitRecycling.enabled)}
                            onChange={(e) => {
                              const updated = { ...fundData.exitRecycling, enabled: Boolean(e.target.checked) };
                              handleComplexDataChange('exitRecycling', updated);
                            }}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                          />
                      <Label htmlFor="exitRecycling" className="text-sm font-medium text-gray-700">
                        Enable exit recycling
                      </Label>
                    </div>
                    {fundData.exitRecycling.enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Recycling rate (%)</Label>
                          <Input
                            type="number"
                            value={fundData.exitRecycling.recyclePercentage}
                            onChange={(e) => {
                              const updated = { ...fundData.exitRecycling, recyclePercentage: parseFloat(e.target.value) };
                              handleComplexDataChange('exitRecycling', updated);
                            }}
                            placeholder="100"
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Max cap (% of committed capital)</Label>
                          <Input
                            type="number"
                            value={fundData.exitRecycling.maxRecycleAmount || ''}
                            onChange={(e) => {
                              const updated = { ...fundData.exitRecycling, maxRecycleAmount: parseFloat(e.target.value) };
                              handleComplexDataChange('exitRecycling', updated);
                            }}
                            placeholder="50"
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Term (years)</Label>
                          <Input
                            type="number"
                            value={fundData.exitRecycling.recycleWindowMonths}
                            onChange={(e) => {
                              const updated = { ...fundData.exitRecycling, recycleWindowMonths: parseFloat(e.target.value) };
                              handleComplexDataChange('exitRecycling', updated);
                            }}
                            placeholder="5"
                            className="h-10"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Waterfall Structure */}
                <div className="border-b border-gray-200 pb-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Waterfall Structure *</h3>
                  <p className="text-sm text-gray-600 mb-4">Define profit splits between LPs and GPs</p>
                  
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Waterfall Type</Label>
                      <Select value={fundData.waterfall.type} onValueChange={(value) => {
                        const updated = { ...fundData.waterfall, type: value };
                        handleComplexDataChange('waterfall', updated);
                      }}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select waterfall type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="european">European (Fund Level Carry)</SelectItem>
                          <SelectItem value="american">American (Deal by Deal Carry)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="carryPercentage" className="text-sm font-medium text-gray-700">
                          Carry Percentage
                        </Label>
                        <div className="relative">
                          <Input
                            id="carryPercentage"
                            type="number"
                            step="0.1"
                            value={fundData.carryPercentage}
                            onChange={(e) => handleInputChange('carryPercentage', e.target.value)}
                            placeholder="20"
                            className="h-11 pr-8"
                          />
                          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            id="preferredReturn"
                            checked={fundData.preferredReturn}
                            onChange={(e) => handleInputChange('preferredReturn', e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                          />
                          <Label htmlFor="preferredReturn" className="text-sm font-medium text-gray-700">
                            Preferred Return
                          </Label>
                        </div>
                        {fundData.preferredReturn && (
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.1"
                              value={fundData.preferredReturnRate}
                              onChange={(e) => handleInputChange('preferredReturnRate', e.target.value)}
                              placeholder="8"
                              className="h-11 pr-8"
                            />
                            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Limited Partners */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Limited Partners *</h3>
                  <p className="text-sm text-gray-600 mb-4">Define LP classes and investment terms</p>
                  
                  <div className="space-y-4">
                    {(fundData.limitedPartners || []).map((lp, index) => (
                      <div key={lp.id} className="bg-gray-50 rounded-lg p-4 border">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">LP Class Name</Label>
                            <Input
                              value={lp.name}
                              onChange={(e) => {
                                const newLPs = [...(fundData.limitedPartners || [])];
                                if (newLPs[index]) {
                                  newLPs[index].name = e.target.value;
                                  handleComplexDataChange('limitedPartners', newLPs);
                                }
                              }}
                              placeholder="e.g., Institutional LPs"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Investment Amount</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                              <Input
                                type="number"
                                value={lp.investment}
                                onChange={(e) => {
                                  const newLPs = [...(fundData.limitedPartners || [])];
                                  if (newLPs[index]) {
                                    newLPs[index].investment = e.target.value;
                                    handleComplexDataChange('limitedPartners', newLPs);
                                  }
                                }}
                                placeholder="80000000"
                                className="h-10 pl-8"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Fee Profile</Label>
                            <Select 
                              value={lp.feeProfile} 
                              onValueChange={(value) => {
                                const newLPs = [...(fundData.limitedPartners || [])];
                                if (newLPs[index]) {
                                  newLPs[index].feeProfile = value;
                                  handleComplexDataChange('limitedPartners', newLPs);
                                }
                              }}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select profile" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Default</SelectItem>
                                <SelectItem value="institutional">Institutional</SelectItem>
                                <SelectItem value="family_office">Family Office</SelectItem>
                                <SelectItem value="strategic">Strategic</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Profit Split</Label>
                            <Select 
                              value={lp.profitSplit} 
                              onValueChange={(value) => {
                                const newLPs = [...(fundData.limitedPartners || [])];
                                if (newLPs[index]) {
                                  newLPs[index].profitSplit = value;
                                  handleComplexDataChange('limitedPartners', newLPs);
                                }
                              }}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select split" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pro_rata">Pro-Rata</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const newLP = {
                            id: `lp-${Date.now()}`,
                            name: "",
                            investment: "0",
                            feeProfile: "default",
                            profitSplit: "pro_rata"
                          };
                          const newLPs = [...(fundData.limitedPartners || []), newLP];
                          handleComplexDataChange('limitedPartners', newLPs);
                        }}
                        className="text-blue-600 border-blue-200"
                      >
                        + Add LP Class
                      </Button>
                      <Button variant="outline" size="sm" className="text-blue-600 border-blue-200">
                        Bulk Upload
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Review Fund Configuration</h3>
                
                <div className="bg-gray-50 rounded-lg p-6 space-y-6">
                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Fund Basics</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Fund Name</p>
                        <p className="font-semibold text-gray-900">{fundData.name || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Currency</p>
                        <p className="font-semibold text-gray-900">{fundData.currency}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Start Date</p>
                        <p className="font-semibold text-gray-900">{fundData.startDate}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Capital Call Frequency</p>
                        <p className="font-semibold text-gray-900">{fundData.capitalCallFrequency}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Committed Capital</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Committed Capital</p>
                        <p className="font-semibold text-gray-900">
                          ${parseFloat(fundData.totalCommittedCapital || "0").toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">GP Commitment</p>
                        <p className="font-semibold text-gray-900">
                          {fundData.gpCommitmentPercent}% (${parseFloat(fundData.gpCommitmentAmount || "0").toLocaleString()})
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">LP Commitment</p>
                        <p className="font-semibold text-gray-900">
                          ${parseFloat(fundData.lpCommitmentAmount || "0").toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Cashless GP Commit</p>
                        <p className="font-semibold text-gray-900">{fundData.cashlessGPPercent}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Investment Strategy Summary */}
                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Investment Strategy</h4>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Investment Stages</p>
                        <div className="space-y-1">
                          {fundData.investmentStrategy.stages.map((stage, index) => (
                            <p key={stage.id} className="text-sm text-gray-900">
                              {stage.name}: {stage.graduationRate}% graduation, {stage.exitRate}% exit
                            </p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Sector Allocation</p>
                        <div className="space-y-1">
                          {fundData.investmentStrategy.sectorProfiles.map((sector, index) => (
                            <p key={sector.id} className="text-sm text-gray-900">
                              {sector.name}: {sector.targetPercentage}%
                            </p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Capital Allocation</p>
                        <div className="space-y-1">
                          {fundData.investmentStrategy.allocations.map((allocation, index) => (
                            <p key={allocation.id} className="text-sm text-gray-900">
                              {allocation.category}: {allocation.percentage}%
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Exit Recycling Summary */}
                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Exit Recycling</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Status</p>
                        <p className="font-semibold text-gray-900">
                          {fundData.exitRecycling.enabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      {fundData.exitRecycling.enabled && (
                        <>
                          <div>
                            <p className="text-sm text-gray-600">Recycle Percentage</p>
                            <p className="font-semibold text-gray-900">{fundData.exitRecycling.recyclePercentage}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Window</p>
                            <p className="font-semibold text-gray-900">{fundData.exitRecycling.recycleWindowMonths} months</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Restrictions</p>
                            <p className="font-semibold text-gray-900">
                              {fundData.exitRecycling.restrictToSameSector || fundData.exitRecycling.restrictToSameStage
                                ? `${fundData.exitRecycling.restrictToSameSector ? 'Same Sector' : ''} ${
                                    fundData.exitRecycling.restrictToSameSector && fundData.exitRecycling.restrictToSameStage ? '& ' : ''
                                  }${fundData.exitRecycling.restrictToSameStage ? 'Same Stage' : ''}`
                                : 'None'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Waterfall Summary */}
                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Waterfall Structure</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Type</p>
                        <p className="font-semibold text-gray-900">
                          {fundData.waterfall.type === 'EUROPEAN' ? 'European (deal-by-deal)' : 'American (fund-level)'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Hurdle Rate</p>
                        <p className="font-semibold text-gray-900">{(fundData.waterfall.hurdle * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Catch-up Rate</p>
                        <p className="font-semibold text-gray-900">{(fundData.waterfall.catchUp * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Carry Vesting</p>
                        <p className="font-semibold text-gray-900">
                          {fundData.waterfall.carryVesting.cliffYears}y cliff, {fundData.waterfall.carryVesting.vestingYears}y vest
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Vehicle Structure</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Structure Type</p>
                        <p className="font-semibold text-gray-900">
                          {fundData.vehicleStructure === 'traditional_fund' ? 'Traditional Fund (recommended)' : 'SPV (no construction)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Ready to create your fund?</strong> You can modify these settings later in fund management.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
              <Button 
                variant="outline" 
                onClick={handleBack}
                disabled={currentStep === 'fund-basics'}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>

              <div className="flex items-center space-x-3">
                {canSkipStep() && currentStep !== 'review' && (
                  <Button 
                    variant="ghost"
                    onClick={handleNext}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    Skip for now
                  </Button>
                )}
                
                {currentStep !== 'review' ? (
                  <Button 
                    onClick={handleNext}
                    disabled={!canProceed}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <span>Next</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSave} 
                    disabled={createFundMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createFundMutation.isPending ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Creating Fund...</span>
                      </div>
                    ) : (
                      "Create Fund & Continue"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
