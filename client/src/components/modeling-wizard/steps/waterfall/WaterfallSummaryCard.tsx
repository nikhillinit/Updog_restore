/**
 * Waterfall Summary Card
 * Displays distribution preview and key metrics
 */

import React from 'react';
import { type Waterfall } from '@shared/types';
import { useWaterfallCalculations } from '@/hooks/useWaterfallCalculations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, DollarSign } from 'lucide-react';

interface WaterfallSummaryCardProps {
  waterfall: Waterfall;
}

export function WaterfallSummaryCard({ waterfall }: WaterfallSummaryCardProps) {
  // Calculate example distribution with 2.5x MOIC
  const exampleDistribution = useWaterfallCalculations(waterfall, 2.5);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-inter text-xl">Distribution Summary</CardTitle>
            <CardDescription className="font-poppins">
              Preview of waterfall structure and example distribution
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-poppins bg-blue-100 text-blue-800">
            {waterfall.type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Waterfall Configuration Summary */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-charcoal-500">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-poppins">Distribution Model</span>
            </div>
            <p className="text-lg font-inter font-semibold text-pov-charcoal">American</p>
            <p className="text-xs text-charcoal-500">Deal-by-deal</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-charcoal-500">
              <Users className="h-4 w-4" />
              <span className="text-xs font-poppins">Carry Vesting</span>
            </div>
            <p className="text-lg font-inter font-semibold text-pov-charcoal">
              {waterfall.carryVesting.cliffYears}y + {waterfall.carryVesting.vestingYears}y
            </p>
            <p className="text-xs text-charcoal-500">Cliff + vesting period</p>
          </div>
        </div>

        {/* Example Distribution Scenario */}
        <div className="pt-6 border-t border-charcoal-200">
          <h4 className="font-inter font-semibold text-pov-charcoal mb-4">
            Example Distribution (2.5x MOIC)
          </h4>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-charcoal-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-poppins font-medium text-pov-charcoal">
                    Limited Partners (LPs)
                  </p>
                  <p className="text-xs text-charcoal-500">
                    {exampleDistribution.lpPercentage.toFixed(1)}% of profits
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-inter font-semibold text-pov-charcoal">
                  ${exampleDistribution.lpDistribution.toFixed(1)}M
                </p>
                <p className="text-xs text-charcoal-500">
                  {exampleDistribution.lpMoic.toFixed(2)}x MOIC
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-charcoal-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-poppins font-medium text-pov-charcoal">
                    General Partners (GPs)
                  </p>
                  <p className="text-xs text-charcoal-500">
                    {exampleDistribution.gpPercentage.toFixed(1)}% of profits
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-inter font-semibold text-pov-charcoal">
                  ${exampleDistribution.gpDistribution.toFixed(1)}M
                </p>
                <p className="text-xs text-charcoal-500">Carried interest</p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This example assumes $100M fund size and $250M total value
              (2.5x MOIC).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
