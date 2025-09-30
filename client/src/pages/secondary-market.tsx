/**
 * Secondary Market Analysis Page
 * Comprehensive secondary market analysis and liquidity management
 */

import React from 'react';
import SecondaryMarketAnalysis from '@/components/portfolio/SecondaryMarketAnalysis';

export default function SecondaryMarketPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Secondary Market Analysis</h1>
          <p className="text-gray-600">
            Analyze liquidity opportunities, track secondary valuations, and identify market trends
          </p>
        </div>
      </div>

      <SecondaryMarketAnalysis />
    </div>
  );
}