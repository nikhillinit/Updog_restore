import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ArrowLeft, ArrowRight, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Import business logic and types
import { getDefaultRounds } from '@/lib/investment-round-defaults';
import {
  applyRoundUpdate,
  validateRound,
  calculateRoundSummary,
  formatCurrency,
  formatPercent,
  formatMonths
} from '@/lib/investment-round-utils';
import type { InvestmentRound, RoundSummary, ValuationType } from '@/types/investment-rounds';

export default function InvestmentRoundsStep() {
  const [, navigate] = useLocation();
  const [rounds, setRounds] = useState<InvestmentRound[]>(getDefaultRounds());
  const [summary, setSummary] = useState<RoundSummary | null>(null);

  // Calculate summary whenever rounds change
  useEffect(() => {
    setSummary(calculateRoundSummary(rounds));
  }, [rounds]);

  // Validation for all rounds
  const validationErrors = useMemo(() => {
    const errors: Record<string, string[]> = {};
    rounds.forEach(round => {
      const roundErrors = validateRound(round);
      if (roundErrors.length > 0) {
        errors[round.id] = roundErrors;
      }
    });
    return errors;
  }, [rounds]);

  const hasErrors = Object.keys(validationErrors).length > 0;
  const totalErrors = Object.values(validationErrors).flat().length;

  // Round update handler
  const handleUpdateRound = (id: string, updates: Partial<InvestmentRound>) => {
    setRounds(prev => prev.map(round => {
      if (round.id !== id) return round;
      return applyRoundUpdate(round, updates);
    }));
  };

  // Add new round
  const handleAddRound = () => {
    const newRound: InvestmentRound = {
      id: `custom-${Date.now()}`,
      name: 'Series A',
      roundSize: 0,
      valuationType: 'Pre-Money',
      valuation: 0,
      preMoney: 0,
      postMoney: 0,
      esopPct: 10,
      graduationRate: 0,
      exitRate: 0,
      failureRate: 100,
      monthsToGraduate: 18,
      monthsToExit: 24,
      exitValuation: 0,
      isCustom: true
    };
    setRounds([...rounds, newRound]);
  };

  // Delete round
  const handleDeleteRound = (id: string) => {
    if (rounds.length <= 1) {
      alert('You must have at least one investment round defined.');
      return;
    }
    setRounds(prev => prev.filter(round => round.id !== id));
  };

  // Move round up/down
  const handleMoveRound = (id: string, direction: 'up' | 'down') => {
    const index = rounds.findIndex(r => r.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === rounds.length - 1)
    ) {
      return;
    }

    const newRounds = [...rounds];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newRounds[index], newRounds[targetIndex]] = [newRounds[targetIndex]!, newRounds[index]!];
    setRounds(newRounds);
  };

  // Handle valuation type change
  const handleValuationTypeChange = (id: string, newType: ValuationType) => {
    const round = rounds.find(r => r.id === id);
    if (!round) return;

    // When switching types, maintain the current value as the new input
    const newValuation = newType === 'Pre-Money' ? round.preMoney : round.postMoney;
    handleUpdateRound(id, {
      valuationType: newType,
      valuation: newValuation
    });
  };

  return (
    <ModernStepContainer
      title="Investment Rounds"
      description="Define the investment stages, valuations, and progression rates"
    >
      <div className="max-w-[1500px] mx-auto px-6">
        {/* Info Alert */}
        <Alert className="bg-blue-50 border-blue-200 mb-4">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            <strong>Important:</strong> Do not delete later stage rounds, even if your fund doesn't participate in them.
            These rounds are needed to model future valuations and portfolio company trajectories.
          </AlertDescription>
        </Alert>

        {/* Compact Summary - Contextual Subtitle */}
        {summary && (
          <div className="mb-4 pb-3 border-b border-[#E0D8D1]">
            <p className="text-sm font-poppins text-[#292929]/70">
              Modeling a <strong className="text-[#292929]">{formatMonths(summary.totalFundLifeMonths)}</strong> journey
              with <strong className="text-[#292929]">{formatCurrency(summary.totalRoundSize)}</strong> capital
              across stages, averaging <strong className="text-emerald-600">{formatPercent(summary.averageGraduationRate)}</strong> graduation
              and <strong className="text-blue-600">{formatPercent(summary.averageExitRate)}</strong> exit rates.
            </p>
          </div>
        )}

        {/* Main Table - Horizontally Scrollable */}
        <div className="border border-[#E0D8D1] rounded-xl overflow-hidden bg-white mb-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#292929] hover:bg-[#292929]">
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[140px]">
                    Stage Name
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[110px]">
                    Round Size ($M)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[120px]">
                    Valuation Type
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[110px]">
                    Valuation ($M)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[90px]">
                    ESOP (%)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[100px]">
                    Grad Rate (%)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[100px]">
                    Exit Rate (%)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[100px]">
                    Fail Rate (%)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[110px]">
                    Months to Grad
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[110px]">
                    Months to Exit
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[120px]">
                    Exit Val ($M)
                  </TableHead>
                  <TableHead className="text-xs text-white sticky top-0 z-10 bg-[#292929] min-w-[110px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round, index) => {
                  const roundErrors = validationErrors[round.id] || [];
                  const hasRoundErrors = roundErrors.length > 0;

                  return (
                    <TableRow
                      key={round.id}
                      className={cn(
                        "border-b border-[#E0D8D1]",
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/50",
                        hasRoundErrors && "bg-red-50/30"
                      )}
                    >
                      {/* Stage Name */}
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            value={round.name}
                            onChange={(e) => handleUpdateRound(round.id, {
                              name: e.target.value as any
                            })}
                            className={cn(
                              "h-8 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins font-medium",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                          {round.isCustom && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap">
                              Custom
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Round Size */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            $
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={round.roundSize}
                            onChange={(e) => handleUpdateRound(round.id, {
                              roundSize: parseFloat(e.target.value) || 0
                            })}
                            className={cn(
                              "h-8 pl-5 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                        </div>
                      </TableCell>

                      {/* Valuation Type Toggle */}
                      <TableCell className="py-2">
                        <div className="flex border border-[#E0D8D1] rounded overflow-hidden h-8">
                          <button
                            type="button"
                            className={cn(
                              "flex-1 text-xs px-2 font-poppins transition-colors",
                              round.valuationType === 'Pre-Money'
                                ? "bg-blue-500 text-white"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                            )}
                            onClick={() => handleValuationTypeChange(round.id, 'Pre-Money')}
                          >
                            Pre
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "flex-1 text-xs px-2 font-poppins transition-colors",
                              round.valuationType === 'Post-Money'
                                ? "bg-blue-500 text-white"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                            )}
                            onClick={() => handleValuationTypeChange(round.id, 'Post-Money')}
                          >
                            Post
                          </button>
                        </div>
                      </TableCell>

                      {/* Valuation */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            $
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={round.valuation}
                            onChange={(e) => handleUpdateRound(round.id, {
                              valuation: parseFloat(e.target.value) || 0
                            })}
                            className={cn(
                              "h-8 pl-5 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                        </div>
                      </TableCell>

                      {/* ESOP % */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="30"
                            step="0.5"
                            value={round.esopPct}
                            onChange={(e) => handleUpdateRound(round.id, {
                              esopPct: parseFloat(e.target.value) || 0
                            })}
                            className={cn(
                              "h-8 pr-5 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            %
                          </span>
                        </div>
                      </TableCell>

                      {/* Graduation Rate % */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={round.graduationRate}
                            onChange={(e) => handleUpdateRound(round.id, {
                              graduationRate: parseFloat(e.target.value) || 0
                            })}
                            className={cn(
                              "h-8 pr-5 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            %
                          </span>
                        </div>
                      </TableCell>

                      {/* Exit Rate % */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={round.exitRate}
                            onChange={(e) => handleUpdateRound(round.id, {
                              exitRate: parseFloat(e.target.value) || 0
                            })}
                            className={cn(
                              "h-8 pr-5 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            %
                          </span>
                        </div>
                      </TableCell>

                      {/* Failure Rate % (Read-only) */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <Input
                            type="number"
                            value={round.failureRate.toFixed(0)}
                            disabled
                            className="h-8 pr-5 text-sm px-2 bg-gray-50 border border-gray-200 rounded text-gray-600 cursor-not-allowed font-poppins"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            %
                          </span>
                        </div>
                      </TableCell>

                      {/* Months to Graduate */}
                      <TableCell className="py-2">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={round.monthsToGraduate}
                          onChange={(e) => handleUpdateRound(round.id, {
                            monthsToGraduate: parseInt(e.target.value) || 0
                          })}
                          className={cn(
                            "h-8 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                            hasRoundErrors && "border-red-300 focus:border-red-500"
                          )}
                        />
                      </TableCell>

                      {/* Months to Exit */}
                      <TableCell className="py-2">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={round.monthsToExit}
                          onChange={(e) => handleUpdateRound(round.id, {
                            monthsToExit: parseInt(e.target.value) || 0
                          })}
                          className={cn(
                            "h-8 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                            hasRoundErrors && "border-red-300 focus:border-red-500"
                          )}
                        />
                      </TableCell>

                      {/* Exit Valuation */}
                      <TableCell className="py-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            $
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={round.exitValuation}
                            onChange={(e) => handleUpdateRound(round.id, {
                              exitValuation: parseFloat(e.target.value) || 0
                            })}
                            className={cn(
                              "h-8 pl-5 text-sm px-2 border-[#E0D8D1] focus:border-[#292929] font-poppins",
                              hasRoundErrors && "border-red-300 focus:border-red-500"
                            )}
                          />
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-2">
                        <div className="flex gap-1 items-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveRound(round.id, 'up')}
                            disabled={index === 0}
                            className="h-7 w-7 p-0 hover:bg-gray-200"
                            title="Move up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveRound(round.id, 'down')}
                            disabled={index === rounds.length - 1}
                            className="h-7 w-7 p-0 hover:bg-gray-200"
                            title="Move down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRound(round.id)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete round"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {hasRoundErrors && (
                            <div className="ml-1" title={roundErrors.join(', ')}>
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Validation Errors Summary */}
        {hasErrors && (
          <Alert className="bg-red-50 border-red-200 mb-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">
              <strong>{totalErrors} validation error{totalErrors !== 1 ? 's' : ''} found.</strong> Please review the highlighted rows and fix the errors before proceeding.
              <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                {Object.entries(validationErrors).map(([roundId, errors]) => {
                  const round = rounds.find(r => r.id === roundId);
                  return (
                    <li key={roundId}>
                      <strong>{round?.name}:</strong> {errors.join(', ')}
                    </li>
                  );
                })}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Add Round Button */}
        <div className="flex justify-center mb-4">
          <Button
            onClick={handleAddRound}
            variant="outline"
            className="px-6 py-2 h-10 border-[#E0D8D1] hover:bg-[#E0D8D1]/20 hover:border-[#292929] font-poppins font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Round
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-6 border-t border-[#E0D8D1]">
          <Button
            data-testid="previous-step"
            variant="outline"
            onClick={() => navigate('/fund-setup?step=1')}
            className="flex items-center gap-2 px-8 py-3 h-auto border-[#E0D8D1] hover:bg-[#E0D8D1]/20 hover:border-[#292929] font-poppins font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            data-testid="next-step"
            onClick={() => navigate('/fund-setup?step=3')}
            className="flex items-center gap-2 bg-[#292929] hover:bg-[#292929]/90 text-white px-8 py-3 h-auto font-poppins font-medium"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}
