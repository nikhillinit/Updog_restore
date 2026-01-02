/**
 * Scenario Comparison Page
 *
 * MVP Phase 1: Ephemeral scenario comparisons with Redis caching
 * Allows users to select multiple scenarios and compare performance metrics
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { ScenarioSelector } from '@/components/comparison-tool/ScenarioSelector';
import { ComparisonDeltaTable } from '@/components/comparison-tool/ComparisonDeltaTable';
import { useCreateComparison } from '@/hooks/useScenarioComparison';
import { useFundContext } from '@/contexts/FundContext';
import type { ComparisonMetric } from '@shared/types/scenario-comparison';

export function ScenarioComparisonPage() {
  const { fundId } = useFundContext();
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const createComparison = useCreateComparison();

  // Default metrics for MVP
  const comparisonMetrics: ComparisonMetric[] = [
    'moic',
    'total_investment',
    'follow_ons',
    'exit_proceeds',
    'exit_valuation',
  ];

  const handleCompare = () => {
    if (!fundId || selectedScenarioIds.length < 2) {
      return;
    }

    const [baseScenarioId, ...comparisonScenarioIds] = selectedScenarioIds;

    // Ensure baseScenarioId is defined before mutation
    if (!baseScenarioId) return;

    createComparison.mutate({
      fundId,
      baseScenarioId,
      comparisonScenarioIds,
      comparisonType: 'deal_level',
      comparisonMetrics,
      includeDetails: false,
    });
  };

  const canCompare = selectedScenarioIds.length >= 2 && selectedScenarioIds.length <= 6;
  const isComparing = createComparison.isPending;
  const comparisonData = createComparison.data;
  const comparisonError = createComparison.error;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Scenario Comparison</h1>
        <p className="text-muted-foreground mt-2">
          Compare performance metrics across multiple scenarios to evaluate different strategies
        </p>
      </div>

      {/* Scenario Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle>Select Scenarios to Compare</CardTitle>
          <CardDescription>
            Choose 2-6 scenarios. The first selected will be used as the baseline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScenarioSelector
            value={selectedScenarioIds}
            onChange={setSelectedScenarioIds}
            maxSelections={6}
            minSelections={2}
          />

          {/* Selection Summary */}
          {selectedScenarioIds.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="text-sm">
                <span className="font-medium">{selectedScenarioIds.length}</span> scenario(s)
                selected
                {selectedScenarioIds.length >= 2 && (
                  <span className="text-muted-foreground ml-2">
                    (Baseline: {selectedScenarioIds[0]?.substring(0, 8)}...)
                  </span>
                )}
              </div>
              <Button onClick={handleCompare} disabled={!canCompare || isComparing}>
                {isComparing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isComparing ? 'Comparing...' : 'Compare Scenarios'}
              </Button>
            </div>
          )}

          {/* Validation Messages */}
          {selectedScenarioIds.length === 1 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please select at least one more scenario to compare
              </AlertDescription>
            </Alert>
          )}

          {selectedScenarioIds.length > 6 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Maximum 6 scenarios allowed. Please deselect some scenarios.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {comparisonError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {comparisonError.message || 'Failed to create comparison'}
          </AlertDescription>
        </Alert>
      )}

      {/* Results Display */}
      {comparisonData && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison Results</CardTitle>
            <CardDescription>
              Comparing {comparisonData['results']?.['scenarios']?.length ?? 0} scenarios across{' '}
              {comparisonData.comparisonMetrics.length} metrics
              {comparisonData['cacheExpiresAt'] && (
                <span className="text-muted-foreground ml-2">
                  (Expires: {new Date(comparisonData['cacheExpiresAt']).toLocaleTimeString()})
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComparisonDeltaTable
              deltaMetrics={comparisonData['results']?.['deltaMetrics'] ?? []}
              scenarios={comparisonData['results']?.['scenarios'] ?? []}
              showAbsolute={true}
              showPercentage={true}
              highlightThreshold={0.1}
              colorScheme="traffic_light"
            />
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!comparisonData && !isComparing && !comparisonError && selectedScenarioIds.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-muted-foreground space-y-2">
              <p className="text-lg font-medium">No scenarios selected</p>
              <p className="text-sm">
                Select 2 or more scenarios above to see a side-by-side comparison
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
