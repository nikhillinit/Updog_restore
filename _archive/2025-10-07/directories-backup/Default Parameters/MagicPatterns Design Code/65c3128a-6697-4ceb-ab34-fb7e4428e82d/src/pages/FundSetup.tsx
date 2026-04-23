import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';
export function FundSetup() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const stepParam = searchParams.get('step');
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;
  useEffect(() => {
    if (stepParam) {
      const step = parseInt(stepParam);
      if (!isNaN(step) && step > 0 && step <= totalSteps) {
        setCurrentStep(step);
      }
    }
  }, [stepParam]);
  return <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Fund Setup</h2>
          <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          {currentStep === 1 && <div>
              <h3 className="text-xl font-medium text-gray-900 mb-4">
                Fund Details
              </h3>
              <p className="text-gray-600 mb-6">
                Enter the basic information about your fund.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fund Name
                  </label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Enter fund name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fund Type
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Select fund type</option>
                    <option value="hedge">Hedge Fund</option>
                    <option value="mutual">Mutual Fund</option>
                    <option value="etf">ETF</option>
                    <option value="pension">Pension Fund</option>
                  </select>
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                  Continue
                </button>
              </div>
            </div>}
          {/* Placeholder for other steps */}
          {currentStep > 1 && <div className="text-center py-10">
              <h3 className="text-xl font-medium text-gray-900 mb-4">
                Step {currentStep}
              </h3>
              <p className="text-gray-600">
                This is a placeholder for step {currentStep}.
              </p>
            </div>}
        </div>
      </div>
    </div>;
}