/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import OwnershipUpdateDialog from "./ownership-update-dialog";
import NewRoundDialog from "./new-round-dialog";
import ValuationUpdateDialog from "./valuation-update-dialog";
import { 
  Plus, 
  DollarSign, 
  TrendingUp, 
  Building, 
  ArrowUpDown, 
  Banknote,
  Calculator
} from "lucide-react";

interface AddEventDropdownProps {
  onSelectEvent: (eventType: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  investment?: {
    id: string;
    company: string;
    currentOwnership: number;
  };
}

const eventTypes = [
  {
    id: 'new-round',
    label: 'New Round',
    icon: Plus,
    description: 'Add a new funding round'
  },
  {
    id: 'ownership-update',
    label: 'Ownership Update',
    icon: ArrowUpDown,
    description: 'Update ownership percentage'
  },
  {
    id: 'valuation-update',
    label: 'Valuation Update',
    icon: TrendingUp,
    description: 'Update company valuation'
  },
  {
    id: 'secondary-acquisition',
    label: 'Secondary Acquisition',
    icon: DollarSign,
    description: 'Secondary share purchase'
  },
  {
    id: 'partial-sale',
    label: 'Partial Sale',
    icon: Calculator,
    description: 'Partial exit or sale'
  },
  {
    id: 'dividend',
    label: 'Dividend, Interest or Distribution',
    icon: Banknote,
    description: 'Cash distributions'
  }
];

export default function AddEventDropdown({ 
  onSelectEvent, 
  isOpen, 
  onToggle,
  investment 
}: AddEventDropdownProps) {
  const [showOwnershipDialog, setShowOwnershipDialog] = useState(false);
  const [showNewRoundDialog, setShowNewRoundDialog] = useState(false);
  const [showValuationDialog, setShowValuationDialog] = useState(false);
  return (
    <div className="relative">
      <Button 
        onClick={onToggle}
        className="povc-bg-primary hover:bg-blue-700"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add
      </Button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <Card className="absolute top-full mt-2 right-0 w-80 z-50 shadow-lg">
            <CardContent className="p-2">
              <div className="space-y-1">
                {eventTypes.map((event) => {
                  const IconComponent = event.icon;
                  return (
                    <button
                      key={event.id}
                      onClick={() => {
                        if (event.id === 'ownership-update') {
                          setShowOwnershipDialog(true);
                          onToggle();
                        } else if (event.id === 'new-round') {
                          setShowNewRoundDialog(true);
                          onToggle();
                        } else if (event.id === 'valuation-update') {
                          setShowValuationDialog(true);
                          onToggle();
                        } else {
                          onSelectEvent(event.id);
                          onToggle();
                        }
                      }}
                      className="w-full flex items-center space-x-3 p-3 rounded-md hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex-shrink-0">
                        <IconComponent className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {event.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {event.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      
      {/* Dialogs */}
      <OwnershipUpdateDialog
        isOpen={showOwnershipDialog}
        onOpenChange={setShowOwnershipDialog}
        investment={investment}
      />
      
      <NewRoundDialog
        isOpen={showNewRoundDialog}
        onOpenChange={setShowNewRoundDialog}
        investment={investment}
      />
      
      <ValuationUpdateDialog
        isOpen={showValuationDialog}
        onOpenChange={setShowValuationDialog}
        investment={{
          id: investment?.id || "",
          company: investment?.company || "",
          currentValuation: 15000000
        }}
      />
    </div>
  );
}
