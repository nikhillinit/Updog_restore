import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Edit, MoveUp, MoveDown } from "lucide-react";
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';

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
    <ModernStepContainer
      title="Investment Strategy"
      description="Stages, sectors, and allocations"
    >
      <div className="space-y-8">
        {/* Sector Profiles Section */}
        <div className="space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h3 className="text-lg font-medium text-charcoal-800 mb-2">Sector Profiles</h3>
            <p className="text-gray-600">
              Define macro views on round sizes, valuations, and performance for different sectors.
              A Default profile is created based on proprietary research and publicly available datasets.
            </p>
          </div>

          <div className="space-y-6">

            {sectorProfiles.map((profile: any) => {
              const isEditing = editingProfile === profile.id;

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

                      {/* Stages Summary with Fixed Column Widths */}
                      <div className="space-y-4">
                        {/* Header with Fixed Column Grid */}
                        <div className="grid text-sm font-bold text-gray-700 py-4 px-2 bg-gray-100 rounded-lg border border-gray-200" style={{
                          gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px'
                        }}>
                          <div className="text-blue-700 px-3">Round</div>
                          <div className="text-blue-700 px-3 text-center">Size ($M)</div>
                          <div className="text-blue-700 px-3 text-center">Type</div>
                          <div className="text-blue-700 px-3 text-center">Valuation ($M)</div>
                          <div className="text-blue-700 px-3 text-center">ESOP (%)</div>
                          <div className="text-green-700 px-3 text-center">Grad (%)</div>
                          <div className="text-green-700 px-3 text-center">Mo to Grad</div>
                          <div className="text-orange-700 px-3 text-center">Exit (%)</div>
                          <div className="text-orange-700 px-3 text-center">Exit Val ($M)</div>
                        </div>

                        {/* Rows with Matching Fixed Column Grid */}
                        {profile.stages.map((stage: any, index: any) => (
                          <div key={stage.id} className="grid text-base py-4 px-2 bg-white rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-all" style={{
                            gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px'
                          }}>
                            <div className="font-bold text-blue-800 text-lg px-3">{stage.name}</div>
                            <div className="font-semibold text-gray-900 px-3 text-center">${stage.roundSize}M</div>
                            <div className="text-gray-700 font-medium px-3 text-center">{stage.valuationType}</div>
                            <div className="font-semibold text-gray-900 px-3 text-center">${stage.valuation}M</div>
                            <div className="font-semibold text-gray-900 px-3 text-center">{stage.esopPct}%</div>
                            <div className="font-bold text-green-800 px-3 text-center">{stage.graduationRate}%</div>
                            <div className="font-bold text-green-800 px-3 text-center">{stage.monthsToGraduate}mo</div>
                            <div className="font-bold text-orange-800 px-3 text-center">{stage.exitRate}%</div>
                            <div className="font-semibold text-gray-900 px-3 text-center">${stage.exitValuation}M</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // Edit Mode
                    <div className="space-y-6">
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
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-charcoal-700">Profile Name</Label>
                        <Input
                          value={profile.name}
                          onChange={(e: any) => handleUpdateProfile(profile.id, { name: e.target.value })}
                          placeholder="e.g., FinTech, HealthTech, Enterprise SaaS"
                          className="h-12"
                        />
                      </div>

                      {/* Stages Header */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-charcoal-700">Investment Stages</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddStage(profile.id)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Round
                          </Button>
                        </div>

                        {/* Column Headers with Fixed Column Grid */}
                        <div className="grid text-base font-bold text-gray-700 py-4 px-2 bg-gray-100 rounded-lg border border-gray-200" style={{
                          gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px 120px'
                        }}>
                          <div className="text-blue-700 px-3">Round</div>
                          <div className="text-blue-700 px-3 text-center">Size ($M)</div>
                          <div className="text-blue-700 px-3 text-center">Type</div>
                          <div className="text-blue-700 px-3 text-center">Valuation ($M)</div>
                          <div className="text-blue-700 px-3 text-center">ESOP (%)</div>
                          <div className="text-green-700 px-3 text-center">Grad (%)</div>
                          <div className="text-green-700 px-3 text-center">Mo to Grad</div>
                          <div className="text-orange-700 px-3 text-center">Exit (%)</div>
                          <div className="text-orange-700 px-3 text-center">Exit Val ($M)</div>
                          <div className="text-gray-600 px-3 text-center">Actions</div>
                        </div>
                      </div>

                      {/* Stages with Fixed Column Grid Matching Headers */}
                      <div className="space-y-4">
                        {profile.stages.map((stage: any, stageIndex: any) => (
                          <div key={stage.id} className="grid items-center py-4 px-2 bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all" style={{
                            gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px 120px'
                          }}>
                            {/* Round Dropdown */}
                            <div className="px-3">
                              <Select
                                value={stage.name}
                                onValueChange={(value: string) => handleUpdateStage(profile.id, stage.id, { name: value })}
                              >
                                <SelectTrigger className="h-12 text-sm font-medium w-full">
                                  <SelectValue placeholder="Select round" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Pre-Seed">Pre-Seed</SelectItem>
                                  <SelectItem value="Seed">Seed</SelectItem>
                                  <SelectItem value="Series A">Series A</SelectItem>
                                  <SelectItem value="Series B">Series B</SelectItem>
                                  <SelectItem value="Series C">Series C</SelectItem>
                                  <SelectItem value="Series D+">Series D+</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Size */}
                            <div className="px-3">
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                value={stage.roundSize}
                                onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { roundSize: parseFloat(e.target.value) || 0 })}
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="0.0"
                              />
                            </div>

                            {/* Type (Pre/Post) */}
                            <div className="px-3">
                              <Select
                                value={stage.valuationType}
                                onValueChange={(value: 'pre' | 'post') => handleUpdateStage(profile.id, stage.id, { valuationType: value })}
                              >
                                <SelectTrigger className="h-12 text-sm w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pre">Pre</SelectItem>
                                  <SelectItem value="post">Post</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Valuation */}
                            <div className="px-3">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={stage.valuation}
                                onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { valuation: parseFloat(e.target.value) || 0 })}
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="0"
                              />
                            </div>

                            {/* ESOP */}
                            <div className="px-3">
                              <Input
                                type="number"
                                min="0"
                                max="50"
                                step="0.5"
                                value={stage.esopPct}
                                onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { esopPct: parseFloat(e.target.value) || 0 })}
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="10"
                              />
                            </div>

                            {/* Graduation Rate */}
                            <div className="px-3">
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
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="30"
                              />
                            </div>

                            {/* Months to Graduate */}
                            <div className="px-3">
                              <Input
                                type="number"
                                min="1"
                                max="120"
                                step="1"
                                value={stage.monthsToGraduate}
                                onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { monthsToGraduate: parseInt(e.target.value) || 12 })}
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="18"
                              />
                            </div>

                            {/* Exit Rate */}
                            <div className="px-3">
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
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="5"
                              />
                            </div>

                            {/* Exit Valuation */}
                            <div className="px-3">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={stage.exitValuation}
                                onChange={(e: any) => handleUpdateStage(profile.id, stage.id, { exitValuation: parseFloat(e.target.value) || 0 })}
                                className="h-12 text-sm text-center font-medium w-full"
                                placeholder="50"
                              />
                            </div>

                            {/* Actions */}
                            <div className="px-3 flex gap-1 justify-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMoveStage(profile.id, stageIndex, 'up')}
                                disabled={stageIndex === 0}
                                className="h-8 w-8 p-0"
                              >
                                <MoveUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMoveStage(profile.id, stageIndex, 'down')}
                                disabled={stageIndex === profile.stages.length - 1}
                                className="h-8 w-8 p-0"
                              >
                                <MoveDown className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteStage(profile.id, stage.id)}
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Important Considerations */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
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

            <Button onClick={handleAddProfile} variant="outline" className="w-full h-12">
              <Plus className="h-4 w-4 mr-2" />
              Add Sector Profile
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-gray-100 mt-8">
          <Button
            variant="outline"
            onClick={() => navigate('/fund-setup?step=2')}
            className="flex items-center gap-2 px-8 py-3 h-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            onClick={() => navigate('/fund-setup?step=4')}
            className="flex items-center gap-2 bg-charcoal-800 hover:bg-charcoal-900 text-white px-8 py-3 h-auto"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}