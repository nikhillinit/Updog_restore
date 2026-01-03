/**
 * Scenario Selector Component
 *
 * Multi-select dropdown for choosing scenarios to compare.
 * Supports selecting a base scenario and up to 5 comparison scenarios.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Scenario {
  id: string;
  name: string;
  type: 'deal' | 'portfolio';
  isDefault?: boolean;
  caseCount?: number;
  lastUpdated?: string;
}

interface BaseScenarioSelectorProps {
  scenarios: Scenario[];
  baseScenarioId?: string;
  comparisonScenarioIds: string[];
  onBaseChange: (scenarioId: string) => void;
  onComparisonChange: (scenarioIds: string[]) => void;
  maxComparisons?: number;
  disabled?: boolean;
}

interface SimpleScenarioSelectorProps {
  scenarios?: Scenario[];
  value: string[];
  onChange: (scenarioIds: string[]) => void;
  maxSelections?: number;
  minSelections?: number;
  disabled?: boolean;
}

export type ScenarioSelectorProps = BaseScenarioSelectorProps | SimpleScenarioSelectorProps;

function isSimpleProps(props: ScenarioSelectorProps): props is SimpleScenarioSelectorProps {
  return 'value' in props && 'onChange' in props;
}

export function ScenarioSelector(props: ScenarioSelectorProps) {
  // Call all hooks BEFORE any conditional logic or early returns
  const isSimple = isSimpleProps(props);
  const [baseOpen, setBaseOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Extract props for complex mode (with defaults to avoid runtime errors in simple mode)
  const complexProps = isSimple ? null : props;
  const scenarios = complexProps?.scenarios ?? [];
  const baseScenarioId = complexProps?.baseScenarioId;
  const comparisonScenarioIds = complexProps?.comparisonScenarioIds ?? [];

  const baseScenario = useMemo(
    () => scenarios.find((s) => s.id === baseScenarioId),
    [scenarios, baseScenarioId]
  );

  const selectedComparisonScenarios = useMemo(
    () => scenarios.filter((s) => comparisonScenarioIds.includes(s.id)),
    [scenarios, comparisonScenarioIds]
  );

  const availableForComparison = useMemo(
    () => scenarios.filter((s) => s.id !== baseScenarioId),
    [scenarios, baseScenarioId]
  );

  // Handle simple value/onChange API
  if (isSimple) {
    const { value, onChange, disabled = false } = props as SimpleScenarioSelectorProps;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => onChange(value.filter(v => v !== id))}>
              {id.substring(0, 8)}...
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
        {value.length === 0 && (
          <p className="text-sm text-muted-foreground">No scenarios selected</p>
        )}
        {disabled && <p className="text-sm text-muted-foreground">Selection disabled</p>}
      </div>
    );
  }

  // Handle complex API
  const {
    onBaseChange,
    onComparisonChange,
    maxComparisons = 5,
    disabled = false,
  } = props as BaseScenarioSelectorProps;

  const handleComparisonToggle = (scenarioId: string) => {
    if (comparisonScenarioIds.includes(scenarioId)) {
      onComparisonChange(comparisonScenarioIds.filter((id) => id !== scenarioId));
    } else if (comparisonScenarioIds.length < maxComparisons) {
      onComparisonChange([...comparisonScenarioIds, scenarioId]);
    }
  };

  const handleRemoveComparison = (scenarioId: string) => {
    onComparisonChange(comparisonScenarioIds.filter((id) => id !== scenarioId));
  };

  const getScenarioTypeColor = (type: string) => {
    return type === 'deal' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      {/* Base Scenario Selector */}
      <div className="flex-1">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Base Scenario
        </label>
        <Popover open={baseOpen} onOpenChange={setBaseOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={disabled}
            >
              <div className="flex items-center gap-2 truncate">
                <Star className="w-4 h-4 text-yellow-500" />
                {baseScenario ? (
                  <>
                    <span className="truncate">{baseScenario.name}</span>
                    <Badge
                      variant="secondary"
                      className={cn('text-xs', getScenarioTypeColor(baseScenario.type))}
                    >
                      {baseScenario.type}
                    </Badge>
                  </>
                ) : (
                  <span className="text-gray-500">Select base scenario...</span>
                )}
              </div>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <ScrollArea className="h-64">
              <div className="p-2">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded-md text-left',
                      'hover:bg-gray-100 transition-colors',
                      scenario.id === baseScenarioId && 'bg-blue-50'
                    )}
                    onClick={() => {
                      onBaseChange(scenario.id);
                      // Remove from comparison if it was selected
                      if (comparisonScenarioIds.includes(scenario.id)) {
                        onComparisonChange(
                          comparisonScenarioIds.filter((id) => id !== scenario.id)
                        );
                      }
                      setBaseOpen(false);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{scenario.name}</span>
                        {scenario.isDefault && (
                          <Badge variant="outline" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Badge
                          variant="secondary"
                          className={cn('text-xs', getScenarioTypeColor(scenario.type))}
                        >
                          {scenario.type}
                        </Badge>
                        {scenario.caseCount !== undefined && (
                          <span>{scenario.caseCount} cases</span>
                        )}
                      </div>
                    </div>
                    {scenario.id === baseScenarioId && (
                      <Star className="w-4 h-4 text-yellow-500" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Comparison Scenarios Selector */}
      <div className="flex-1">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Compare Against ({comparisonScenarioIds.length}/{maxComparisons})
        </label>
        <Popover open={compareOpen} onOpenChange={setCompareOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={disabled || !baseScenarioId}
            >
              <div className="flex items-center gap-1 truncate">
                {selectedComparisonScenarios.length === 0 ? (
                  <span className="text-gray-500">Select scenarios to compare...</span>
                ) : (
                  selectedComparisonScenarios.slice(0, 2).map((s) => (
                    <Badge key={s.id} variant="secondary" className="text-xs truncate max-w-24">
                      {s.name}
                    </Badge>
                  ))
                )}
                {selectedComparisonScenarios.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedComparisonScenarios.length - 2}
                  </Badge>
                )}
              </div>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <ScrollArea className="h-64">
              <div className="p-2">
                {availableForComparison.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Select a base scenario first
                  </div>
                ) : (
                  availableForComparison.map((scenario) => {
                    const isSelected = comparisonScenarioIds.includes(scenario.id);
                    const isDisabled =
                      !isSelected && comparisonScenarioIds.length >= maxComparisons;

                    return (
                      <button
                        key={scenario.id}
                        className={cn(
                          'w-full flex items-center gap-2 p-2 rounded-md text-left',
                          'transition-colors',
                          isDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-100',
                          isSelected && 'bg-blue-50'
                        )}
                        onClick={() => !isDisabled && handleComparisonToggle(scenario.id)}
                        disabled={isDisabled}
                      >
                        <Checkbox checked={isSelected} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{scenario.name}</span>
                            {scenario.isDefault && (
                              <Badge variant="outline" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Badge
                              variant="secondary"
                              className={cn('text-xs', getScenarioTypeColor(scenario.type))}
                            >
                              {scenario.type}
                            </Badge>
                            {scenario.caseCount !== undefined && (
                              <span>{scenario.caseCount} cases</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Selected comparison badges */}
        {selectedComparisonScenarios.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedComparisonScenarios.map((scenario) => (
              <Badge
                key={scenario.id}
                variant="secondary"
                className="text-xs pr-1 flex items-center gap-1"
              >
                <span className="truncate max-w-24">{scenario.name}</span>
                <button
                  className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  onClick={() => handleRemoveComparison(scenario.id)}
                  disabled={disabled}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScenarioSelector;
