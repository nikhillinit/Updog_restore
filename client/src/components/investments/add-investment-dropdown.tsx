/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuSub, 
  DropdownMenuSubContent, 
  DropdownMenuSubTrigger, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Plus, ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import TactycInvestmentEditor from "./tactyc-investment-editor";

interface SectorProfile {
  id: string;
  name: string;
  entryRounds: string[];
}

const sectorProfiles: SectorProfile[] = [
  {
    id: 'default',
    name: 'Default Profile',
    entryRounds: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+']
  },
  {
    id: 'enterprise-saas',
    name: 'Enterprise SaaS Profile',
    entryRounds: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+']
  },
  {
    id: 'fintech',
    name: 'FinTech Profile',
    entryRounds: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+']
  },
  {
    id: 'marketplace',
    name: 'Marketplace Profile',
    entryRounds: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+']
  },
  {
    id: 'healthcare',
    name: 'Healthcare Profile',
    entryRounds: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+']
  }
];

interface AddInvestmentDropdownProps {
  onInvestmentAdded?: () => void;
  onBulkImport?: () => void;
}

export default function AddInvestmentDropdown({ onInvestmentAdded, onBulkImport }: AddInvestmentDropdownProps) {
  const [showInvestmentEditor, setShowInvestmentEditor] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedRound, setSelectedRound] = useState<string>('');

  const handleProfileRoundSelect = (profileId: string, round: string) => {
    setSelectedProfile(profileId);
    setSelectedRound(round);
    setShowInvestmentEditor(true);
  };

  const handleInvestmentComplete = () => {
    setShowInvestmentEditor(false);
    setSelectedProfile('');
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
            Select a sector profile and entry round to add a new investment in your portfolio
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
                    onClick={() => handleProfileRoundSelect(profile.id, round)}
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

      {/* Investment Editor Dialog */}
      <Dialog open={showInvestmentEditor} onOpenChange={setShowInvestmentEditor}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Investment Editor</DialogTitle>
            <DialogDescription>
              Add new investment using {sectorProfiles.find(p => p.id === selectedProfile)?.name} profile, 
              starting at {selectedRound} round
            </DialogDescription>
          </DialogHeader>
          <TactycInvestmentEditor 
            profileId={selectedProfile}
            entryRound={selectedRound}
            onComplete={handleInvestmentComplete}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
