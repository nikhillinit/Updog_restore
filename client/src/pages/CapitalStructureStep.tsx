import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { useFundSelector, useFundTuple, useFundAction } from '@/stores/useFundSelector';

interface LPClass {
  id: string;
  name: string;
  targetAllocation: number;
  managementFeeRate?: number;
  carriedInterest?: number;
  preferredReturn?: number;
}

interface LP {
  id: string;
  name: string;
  commitment: number;
  lpClassId?: string;
  type: 'institutional' | 'family-office' | 'fund-of-funds' | 'individual' | 'other';
}

export default function CapitalStructureStep() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("gp-commitment");

  // State
  const [gpCommitment, fundSize, lpClasses, lps] = useFundTuple(
    s => [s.gpCommitment, s.fundSize, s.lpClasses || [], s.lps || []]
  );

  // Actions
  const updateCapitalStructure = useFundAction(s => s.updateCapitalStructure);
  const addLPClass = useFundAction(s => s.addLPClass);
  const updateLPClass = useFundAction(s => s.updateLPClass);
  const removeLPClass = useFundAction(s => s.removeLPClass);
  const addLP = useFundAction(s => s.addLP);
  const updateLP = useFundAction(s => s.updateLP);
  const removeLP = useFundAction(s => s.removeLP);

  // Calculated values
  const totalLPCommitments = lps.reduce((sum, lp) => sum + (lp.commitment || 0), 0);
  const totalCommitments = totalLPCommitments + (gpCommitment || 0);
  const gpPercentage = totalCommitments > 0 ? ((gpCommitment || 0) / totalCommitments * 100) : 0;
  const totalLPClassAllocation = lpClasses.reduce((sum, cls) => sum + (cls.targetAllocation || 0), 0);

  const handleAddLPClass = () => {
    const newClass: LPClass = {
      id: `class-${Date.now()}`,
      name: '',
      targetAllocation: 0,
    };
    addLPClass(newClass);
  };

  const handleAddLP = () => {
    const newLP: LP = {
      id: `lp-${Date.now()}`,
      name: '',
      commitment: 0,
      type: 'institutional',
    };
    addLP(newLP);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Capital Structure</h2>
        <p className="text-gray-600 mt-2">Define GP commitment and LP structure</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capital Overview</CardTitle>
          <CardDescription>
            Total Commitments: ${(totalCommitments / 1000000).toFixed(2)}M
            {fundSize && fundSize > 0 && (
              <span className="ml-2">
                ({((totalCommitments / 1000000) / fundSize * 100).toFixed(1)}% of target)
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="gp-commitment">GP Commitment</TabsTrigger>
          <TabsTrigger value="lp-classes">LP Classes</TabsTrigger>
          <TabsTrigger value="lps">Limited Partners</TabsTrigger>
        </TabsList>

        <TabsContent value="gp-commitment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Partner Commitment</CardTitle>
              <CardDescription>
                GP commitment amount and percentage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gp-commitment">GP Commitment ($M)</Label>
                  <Input
                    id="gp-commitment"
                    type="number"
                    min="0"
                    step="0.1"
                    value={(gpCommitment || 0) / 1000000}
                    onChange={(e) => updateCapitalStructure({ 
                      gpCommitment: parseFloat(e.target.value) * 1000000 || 0 
                    })}
                    placeholder="e.g., 2.0"
                    data-testid="gp-commitment"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>GP Percentage</Label>
                  <div className="p-2 bg-gray-50 rounded h-10 flex items-center">
                    <span className="text-gray-700" data-testid="gp-percentage">
                      {gpPercentage.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <p>Standard GP commitment ranges:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>Seed/Early Stage: 1-3%</li>
                  <li>Growth/Late Stage: 2-5%</li>
                  <li>Buyout: 1-2%</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lp-classes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LP Classes</CardTitle>
              <CardDescription>
                Define different classes of LPs with varying terms
                {totalLPClassAllocation > 0 && (
                  <span className="ml-2">
                    (Total: {totalLPClassAllocation.toFixed(1)}%)
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {lpClasses.map((lpClass, index) => (
                <div key={lpClass.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Class {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLPClass(lpClass.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Class Name</Label>
                      <Input
                        value={lpClass.name}
                        onChange={(e) => updateLPClass(lpClass.id, { name: e.target.value })}
                        placeholder="e.g., Class A, Founders"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Target Allocation (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={lpClass.targetAllocation}
                        onChange={(e) => updateLPClass(lpClass.id, { 
                          targetAllocation: parseFloat(e.target.value) || 0 
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Management Fee (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={lpClass.managementFeeRate || ''}
                        onChange={(e) => updateLPClass(lpClass.id, { 
                          managementFeeRate: parseFloat(e.target.value) || undefined 
                        })}
                        placeholder="Default"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Preferred Return (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="20"
                        step="0.1"
                        value={lpClass.preferredReturn || ''}
                        onChange={(e) => updateLPClass(lpClass.id, { 
                          preferredReturn: parseFloat(e.target.value) || undefined 
                        })}
                        placeholder="Default"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Carried Interest (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="50"
                        step="1"
                        value={lpClass.carriedInterest || ''}
                        onChange={(e) => updateLPClass(lpClass.id, { 
                          carriedInterest: parseFloat(e.target.value) || undefined 
                        })}
                        placeholder="Default"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button onClick={handleAddLPClass} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add LP Class
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Limited Partners</CardTitle>
              <CardDescription>
                Individual LP commitments (Total: ${(totalLPCommitments / 1000000).toFixed(2)}M)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {lps.map((lp, index) => (
                <div key={lp.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">LP {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLP(lp.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>LP Name</Label>
                      <Input
                        value={lp.name}
                        onChange={(e) => updateLP(lp.id, { name: e.target.value })}
                        placeholder="e.g., State Pension Fund"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Commitment ($M)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={(lp.commitment || 0) / 1000000}
                        onChange={(e) => updateLP(lp.id, { 
                          commitment: parseFloat(e.target.value) * 1000000 || 0 
                        })}
                        placeholder="e.g., 10.0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={lp.type}
                        onValueChange={(value: LP['type']) => updateLP(lp.id, { type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="institutional">Institutional</SelectItem>
                          <SelectItem value="family-office">Family Office</SelectItem>
                          <SelectItem value="fund-of-funds">Fund of Funds</SelectItem>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {lpClasses.length > 0 && (
                      <div className="space-y-2">
                        <Label>LP Class</Label>
                        <Select
                          value={lp.lpClassId || ''}
                          onValueChange={(value) => updateLP(lp.id, { 
                            lpClassId: value || undefined 
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Default Terms</SelectItem>
                            {lpClasses.map(cls => (
                              <SelectItem key={cls.id} value={cls.id}>
                                {cls.name || 'Unnamed Class'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              <Button onClick={handleAddLP} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Limited Partner
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-between mt-6">
        <Button 
          variant="outline"
          onClick={() => navigate('/fund-setup?step=1')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button 
          onClick={() => navigate('/fund-setup?step=3')}
          className="flex items-center gap-2"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}