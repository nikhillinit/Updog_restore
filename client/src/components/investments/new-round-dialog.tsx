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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Calendar, TrendingUp, Info, Plus } from "lucide-react";

interface NewRoundDialogProps {
  isOpen: boolean;
  onOpenChange: (_open: boolean) => void;
  investment?: {
    id: string;
    company: string;
  };
}

export default function NewRoundDialog({ 
  isOpen, 
  onOpenChange, 
  investment 
}: NewRoundDialogProps) {
  const [securityType, setSecurityType] = useState("Other");
  const [month, setMonth] = useState("Jun-2024");
  const [roundName, setRoundName] = useState("Warrants");
  const [graduationRate, setGraduationRate] = useState("100");
  const [currency, setCurrency] = useState("United States Dollar ($)");
  const [investmentAmount, setInvestmentAmount] = useState("25000");
  const [roundSize, setRoundSize] = useState("25000");
  const [preMoneyValuation, setPreMoneyValuation] = useState("18700000");
  
  // Advanced share data
  const [showAdvancedShares, setShowAdvancedShares] = useState(false);
  const [sharePrice, setSharePrice] = useState("1.5");
  const [newSharesPurchased, setNewSharesPurchased] = useState("16666.666667");
  const [totalSharesOwned, setTotalSharesOwned] = useState("683333.333333");
  const [newSharesIssued, setNewSharesIssued] = useState("16666.666667");
  const [fullyDilutedShares, setFullyDilutedShares] = useState("12483333.333333");

  const handleSave = () => {
    console.log("Saving new round:", {
      securityType,
      month,
      roundName,
      graduationRate: parseFloat(graduationRate),
      currency,
      investmentAmount: parseFloat(investmentAmount),
      roundSize: parseFloat(roundSize),
      preMoneyValuation: parseFloat(preMoneyValuation),
      ...(showAdvancedShares && {
        sharePrice: parseFloat(sharePrice),
        newSharesPurchased: parseFloat(newSharesPurchased),
        totalSharesOwned: parseFloat(totalSharesOwned),
        newSharesIssued: parseFloat(newSharesIssued),
        fullyDilutedShares: parseFloat(fullyDilutedShares)
      })
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Round</span>
          </DialogTitle>
          <DialogDescription>
            Add a new investment round for {investment?.company || "this investment"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Security Type */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <span>Security Type</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Select value={securityType} onValueChange={setSecurityType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Equity">Equity</SelectItem>
                <SelectItem value="Convertible Note">Convertible Note</SelectItem>
                <SelectItem value="SAFE">SAFE</SelectItem>
                <SelectItem value="Warrant">Warrant</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Month */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Month</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Input
              value={month}
              onChange={(e: any) => setMonth(e.target.value)}
              placeholder="Jun-2024"
              className="font-mono"
            />
          </div>

          {/* Round Name */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <span>Round Name</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Input
              value={roundName}
              onChange={(e: any) => setRoundName(e.target.value)}
              placeholder="Warrants"
            />
          </div>

          {/* Graduation Rate */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <span>Graduation Rate (%)</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="relative">
              <Input
                value={graduationRate}
                onChange={(e: any) => setGraduationRate(e.target.value)}
                className="pr-8 text-center"
                placeholder="100"
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
          </div>

          {/* Round Currency */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <span>Round Currency</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="United States Dollar ($)">United States Dollar ($)</SelectItem>
                <SelectItem value="Euro (€)">Euro (€)</SelectItem>
                <SelectItem value="British Pound (£)">British Pound (£)</SelectItem>
                <SelectItem value="Canadian Dollar (CAD)">Canadian Dollar (CAD)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Investment Amount */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4" />
              <span>Investment Amount ($)</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="relative">
              <Input
                value={investmentAmount}
                onChange={(e: any) => setInvestmentAmount(e.target.value)}
                className="pl-8 bg-yellow-50 border-yellow-200 font-mono"
                placeholder="25000"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                $
              </span>
            </div>
          </div>

          {/* Round Size */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <span>Round Size ($)</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="relative">
              <Input
                value={roundSize}
                onChange={(e: any) => setRoundSize(e.target.value)}
                className="pl-8 bg-yellow-50 border-yellow-200 font-mono"
                placeholder="25000"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                $
              </span>
            </div>
          </div>

          {/* Pre-Money Valuation */}
          <div className="space-y-2">
            <Label className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Pre-Money Valuation ($)</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="relative">
              <Input
                value={preMoneyValuation}
                onChange={(e: any) => setPreMoneyValuation(e.target.value)}
                className="pl-8 bg-yellow-50 border-yellow-200 font-mono"
                placeholder="18700000"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                $
              </span>
            </div>
          </div>

          <Separator />

          {/* Advanced Share Data Toggle */}
          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="text-blue-600">Advanced Share Data</span>
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                checked={showAdvancedShares}
                onCheckedChange={setShowAdvancedShares}
              />
              <Badge variant={showAdvancedShares ? "default" : "secondary"}>
                {showAdvancedShares ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>

          {/* Advanced Share Data Section */}
          {showAdvancedShares && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Share Details</CardTitle>
                <CardDescription className="text-xs">
                  Enter precise share information for accurate calculations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Share Price */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center space-x-1">
                    <span>Share Price ($)</span>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <div className="relative">
                    <Input
                      value={sharePrice}
                      onChange={(e: any) => setSharePrice(e.target.value)}
                      className="pl-6 bg-yellow-50 border-yellow-200 font-mono text-sm"
                      placeholder="1.5"
                    />
                    <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">
                      $
                    </span>
                  </div>
                </div>

                {/* New Shares Purchased */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center space-x-1">
                    <span>New Shares Purchased</span>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Input
                    value={newSharesPurchased}
                    onChange={(e: any) => setNewSharesPurchased(e.target.value)}
                    className="bg-yellow-50 border-yellow-200 font-mono text-sm"
                    placeholder="16666.666667"
                  />
                </div>

                {/* Total Shares Owned */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center space-x-1">
                    <span>Total Shares Owned</span>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Input
                    value={totalSharesOwned}
                    onChange={(e: any) => setTotalSharesOwned(e.target.value)}
                    className="bg-yellow-50 border-yellow-200 font-mono text-sm"
                    placeholder="683333.333333"
                  />
                </div>

                {/* New Shares Issued */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center space-x-1">
                    <span>New Shares Issued</span>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Input
                    value={newSharesIssued}
                    onChange={(e: any) => setNewSharesIssued(e.target.value)}
                    className="bg-yellow-50 border-yellow-200 font-mono text-sm"
                    placeholder="16666.666667"
                  />
                </div>

                {/* Fully Diluted Shares Outstanding */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center space-x-1">
                    <span>Fully Diluted Shares Outstanding</span>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Input
                    value={fullyDilutedShares}
                    onChange={(e: any) => setFullyDilutedShares(e.target.value)}
                    className="bg-yellow-50 border-yellow-200 font-mono text-sm"
                    placeholder="12483333.333333"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calculated Values Display */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Investment</div>
              <div className="text-sm font-semibold">${parseInt(investmentAmount).toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Post-Money</div>
              <div className="text-sm font-semibold">
                ${((parseInt(preMoneyValuation) + parseInt(roundSize)) / 1000000).toFixed(2)}M
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Ownership</div>
              <div className="text-sm font-semibold text-blue-600">
                {((parseInt(investmentAmount) / (parseInt(preMoneyValuation) + parseInt(roundSize))) * 100).toFixed(2)}%
              </div>
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
              Add Round
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
