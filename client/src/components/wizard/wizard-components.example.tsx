// @ts-nocheck - TODO: Fix for MVP
/**
 * Wizard Components Usage Example
 *
 * Demonstrates how to use ProgressStepper, WizardCard, and useAutosave together.
 */

import React, { useState } from 'react';
import { ProgressStepper, type ProgressStep } from './ProgressStepper';
import { WizardCard } from './WizardCard';
import { useAutosave } from '@/hooks/useAutosave';
import { Check, Loader2, AlertCircle } from 'lucide-react';

// Example: Multi-step wizard
export function WizardExample() {
  // Define wizard steps
  const steps: ProgressStep[] = [
    { id: 'basics', label: 'Fund Basics', href: '/wizard?step=1' },
    { id: 'strategy', label: 'Strategy', href: '/wizard?step=2' },
    { id: 'distribution', label: 'Distribution', href: '/wizard?step=3' },
    { id: 'review', label: 'Review', href: '/wizard?step=4' },
  ];

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fundName: '',
    fundSize: 0,
    strategy: '',
  });

  // Auto-save form data
  const autosaveStatus = useAutosave(
    formData,
    async (data) => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log('Saved:', data);
      localStorage.setItem('wizard-draft', JSON.stringify(data));
    },
    800
  );

  return (
    <div className="min-h-screen bg-lightGray">
      {/* Progress Header */}
      <div className="bg-white border-b border-lightGray shadow-card">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-heading font-bold text-charcoal">
              Fund Construction Wizard
            </h1>
            {/* Autosave Indicator */}
            <AutosaveIndicator status={autosaveStatus} />
          </div>
          <ProgressStepper current={currentStep} steps={steps} />
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {currentStep === 1 && (
          <WizardCard
            title="Fund Basics"
            description="Enter the basic information about your fund"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">
                  Fund Name
                </label>
                <input
                  type="text"
                  value={formData.fundName}
                  onChange={(e) =>
                    setFormData({ ...formData, fundName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-lightGray rounded-lg focus:outline-none focus:ring-2 focus:ring-charcoal"
                  placeholder="e.g., Press On Fund I"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">
                  Fund Size (millions)
                </label>
                <input
                  type="number"
                  value={formData.fundSize || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fundSize: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-lightGray rounded-lg focus:outline-none focus:ring-2 focus:ring-charcoal"
                  placeholder="e.g., 50"
                />
              </div>
            </div>
          </WizardCard>
        )}

        {currentStep === 2 && (
          <WizardCard
            title="Investment Strategy"
            description="Define your investment approach"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">
                  Strategy
                </label>
                <textarea
                  value={formData.strategy}
                  onChange={(e) =>
                    setFormData({ ...formData, strategy: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-lightGray rounded-lg focus:outline-none focus:ring-2 focus:ring-charcoal"
                  rows={4}
                  placeholder="Describe your investment strategy..."
                />
              </div>
            </div>
          </WizardCard>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="px-4 py-2 bg-lightGray text-charcoal rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-beige transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setCurrentStep(Math.min(steps.length, currentStep + 1))}
            disabled={currentStep === steps.length}
            className="px-4 py-2 bg-charcoal text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-charcoal/90 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

// Autosave status indicator component
function AutosaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {status === 'saving' && (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-charcoal/60" />
          <span className="text-charcoal/60">Saving...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="w-4 h-4 text-success" />
          <span className="text-success">Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-error" />
          <span className="text-error">Save failed</span>
        </>
      )}
    </div>
  );
}

// Example: Using WizardCard standalone
export function WizardCardExample() {
  return (
    <div className="p-8 bg-lightGray">
      <WizardCard
        title="Capital Structure"
        description="Define how capital will be allocated across the portfolio"
      >
        <div className="space-y-4">
          <p className="text-sm text-charcoal/70">
            Configure your fund's capital allocation strategy, including initial
            check sizes and reserve ratios.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-lightGray rounded-lg">
              <div className="text-xs text-charcoal/60 mb-1">Initial Check</div>
              <div className="text-xl font-bold text-charcoal">$2M</div>
            </div>
            <div className="p-4 bg-lightGray rounded-lg">
              <div className="text-xs text-charcoal/60 mb-1">Reserve Ratio</div>
              <div className="text-xl font-bold text-charcoal">50%</div>
            </div>
          </div>
        </div>
      </WizardCard>
    </div>
  );
}

// Example: Using useAutosave with complex data
export function AutosaveExample() {
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    preferences: {
      notifications: true,
      theme: 'light' as 'light' | 'dark',
    },
  });

  const status = useAutosave(
    userData,
    async (data) => {
      // Simulate API call
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }
    },
    1000 // 1 second delay
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">User Preferences</h2>
        <AutosaveIndicator status={status} />
      </div>
      <div className="space-y-4">
        <input
          type="text"
          value={userData.name}
          onChange={(e) => setUserData({ ...userData, name: e.target.value })}
          placeholder="Name"
          className="w-full px-3 py-2 border border-lightGray rounded-lg"
        />
        <input
          type="email"
          value={userData.email}
          onChange={(e) => setUserData({ ...userData, email: e.target.value })}
          placeholder="Email"
          className="w-full px-3 py-2 border border-lightGray rounded-lg"
        />
      </div>
    </div>
  );
}
