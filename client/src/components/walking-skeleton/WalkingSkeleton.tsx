import React, { useState } from 'react';

/**
 * Walking Skeleton - Minimal End-to-End Flow
 * This component demonstrates the simplest possible fund creation → calculation → display flow
 */
export const WalkingSkeleton: React.FC = () => {
  const [fundSize, setFundSize] = useState<number>(10000000); // $10M default
  const [result, setResult] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleCalculate = async () => {
    setLoading(true);
    try {
      // Minimal calculation - just return 20% for reserves
      const reserves = fundSize * 0.2;
      setResult(reserves);
    } catch (error) {
      console.error('Calculation failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div data-testid="walking-skeleton" className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Walking Skeleton</h2>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="fund-size" className="block text-sm font-medium">
            Fund Size ($)
          </label>
          <input
            id="fund-size"
            type="number"
            value={fundSize}
            onChange={(e: any) => setFundSize(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300"
            data-testid="fund-size-input"
          />
        </div>
        
        <button
          onClick={handleCalculate}
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
          data-testid="calculate-button"
        >
          {loading ? 'Calculating...' : 'Calculate Reserves'}
        </button>
        
        {result !== null && (
          <div className="p-4 bg-gray-100 rounded" data-testid="result-display">
            <p className="text-sm text-gray-600">Recommended Reserves:</p>
            <p className="text-2xl font-bold">${(result / 1000000).toFixed(1)}M</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalkingSkeleton;
