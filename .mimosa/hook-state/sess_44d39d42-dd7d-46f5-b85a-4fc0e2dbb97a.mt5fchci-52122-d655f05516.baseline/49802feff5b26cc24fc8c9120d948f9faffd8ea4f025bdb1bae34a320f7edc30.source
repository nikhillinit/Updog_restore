/**
 * Sector Profile Card Component
 *
 * Manages a single sector profile including:
 * - Sector name and allocation percentage
 * - Investment stage cohorts
 * - Collapsible stage details
 *
 * Features:
 * - Sector name and allocation inputs
 * - Nested InvestmentStageForm for stage management
 * - Collapsible design for better UX
 * - Remove sector button
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, ChevronDown } from 'lucide-react';
import { InvestmentStageForm, type InvestmentStageCohort } from './InvestmentStageForm';

// ============================================================================
// TYPES
// ============================================================================

export type SectorProfile = {
  id: string;
  name: string;
  allocation: number;
  description?: string;
  stages: InvestmentStageCohort[];
};

export interface SectorProfileCardProps {
  profile: SectorProfile;
  index: number;
  onUpdate: (id: string, updates: Partial<SectorProfile>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SectorProfileCard({
  profile,
  index,
  onUpdate,
  onRemove,
  canRemove
}: SectorProfileCardProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div className="bg-charcoal-50 rounded-lg border border-charcoal-200">
      {/* Header */}
      <div className="p-4 border-b border-charcoal-200">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-inter font-bold text-base text-pov-charcoal">
            Sector Profile {index + 1}
          </h4>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(profile.id)}
              className="text-error hover:text-error hover:bg-error/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Sector Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-poppins text-charcoal-700">
              Sector Name *
            </Label>
            <Input
              type="text"
              placeholder="e.g., B2B SaaS"
              value={profile.name}
              onChange={(e) => onUpdate(profile.id, { name: e.target.value })}
              className="mt-2"
            />
          </div>

          <div>
            <Label className="font-poppins text-charcoal-700">
              Portfolio Allocation (%) *
            </Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={profile.allocation || ''}
              onChange={(e) => onUpdate(profile.id, { allocation: parseFloat(e.target.value) || 0 })}
              className="mt-2"
            />
          </div>
        </div>

        {/* Description (Optional) */}
        <div className="mt-4">
          <Label className="font-poppins text-charcoal-700">
            Description (optional)
          </Label>
          <Input
            type="text"
            placeholder="Brief description of sector focus"
            value={profile.description || ''}
            onChange={(e) => onUpdate(profile.id, { description: e.target.value })}
            className="mt-2"
          />
        </div>
      </div>

      {/* Investment Stages (Collapsible) */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="p-4">
          <CollapsibleTrigger className="flex items-center justify-between w-full group mb-4">
            <h5 className="font-inter font-bold text-sm text-charcoal-700">
              Investment Stages ({profile.stages.length})
            </h5>
            <ChevronDown
              className={`w-5 h-5 text-charcoal-600 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent>
            <InvestmentStageForm
              stages={profile.stages}
              onChange={(stages) => onUpdate(profile.id, { stages })}
            />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
