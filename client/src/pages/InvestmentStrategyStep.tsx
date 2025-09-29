import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Edit, MoveUp, MoveDown } from "lucide-react";

// Investment Stage interface
interface InvestmentStage {
  id: string;
  name: string;
  roundSize: number; // $M
  valuation: number; // $M
  valuationType: 'pre' | 'post';
  esopPct: number; // %
  graduationRate: number; // %
  exitRate: number; // %
  exitValuation: number; // $M
  monthsToGraduate: number;
  monthsToExit: number;
}

// Sector Profile interface
interface SectorProfile {
  id: string;
  name: string;
  stages: InvestmentStage[];
}

export default function InvestmentStrategyStep() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("sector-profiles"); // Start on sector profiles tab
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);

  // Debug logging
  React.useEffect(() => {
    console.log('Component mounted, editingProfile:', editingProfile);
  }, []);

  React.useEffect(() => {
    console.log('editingProfile state changed:', editingProfile);
  }, [editingProfile]);

  // Mock sector profiles (this would come from store)
  // Updated with 2024-2025 market data based on current venture capital trends
  const [sectorProfiles, setSectorProfiles] = useState<SectorProfile[]>([
    {
      id: 'default',
      name: 'Default',
      stages: [
        {
          id: 'pre-seed',
          name: 'Pre-Seed',
          roundSize: 0.75, // 2024-2025: Increased from $0.5M due to higher operating costs and talent competition
          valuation: 6.5, // 2024-2025: Higher valuations reflecting strong early-stage market
          valuationType: 'pre',
          esopPct: 20, // 2024-2025: Increased to attract top talent in competitive market
          graduationRate: 25, // 2024-2025: More conservative, reflecting Series A funding challenges
          exitRate: 5, // 2024-2025: Lower early exits as companies hold longer for higher valuations
          exitValuation: 12, // 2024-2025: Updated exit valuation expectation
          monthsToGraduate: 18,
          monthsToExit: 24
        },
        {
          id: 'seed',
          name: 'Seed',
          roundSize: 3.5, // 2024-2025: Significant increase reflecting larger seed rounds
          valuation: 16, // 2024-2025: Higher seed valuations in current market
          valuationType: 'pre',
          esopPct: 20, // 2024-2025: Maintained high ESOP to retain talent through Series A Chasm
          graduationRate: 18, // 2024-2025: Series A Chasm - much lower graduation rate
          exitRate: 20,
          exitValuation: 35, // 2024-2025: Higher exit expectations
          monthsToGraduate: 25, // 2024-2025: Longer time to Series A due to market conditions
          monthsToExit: 30
        },
        {
          id: 'series-a',
          name: 'Series A',
          roundSize: 12, // 2024-2025: Larger Series A rounds reflecting market consolidation
          valuation: 48, // 2024-2025: Higher Series A valuations for proven companies
          valuationType: 'pre',
          esopPct: 18, // 2024-2025: Slightly reduced from seed but still competitive
          graduationRate: 35, // 2024-2025: Improved graduation rate for Series A survivors
          exitRate: 25,
          exitValuation: 120, // 2024-2025: Higher exit valuations for Series A companies
          monthsToGraduate: 34, // 2024-2025: Longer path to Series B
          monthsToExit: 36
        },
        {
          id: 'series-b',
          name: 'Series B',
          roundSize: 30, // 2024-2025: Larger Series B rounds
          valuation: 109, // 2024-2025: Updated Series B valuations
          valuationType: 'pre',
          esopPct: 17, // 2024-2025: Maintained competitive ESOP levels
          graduationRate: 40, // 2024-2025: Improved graduation rate for proven growth companies
          exitRate: 25,
          exitValuation: 250, // 2024-2025: Higher Series B exit expectations
          monthsToGraduate: 26, // 2024-2025: Faster path to Series C in growth phase
          monthsToExit: 42
        },
        {
          id: 'series-c',
          name: 'Series C+',
          roundSize: 50, // 2024-2025: New stage - larger late-stage rounds
          valuation: 200, // 2024-2025: Late-stage valuations for scaled companies
          valuationType: 'pre',
          esopPct: 12, // 2024-2025: Lower ESOP percentage for mature companies
          graduationRate: 0, // Final stage - no graduation
          exitRate: 50, // 2024-2025: Higher exit rate for mature companies seeking liquidity
          exitValuation: 500, // 2024-2025: Premium exit valuations for Series C+ companies
          monthsToGraduate: 0,
          monthsToExit: 48
        }
      ]
    }
  ]);

  const calculateFailureRate = (graduationRate: number, exitRate: number): number => {
    return Math.max(0, 100 - graduationRate - exitRate);
  };

  const validateStageRates = (graduationRate: number, exitRate: number): boolean => {
    return graduationRate + exitRate <= 100;
  };

  const handleAddProfile = () => {
    const newProfile: SectorProfile = {
      id: `profile-${Date.now()}`,
      name: '',
      stages: [
        {
          id: `stage-${Date.now()}`,
          name: 'Seed',
          roundSize: 3.5, // 2024-2025 market default
          valuation: 16, // 2024-2025 market default
          valuationType: 'pre',
          esopPct: 20, // 2024-2025 market default
          graduationRate: 18, // 2024-2025 market default - Series A Chasm
          exitRate: 20,
          exitValuation: 35, // 2024-2025 market default
          monthsToGraduate: 25, // 2024-2025 market default
          monthsToExit: 30
        }
      ]
    };
    setSectorProfiles([...sectorProfiles, newProfile]);
    setEditingProfile(newProfile.id);
  };

  const handleDeleteProfile = (profileId: string) => {
    setSectorProfiles(prev => prev.filter(p => p.id !== profileId));
    if (editingProfile === profileId) {
      setEditingProfile(null);
    }
  };

  const handleUpdateProfile = (profileId: string, updates: Partial<SectorProfile>) => {
    setSectorProfiles(prev => prev.map(p => 
      p.id === profileId ? { ...p, ...updates } : p
    ));
  };

  const handleAddStage = (profileId: string) => {
    const newStage: InvestmentStage = {
      id: `stage-${Date.now()}`,
      name: '',
      roundSize: 12, // 2024-2025 Series A market default
      valuation: 48, // 2024-2025 Series A market default
      valuationType: 'pre',
      esopPct: 18, // 2024-2025 market default
      graduationRate: 35, // 2024-2025 market default
      exitRate: 25,
      exitValuation: 120, // 2024-2025 market default
      monthsToGraduate: 34, // 2024-2025 market default
      monthsToExit: 36
    };

    setSectorProfiles(prev => prev.map(p => 
      p.id === profileId ? { 
        ...p, 
        stages: [...p.stages, newStage] 
      } : p
    ));
  };

  const handleDeleteStage = (profileId: string, stageId: string) => {
    setSectorProfiles(prev => prev.map(p => 
      p.id === profileId ? { 
        ...p, 
        stages: p.stages.filter(s => s.id !== stageId) 
      } : p
    ));
  };

  const handleUpdateStage = (profileId: string, stageId: string, updates: Partial<InvestmentStage>) => {
    setSectorProfiles(prev => prev.map(p => 
      p.id === profileId ? { 
        ...p, 
        stages: p.stages.map(s => 
          s.id === stageId ? { ...s, ...updates } : s
        ) 
      } : p
    ));
  };

  const handleMoveStage = (profileId: string, stageIndex: number, direction: 'up' | 'down') => {
    setSectorProfiles(prev => prev.map(p => {
      if (p.id !== profileId) return p;
      
      const stages = [...p.stages];
      const newIndex = direction === 'up' ? stageIndex - 1 : stageIndex + 1;
      
      if (newIndex >= 0 && newIndex < stages.length) {
        [stages[stageIndex], stages[newIndex]] = [stages[newIndex], stages[stageIndex]];
      }
      
      return { ...p, stages };
    }));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Investment Strategy</h2>
        <p className="text-gray-600 mt-2">Define your investment stages, sector focus, and capital allocation</p>
      </div>

      {/* Remove tabs, just show sector profiles directly */}
      <Card>
        <CardHeader>
          <CardTitle>Sector Profiles</CardTitle>
          <CardDescription>
            Define macro views on round sizes, valuations, and performance for different sectors.
            A Default profile is created based on proprietary research and publicly available datasets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
              {/* Debug controls */}
              <div className="bg-gray-100 p-3 rounded border">
                <p className="text-sm mb-2">Debug: editingProfile = {editingProfile || 'null'}</p>
                <Button 
                  size="sm" 
                  onClick={() => setEditingProfile(editingProfile ? null : 'default')}
                  className="mr-2"
                >
                  Toggle Edit Mode
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => console.log('Current state:', { editingProfile, activeTab })}
                >
                  Log State
                </Button>
              </div>

              {sectorProfiles.map((profile: any) => {
                const isEditing = editingProfile === profile.id;
                console.log(`Profile ${profile.id}: isEditing = ${isEditing}, editingProfile = ${editingProfile}`);
                
                return (
                  <div key={profile.id} className={`border rounded-lg p-4 space-y-4 ${isEditing ? 'border-blue-500 bg-blue-50' : ''}`}>
                    {!isEditing ? (
                      // View Mode
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-medium text-lg">{profile.name || 'Unnamed Profile'}</h3>
                            <p className="text-sm text-gray-600">{profile.stages.length} stages defined</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                console.log('Edit clicked for profile:', profile.id);
                                setEditingProfile(profile.id);
                              }}
                              data-testid={`edit-profile-${profile.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {profile.id !== 'default' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteProfile(profile.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Stages Summary */}
                        <div className="grid gap-2">
                          {profile.stages.map((stage: any, index: any) => (
                            <div key={stage.id} className="grid grid-cols-8 gap-2 text-sm py-2 border-b">
                              <div className="font-medium">{stage.name}</div>
                              <div>${stage.roundSize}M</div>
                              <div>${stage.valuation}M ({stage.valuationType})</div>
                              <div>{stage.esopPct}%</div>
                              <div>{stage.graduationRate}%</div>
                              <div>{stage.exitRate}%</div>
                              <div>{calculateFailureRate(stage.graduationRate, stage.exitRate)}%</div>
                              <div>{stage.monthsToGraduate}mo</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      // Edit Mode
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Edit Profile</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingProfile(null)}
                          >
                            Done
                          </Button>
                        </div>

                        {/* Profile Name */}
                        <div className="space-y-2">
                          <Label>Profile Name</Label>
                          <Input
                            value={profile.name}
                            onChange={(e: any) => handleUpdateProfile(profile.id, { name: e.target.value })}
                            placeholder="e.g., FinTech, HealthTech, Enterprise SaaS"
                          />
                        </div>

                        {/* Stages Header */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Investment Stages</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddStage(profile.id)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Round
                            </Button>
                          </div>
                          
                          {/* Column Headers */}
                          <div className="grid grid-cols-10 gap-2 text-xs font-medium text-gray-600 py-2 border-b">
                            <div>Round</div>
                            <div>Size ($M)</div>
                            <div>Valuation ($M)</div>
                            <div>Type</div>
                            <div>ESOP (%)</div>
                            <div>Grad (%)</div>
                            <div>Exit (%)</div>
                            <div>Exit Val ($M)</div>
                            <div>Mo to Grad</div>
                            <div>Actions</div>
                          </div>
                        </div>

                        {/* Stages */}
                        {profile.stages.map((stage: any, stageIndex: any) => (
                          <div key={stage.id} className="grid grid-cols-10 gap-2 items-center py-2 border-b">
                            <Input
                              value={stage.name}
                              onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { name: e.target.value })}
                              placeholder="Round name"
                              className="text-sm"
                            />
                            
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={stage.roundSize}
                              onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { roundSize: parseFloat(e.target.value) || 0 })}
                              className="text-sm"
                            />
                            
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={stage.valuation}
                              onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { valuation: parseFloat(e.target.value) || 0 })}
                              className="text-sm"
                            />
                            
                            <Select
                              value={stage.valuationType}
                              onValueChange={(value: 'pre' | 'post') => handleUpdateStage(profile.id, stage.id, { valuationType: value })}
                            >
                              <SelectTrigger className="text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pre">Pre</SelectItem>
                                <SelectItem value="post">Post</SelectItem>
                              </SelectContent>
                            </Select>
                            
                            <Input
                              type="number"
                              min="0"
                              max="50"
                              step="1"
                              value={stage.esopPct}
                              onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { esopPct: parseFloat(e.target.value) || 0 })}
                              className="text-sm"
                            />
                            
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={stage.graduationRate}
                              onChange={(e: any) => {
                                const value = parseFloat(e.target.value) || 0;
                                if (validateStageRates(value, stage.exitRate)) {
                                  handleUpdateStage(profile.id, stage.id, { graduationRate: value });
                                }
                              }}
                              className="text-sm"
                            />
                            
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={stage.exitRate}
                              onChange={(e: any) => {
                                const value = parseFloat(e.target.value) || 0;
                                if (validateStageRates(stage.graduationRate, value)) {
                                  handleUpdateStage(profile.id, stage.id, { exitRate: value });
                                }
                              }}
                              className="text-sm"
                            />
                            
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={stage.exitValuation}
                              onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { exitValuation: parseFloat(e.target.value) || 0 })}
                              className="text-sm"
                            />
                            
                            <Input
                              type="number"
                              min="1"
                              max="120"
                              step="1"
                              value={stage.monthsToGraduate}
                              onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { monthsToGraduate: parseInt(e.target.value) || 12 })}
                              className="text-sm"
                            />
                            
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMoveStage(profile.id, stageIndex, 'up')}
                                disabled={stageIndex === 0}
                              >
                                <MoveUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMoveStage(profile.id, stageIndex, 'down')}
                                disabled={stageIndex === profile.stages.length - 1}
                              >
                                <MoveDown className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteStage(profile.id, stage.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}

                        {/* Important Considerations */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                          <h4 className="font-medium text-amber-900 mb-2">Important Considerations</h4>
                          <ul className="text-sm text-amber-800 space-y-1">
                            <li>• Graduation Rate + Exit Rate cannot exceed 100% for any stage</li>
                            <li>• The last stage must have a 0% graduation rate (no subsequent stage)</li>
                            <li>• Time to exit is months after entering that stage, not from initial investment</li>
                            <li>• Don't delete later-stage rounds even if you don't participate - needed for FMV step-ups</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
          <Button onClick={handleAddProfile} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Sector Profile
          </Button>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button 
          variant="outline"
          onClick={() => navigate('/fund-setup?step=2')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button 
          onClick={() => navigate('/fund-setup?step=4')}
          className="flex items-center gap-2"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}