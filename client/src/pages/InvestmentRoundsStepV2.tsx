/**
 * InvestmentRoundsStepV2 - Redesigned investment rounds wizard step
 *
 * Features:
 * - Accordion-based stage editing with progressive disclosure
 * - Sector profile sidebar for switching between profiles
 * - Sticky validation callout with real-time metrics
 * - Framer Motion animations
 * - Pre/Post valuation toggle with animated indicator
 *
 * This is a redesign based on Magic Patterns prototype for improved UX.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';
import type { StageData } from '@/components/wizard/StageAccordionRow';
import { StageAccordionRow } from '@/components/wizard/StageAccordionRow';
import { SectorProfileSwitcher } from '@/components/wizard/SectorProfileSwitcher';
import type { ValidationIssue } from '@/components/wizard/InvestmentValidationCallout';
import { InvestmentValidationCallout } from '@/components/wizard/InvestmentValidationCallout';
import { InfoBanner } from '@/components/wizard/InfoBanner';
import { ProfileHeader } from '@/components/wizard/ProfileHeader';
import { fundStore } from '@/stores/fundStore';
import { useFundAction } from '@/stores/useFundSelector';
import { DEFAULT_PROFILES, DEFAULT_STAGES } from './constants';

export default function InvestmentRoundsStepV2() {
  const [, navigate] = useLocation();
  const [activeProfileId, setActiveProfileId] = useState('default');
  const [stages, setStages] = useState<StageData[]>(() =>
    DEFAULT_STAGES.map((stage) => ({ ...stage }))
  );
  const [validationStatus, setValidationStatus] = useState<'success' | 'warning' | 'error'>(
    'success'
  );
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  // Get the fromInvestmentStrategy action to sync data to fundStore
  const fromInvestmentStrategy = useFundAction((s) => s.fromInvestmentStrategy);
  // Only a user edit in this step syncs stages to the store. Mount never does:
  // the mount sync replaced the stored stages and scheduled a second draft save.
  const userEditedRef = useRef(false);

  const activeProfile = useMemo(
    () => DEFAULT_PROFILES.find((p) => p.id === activeProfileId) || DEFAULT_PROFILES[0]!,
    [activeProfileId]
  );

  // Handle stage field changes
  const handleStageChange = useCallback(
    (id: string, field: keyof StageData, value: StageData[keyof StageData]) => {
      userEditedRef.current = true;
      setStages((prev) =>
        prev.map((stage) => (stage.id === id ? { ...stage, [field]: value } : stage))
      );
    },
    []
  );

  // Add new stage
  const handleAddStage = useCallback(() => {
    const newStage: StageData = {
      id: `custom-${Date.now()}`,
      name: 'New Stage',
      roundSize: 10.0,
      valuation: 50.0,
      valuationType: 'Pre',
      esop: 10,
      gradRate: 50,
      monthsToNext: 18,
      exitRate: 10,
    };
    userEditedRef.current = true;
    setStages((prev) => [...prev, newStage]);
  }, []);

  // Reset stage to defaults
  const handleResetStage = useCallback((id: string) => {
    const defaultStage = DEFAULT_STAGES.find((s) => s.id === id);
    if (defaultStage) {
      userEditedRef.current = true;
      setStages((prev) => prev.map((stage) => (stage.id === id ? { ...defaultStage } : stage)));
    }
  }, []);

  // Real-time validation
  useEffect(() => {
    const issues: ValidationIssue[] = [];

    stages.forEach((stage) => {
      if (stage.gradRate < 0 || stage.gradRate > 100) {
        issues.push({
          field: stage.name,
          message: 'Graduation rate must be between 0-100%',
          severity: 'error',
        });
      }
      if (stage.exitRate < 0 || stage.exitRate > 100) {
        issues.push({
          field: stage.name,
          message: 'Exit rate must be between 0-100%',
          severity: 'error',
        });
      }
      if (stage.gradRate + stage.exitRate > 100) {
        issues.push({
          field: stage.name,
          message: 'Graduation + exit rates cannot exceed 100%',
          severity: 'error',
        });
      }
      if (stage.roundSize <= 0) {
        issues.push({
          field: stage.name,
          message: 'Round size must be greater than 0',
          severity: 'error',
        });
      }
      if (stage.valuation <= 0) {
        issues.push({
          field: stage.name,
          message: 'Valuation must be greater than 0',
          severity: 'error',
        });
      }
    });

    setValidationIssues(issues);
    setValidationStatus(
      issues.length === 0
        ? 'success'
        : issues.some((i) => i.severity === 'error')
          ? 'error'
          : 'warning'
    );
  }, [stages]);

  // Sync user-edited stages to fundStore; keep the stored sector profiles and
  // allocations (an empty array would clear them).
  useEffect(() => {
    if (!userEditedRef.current) return;
    const stagesForStore = stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      graduationRate: stage.gradRate,
      exitRate: stage.exitRate,
    }));
    const { sectorProfiles, allocations } = fundStore.getState();
    fromInvestmentStrategy({ stages: stagesForStore, sectorProfiles, allocations });
  }, [stages, fromInvestmentStrategy]);

  // Check if we have validation errors
  const hasErrors = validationIssues.some((i) => i.severity === 'error');

  return (
    <ModernStepContainer
      title="Investment Rounds"
      description="Define the investment stages, valuations, and progression rates"
    >
      <div className="flex flex-1 overflow-hidden -mx-6 -mt-6">
        {/* Left Sidebar - Sector Profiles */}
        <SectorProfileSwitcher
          profiles={DEFAULT_PROFILES.map((p) => ({
            ...p,
            stagesCount: p.id === activeProfileId ? stages.length : p.stagesCount,
          }))}
          activeProfileId={activeProfileId}
          onSelectProfile={setActiveProfileId}
          onAddProfile={() => {
            /* TODO: future feature */
          }}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-8 pb-32">
          <div className="max-w-5xl mx-auto">
            {/* Profile Header */}
            <ProfileHeader
              profileName={activeProfile.name}
              {...(activeProfile.isDefault !== undefined && { isDefault: activeProfile.isDefault })}
              stageCount={stages.length}
              onAddStage={handleAddStage}
              onDuplicate={() => {
                /* TODO: future feature */
              }}
            />

            {/* Info Banner */}
            <InfoBanner
              title="Later rounds support portfolio trajectory modeling"
              description="Keep later-stage rounds when they affect valuation step-ups or exit timing, even if the fund does not initially enter at those rounds. Participation levels are configured in Capital Allocation."
            />

            {/* Stage Accordion Rows */}
            <div className="space-y-4">
              {stages.map((stage) => (
                <StageAccordionRow
                  key={stage.id}
                  stage={stage}
                  onChange={handleStageChange}
                  onReset={handleResetStage}
                  hasError={validationIssues.some((issue) => issue.field === stage.name)}
                />
              ))}
            </div>
            {/* Validation Callout */}
            <div className="mt-8">
              <InvestmentValidationCallout
                status={validationStatus}
                issues={validationIssues}
                stages={stages}
              />
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6 mt-8 border-t border-beige-200">
              <Button
                data-testid="previous-step"
                variant="outline"
                onClick={() => navigate('/fund-setup?step=1')}
                className="flex items-center gap-2 px-8 py-3 h-auto border-beige-200 hover:bg-beige/20 hover:border-pov-charcoal font-poppins font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                data-testid="next-step"
                onClick={() => navigate('/fund-setup?step=3')}
                disabled={hasErrors}
                className="flex items-center gap-2 bg-pov-charcoal hover:bg-charcoal-700 text-pov-white px-8 py-3 h-auto font-poppins font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModernStepContainer>
  );
}
