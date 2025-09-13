/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { mapAsync } from "@/lib";
import { useState, useEffect, useRef } from 'react';
import { startCreateFund, cancelCreateFund, computeCreateFundHash } from '@/services/funds';
import { toFundCreationPayload } from '@/core/reserves/adapter/toEngineGraduationRates';
import { toast } from '@/lib/toast';
import { useFundStore } from '@/stores/useFundStore';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PremiumCard } from "@/components/ui/PremiumCard";
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
import { CheckCircle, Circle, ArrowRight, ArrowLeft, Building2, Plus, Edit2, Trash2, X } from "lucide-react";
import { resilientLimit } from "@/utils/resilientLimit";
// Removed server import - use shared types or client-side metrics instead
// import { asyncRepl } from "../../../server/metrics";
import _BudgetCreator from "@/components/budget/budget-creator";
import InvestmentStrategyStep from "./InvestmentStrategyStep";
import ExitRecyclingStep from "./ExitRecyclingStep";
import WaterfallStep from "./WaterfallStep";
import type { InvestmentStrategy, ExitRecycling, Waterfall } from "@shared/types";
import type { Fund as DatabaseFund } from "@shared/schema";
import type { Fund } from "@/contexts/FundContext";
import { EnhancedAnalyticsPanel } from "@/components/analytics/EnhancedAnalyticsPanel";
import { convertFundDataToCashFlows, generateWaterfallInputs } from "@/lib/cashflow/generate";

type WizardStep = 'fund-basics' | 'committed-capital' | 'investment-strategy' | 'exit-recycling' | 'waterfall' | 'advanced-settings' | 'review';

interface LPClass {
  id: string;
  name: string;
  totalCommitment: number;
  excludedFromManagementFees: boolean;
  sideLetterProvisions?: string;
}

interface CapitalCall {
  id: string;
  callNumber: number;
  date: string;
  percentage: number;
  amounts: { [classId: string]: number };
}

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

  // LP Class modal state
  const [isLPClassModalOpen, setIsLPClassModalOpen] = useState(false);
  const [editingLPClass, setEditingLPClass] = useState<LPClass | null>(null);
  const [lpClassForm, setLPClassForm] = useState({
    name: '',
    totalCommitment: '',
    excludedFromManagementFees: false,
    sideLetterProvisions: ''
  });
  
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
    
    // Committed Capital
    totalCommittedCapital: "100000000",
    gpCommitmentPercent: "2",
    gpCommitment: "2",
    gpCommitmentAmount: "2000000",
    lpCommitmentAmount: "98000000",
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
    deployedCapital: 0,
    showCommitmentSchedule: false,
    lpCommitmentCloses: [
      { month: 1, percentage: 50, calendarMonth: 'Jan 2024' },
      { month: 2, percentage: 50, calendarMonth: 'Feb 2024' }
    ],
    lpClasses: [] as LPClass[],
    capitalCalls: [] as CapitalCall[],
    capitalCallFrequency: 'Quarterly'
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
      const databaseFund = await response.json() as unknown as DatabaseFund;
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

  // LP Class management functions
  const resetLPClassForm = () => {
    setLPClassForm({
      name: '',
      totalCommitment: '',
      excludedFromManagementFees: false,
      sideLetterProvisions: ''
    });
    setEditingLPClass(null);
  };

  const openAddLPClassModal = () => {
    resetLPClassForm();
    setIsLPClassModalOpen(true);
  };

  const openEditLPClassModal = (lpClass: LPClass) => {
    setLPClassForm({
      name: lpClass.name,
      totalCommitment: lpClass.totalCommitment.toString(),
      excludedFromManagementFees: lpClass.excludedFromManagementFees,
      sideLetterProvisions: lpClass.sideLetterProvisions || ''
    });
    setEditingLPClass(lpClass);
    setIsLPClassModalOpen(true);
  };

  const saveLPClass = () => {
    const newClass: LPClass = {
      id: editingLPClass?.id || `lp-class-${Date.now()}`,
      name: lpClassForm.name,
      totalCommitment: parseFloat(lpClassForm.totalCommitment) || 0,
      excludedFromManagementFees: lpClassForm.excludedFromManagementFees,
      sideLetterProvisions: lpClassForm.sideLetterProvisions
    };

    if (editingLPClass) {
      // Update existing class
      const updatedClasses = fundData.lpClasses.map(cls =>
        cls.id === editingLPClass.id ? newClass : cls
      );
      setFundData(prev => ({ ...prev, lpClasses: updatedClasses }));
    } else {
      // Add new class
      setFundData(prev => ({ ...prev, lpClasses: [...prev.lpClasses, newClass] }));
    }

    setIsLPClassModalOpen(false);
    resetLPClassForm();
  };

  const deleteLPClass = (classId: string) => {
    const updatedClasses = fundData.lpClasses.filter(cls => cls.id !== classId);
    setFundData(prev => ({ ...prev, lpClasses: updatedClasses }));
  };

  // Calculate summary metrics
  const calculateSummaryMetrics = () => {
    const totalLPCommitment = fundData.lpClasses.reduce((sum, cls) => sum + cls.totalCommitment, 0);
    const totalCommittedCapital = parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')) || 0;
    // Use the total committed capital from Fund Basics as the official fund size
    const totalFundSize = totalCommittedCapital;
    const excludedFromFees = fundData.lpClasses.filter(cls => cls.excludedFromManagementFees).length;
    const includedInFees = fundData.lpClasses.filter(cls => !cls.excludedFromManagementFees).length;

    return {
      totalFundSize,
      totalLPCommitment,
      numberOfClasses: fundData.lpClasses.length,
      excludedFromFees,
      includedInFees
    };
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
      // asyncRepl.inc({ file: 'fund-setup.tsx' }, migrationCount); // Removed server dependency
      
      return results;
    } catch (error) {
      console.error('Portfolio allocation processing failed:', error);
      throw error;
    }
  };

  const [saving, setSaving] = useState(false);
  
  const handleSave = async () => {
    if (saving) return; // UI re-entrancy guard
    setSaving(true);
    
    try {
      // Get current state from the fund store
      const storeState = useFundStore.getState();
      
      // Create payload using the centralized adapter
      const payload = toFundCreationPayload(storeState);
      
      // Process allocations with controlled concurrency if needed
      if (fundData.allocations?.length) {
        const processedAllocations = await processPortfolioAllocations(fundData.allocations);
        payload.basics = { ...payload.basics, allocations: processedAllocations };
      }
      
      // Use the new service with toast feedback and idempotency
      const { createFundWithToast } = await import('@/services/funds');
      // Fix type issue by using a proper options object
      const fund = await createFundWithToast(payload, { reuseExisting: true });
      
      // Update context and navigate
      setCurrentFund(fund as unknown as Fund);
      queryClient.invalidateQueries({ queryKey: ['/api/funds'] });
      setLocation('/dashboard');
      
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // UX-friendly: don't treat cancellations as failures
        console.info('Save cancelled:', error.message);
        return;
      }
      console.error('Fund creation failed:', error);
    } finally {
      setSaving(false);
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

      <div className="max-w-7xl mx-auto px-6 py-8 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <WizardContainer
              title={WIZARD_STEPS[currentStepIndex].label}
              subtitle={WIZARD_STEPS[currentStepIndex].description}
              className="mb-8"
            >
            {/* Fund Basics Step */}
            {currentStep === 'fund-basics' && (
              <div className="space-y-6">
                {/* Fund Name - Full Width */}
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="space-y-3">
                    <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                      Fund Name *
                    </label>
                    <Input
                      value={fundData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Enter your fund name"
                      className="h-12 border-beige-300 rounded-2xl focus:border-pov-charcoal transition-colors w-full"
                    />
                    <p className="text-xs text-charcoal-500 font-poppins">
                      The official name of your venture capital fund
                    </p>
                  </div>
                </div>

                {/* Fund Timeline & Commitments - Re-architected */}
                <div className="bg-white rounded-2xl shadow-sm" style={{ padding: '16px' }}>
                  {/* Section Heading */}
                  <div className="mb-4">
                    <h3 className="font-inter font-bold" style={{ fontSize: '20px', color: '#292929' }}>
                      Fund Timeline & Commitments
                    </h3>
                    <div className="h-px bg-charcoal-400 w-full mt-2"></div>
                  </div>

                  {/* Timeline Section - 2×2 Grid */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 className="font-poppins text-xs font-medium uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>
                      Timeline
                    </h4>
                    {/* Evergreen Toggle - Above the grid */}
                    <div className="flex items-center space-x-3 mb-4">
                      <label className="font-poppins text-xs font-medium uppercase tracking-widest" style={{ color: '#4A4A4A' }}>
                        Evergreen Fund?
                      </label>
                      <Switch
                        checked={fundData.isEvergreen}
                        onCheckedChange={(checked) => {
                          handleInputChange('isEvergreen', checked);
                          if (checked) {
                            handleInputChange('hasEndDate', false);
                            handleInputChange('endDate', '');
                          }
                        }}
                        className="w-10 h-5 data-[state=checked]:bg-pov-charcoal"
                      />
                      <span className="text-sm font-poppins text-charcoal-600">
                        {fundData.isEvergreen ? 'ON' : 'OFF'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '12px' }}>
                      {/* Top Row */}
                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Fund Start Date
                        </label>
                        <Input
                          type="date"
                          value={fundData.startDate}
                          onChange={(e) => handleInputChange('startDate', e.target.value)}
                          className="h-12 rounded-2xl w-full"
                          style={{ border: '1px solid #E0D8D1' }}
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Fund End Date
                        </label>
                        <Input
                          type="date"
                          value={fundData.endDate}
                          onChange={(e) => handleInputChange('endDate', e.target.value)}
                          disabled={fundData.isEvergreen}
                          className={`h-12 rounded-2xl w-full ${
                            fundData.isEvergreen ? 'bg-pov-gray text-charcoal-400 cursor-not-allowed' : ''
                          }`}
                          style={{ border: '1px solid #E0D8D1' }}
                          min={fundData.startDate}
                        />
                      </div>

                      {/* Bottom Row */}
                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Investment Horizon (Years)
                        </label>
                        <Input
                          type="number"
                          min="1"
                          max={fundData.lifeYears || 20}
                          value={fundData.investmentHorizonYears}
                          onChange={(e) => handleInputChange('investmentHorizonYears', e.target.value)}
                          placeholder="5"
                          className="h-12 rounded-2xl w-full"
                          style={{ border: '1px solid #E0D8D1' }}
                        />
                        <p className="text-xs text-charcoal-500 font-poppins">
                          Period for making new investments (typically 3-5 years)
                        </p>
                      </div>

                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Fund Term
                        </label>
                        <div className="h-12 rounded-2xl w-full bg-pov-gray flex items-center px-4" style={{ border: '1px solid #E0D8D1' }}>
                          <span className="text-charcoal-600 font-poppins text-sm">
                            {(() => {
                              if (!fundData.startDate || !fundData.endDate || fundData.isEvergreen) {
                                return fundData.isEvergreen ? 'Evergreen' : 'Set dates to calculate';
                              }
                              const start = new Date(fundData.startDate);
                              const end = new Date(fundData.endDate);
                              const years = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
                              return `${years} years`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Commitments Section - 2×2 Grid */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 className="font-poppins text-xs font-medium uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>
                      Commitments
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '12px' }}>
                      {/* Top Row */}
                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Total Committed Capital
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-charcoal-600 font-medium">$</span>
                          <Input
                            type="text"
                            value={fundData.totalCommittedCapital.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            onChange={(e) => {
                              const value = e.target.value.replace(/,/g, '');
                              handleInputChange('totalCommittedCapital', value);
                            }}
                            placeholder="100,000,000"
                            className="h-12 rounded-2xl w-full pl-8"
                            style={{ border: '1px solid #E0D8D1' }}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Capital Call Frequency
                        </label>
                        <Select value={fundData.capitalCallFrequency} onValueChange={(value) => handleInputChange('capitalCallFrequency', value)}>
                          <SelectTrigger className="h-12 rounded-2xl w-full" style={{ border: '1px solid #E0D8D1' }}>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Upfront">Upfront</SelectItem>
                            <SelectItem value="Quarterly">Quarterly</SelectItem>
                            <SelectItem value="Semi-Annually">Semi-Annually</SelectItem>
                            <SelectItem value="Annually">Annually</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Bottom Row */}
                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          GP Commitment %
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={fundData.gpCommitmentPercent}
                            onChange={(e) => handleInputChange('gpCommitmentPercent', e.target.value)}
                            placeholder="2.0"
                            className="h-12 rounded-2xl w-full pr-8"
                            style={{ border: '1px solid #E0D8D1' }}
                          />
                          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-charcoal-600 font-medium">%</span>
                        </div>
                        {/* Calculated Commitments */}
                        {fundData.totalCommittedCapital && fundData.gpCommitmentPercent && (
                          <div className="space-y-1 text-xs text-charcoal-600 font-poppins">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 rounded-full bg-charcoal-400"></div>
                              <span>GP Commitment is ${(() => {
                                const total = parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')) || 0;
                                const gpPercent = parseFloat(fundData.gpCommitmentPercent) || 0;
                                const gpAmount = (total * gpPercent / 100);
                                return gpAmount.toLocaleString();
                              })()}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 rounded-full bg-charcoal-400"></div>
                              <span>LP Commitment is ${(() => {
                                const total = parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')) || 0;
                                const gpPercent = parseFloat(fundData.gpCommitmentPercent) || 0;
                                const lpAmount = (total * (100 - gpPercent) / 100);
                                return lpAmount.toLocaleString();
                              })()}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Cashless GP Contribution %
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={fundData.cashlessGPPercent}
                            onChange={(e) => handleInputChange('cashlessGPPercent', e.target.value)}
                            placeholder="0"
                            className="h-12 rounded-2xl w-full pr-8"
                            style={{ border: '1px solid #E0D8D1' }}
                          />
                          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-charcoal-600 font-medium">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Optional Commitment Schedule */}
                  <div>
                    <button
                      className="flex items-center space-x-2 mb-3 text-pov-charcoal hover:text-charcoal-700 transition-colors duration-200"
                      onClick={() => setFundData(prev => ({ ...prev, showCommitmentSchedule: !prev.showCommitmentSchedule }))}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${
                          fundData.showCommitmentSchedule ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="font-poppins text-sm font-medium">
                        Optional: Define Timing of LP Commitment Closes
                      </span>
                    </button>

                    {fundData.showCommitmentSchedule && (
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <div className="mb-4">
                          <h5 className="font-poppins text-xs font-medium uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>
                            LP Commitment Schedule
                            <button className="ml-2 text-charcoal-500 hover:text-charcoal-700">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </h5>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-slate-300">
                                <th className="text-left py-2 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Month</th>
                                <th className="text-left py-2 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Calendar Month</th>
                                <th className="text-left py-2 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">% of this LP's Entire Commitment</th>
                                <th className="text-left py-2 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Amount Committed</th>
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(fundData.lpCommitmentCloses || [{ month: 1, percentage: 50, calendarMonth: 'Jan 2024' }, { month: 2, percentage: 50, calendarMonth: 'Feb 2024' }]).map((close, index) => (
                                <tr key={index} className="border-b border-slate-200">
                                  <td className="py-3 px-3">
                                    <Input
                                      type="number"
                                      value={close.month || index + 1}
                                      className="w-16 h-8 text-sm rounded-lg"
                                      style={{ border: '1px solid #E0D8D1' }}
                                      readOnly
                                    />
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="text-sm text-charcoal-600 font-poppins">
                                      {close.calendarMonth || `Jan 202${4 + index}`}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="flex items-center space-x-2">
                                      <Input
                                        type="number"
                                        value={close.percentage || 50}
                                        onChange={(e) => {
                                          const newCloses = [...(fundData.lpCommitmentCloses || [{ month: 1, percentage: 50, calendarMonth: 'Jan 2024' }, { month: 2, percentage: 50, calendarMonth: 'Feb 2024' }])];
                                          newCloses[index] = { ...newCloses[index], percentage: parseInt(e.target.value) || 0 };
                                          handleComplexDataChange('lpCommitmentCloses', newCloses);
                                        }}
                                        className="w-20 h-8 text-sm rounded-lg"
                                        style={{ border: '1px solid #E0D8D1' }}
                                      />
                                      <span className="text-sm text-charcoal-600">%</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <button className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-poppins">
                                      Enter Amount
                                    </button>
                                  </td>
                                  <td className="py-3 px-3">
                                    {index > 0 && (
                                      <button className="text-red-500 hover:text-red-700">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-4">
                          <button className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-pov-charcoal text-sm font-poppins font-medium rounded-lg transition-all duration-200">
                            Add Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Capital Structure Step */}
            {currentStep === 'committed-capital' && (
              <div className="space-y-6">
                {/* Summary Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {(() => {
                    const metrics = calculateSummaryMetrics();
                    return (
                      <>
                        <PremiumCard className="p-4">
                          <div className="text-center">
                            <h3 className="font-inter font-bold text-2xl text-pov-charcoal">
                              ${metrics.totalFundSize.toLocaleString()}
                            </h3>
                            <p className="text-sm text-charcoal-600 font-poppins">Total Fund Size</p>
                          </div>
                        </PremiumCard>
                        <PremiumCard className="p-4">
                          <div className="text-center">
                            <h3 className="font-inter font-bold text-2xl text-pov-charcoal">
                              {metrics.numberOfClasses}
                            </h3>
                            <p className="text-sm text-charcoal-600 font-poppins">LP Classes</p>
                          </div>
                        </PremiumCard>
                        <PremiumCard className="p-4">
                          <div className="text-center">
                            <h3 className="font-inter font-bold text-2xl text-pov-charcoal">
                              {metrics.excludedFromFees}
                            </h3>
                            <p className="text-sm text-charcoal-600 font-poppins">Excluded from Fees</p>
                          </div>
                        </PremiumCard>
                        <PremiumCard className="p-4">
                          <div className="text-center">
                            <h3 className="font-inter font-bold text-2xl text-pov-charcoal">
                              {metrics.includedInFees}
                            </h3>
                            <p className="text-sm text-charcoal-600 font-poppins">Included in Fees</p>
                          </div>
                        </PremiumCard>
                      </>
                    );
                  })()}
                </div>

                {/* LP Classes Management Section */}
                <PremiumCard
                  title="LP Classes"
                  className="p-6"
                  headerActions={
                    <Button
                      onClick={openAddLPClassModal}
                      className="flex items-center space-x-2 bg-pov-charcoal hover:bg-pov-charcoal/90 text-white rounded-2xl h-10 px-4 transition-all duration-200"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="font-poppins font-medium">Add LP Class</span>
                    </Button>
                  }
                >
                  {/* LP Classes Table */}
                  {fundData.lpClasses.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-charcoal-200">
                            <th className="text-left py-3 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Class</th>
                            <th className="text-left py-3 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">LP Commitment</th>
                            <th className="text-left py-3 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Commit %</th>
                            <th className="text-left py-3 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Fee Status</th>
                            <th className="text-left py-3 px-3 font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fundData.lpClasses.map((lpClass) => {
                            const totalCommittedCapital = parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')) || 0;
                            const commitPercent = totalCommittedCapital > 0 ? ((lpClass.totalCommitment / totalCommittedCapital) * 100).toFixed(2) : '0.00';
                            return (
                              <tr key={lpClass.id} className="border-b border-charcoal-100">
                                <td className="py-3 px-3 font-poppins text-sm text-charcoal-700">{lpClass.name}</td>
                                <td className="py-3 px-3 font-poppins text-sm text-charcoal-700">${lpClass.totalCommitment.toLocaleString()}</td>
                                <td className="py-3 px-3 font-poppins text-sm text-charcoal-700">{commitPercent}%</td>
                                <td className="py-3 px-3 font-poppins text-sm text-charcoal-700">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    lpClass.excludedFromManagementFees
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-green-100 text-green-800'
                                  }`}>
                                    {lpClass.excludedFromManagementFees ? 'Excluded' : 'Included'}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => openEditLPClassModal(lpClass)}
                                      className="text-blue-600 hover:text-blue-800"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => deleteLPClass(lpClass.id)}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {/* Footer Row with Totals */}
                          <tr className="bg-slate-50 border-t-2 border-charcoal-300">
                            <td className="py-3 px-3 font-poppins text-sm font-medium text-charcoal-700">Totals</td>
                            <td className="py-3 px-3 font-poppins text-sm font-medium text-charcoal-700">
                              ${fundData.lpClasses.reduce((sum, cls) => sum + cls.totalCommitment, 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 font-poppins text-sm font-medium text-charcoal-700">
                              100.00%
                            </td>
                            <td className="py-3 px-3 font-poppins text-sm font-medium text-charcoal-700">
                              {calculateSummaryMetrics().excludedFromFees}E / {calculateSummaryMetrics().includedInFees}I
                            </td>
                            <td className="py-3 px-3"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-charcoal-500">
                      <Building2 className="w-12 h-12 mx-auto mb-4 text-charcoal-300" />
                      <p className="font-poppins text-lg mb-2">No LP Classes Yet</p>
                      <p className="font-poppins text-sm">Add your first LP class to get started</p>
                    </div>
                  )}
                </PremiumCard>

                {/* GP Commitment Section */}
                <PremiumCard title="GP Commitment" className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                        GP Commitment %
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={fundData.gpCommitmentPercent}
                          onChange={(e) => handleInputChange('gpCommitmentPercent', e.target.value)}
                          placeholder="2.0"
                          className="h-12 rounded-2xl w-full pr-8"
                          style={{ border: '1px solid #E0D8D1' }}
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-charcoal-600 font-medium">%</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                        GP Commitment Amount
                      </label>
                      <div className="h-12 rounded-2xl w-full bg-pov-gray flex items-center px-4" style={{ border: '1px solid #E0D8D1' }}>
                        <span className="text-charcoal-600 font-poppins text-sm">
                          ${(() => {
                            const totalCommittedCapital = parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')) || 0;
                            const gpPercent = parseFloat(fundData.gpCommitmentPercent) || 0;
                            const gpAmount = (totalCommittedCapital * gpPercent / 100);
                            return gpAmount.toLocaleString();
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </PremiumCard>

                {/* Capital Call Schedule Builder */}
                <PremiumCard title="Capital Call Schedule" className="p-6">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                          Call Frequency
                        </label>
                        <Select
                          value={fundData.capitalCallFrequency}
                          onValueChange={(value) => handleInputChange('capitalCallFrequency', value)}
                        >
                          <SelectTrigger className="h-12 rounded-2xl w-full" style={{ border: '1px solid #E0D8D1' }}>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Quarterly">Quarterly</SelectItem>
                            <SelectItem value="Semi-Annual">Semi-Annual</SelectItem>
                            <SelectItem value="Annual">Annual</SelectItem>
                            <SelectItem value="As Needed">As Needed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {fundData.capitalCallFrequency !== 'As Needed' && (
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <h5 className="font-poppins text-xs font-medium uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>
                          Projected Call Schedule
                        </h5>
                        <div className="text-center py-8 text-charcoal-500">
                          <p className="font-poppins text-sm">Capital call schedule will be generated based on frequency and LP classes</p>
                        </div>
                      </div>
                    )}
                  </div>
                </PremiumCard>
              </div>
            )}

            {/* Investment Strategy Step */}
            {currentStep === 'investment-strategy' && (
              <div data-testid="wizard-step3-container">
                <InvestmentStrategyStep />
              </div>
            )}

            {/* Exit Recycling Step */}
            {currentStep === 'exit-recycling' && (
              <div data-testid="wizard-step4-container">
                <ExitRecyclingStep
                  data={fundData.exitRecycling}
                  onChange={(data) => handleComplexDataChange('exitRecycling', data)}
                />
              </div>
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
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="space-y-3">
                    <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                      Vehicle Structure
                    </label>
                    <select
                      value={fundData.vehicleStructure}
                      onChange={(e) => handleInputChange('vehicleStructure', e.target.value)}
                      className="h-12 border-beige-300 rounded-2xl focus:border-pov-charcoal transition-colors w-full px-3"
                    >
                      <option value="traditional_fund">Traditional Fund</option>
                      <option value="spv">Special Purpose Vehicle</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="space-y-3">
                    <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest block">
                      Management Fee Structure
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={fundData.feeStructure}
                        onChange={(e) => handleInputChange('feeStructure', e.target.value)}
                        placeholder="2.0"
                        className="h-12 rounded-2xl w-full pr-8"
                        style={{ border: '1px solid #E0D8D1' }}
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-charcoal-600 font-medium">%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <h3 className="font-inter font-bold text-xl text-pov-charcoal mb-4">Fund Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest">Fund Name</label>
                      <p className="text-lg font-medium text-charcoal-700">{fundData.name}</p>
                    </div>
                    <div>
                      <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest">Total Size</label>
                      <p className="text-lg font-medium text-charcoal-700">${parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')).toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest">Management Fee</label>
                      <p className="text-lg font-medium text-charcoal-700">{fundData.feeStructure}%</p>
                    </div>
                    <div>
                      <label className="font-poppins text-xs font-medium text-charcoal-600 uppercase tracking-widest">Investment Strategy</label>
                      <p className="text-lg font-medium text-charcoal-700">{fundData.investmentStrategy.stages.length} stages defined</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            </WizardContainer>
          </div>

          {/* Analytics Panel - Right Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <EnhancedAnalyticsPanel
                cashFlows={convertFundDataToCashFlows(fundData)}
                wConfig={generateWaterfallInputs(fundData).config}
                contributions={generateWaterfallInputs(fundData).contributions}
                exits={generateWaterfallInputs(fundData).exits}
              />
            </div>
          </div>
        </div>

        {/* LP Class Modal */}
        <Dialog open={isLPClassModalOpen} onOpenChange={setIsLPClassModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-inter font-bold text-xl text-pov-charcoal">
                {editingLPClass ? 'Edit LP Class' : 'Add New LP Class'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                    Class Name *
                  </label>
                  <Input
                    type="text"
                    value={lpClassForm.name}
                    onChange={(e) => setLPClassForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Class A - Strategic Partners"
                    className="h-12 rounded-2xl w-full"
                    style={{ border: '1px solid #E0D8D1' }}
                  />
                </div>

                <div className="space-y-3">
                  <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                    Total Commitment *
                  </label>
                  <FinancialInput
                    label=""
                    value={lpClassForm.totalCommitment}
                    onChange={(value) => setLPClassForm(prev => ({ ...prev, totalCommitment: value }))}
                    type="currency"
                    placeholder="50000000"
                    className="h-12 rounded-2xl"
                  />
                  {/* Show commitment percentage */}
                  {lpClassForm.totalCommitment && (
                    <p className="text-xs text-charcoal-500 font-poppins">
                      {(() => {
                        const currentCommitment = parseFloat(lpClassForm.totalCommitment) || 0;
                        const totalCommittedCapital = parseFloat(fundData.totalCommittedCapital.replace(/,/g, '')) || 0;
                        const commitPercent = totalCommittedCapital > 0 ? ((currentCommitment / totalCommittedCapital) * 100).toFixed(2) : '0.00';
                        return `${commitPercent}% of total committed capital`;
                      })()}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-poppins text-xs font-medium uppercase tracking-widest" style={{ color: '#4A4A4A' }}>
                      Excluded from Management Fees
                    </label>
                    <Switch
                      checked={lpClassForm.excludedFromManagementFees}
                      onCheckedChange={(checked) => setLPClassForm(prev => ({ ...prev, excludedFromManagementFees: checked }))}
                      className="w-10 h-5 data-[state=checked]:bg-pov-charcoal"
                    />
                  </div>
                  <p className="text-xs text-charcoal-500 font-poppins">
                    {lpClassForm.excludedFromManagementFees
                      ? 'This LP class will not pay management fees'
                      : 'This LP class will pay standard management fees'
                    }
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="font-poppins text-xs font-medium uppercase tracking-widest block" style={{ color: '#4A4A4A' }}>
                  Side Letter Provisions (Optional)
                </label>
                <Textarea
                  value={lpClassForm.sideLetterProvisions}
                  onChange={(e) => setLPClassForm(prev => ({ ...prev, sideLetterProvisions: e.target.value }))}
                  placeholder="Enter any special provisions, fee arrangements, or terms specific to this LP class..."
                  className="min-h-[100px] rounded-2xl"
                  style={{ border: '1px solid #E0D8D1' }}
                />
              </div>
            </div>

            <DialogFooter className="space-x-3">
              <Button
                variant="outline"
                onClick={() => setIsLPClassModalOpen(false)}
                className="border-charcoal-300 text-charcoal-600 hover:bg-charcoal-50"
              >
                Cancel
              </Button>
              <Button
                onClick={saveLPClass}
                disabled={!lpClassForm.name || !lpClassForm.totalCommitment}
                className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-white"
              >
                {editingLPClass ? 'Update Class' : 'Add Class'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sticky Footer Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-charcoal-100 border-t border-charcoal-200 shadow-lg z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
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

