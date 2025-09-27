/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Percent, Calendar, Info } from "lucide-react";

interface OwnershipUpdateDialogProps {
  isOpen: boolean;
  onOpenChange: (_open: boolean) => void;
  investment?: {
    id: string;
    company: string;
    currentOwnership: number;
  };
}

export default function OwnershipUpdateDialog({ 
  isOpen, 
  onOpenChange, 
  investment 
}: OwnershipUpdateDialogProps) {
  const [month, setMonth] = useState("Dec-2024");
  const [updatedOwnership, setUpdatedOwnership] = useState("2.284727");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [eventNotes, setEventNotes] = useState("");
  const [isDilutionMode, setIsDilutionMode] = useState(false);

  const handleSave = () => {
    console.log("Saving ownership update:", {
      month,
      updatedOwnership: parseFloat(updatedOwnership),
      advancedMode
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Percent className="h-5 w-5" />
            <span>Ownership Update</span>
          </DialogTitle>
          <DialogDescription>
            Update ownership percentage for {investment?.company || "this investment"}
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
              onChange={(e: any) => setMonth(e.target.value)}
              placeholder="Feb-2021"
              className="font-mono"
            />
          </div>

          {/* Updated Ownership */}
          <div className="space-y-2">
            <Label htmlFor="ownership" className="flex items-center space-x-2">
              <span>Updated ownership (%)</span>
              <Info className="h-3 w-3 text-muted-foreground" />
              <span 
                className="text-blue-600 text-sm cursor-pointer hover:underline"
                onClick={() => setIsDilutionMode(!isDilutionMode)}
              >
                {isDilutionMode ? "Enter Ownership (%)" : "Enter Dilution (%)"}
              </span>
            </Label>
            <div className="relative">
              <Input
                id="ownership"
                value={updatedOwnership}
                onChange={(e: any) => setUpdatedOwnership(e.target.value)}
                className="pr-8 text-center bg-yellow-50 border-yellow-200 font-mono"
                placeholder={isDilutionMode ? "5.0" : "2.284727"}
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
          </div>

          {/* Event Notes */}
          <div className="space-y-2">
            <Label htmlFor="event-notes" className="flex items-center space-x-2">
              <span>Event Notes</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Textarea
              id="event-notes"
              value={eventNotes}
              onChange={(e: any) => setEventNotes(e.target.value)}
              placeholder="Enter text here"
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Advanced Mode Toggle */}
          <div className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="text-blue-600 cursor-pointer">Enter Share Data (Advanced)</span>
            </div>
            <div className="flex items-center space-x-2 ml-auto">
              <Switch 
                id="advanced-mode"
                checked={advancedMode}
                onCheckedChange={setAdvancedMode}
              />
              <Badge variant={advancedMode ? "default" : "secondary"}>
                {advancedMode ? "Yes" : "No"}
              </Badge>
            </div>
          </div>

          {/* Advanced Share Data (when enabled) */}
          {advancedMode && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Advanced Share Data Entry</CardTitle>
                <CardDescription className="text-xs">
                  Enter detailed share information for precise ownership calculation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Shares Outstanding</Label>
                    <Input placeholder="1,000,000" className="text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Our Shares</Label>
                    <Input placeholder="100,000" className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Option Pool</Label>
                    <Input placeholder="150,000" className="text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Fully Diluted Shares</Label>
                    <Input placeholder="1,150,000" className="text-sm" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current vs New Ownership */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Current Ownership</div>
              <div className="text-lg font-semibold">{investment?.currentOwnership || 8.5}%</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">New Ownership</div>
              <div className="text-lg font-semibold text-blue-600">
                {isDilutionMode 
                  ? `${((investment?.currentOwnership || 8.5) - parseFloat(updatedOwnership || "0")).toFixed(3)}%`
                  : `${updatedOwnership}%`
                }
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button 
              onClick={handleSave}
              className="povc-bg-primary hover:bg-blue-700"
            >
              Save Ownership Update
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
