/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import LiquidationPreferencesDialog from "./liquidation-preferences-dialog";
import { 
  TrendingUp, 
  TrendingDown, 
  Target,
  CheckCircle,
  Plus,
  Edit3
} from "lucide-react";

interface PerformanceCaseTabsProps {
  investment: {
    id: string;
    company: string;
    amount: number;
  };
}

interface Round {
  id: string;
  name: string;
  type: 'actual' | 'projected';
  date: string;
  investment: number;
  roundSize: number;
  reserved?: number;
  moic: number;
  irr: number;
  fmv: number;
  ownership: number;
  graduationRate?: number;
  hasProRata?: boolean;
}

interface PerformanceCase {
  id: string;
  name: string;
  probability: number;
  isActive: boolean;
  hasLiqPrefs?: boolean;
  rounds: Round[];
  exitValue?: number;
  exitDate?: string;
  exitProceeds?: number;
}

export default function PerformanceCaseTabs({ investment }: PerformanceCaseTabsProps) {
  const [activeCase, setActiveCase] = useState("base");
  const [showLiqPrefsDialog, setShowLiqPrefsDialog] = useState(false);
  const [selectedCase, setSelectedCase] = useState<PerformanceCase | null>(null);

  // Sample performance cases data
  const performanceCases: PerformanceCase[] = [
    {
      id: "default",
      name: "Default",
      probability: 100,
      isActive: true,
      rounds: [
        {
          id: "seed",
          name: "Seed",
          type: "actual",
          date: "Nov 2020",
          investment: 1542000,
          roundSize: 5000000,
          moic: 1.00,
          irr: 0,
          fmv: 1542000,
          ownership: 30.8,
          hasProRata: false
        },
        {
          id: "series-a",
          name: "Series A",
          type: "projected",
          date: "Jul 2024",
          investment: 616800,
          roundSize: 8000000,
          reserved: 300000,
          moic: 1.02,
          irr: 0.68,
          fmv: 1800000,
          ownership: 25.5,
          graduationRate: 50,
          hasProRata: true
        }
      ]
    },
    {
      id: "base",
      name: "Base",
      probability: 50,
      isActive: true,
      rounds: [
        {
          id: "series-a",
          name: "Series A",
          type: "actual",
          date: "May 2020",
          investment: 2428571,
          roundSize: 6071000,
          moic: 1.00,
          irr: 0,
          fmv: 2428571,
          ownership: 40.0,
          hasProRata: false
        },
        {
          id: "series-b",
          name: "Series B",
          type: "projected",
          date: "Jul 2024",
          investment: 0,
          roundSize: 12800000,
          moic: 1.65,
          irr: 12.72,
          fmv: 4000000,
          ownership: 35.2,
          hasProRata: false
        },
        {
          id: "exit",
          name: "Exit",
          type: "projected",
          date: "Jul 2030",
          investment: 0,
          roundSize: 0,
          moic: 2.13,
          irr: 7.72,
          fmv: 0,
          ownership: 0,
          hasProRata: false
        }
      ],
      exitValue: 120000000,
      exitProceeds: 5175000
    },
    {
      id: "downside",
      name: "Downside", 
      probability: 25,
      isActive: false,
      rounds: [
        {
          id: "series-a",
          name: "Series A",
          type: "actual", 
          date: "May 2020",
          investment: 2428571,
          roundSize: 6071000,
          moic: 1.00,
          irr: 0,
          fmv: 2428571,
          ownership: 40.0,
          hasProRata: false
        }
      ]
    },
    {
      id: "upside",
      name: "Upside",
      probability: 25,
      isActive: false,
      hasLiqPrefs: true,
      rounds: [
        {
          id: "series-a",
          name: "Series A",
          type: "actual",
          date: "Feb 2020",
          investment: 1736988,
          roundSize: 4500000,
          moic: 1.00,
          irr: 0,
          fmv: 1736988,
          ownership: 38.6,
          hasProRata: false
        },
        {
          id: "series-b",
          name: "Series B",
          type: "projected",
          date: "Jan 2026",
          investment: 624390,
          roundSize: 8000000,
          reserved: 500000,
          moic: 1.10,
          irr: 1.99,
          fmv: 2500000,
          ownership: 32.1,
          graduationRate: 50,
          hasProRata: true
        }
      ]
    }
  ];

  const currentCase = performanceCases.find(c => c.id === activeCase) || performanceCases[0]!;

  const handleLiqPrefs = (performanceCase: PerformanceCase) => {
    setSelectedCase(performanceCase);
    setShowLiqPrefsDialog(true);
  };

  const getRoundIcon = (round: Round) => {
    if (round.name === "Exit") return Target;
    if (round.type === "actual") return CheckCircle;
    return TrendingUp;
  };

  return (
    <div className="space-y-4">
      {/* Performance Case Tabs */}
      <Tabs value={activeCase} onValueChange={setActiveCase} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {performanceCases.map((performanceCase: any) => (
            <TabsTrigger 
              key={performanceCase.id} 
              value={performanceCase.id}
              className="relative"
            >
              <div className="text-center">
                <div className="font-medium">{performanceCase.name}</div>
                <div className="text-xs text-muted-foreground">
                  {performanceCase.probability}%
                </div>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab Content for each Performance Case */}
        {performanceCases.map((performanceCase: any) => (
          <TabsContent key={performanceCase.id} value={performanceCase.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-medium">{performanceCase.name} Case</h3>
                <Badge variant="outline">{performanceCase.probability}% probability</Badge>
                {performanceCase.hasLiqPrefs && (
                  <Badge variant="destructive" className="text-xs">Liq Prefs Active</Badge>
                )}
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => handleLiqPrefs(performanceCase)}
                >
                  <TrendingDown className="h-4 w-4 mr-1" />
                  Liq Prefs
                </Button>
                <Button variant="outline" size="sm">
                  <Edit3 className="h-4 w-4 mr-1" />
                  Edit Case
                </Button>
              </div>
            </div>

            {/* Rounds Display */}
            <div className="space-y-3">
              {performanceCase.rounds.map((round: any) => {
                const IconComponent = getRoundIcon(round);
                return (
                  <Card key={round.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2">
                            <IconComponent className={`h-5 w-5 ${
                              round.type === 'actual' ? 'text-green-600' : 
                              round.name === 'Exit' ? 'text-purple-600' : 'text-blue-600'
                            }`} />
                            <div>
                              <h4 className="font-medium">{round.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {round.date} • {round.type === 'actual' ? 'Actual' : 'Projected'}
                              </p>
                            </div>
                          </div>
                          {round.graduationRate && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              {round.graduationRate}%
                            </Badge>
                          )}
                          {round.hasProRata && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Pro-Rata
                            </Badge>
                          )}
                        </div>

                        <div className="text-right">
                          {round.name === "Exit" ? (
                            <div>
                              <p className="text-sm text-muted-foreground">Exit Value</p>
                              <p className="font-semibold">${(performanceCase.exitValue! / 1000000).toFixed(0)}mm</p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-muted-foreground">Investment</p>
                              <p className="font-semibold">${round.investment.toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <Separator className="my-3" />

                      {/* Round Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                        {round.name !== "Exit" && (
                          <>
                            {round.roundSize > 0 && (
                              <div>
                                <p className="text-muted-foreground">Round Size</p>
                                <p className="font-medium">${(round.roundSize / 1000000).toFixed(1)}M</p>
                              </div>
                            )}
                            {round.reserved && (
                              <div>
                                <p className="text-muted-foreground">Reserved</p>
                                <p className="font-medium">${round.reserved.toLocaleString()}</p>
                              </div>
                            )}
                          </>
                        )}
                        
                        <div>
                          <p className="text-muted-foreground">MOIC</p>
                          <p className="font-medium">{round.moic.toFixed(2)}x</p>
                        </div>
                        
                        <div>
                          <p className="text-muted-foreground">IRR</p>
                          <p className="font-medium">
                            {round.irr > 0 ? `${round.irr.toFixed(2)}%` : '-'}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-muted-foreground">FMV</p>
                          <p className="font-medium">
                            {round.fmv > 0 ? `$${(round.fmv / 1000000).toFixed(2)}M` : '-'}
                          </p>
                        </div>
                        
                        {round.name !== "Exit" && (
                          <div>
                            <p className="text-muted-foreground">Ownership</p>
                            <p className="font-medium">{round.ownership.toFixed(1)}%</p>
                          </div>
                        )}

                        {round.name === "Exit" && performanceCase.exitProceeds && (
                          <div>
                            <p className="text-muted-foreground">Exit Proceeds</p>
                            <p className="font-medium">${(performanceCase.exitProceeds / 1000000).toFixed(2)}M</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Add Round Button */}
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Round
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Liquidation Preferences Dialog */}
      <LiquidationPreferencesDialog
        isOpen={showLiqPrefsDialog}
        onOpenChange={setShowLiqPrefsDialog}
        investment={investment}
        {...(selectedCase !== null ? { performanceCase: {
          id: selectedCase.id,
          name: selectedCase.name
        } } : {})}
      />
    </div>
  );
}
