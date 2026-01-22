/**
 * AddInvestmentDropdown - Investment creation dropdown menu
 *
 * Provides sector profile and entry round selection, then opens
 * InvestmentEditorDialog for the actual investment creation.
 *
 * @module client/components/investments/add-investment-dropdown
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';
import InvestmentEditorDialog from './InvestmentEditorDialog';

const entryRounds = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D',
  'Series E+',
] as const;

interface SectorProfile {
  id: string;
  name: string;
  entryRounds: readonly string[];
}

const sectorProfiles: SectorProfile[] = [
  { id: 'default', name: 'Default Profile', entryRounds },
  { id: 'enterprise-saas', name: 'Enterprise SaaS Profile', entryRounds },
  { id: 'fintech', name: 'FinTech Profile', entryRounds },
  { id: 'marketplace', name: 'Marketplace Profile', entryRounds },
  { id: 'healthcare', name: 'Healthcare Profile', entryRounds },
];

interface AddInvestmentDropdownProps {
  onInvestmentAdded?: () => void;
  onBulkImport?: () => void;
}

export default function AddInvestmentDropdown({
  onInvestmentAdded,
  onBulkImport,
}: AddInvestmentDropdownProps) {
  const [showInvestmentEditor, setShowInvestmentEditor] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<SectorProfile | null>(null);
  const [selectedRound, setSelectedRound] = useState('');

  const handleProfileRoundSelect = (profile: SectorProfile, round: string) => {
    setSelectedProfile(profile);
    setSelectedRound(round);
    setShowInvestmentEditor(true);
  };

  const handleInvestmentComplete = () => {
    setShowInvestmentEditor(false);
    setSelectedProfile(null);
    setSelectedRound('');
    onInvestmentAdded?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Investment
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start">
          <div className="p-2 text-sm text-gray-600">
            Select a sector profile and entry round to add a new investment in
            your portfolio
          </div>
          <DropdownMenuSeparator />

          {sectorProfiles.map((profile) => (
            <DropdownMenuSub key={profile.id}>
              <DropdownMenuSubTrigger className="flex items-center justify-between">
                <span>{profile.name}</span>
                <ChevronRight className="h-4 w-4" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <div className="p-2 text-xs text-gray-500 font-medium">
                  Investment starting at...
                </div>
                {profile.entryRounds.map((round) => (
                  <DropdownMenuItem
                    key={round}
                    onClick={() => handleProfileRoundSelect(profile, round)}
                    className="cursor-pointer"
                  >
                    {round}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => onBulkImport?.()}
            className="cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Bulk FMV Update
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Investment Editor Dialog with split-screen layout */}
      <InvestmentEditorDialog
        open={showInvestmentEditor}
        onOpenChange={setShowInvestmentEditor}
        {...(selectedProfile?.id ? { profileId: selectedProfile.id } : {})}
        {...(selectedProfile?.name ? { profileName: selectedProfile.name } : {})}
        {...(selectedRound ? { entryRound: selectedRound } : {})}
        onComplete={handleInvestmentComplete}
      />
    </>
  );
}
