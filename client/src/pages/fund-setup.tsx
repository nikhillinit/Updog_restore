import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Building2 } from "lucide-react";

export default function FundSetup() {
  const [, setLocation] = useLocation();
  const [fundName, setFundName] = useState("");

  const handleSave = () => {
    // Placeholder save logic
    setLocation('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Press On Ventures Construction Wizard</h1>
          <p className="text-gray-600">Set up your fund with essential information</p>
        </div>

        {/* Step Content */}
        <Card className="shadow-lg border-0 mt-16">
          <CardHeader className="bg-white border-b border-gray-200 rounded-t-lg">
            <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">
              Fund Basics
            </CardTitle>
            <p className="text-gray-600 text-sm mt-1">
              Some basic facts on your fund
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            <div className="space-y-8">
              {/* Fund Name */}
              <div className="space-y-3">
                <Label htmlFor="fundName" className="text-base font-medium text-gray-900">
                  Fund Name
                </Label>
                <Input
                  id="fundName"
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  placeholder="Enter fund name"
                  className="h-11 border-gray-300"
                />
              </div>
            </div>
            
            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
              <Button variant="outline" disabled>
                Back
              </Button>
              <Button onClick={handleSave} disabled={!fundName}>
                Create Fund
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
