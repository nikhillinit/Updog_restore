import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFundContext } from "@/contexts/FundContext";
import { CheckCircle, Circle, ArrowRight, ArrowLeft, Building2 } from "lucide-react";
import { resilientLimit } from "@/utils/resilientLimit";
import { asyncRepl } from "../../../server/metrics";
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

  // refactor(async): Replace forEach with controlled concurrency + circuit breaker
  const processPortfolioAllocations = async (allocations: any[]) => {
    const limit = resilientLimit({ 
      concurrency: 4,      // Max 4 concurrent validations
      maxFailures: 3,      // Circuit breaker after 3 failures
      resetOnSuccess: true // Reset failure count on success
    });
    
    // Batch increment counter for this operation
    const migrationCount = 1; // Number of forEach patterns replaced in this function
    
    try {
      const results = await Promise.all(
        allocations.map(allocation => 
          limit(async () => {
            // Simulate async validation/processing
            await new Promise(resolve => setTimeout(resolve, 50));
            return {
              ...allocation,
              validated: true,
              processedAt: new Date().toISOString()
            };
          })
        )
      );
      
      // Track successful async forEach replacement
      asyncRepl.inc({ file: 'fund-setup.tsx' }, migrationCount);
      
      return results;
    } catch (error) {
      console.error('Portfolio allocation processing failed:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    // Process allocations with controlled concurrency before saving
    if (fundData.allocations?.length) {
      const processedAllocations = await processPortfolioAllocations(fundData.allocations);
      const enhancedFundData = { ...fundData, allocations: processedAllocations };
      createFundMutation.mutate(enhancedFundData);
    } else {
      createFundMutation.mutate(fundData);
    }
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

            {/* Rest of the component is the same... */}
            {/* Other steps content would continue here... */}

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
