/**
 * Default Scenario Button Component
 *
 * Quick action button to load default scenario templates
 * (Base Case, Optimistic, Pessimistic)
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { generateDefaultScenarios } from '@/lib/scenario-calculations';
import { type ScenarioAdjustment } from '@/schemas/modeling-wizard.schemas';

export interface DefaultScenarioButtonProps {
  /** Callback to set scenarios */
  onLoadDefaults: (scenarios: ScenarioAdjustment[]) => void;

  /** Disable button */
  disabled?: boolean;
}

export function DefaultScenarioButton({
  onLoadDefaults,
  disabled = false
}: DefaultScenarioButtonProps) {
  const handleClick = () => {
    const defaults = generateDefaultScenarios();
    onLoadDefaults(defaults);
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      className="gap-2"
    >
      <Sparkles className="w-4 h-4" />
      Load Default Scenarios
    </Button>
  );
}
