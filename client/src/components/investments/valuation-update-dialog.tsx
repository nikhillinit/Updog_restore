/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Calendar, Info } from "lucide-react";

interface ValuationUpdateDialogProps {
  isOpen: boolean;
  onOpenChange: (_open: boolean) => void;
  investment?: {
    id: string;
    company: string;
    currentValuation: number;
  };
}

export default function ValuationUpdateDialog({ 
  isOpen, 
  onOpenChange, 
  investment 
}: ValuationUpdateDialogProps) {
  const [month, setMonth] = useState("Jul-2024");
  const [newValuation, setNewValuation] = useState("20.00");

  const handleSave = () => {
    console.log("Saving valuation update:", {
      month,
      newValuation: parseFloat(newValuation) * 1000000
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Valuation Update</span>
          </DialogTitle>
          <DialogDescription>
            Update the valuation for {investment?.company || "this investment"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Month Selection */}
          <div className="space-y-2">
            <Label htmlFor="month" className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Month</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Input
              id="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="Jul-2024"
              className="font-mono"
            />
          </div>

          {/* New Valuation */}
          <div className="space-y-2">
            <Label htmlFor="valuation" className="flex items-center space-x-2">
              <span>New Valuation</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="relative">
              <Input
                id="valuation"
                value={newValuation}
                onChange={(e) => setNewValuation(e.target.value)}
                className="pl-8 text-center bg-blue-50 border-blue-200 font-mono text-lg"
                placeholder="20.00"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                mm
              </span>
            </div>
          </div>

          {/* Current vs New Valuation */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Current Valuation</div>
              <div className="text-lg font-semibold">
                ${((investment?.currentValuation || 15000000) / 1000000).toFixed(2)}mm
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">New Valuation</div>
              <div className="text-lg font-semibold text-blue-600">${newValuation}mm</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              className="povc-bg-primary hover:bg-blue-700"
            >
              Update Valuation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
