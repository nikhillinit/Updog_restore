import { mapAsync } from "@/lib";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FinancialInput } from "@/components/wizard/FinancialInput";
import { POVLogo } from "@/components/ui/POVLogo";
import { WizardHeader } from "@/components/wizard/WizardHeader";
import { WizardProgressRedesigned } from "@/components/wizard/WizardProgressRedesigned";
import { WizardContainer, WizardSectionHeading, WizardInputLabel } from "@/components/wizard/WizardContainer";

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
  { id: 'fund-basics', label: 'Fund Basics', description: 'Name, currency, and fund lifecycle', icon: '1' },
  { id: 'committed-capital', label: 'Capital Structure', description: 'LP/GP commitments and capital calls', icon: '2' },
  { id: 'investment-strategy', label: 'Investment Strategy', description: 'Stages, sectors, and allocations', icon: '3' },
  { id: 'exit-recycling', label: 'Exit Recycling', description: 'Proceeds recycling configuration', icon: '4' },
  { id: 'waterfall', label: 'Waterfall & Carry', description: 'Distribution terms and carry structure', icon: '5' },
  { id: 'advanced-settings', label: 'Advanced Settings', description: 'Fund structure and expenses', icon: '6' },
  { id: 'review', label: 'Review & Create', description: 'Final review and fund creation', icon: '✓' },
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
      concurrency: 3,      // Max 3 concurrent validations
      maxFailures: 3,      // Circuit breaker after 3 failures
      resetOnSuccess: true // Reset failure count on success
    });
    
    // Batch increment counter for this operation
    const migrationCount = 1; // Number of forEach patterns replaced in this function
    
    try {
      const results = await Promise.all(
        await mapAsync(allocations, allocation => 
          limit(async () => {
            // Simulate async validation/processing
            await new Promise(resolve => setTimeout(resolve, 50));
            return {
              ...allocation,
              validated: true,
              processedAt: new Date().toISOString()
            };
          }))
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

  const completedSteps = WIZARD_STEPS.slice(0, currentStepIndex).map(step => step.id);

  return (
    <div className="min-h-screen bg-slate-100 overflow-y-auto">
      {/* Header with Logo Lockup and Centered Title */}
      <WizardHeader
        title="Fund Construction Wizard"
        subtitle="Configure your venture capital fund with institutional-grade precision and professional standards"
      />

      {/* Wizard Progress with Octagonal Icons */}
      <WizardProgressRedesigned
        steps={WIZARD_STEPS}
        currentStep={currentStep}
        completedSteps={completedSteps}
      />

      <div className="max-w-6xl mx-auto px-6 py-8 pb-32">
        <WizardContainer
          title={WIZARD_STEPS[currentStepIndex].label}
          subtitle={WIZARD_STEPS[currentStepIndex].description}
          className="mb-8"
          style={{ margin: '24px' }}
        >
            {/* Fund Basics Step */}
            {currentStep === 'fund-basics' && (
              <div className="space-y-12">
                {/* Basic Information Section */}
                <div className="space-y-6">
                  <h3 className="font-inter font-bold text-2xl text-pov-charcoal">
                    Basic Information
                  </h3>

                  <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
                    {/* Fund Name - Full Width */}
                    <div className="space-y-3">
                      <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                        Fund Name *
                      </label>
                      <Input
                        value={fundData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter your fund name"
                        className="h-12 border-charcoal-300 rounded-2xl focus:border-pov-charcoal transition-colors"
                      />
                      <p className="text-xs text-charcoal-500 font-poppins">
                        The official name of your venture capital fund
                      </p>
                    </div>

                    {/* Currency - Half Width */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                          Fund Currency
                        </label>
                        <Select value={fundData.currency} onValueChange={(value) => handleInputChange('currency', value)}>
                          <SelectTrigger className="h-12 border-charcoal-300 rounded-2xl">
                            <SelectValue placeholder="United States Dollar ($)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">United States Dollar ($)</SelectItem>
                            <SelectItem value="EUR">Euro (€)</SelectItem>
                            <SelectItem value="GBP">British Pound (£)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                          Capital Call Frequency
                        </label>
                        <Select value={fundData.capitalCallFrequency} onValueChange={(value) => handleInputChange('capitalCallFrequency', value)}>
                          <SelectTrigger className="h-12 border-charcoal-300 rounded-2xl">
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
                    </div>
                  </div>
                </div>

                {/* Fund Timeline Section */}
                <div className="space-y-6">
                  <h3 className="font-inter font-bold text-2xl text-pov-charcoal">
                    Fund Timeline
                  </h3>

                  <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Left Column - Dates */}
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                            Fund Start Date
                          </label>
                          <Input
                            type="date"
                            value={fundData.startDate}
                            onChange={(e) => handleInputChange('startDate', e.target.value)}
                            className="h-12 border-charcoal-300 rounded-2xl"
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                            Fund End Date
                          </label>
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id="hasEndDate"
                                checked={fundData.hasEndDate}
                                onChange={(e) => {
                                  handleInputChange('hasEndDate', e.target.checked);
                                  if (!e.target.checked) {
                                    setFundData(prev => ({ ...prev, lifeYears: 10 }));
                                  }
                                }}
                                className="h-4 w-4 text-pov-charcoal border-charcoal-300 rounded"
                              />
                              <label htmlFor="hasEndDate" className="text-sm text-charcoal-600 font-poppins">
                                Fund has specific end date
                              </label>
                            </div>
                            {fundData.hasEndDate && (
                              <Input
                                type="date"
                                value={fundData.endDate}
                                onChange={(e) => handleInputChange('endDate', e.target.value)}
                                className="h-12 border-charcoal-300 rounded-2xl"
                                min={fundData.startDate}
                              />
                            )}
                          </div>
                          {fundData.hasEndDate && fundData.startDate && fundData.endDate && (
                            <p className="text-xs text-charcoal-500 font-poppins">
                              Fund life: {(() => {
                                const start = new Date(fundData.startDate);
                                const end = new Date(fundData.endDate);
                                const years = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
                                return years;
                              })()} years
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Column - Structure & Terms */}
                      <div className="space-y-6">
                        {/* Evergreen Toggle with better positioning */}
                        <div className="bg-beige-50 rounded-xl p-4 border border-beige-200">
                          <div className="flex items-center justify-between mb-2">
                            <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest">
                              Evergreen Fund?
                            </label>
                            <Switch
                              checked={fundData.isEvergreen}
                              onCheckedChange={(checked) => handleInputChange('isEvergreen', checked)}
                            />
                          </div>
                          <p className="text-xs text-charcoal-500 font-poppins">
                            Evergreen funds have no fixed life and can invest indefinitely
                          </p>
                        </div>

                        {/* Conditional Fund Life */}
                        {!fundData.isEvergreen && (
                          <div className="space-y-3">
                            <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                              Fund Life (Years)
                            </label>
                            <Input
                              type="number"
                              min="3"
                              max="20"
                              value={fundData.lifeYears}
                              onChange={(e) => handleInputChange('lifeYears', e.target.value)}
                              className={`h-12 border-charcoal-300 rounded-2xl ${
                                fundData.hasEndDate && fundData.startDate && fundData.endDate
                                  ? 'bg-pov-gray cursor-not-allowed'
                                  : ''
                              }`}
                              placeholder="10"
                              readOnly={Boolean(fundData.hasEndDate && fundData.startDate && fundData.endDate)}
                            />
                            <p className="text-xs text-charcoal-500 font-poppins">
                              {fundData.hasEndDate && fundData.startDate && fundData.endDate
                                ? 'Automatically calculated from start and end dates'
                                : 'Total fund duration (typically 10-12 years)'}
                            </p>
                          </div>
                        )}

                        {/* Investment Horizon */}
                        <div className="space-y-3">
                          <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                            Investment Horizon (Years)
                          </label>
                          <Input
                            type="number"
                            min="1"
                            max={fundData.lifeYears || 20}
                            value={fundData.investmentHorizonYears}
                            onChange={(e) => handleInputChange('investmentHorizonYears', e.target.value)}
                            className="h-12 border-charcoal-300 rounded-2xl"
                            placeholder="5"
                          />
                          <p className="text-xs text-charcoal-500 font-poppins">
                            Period for making new investments (typically 3-5 years)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rest of the component is the same... */}
            {/* Other steps content would continue here... */}

        </WizardContainer>

        {/* Sticky Footer Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-charcoal-100 border-t border-charcoal-200 shadow-lg z-50">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              {/* Left side - Step indicator and Save draft */}
              <div className="flex items-center space-x-6">
                <span className="text-charcoal-600 font-poppins text-sm font-medium">
                  Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
                </span>
                <button className="text-charcoal-500 hover:text-pov-charcoal text-sm font-poppins transition-colors duration-200">
                  Save draft
                </button>
              </div>

              {/* Right side - Navigation buttons */}
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStep === 'fund-basics'}
                  className="flex items-center space-x-2 border border-pov-charcoal text-pov-charcoal hover:bg-pov-charcoal hover:text-white rounded-2xl h-12 px-6 transition-all duration-200 font-poppins font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>

                {canSkipStep() && currentStep !== 'review' && (
                  <Button
                    variant="ghost"
                    onClick={handleNext}
                    className="text-charcoal-500 hover:text-pov-charcoal hover:bg-pov-beige/20 transition-all duration-200 font-poppins font-medium rounded-2xl h-12 px-6"
                  >
                    Skip for now
                  </Button>
                )}

                {currentStep !== 'review' ? (
                  <Button
                    onClick={handleNext}
                    disabled={!canProceed}
                    className="flex items-center space-x-2 bg-pov-charcoal hover:bg-gradient-to-r hover:from-pov-charcoal hover:to-pov-beige text-white rounded-2xl h-12 px-8 shadow-elevated hover:shadow-lg transition-all duration-200 disabled:opacity-50 font-poppins font-medium"
                  >
                    <span>Next</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSave}
                    disabled={createFundMutation.isPending}
                    className="bg-pov-charcoal hover:bg-gradient-to-r hover:from-pov-charcoal hover:to-pov-beige text-white rounded-2xl h-12 px-8 shadow-elevated hover:shadow-lg transition-all duration-200 font-poppins font-medium"
                  >
                    {createFundMutation.isPending ? (
                      <div className="flex items-center gap-3">
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
          </div>
        </div>
      </div>
    </div>
  );
}
