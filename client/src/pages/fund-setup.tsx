import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFundContext } from "@/contexts/FundContext";
import { CheckCircle, Circle, ArrowRight, ArrowLeft, Building2 } from "lucide-react";
import BudgetCreator from "@/components/budget/budget-creator";

type WizardStep = 'fund-basics' | 'committed-capital' | 'advanced-settings' | 'review';

const WIZARD_STEPS: { id: WizardStep; label: string; description: string; icon: string }[] = [
  { id: 'fund-basics', label: 'Fund Name, Currency and Life', description: 'Some basic facts on your fund', icon: 'F' },
  { id: 'committed-capital', label: 'Committed Capital', description: 'The total capital committed from Limited and General Partners', icon: 'C' },
  { id: 'advanced-settings', label: 'Advanced Settings', description: 'Traditional fund or SPV', icon: 'A' },
  { id: 'review', label: 'Review', description: 'Review and create fund', icon: 'R' },
];

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
    capitalCallFrequency: "Monthly",
    
    // Committed Capital
    totalCommittedCapital: "100000000",
    gpCommitmentPercent: "2",
    gpCommitmentAmount: "2000000",
    lpCommitmentAmount: "98000000",
    lpCommitmentCloses: [
      { month: 1, percentage: 100 }
    ],
    
    // Cashless GP Commit (Optional)
    cashlessGPPercent: "20",
    
    // Advanced Settings
    vehicleStructure: "traditional_fund", // traditional_fund or spv
    
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

  const createFundMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        size: parseFloat(data.size),
        managementFee: parseFloat(data.managementFee) / 100,
        carryPercentage: parseFloat(data.carryPercentage) / 100,
        vintageYear: parseInt(data.vintageYear),
        deployedCapital: 0
      })
    }),
    onSuccess: (newFund) => {
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

  const handleInputChange = (field: string, value: string) => {
    setFundData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate dependent fields
      if (field === 'totalCommittedCapital' || field === 'gpCommitmentPercent') {
        return updateCalculatedFields(updated);
      }
      
      return updated;
    });
  };

  const handleNext = () => {
    const stepOrder: WizardStep[] = ['fund-basics', 'committed-capital', 'advanced-settings', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder: WizardStep[] = ['fund-basics', 'committed-capital', 'advanced-settings', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
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
      <div className="max-w-4xl mx-auto p-6 pb-20">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Press On Ventures Construction Wizard</h1>
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
            <CardTitle className="text-xl font-semibold text-gray-900">
              {WIZARD_STEPS[currentStepIndex].label}
            </CardTitle>
            <p className="text-gray-600 text-sm mt-1">
              {WIZARD_STEPS[currentStepIndex].description}
            </p>
          </CardHeader>
          <CardContent className="p-8 max-h-none overflow-visible">
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
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="hasEndDate"
                        checked={fundData.hasEndDate}
                        onChange={(e) => handleInputChange('hasEndDate', e.target.checked.toString())}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <Label htmlFor="hasEndDate" className="text-sm text-gray-700">
                        Fund has end date
                      </Label>
                    </div>
                    {fundData.hasEndDate === 'true' && (
                      <Input
                        type="date"
                        value={fundData.endDate}
                        onChange={(e) => handleInputChange('endDate', e.target.value)}
                        className="h-11 border-gray-300"
                      />
                    )}
                  </div>
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
                      className="h-11 pl-8 border-gray-300"
                    />
                  </div>
                </div>

                {/* GP Commitment */}
                <div className="space-y-3">
                  <Label className="text-base font-medium text-gray-900">
                    GP Commitment (%)
                  </Label>
                  <div className="flex items-center space-x-4">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={fundData.gpCommitmentPercent}
                        onChange={(e) => handleInputChange('gpCommitmentPercent', e.target.value)}
                        placeholder="2"
                        className="h-11 pr-8 border-gray-300"
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

                {/* Optional: Define Timing of LP Commitment Closes */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <Button 
                    variant="ghost" 
                    className="flex items-center text-gray-700 font-medium"
                  >
                    <span className="mr-2">▶</span>
                    Optional: Define Timing of LP Commitment Closes
                  </Button>
                </div>

                {/* Cashless GP Commit */}
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-700 font-medium">▼</span>
                    <span className="text-gray-900 font-medium">Cashless GP Commit</span>
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">Optional</span>
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="text-base font-medium text-gray-900">
                      What % of the GP Commit is Cashless?
                    </Label>
                    <div className="relative max-w-xs">
                      <Input
                        type="number"
                        value={fundData.cashlessGPPercent}
                        onChange={(e) => handleInputChange('cashlessGPPercent', e.target.value)}
                        placeholder="20"
                        className="h-11 pr-8 border-gray-300"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                    </div>
                  </div>
                </div>
              </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="gpCommitment" className="text-sm font-medium text-gray-700">
                        GP Commitment %
                      </Label>
                      <div className="relative">
                        <Input
                          id="gpCommitment"
                          type="number"
                          step="0.1"
                          value={fundData.gpCommitment}
                          onChange={(e) => handleInputChange('gpCommitment', e.target.value)}
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
                          {fundData.size && fundData.gpCommitment 
                            ? `$${((parseFloat(fundData.size) * parseFloat(fundData.gpCommitment)) / 100 / 1000000).toFixed(1)}M`
                            : '$0M'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Calculated GP investment amount</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Fund Timeline</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            {currentStep === 'features' && (
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                                handleInputChange('allocations', JSON.stringify(newAllocations));
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
                                handleInputChange('allocations', JSON.stringify(newAllocations));
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
                                handleInputChange('allocations', JSON.stringify(newAllocations));
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
                                handleInputChange('allocations', JSON.stringify(newAllocations));
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
                          id: Date.now(),
                          name: "",
                          sector: "technology",
                          allocation: "0",
                          stage: "seed"
                        };
                        const newAllocations = [...fundData.allocations, newAllocation];
                        handleInputChange('allocations', JSON.stringify(newAllocations));
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
                          id: index + 1,
                          category: item.category,
                          monthlyAmount: Math.round(item.lifetimeExpense / item.term).toString(),
                          startMonth: "1",
                          endMonth: item.term.toString()
                        }));
                        handleInputChange('fundExpenses', JSON.stringify(newExpenses));
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
                                handleInputChange('fundExpenses', JSON.stringify(newExpenses));
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
                                  handleInputChange('fundExpenses', JSON.stringify(newExpenses));
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
                                handleInputChange('fundExpenses', JSON.stringify(newExpenses));
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
                                handleInputChange('fundExpenses', JSON.stringify(newExpenses));
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
                          id: Date.now(),
                          category: "",
                          monthlyAmount: "0",
                          startMonth: "1",
                          endMonth: "120"
                        };
                        const newExpenses = [...fundData.fundExpenses, newExpense];
                        handleInputChange('fundExpenses', JSON.stringify(newExpenses));
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

                  {/* Fee Step-Down */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="feeStepDown"
                        checked={fundData.feeStepDown}
                        onChange={(e) => handleInputChange('feeStepDown', e.target.checked.toString())}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <Label htmlFor="feeStepDown" className="text-sm font-medium text-gray-700">
                        Enable fee step-down
                      </Label>
                    </div>
                    {fundData.feeStepDown === 'true' && (
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
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="exitRecycling"
                        checked={fundData.exitRecycling}
                        onChange={(e) => handleInputChange('exitRecycling', e.target.checked.toString())}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <Label htmlFor="exitRecycling" className="text-sm font-medium text-gray-700">
                        Enable exit recycling
                      </Label>
                    </div>
                    {fundData.exitRecycling === 'true' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Recycling rate (%)</Label>
                          <Input
                            type="number"
                            value={fundData.exitRecyclingRate}
                            onChange={(e) => handleInputChange('exitRecyclingRate', e.target.value)}
                            placeholder="100"
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Max cap (% of committed capital)</Label>
                          <Input
                            type="number"
                            value={fundData.exitRecyclingCap}
                            onChange={(e) => handleInputChange('exitRecyclingCap', e.target.value)}
                            placeholder="50"
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-gray-600">Term (years)</Label>
                          <Input
                            type="number"
                            value={fundData.exitRecyclingTerm}
                            onChange={(e) => handleInputChange('exitRecyclingTerm', e.target.value)}
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
                      <Select value={fundData.waterfallType} onValueChange={(value) => handleInputChange('waterfallType', value)}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select waterfall type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="european">European (Fund Level Carry)</SelectItem>
                          <SelectItem value="american">American (Deal by Deal Carry)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="preferredReturn"
                            checked={fundData.preferredReturn}
                            onChange={(e) => handleInputChange('preferredReturn', e.target.checked.toString())}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                          />
                          <Label htmlFor="preferredReturn" className="text-sm font-medium text-gray-700">
                            Preferred Return
                          </Label>
                        </div>
                        {fundData.preferredReturn === 'true' && (
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
                                  handleInputChange('limitedPartners', JSON.stringify(newLPs));
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
                                    handleInputChange('limitedPartners', JSON.stringify(newLPs));
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
                                  handleInputChange('limitedPartners', JSON.stringify(newLPs));
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
                                  handleInputChange('limitedPartners', JSON.stringify(newLPs));
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
                            id: Date.now(),
                            name: "",
                            investment: "0",
                            feeProfile: "default",
                            profitSplit: "pro_rata"
                          };
                          const newLPs = [...(fundData.limitedPartners || []), newLP];
                          handleInputChange('limitedPartners', JSON.stringify(newLPs));
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
                disabled={currentStep === 'essentials'}
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
                      <div className="flex items-center space-x-2">
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
