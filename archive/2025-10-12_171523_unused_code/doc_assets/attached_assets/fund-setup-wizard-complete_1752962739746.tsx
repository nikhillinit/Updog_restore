// FundSetupWizard.tsx - Complete fund setup wizard with proper flow
import React, { useState, useCallback } from 'react';
import { useFundContext } from '../../context/fund-context-provider';
import { NumericInput, MoneyInput, PercentInput } from '../inputs';
import { EnhancedFundInputs, StageAllocation } from '../../shared/enhanced-types';
import { calculateReserveRequirements, getReserveStrategyDescription } from '../../utils/reserve-calculations';

interface FundSetupWizardProps {
  onComplete?: () => void;
}

type WizardStep = 'general' | 'lps' | 'fees' | 'allocations' | 'reserves' | 'review';

const WIZARD_STEPS: { id: WizardStep; label: string; description: string }[] = [
  { id: 'general', label: 'General', description: 'Basic fund information' },
  { id: 'lps', label: 'Limited Partners', description: 'LP classes and commitments' },
  { id: 'fees', label: 'Fees & Expenses', description: 'Management fees and expenses' },
  { id: 'allocations', label: 'Allocations', description: 'Stage allocation strategy' },
  { id: 'reserves', label: 'Reserves', description: 'Reserve allocation method' },
  { id: 'review', label: 'Review', description: 'Review and calculate' },
];

export default function FundSetupWizard({ onComplete }: FundSetupWizardProps) {
  const { state, updateInputs, validateInputs, calculateForecast } = useFundContext();
  const [currentStep, setCurrentStep] = useState<WizardStep>('general');
  const [localInputs, setLocalInputs] = useState(state.inputs);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCalculating, setIsCalculating] = useState(false);

  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  // Update local state and context
  const handleInputChange = useCallback((field: keyof EnhancedFundInputs, value: any) => {
    setLocalInputs(prev => ({ ...prev, [field]: value }));
    updateInputs({ [field]: value });
    // Clear error for this field
    setErrors(prev => ({ ...prev, [field]: '' }));
  }, [updateInputs]);

  // Validate current step
  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    switch (currentStep) {
      case 'general':
        if (!localInputs.fundName) newErrors.fundName = 'Fund name is required';
        if (localInputs.fundSize <= 0) newErrors.fundSize = 'Fund size must be greater than 0';
        if (localInputs.fundLifeYears <= 0) newErrors.fundLifeYears = 'Fund life must be greater than 0';
        if (localInputs.investmentPeriodYears <= 0) newErrors.investmentPeriod = 'Investment period must be greater than 0';
        if (localInputs.investmentPeriodYears > localInputs.fundLifeYears) {
          newErrors.investmentPeriod = 'Investment period cannot exceed fund life';
        }
        break;
        
      case 'lps':
        const totalCommitments = localInputs.lpClasses.reduce((sum, lp) => sum + lp.commitment, 0);
        const gpCommitmentAmount = localInputs.fundSize * localInputs.gpCommitment;
        const totalWithGP = totalCommitments + gpCommitmentAmount;
        
        if (Math.abs(totalWithGP - localInputs.fundSize) > 1000) { // Allow $1k tolerance
          newErrors.lpClasses = `Total commitments ($${(totalWithGP/1000000).toFixed(1)}M) must equal fund size ($${(localInputs.fundSize/1000000).toFixed(1)}M)`;
        }
        break;
        
      case 'allocations':
        const totalAllocation = localInputs.stageAllocations.reduce((sum, s) => sum + s.allocation, 0);
        if (Math.abs(totalAllocation - 1) > 0.001) {
          newErrors.allocations = `Stage allocations must sum to 100% (currently ${(totalAllocation * 100).toFixed(1)}%)`;
        }
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navigate between steps
  const goToStep = (step: WizardStep) => {
    if (validateStep()) {
      setCurrentStep(step);
    }
  };

  const goNext = () => {
    if (validateStep()) {
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < WIZARD_STEPS.length) {
        setCurrentStep(WIZARD_STEPS[nextIndex].id);
      }
    }
  };

  const goPrevious = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(WIZARD_STEPS[prevIndex].id);
    }
  };

  // Handle final calculation
  const handleCalculate = async () => {
    if (!validateStep()) return;
    
    setIsCalculating(true);
    try {
      const validation = validateInputs();
      if (!validation.isValid) {
        setErrors({ general: 'Please fix validation errors before calculating' });
        return;
      }
      
      await calculateForecast();
      
      // If successful, complete the wizard
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Calculation failed' });
    } finally {
      setIsCalculating(false);
    }
  };

  // Calculate remaining LP capacity
  const calculateRemainingCapacity = () => {
    const gpCommitmentAmount = localInputs.fundSize * localInputs.gpCommitment;
    const lpCommitments = localInputs.lpClasses.reduce((sum, lp) => sum + lp.commitment, 0);
    return localInputs.fundSize - gpCommitmentAmount - lpCommitments;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {WIZARD_STEPS.map((step, index) => (
            <div key={step.id} className="flex-1 relative">
              <div
                className={`flex items-center ${
                  index < WIZARD_STEPS.length - 1 ? 'w-full' : ''
                }`}
              >
                <button
                  onClick={() => goToStep(step.id)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    index <= currentStepIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                  disabled={index > currentStepIndex}
                >
                  {index + 1}
                </button>
                {index < WIZARD_STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
              <div className="absolute top-12 left-0 right-0 text-center">
                <p className="text-xs font-medium text-gray-900">{step.label}</p>
                <p className="text-xs text-gray-500 mt-1">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white shadow rounded-lg p-6 mt-16">
        <h2 className="text-xl font-semibold mb-6">{WIZARD_STEPS[currentStepIndex].label}</h2>

        {/* Error Display */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            {Object.entries(errors).map(([key, error]) => (
              <p key={key} className="text-sm text-red-800">{error}</p>
            ))}
          </div>
        )}

        {/* General Step */}
        {currentStep === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fund Name
                </label>
                <input
                  type="text"
                  value={localInputs.fundName}
                  onChange={(e) => handleInputChange('fundName', e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., POVC Fund I"
                />
              </div>
              
              <MoneyInput
                label="Fund Size"
                value={localInputs.fundSize}
                onChange={(value) => handleInputChange('fundSize', value)}
                multiplier={1000000}
                suffix="M"
                placeholder="150"
              />
              
              <NumericInput
                label="Fund Life (Years)"
                value={localInputs.fundLifeYears}
                onChange={(value) => handleInputChange('fundLifeYears', value)}
                min={1}
                max={20}
                placeholder="10"
              />
              
              <NumericInput
                label="Investment Period (Years)"
                value={localInputs.investmentPeriodYears}
                onChange={(value) => handleInputChange('investmentPeriodYears', value)}
                min={1}
                max={localInputs.fundLifeYears}
                placeholder="5"
              />
              
              <PercentInput
                label="GP Commitment"
                value={localInputs.gpCommitment * 100}
                onChange={(value) => handleInputChange('gpCommitment', value / 100)}
                min={0}
                max={20}
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GP Commitment Amount
                </label>
                <p className="text-lg font-semibold text-gray-900">
                  ${((localInputs.fundSize * localInputs.gpCommitment) / 1000000).toFixed(1)}M
                </p>
              </div>
            </div>
          </div>
        )}

        {/* LP Classes Step */}
        {currentStep === 'lps' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">LP Classes</h3>
              <div className="text-sm text-gray-600">
                Remaining Capacity: <span className="font-semibold text-lg">
                  ${(calculateRemainingCapacity() / 1000000).toFixed(1)}M
                </span>
              </div>
            </div>

            {/* GP Class (read-only) */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">General Partner (GP)</p>
                  <p className="text-sm text-gray-600">Management fee excluded</p>
                </div>
                <p className="text-lg font-semibold">
                  ${((localInputs.fundSize * localInputs.gpCommitment) / 1000000).toFixed(1)}M
                </p>
              </div>
            </div>

            {/* LP Classes */}
            <div className="space-y-4">
              {localInputs.lpClasses.map((lp, index) => (
                <div key={lp.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input
                      type="text"
                      value={lp.name}
                      onChange={(e) => {
                        const updated = [...localInputs.lpClasses];
                        updated[index] = { ...lp, name: e.target.value };
                        handleInputChange('lpClasses', updated);
                      }}
                      placeholder="LP Class Name"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    
                    <MoneyInput
                      value={lp.commitment}
                      onChange={(value) => {
                        const updated = [...localInputs.lpClasses];
                        updated[index] = { ...lp, commitment: value };
                        handleInputChange('lpClasses', updated);
                      }}
                      multiplier={1000000}
                      suffix="M"
                    />
                    
                    <button
                      onClick={() => {
                        const updated = localInputs.lpClasses.filter((_, i) => i !== index);
                        handleInputChange('lpClasses', updated);
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const newLP = {
                  id: `lp-${Date.now()}`,
                  name: `LP Class ${localInputs.lpClasses.length + 1}`,
                  commitment: 0,
                  feeRate: localInputs.managementFee,
                  carriedInterest: localInputs.carry,
                };
                handleInputChange('lpClasses', [...localInputs.lpClasses, newLP]);
              }}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-800"
            >
              + Add LP Class
            </button>
          </div>
        )}

        {/* Fees Step */}
        {currentStep === 'fees' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PercentInput
                label="Management Fee"
                value={localInputs.managementFee * 100}
                onChange={(value) => handleInputChange('managementFee', value / 100)}
                min={0}
                max={5}
                step={0.25}
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Basis
                </label>
                <select
                  value={localInputs.feeBasis}
                  onChange={(e) => handleInputChange('feeBasis', e.target.value as any)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="committed">Committed Capital</option>
                  <option value="invested">Invested Capital</option>
                  <option value="nav">Net Asset Value</option>
                </select>
              </div>

              <PercentInput
                label="Carried Interest"
                value={localInputs.carry * 100}
                onChange={(value) => handleInputChange('carry', value / 100)}
                min={0}
                max={50}
              />

              <MoneyInput
                label="Annual Expenses"
                value={localInputs.expenses}
                onChange={(value) => handleInputChange('expenses', value)}
                suffix="K"
                multiplier={1000}
              />
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This fund uses American waterfall (deal-by-deal) with {(localInputs.carry * 100).toFixed(0)}% carry.
                GP commitment is excluded from management fees.
              </p>
            </div>
          </div>
        )}

        {/* Allocations Step */}
        {currentStep === 'allocations' && (
          <div className="space-y-6">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Allocation %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      # of Deals
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {localInputs.stageAllocations.map((stage, index) => (
                    <tr key={stage.stage} className={!stage.enabled ? 'opacity-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {stage.stage}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PercentInput
                          value={stage.allocation * 100}
                          onChange={(value) => {
                            const updated = [...localInputs.stageAllocations];
                            updated[index] = { ...stage, allocation: value / 100 };
                            handleInputChange('stageAllocations', updated);
                          }}
                          disabled={!stage.enabled}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <MoneyInput
                          value={stage.checkSize}
                          onChange={(value) => {
                            const updated = [...localInputs.stageAllocations];
                            updated[index] = { ...stage, checkSize: value };
                            handleInputChange('stageAllocations', updated);
                          }}
                          multiplier={1000}
                          suffix="K"
                          disabled={!stage.enabled}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <NumericInput
                          value={stage.numberOfDeals}
                          onChange={(value) => {
                            const updated = [...localInputs.stageAllocations];
                            updated[index] = { ...stage, numberOfDeals: value };
                            handleInputChange('stageAllocations', updated);
                          }}
                          min={0}
                          disabled={!stage.enabled}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => {
                            const updated = [...localInputs.stageAllocations];
                            updated[index] = { ...stage, enabled: !stage.enabled };
                            if (!updated[index].enabled) {
                              updated[index].allocation = 0;
                            }
                            handleInputChange('stageAllocations', updated);
                          }}
                          className={`text-sm ${
                            stage.enabled ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800'
                          }`}
                        >
                          {stage.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">Total</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {(localInputs.stageAllocations
                        .filter(s => s.enabled)
                        .reduce((sum, s) => sum + s.allocation, 0) * 100
                      ).toFixed(1)}%
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Reserves Step */}
        {currentStep === 'reserves' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reserve Allocation Method
              </label>
              <select
                value={localInputs.reserveStrategy}
                onChange={(e) => handleInputChange('reserveStrategy', e.target.value as any)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="exitMoic">Exit MOIC Ranking (Recommended)</option>
                <option value="pareto">Pareto (80/20)</option>
                <option value="crossPortfolio">Cross Portfolio</option>
                <option value="selective">Selective</option>
              </select>
              
              <p className="mt-2 text-sm text-gray-600">
                {getReserveStrategyDescription(localInputs.reserveStrategy)}
              </p>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-2">Estimated Reserve Requirements</h4>
              <div className="space-y-2">
                {calculateReserveRequirements(localInputs, localInputs.reserveStrategy).map(({ stage, reserveAmount, reserveRatio }) => (
                  <div key={stage} className="flex justify-between text-sm">
                    <span>{stage}</span>
                    <span>${(reserveAmount / 1000000).toFixed(1)}M ({(reserveRatio * 100).toFixed(0)}% of initial)</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-300">
                <div className="flex justify-between font-medium">
                  <span>Total Reserves Needed</span>
                  <span>
                    ${(calculateReserveRequirements(localInputs, localInputs.reserveStrategy)
                      .reduce((sum, r) => sum + r.reserveAmount, 0) / 1000000
                    ).toFixed(1)}M
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Review Step */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium mb-4">Fund Summary</h3>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Fund Name</p>
                  <p className="font-medium">{localInputs.fundName}</p>
                </div>
                <div>
                  <p className="text-gray-600">Fund Size</p>
                  <p className="font-medium">${(localInputs.fundSize / 1000000).toFixed(1)}M</p>
                </div>
                <div>
                  <p className="text-gray-600">Fund Life</p>
                  <p className="font-medium">{localInputs.fundLifeYears} years</p>
                </div>
                <div>
                  <p className="text-gray-600">Investment Period</p>
                  <p className="font-medium">{localInputs.investmentPeriodYears} years</p>
                </div>
                <div>
                  <p className="text-gray-600">Management Fee</p>
                  <p className="font-medium">{(localInputs.managementFee * 100).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-gray-600">Carry</p>
                  <p className="font-medium">{(localInputs.carry * 100).toFixed(0)}%</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-300">
                <p className="text-gray-600 mb-2">Stage Allocations</p>
                <div className="space-y-1">
                  {localInputs.stageAllocations
                    .filter(s => s.enabled && s.allocation > 0)
                    .map(stage => (
                      <div key={stage.stage} className="flex justify-between text-sm">
                        <span>{stage.stage}</span>
                        <span>{(stage.allocation * 100).toFixed(1)}% (${(localInputs.fundSize * stage.allocation / 1000000).toFixed(1)}M)</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={goPrevious}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          {currentStep === 'review' ? (
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCalculating ? 'Calculating...' : 'Save & Calculate'}
            </button>
          ) : (
            <button
              onClick={goNext}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}