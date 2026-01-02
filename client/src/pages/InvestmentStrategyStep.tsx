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

// Default sector profiles with 2024-2025 market data
const DEFAULT_SECTOR_PROFILES: SectorProfile[] = [
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
];

export default function InvestmentStrategyStep() {
  const [, navigate] = useLocation();
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);

  // ✅ FIX: Use localStorage for persistence instead of ephemeral useState
  // This ensures data survives component unmount/remount cycles
  //
  // TECHNICAL NOTE: This component manages a nested data structure (SectorProfile with InvestmentStage[])
  // that differs from the fund store's flat structure. To avoid schema conflicts and enable quick
  // iteration, we persist directly to localStorage with a unique key. Future consolidation with
  // Step 2 (Investment Rounds) will migrate this to the unified fund store schema.
  const STORAGE_KEY = 'updog_sector_profiles_with_stages';

  const [sectorProfiles, setSectorProfilesInternal] = useState<SectorProfile[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate that stored data has correct structure
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load sector profiles from localStorage:', error);
    }
    return DEFAULT_SECTOR_PROFILES;
  });

  // Wrapper to persist to localStorage whenever profiles change
  const setSectorProfiles = React.useCallback((profiles: SectorProfile[] | ((prev: SectorProfile[]) => SectorProfile[])) => {
    setSectorProfilesInternal((prev) => {
      const newProfiles = typeof profiles === 'function' ? profiles(prev) : profiles;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfiles));
      } catch (error) {
        console.error('Failed to save sector profiles to localStorage:', error);
      }
      return newProfiles;
    });
  }, [STORAGE_KEY]);

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
        const stageA = stages[stageIndex];
        const stageB = stages[newIndex];
        if (stageA && stageB) {
          stages[stageIndex] = stageB;
          stages[newIndex] = stageA;
        }
      }

      return { ...p, stages };
    }));
  };

  return (
    <ModernStepContainer
      title="Investment Strategy"
      description="Stages, sectors, and allocations"
    >
      {/* Consolidation Notice */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-poppins text-blue-800">
          <strong>📋 Note:</strong> This step will be consolidated with Investment Rounds (Step 2) in a future update
          to eliminate redundancy and streamline the setup process. For now, please continue with your stage definitions.
        </p>
      </div>
      <div className="space-y-8">
        {/* Sector Profiles Section */}
        <div className="space-y-6">
          <div className="pb-4 border-b border-[#E0D8D1]">
            <h3 className="text-xl font-inter font-bold text-[#292929] mb-2">Sector Profiles</h3>
            <p className="font-poppins text-[#292929]/70">
              Define macro views on round sizes, valuations, and performance for different sectors.
              A Default profile is created based on proprietary research and publicly available datasets.
            </p>
          </div>

          <div className="space-y-6">

            {sectorProfiles.map((profile: any) => {
              const isEditing = editingProfile === profile.id;

              return (
                <div key={profile.id} className={`border rounded-xl p-4 space-y-4 shadow-md transition-all duration-200 ${
                  isEditing
                    ? 'border-[#292929] bg-[#E0D8D1]/20 shadow-lg ring-2 ring-[#E0D8D1]'
                    : 'border-[#E0D8D1] bg-white hover:shadow-lg'
                }`}>
                  {!isEditing ? (
                    // View Mode
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-inter font-semibold text-xl text-[#292929]">{profile.name || 'Unnamed Profile'}</h3>
                          <p className="font-poppins text-sm text-[#292929]/60">{profile.stages.length} stages defined</p>
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

                      {/* Stages Summary with Horizontal Scroll */}
                      <div className="overflow-x-auto -mx-4 px-4">
                        <div className="space-y-4 min-w-[1100px]">
                          {/* Header with Fixed Column Grid - Press On Branded */}
                          <div className="grid text-sm font-poppins font-bold text-white py-4 px-2 bg-[#292929] rounded-xl border border-[#292929]" style={{
                            gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px'
                          }}>
                            <div className="text-white px-3">Round</div>
                            <div className="text-white px-3 text-center">Size ($M)</div>
                            <div className="text-white px-3 text-center">Type</div>
                            <div className="text-white px-3 text-center">Valuation ($M)</div>
                            <div className="text-white px-3 text-center">ESOP (%)</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Grad (%)</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Mo to Grad</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Exit (%)</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Exit Val ($M)</div>
                          </div>

                          {/* Rows with Matching Fixed Column Grid */}
                          {profile.stages.map((stage: any, index: any) => (
                            <div key={stage.id} className="grid text-base py-4 px-2 bg-white rounded-xl border border-[#E0D8D1] hover:bg-[#F2F2F2] hover:border-[#292929] hover:shadow-md transition-all duration-200" style={{
                              gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px'
                            }}>
                              <div className="font-inter font-bold text-[#292929] text-lg px-3">{stage.name}</div>
                              <div className="font-poppins font-semibold text-[#292929] px-3 text-center tabular-nums">${stage.roundSize}M</div>
                              <div className="font-poppins text-[#292929]/70 px-3 text-center">{stage.valuationType}</div>
                              <div className="font-poppins font-semibold text-[#292929] px-3 text-center tabular-nums">${stage.valuation}M</div>
                              <div className="font-poppins font-semibold text-[#292929] px-3 text-center tabular-nums">{stage.esopPct}%</div>
                              <div className="font-poppins font-bold text-[#292929] px-3 text-center tabular-nums">{stage.graduationRate}%</div>
                              <div className="font-poppins font-bold text-[#292929] px-3 text-center tabular-nums">{stage.monthsToGraduate}mo</div>
                              <div className="font-poppins font-bold text-[#292929] px-3 text-center tabular-nums">{stage.exitRate}%</div>
                              <div className="font-poppins font-semibold text-[#292929] px-3 text-center tabular-nums">${stage.exitValuation}M</div>
                            </div>
                          ))}
                        </div>
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
                        <Label className="text-sm font-poppins font-medium text-[#292929]">Profile Name</Label>
                        <Input
                          value={profile.name}
                          onChange={(e: any) => handleUpdateProfile(profile.id, { name: e.target.value })}
                          placeholder="e.g., FinTech, HealthTech, Enterprise SaaS"
                          className="h-12 font-poppins border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929]"
                        />
                      </div>

                      {/* Stages Header */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-poppins font-medium text-[#292929]">Investment Stages</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddStage(profile.id)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Round
                          </Button>
                        </div>
                      </div>

                      {/* Stages with Fixed Column Grid Matching Headers - Scrollable */}
                      <div className="overflow-x-auto -mx-4 px-4">
                        <div className="space-y-4 min-w-[1220px]">
                          {/* Column Headers with Fixed Column Grid */}
                          <div className="grid text-base font-poppins font-bold text-white py-4 px-2 bg-[#292929] rounded-xl border border-[#292929]" style={{
                            gridTemplateColumns: '140px 100px 80px 120px 90px 90px 100px 90px 140px 120px'
                          }}>
                            <div className="text-white px-3">Round</div>
                            <div className="text-white px-3 text-center">Size ($M)</div>
                            <div className="text-white px-3 text-center">Type</div>
                            <div className="text-white px-3 text-center">Valuation ($M)</div>
                            <div className="text-white px-3 text-center">ESOP (%)</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Grad (%)</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Mo to Grad</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Exit (%)</div>
                            <div className="text-[#E0D8D1] px-3 text-center">Exit Val ($M)</div>
                            <div className="text-[#F2F2F2] px-3 text-center">Actions</div>
                          </div>
                        {profile.stages.map((stage: any, stageIndex: any) => (
                          <div key={stage.id} className="grid items-center py-4 px-2 bg-white rounded-xl border border-[#E0D8D1] shadow-sm hover:shadow-lg hover:border-[#292929] transition-all duration-200" style={{
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
                      </div>

                      {/* Important Considerations */}
                      <div className="bg-amber-50 border border-[#E0D8D1] rounded-xl p-4 shadow-sm">
                        <h4 className="font-inter font-bold text-[#292929] mb-2">Important Considerations</h4>
                        <ul className="font-poppins text-sm text-[#292929]/80 space-y-1">
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

            <Button
              onClick={handleAddProfile}
              variant="outline"
              className="w-full h-12 font-poppins font-medium border-[#E0D8D1] text-[#292929] hover:bg-[#E0D8D1]/20 hover:border-[#292929] transition-all duration-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Sector Profile
            </Button>
          </div>
        </div>

        {/* Pre-Recycling Validation Notice */}
        <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg">
          <p className="text-sm font-poppins text-blue-900 leading-relaxed">
            <strong>📊 Capital Allocation Validation:</strong> The estimated initial and follow-on capital
            shown above represent <strong>gross investable capital</strong> before recycling.
            These estimates do <strong>not yet factor in</strong>:
          </p>
          <ul className="mt-2 ml-6 text-sm font-poppins text-blue-800 space-y-1">
            <li>• Exit proceeds that may be recycled back into new investments</li>
            <li>• Management fees and fund expenses (configured in later steps)</li>
            <li>• Reserve allocation timing and deployment schedules</li>
          </ul>
          <p className="mt-3 text-sm font-poppins text-blue-900">
            <strong>Next:</strong> In Step 5 (Exit Recycling), you'll configure how exit proceeds
            are reinvested, which will adjust the final capital deployment schedule.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-[#E0D8D1] mt-8">
          <Button
            data-testid="previous-step"
            variant="outline"
            onClick={() => navigate('/fund-setup?step=3')}
            className="flex items-center gap-2 px-8 py-3 h-auto font-poppins font-medium border-[#E0D8D1] text-[#292929] hover:bg-[#E0D8D1]/20 hover:border-[#292929] transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            data-testid="next-step"
            onClick={() => navigate('/fund-setup?step=5')}
            className="flex items-center gap-2 bg-[#292929] hover:bg-[#292929]/90 text-white px-8 py-3 h-auto font-poppins font-medium transition-all duration-200"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}