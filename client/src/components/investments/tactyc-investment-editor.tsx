/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { useFundContext } from "@/contexts/FundContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import FutureRoundsBuilder from "./future-rounds-builder";
import ExitValuationEditor from "./exit-valuation-editor";
import DealTagsEditor from "./deal-tags-editor";
import CustomFieldsEditor from '../custom-fields/custom-fields-editor';
import { CustomField } from '../custom-fields/custom-fields-manager';
import { 
  Building2, 
  DollarSign, 
  Calendar, 
  Users, 
  Tag, 
  Globe, 
  Edit3, 
  Plus, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Target,
  BarChart3,
  Info
} from "lucide-react";

interface PerformanceCase {
  id: string;
  name: string;
  probability: number;
  exitValuation: number;
  exitDate: string;
  rounds: InvestmentRound[];
}

interface InvestmentRound {
  id: string;
  type: string;
  date: string;
  amount: number;
  preMoneyValuation: number;
  postMoneyValuation: number;
  ownership: number;
  graduationRate: number;
  proRataParticipation: boolean;
  leadInvestor?: string;
  coInvestors: string[];
}

interface InvestmentData {
  id: string;
  name: string;
  url: string;
  sector: string;
  geography: string;
  tags: string[];
  managementTeam: string[];
  partners: string[];
  boardMembers: string[];
  coInvestors: string[];
  performanceCases: PerformanceCase[];
  activeCase: string;
}

interface TactycInvestmentEditorProps {
  profileId?: string;
  entryRound?: string;
  onComplete?: () => void;
}

const sectorProfiles = [
  { id: 'default', name: 'Default Profile' },
  { id: 'enterprise-saas', name: 'Enterprise SaaS Profile' },
  { id: 'fintech', name: 'FinTech Profile' },
  { id: 'marketplace', name: 'Marketplace Profile' },
  { id: 'healthcare', name: 'Healthcare Profile' }
];

export default function TactycInvestmentEditor({ profileId, entryRound, onComplete }: TactycInvestmentEditorProps) {
  const { currentFund } = useFundContext();
  const [investment, setInvestment] = useState<InvestmentData>({
    id: 'new-investment',
    name: '',
    url: '',
    sector: profileId === 'fintech' ? 'FinTech' : profileId === 'enterprise-saas' ? 'Enterprise SaaS' : 'Technology',
    geography: 'United States',
    tags: [],
    managementTeam: [],
    partners: [],
    boardMembers: [],
    coInvestors: [],
    performanceCases: [
      {
        id: 'base-case',
        name: 'Base Case',
        probability: 50,
        exitValuation: 3000000000, // $3B exit
        exitDate: '2030-06-15',
        rounds: [
          {
            id: entryRound?.toLowerCase().replace(/\s+/g, '-') || 'seed',
            type: entryRound || 'Seed',
            date: '',
            amount: 0,
            preMoneyValuation: 0,
            postMoneyValuation: 0,
            ownership: 0,
            graduationRate: 65,
            proRataParticipation: false,
            leadInvestor: '',
            coInvestors: []
          },
          {
            id: 'series-a',
            type: 'Series A',
            date: '2025-06-15',
            amount: 0, // Pro-rata participation
            preMoneyValuation: 25000000,
            postMoneyValuation: 35000000,
            ownership: 14.3,
            graduationRate: 70,
            proRataParticipation: true,
            leadInvestor: 'Growth VC',
            coInvestors: ['Co-Investor B']
          },
          {
            id: 'series-b',
            type: 'Series B',
            date: '2027-03-15',
            amount: 0, // Pro-rata participation
            preMoneyValuation: 75000000,
            postMoneyValuation: 100000000,
            ownership: 10.0,
            graduationRate: 45,
            proRataParticipation: true,
            leadInvestor: 'Late Stage VC',
            coInvestors: ['Co-Investor C']
          }
        ]
      },
      {
        id: 'downside-case',
        name: 'Downside Case',
        probability: 10,
        exitValuation: 0,
        exitDate: '2025-12-31',
        rounds: [
          {
            id: 'seed',
            type: 'Seed',
            date: '2024-01-15',
            amount: 2000000,
            preMoneyValuation: 8000000,
            postMoneyValuation: 10000000,
            ownership: 20.0,
            graduationRate: 0, // Fails to graduate
            proRataParticipation: false,
            leadInvestor: 'Lead VC',
            coInvestors: []
          }
        ]
      },
      {
        id: 'upside-case',
        name: 'Upside Case',
        probability: 40,
        exitValuation: 3000000000,
        exitDate: '2029-12-31',
        rounds: [
          {
            id: 'seed',
            type: 'Seed',
            date: '2024-01-15',
            amount: 2000000,
            preMoneyValuation: 8000000,
            postMoneyValuation: 10000000,
            ownership: 20.0,
            graduationRate: 85, // Higher graduation rates
            proRataParticipation: true,
            leadInvestor: 'Lead VC',
            coInvestors: ['Co-Investor A']
          },
          {
            id: 'series-a',
            type: 'Series A',
            date: '2025-06-15',
            amount: 0,
            preMoneyValuation: 25000000,
            postMoneyValuation: 35000000,
            ownership: 14.3,
            graduationRate: 90, // Higher graduation rates
            proRataParticipation: true,
            leadInvestor: 'Growth VC',
            coInvestors: ['Co-Investor B']
          }
        ]
      }
    ],
    activeCase: 'base-case'
  });

  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [showAddRound, setShowAddRound] = useState(false);
  const [showFutureRounds, setShowFutureRounds] = useState(false);
  const [showExitEditor, setShowExitEditor] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true); // Start in edit mode for new investments

  const activeCase = investment.performanceCases.find(c => c.id === investment.activeCase) || investment.performanceCases[0];

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatOwnership = (ownership: number) => `${ownership.toFixed(1)}%`;

  const handleEditRound = (roundId: string) => {
    setEditingRound(roundId);
  };

  const handleReserveProRata = (roundId: string) => {
    // Auto-calculate reserves needed for pro-rata participation
    console.log(`Reserving pro-rata for round: ${roundId}`);
  };

  const handleBuildFutureRounds = (config: any) => {
    // Generate future rounds based on sector profile and configuration
    const newRounds = generateFutureRounds(config);
    const updatedCases = investment.performanceCases.map(case_ => 
      case_.id === investment.activeCase 
        ? { ...case_, rounds: [...case_.rounds, ...newRounds] }
        : case_
    );
    setInvestment(prev => ({ 
      ...prev, 
      performanceCases: updatedCases 
    }));
  };

  const generateFutureRounds = (config: any): InvestmentRound[] => {
    // Sample future rounds generation based on sector profile
    const baseGraduationRate = config.graduationRate === 'sector-based' ? 65 : 
                              config.graduationRate === 'high' ? 85 :
                              config.graduationRate === 'medium' ? 65 : 45;
    
    const futureRounds: InvestmentRound[] = [];
    const roundSequence: string[] = ['Series A', 'Series B', 'Series C', 'Series D'];
    let currentDate = new Date(config.nextRoundDate);
    
    for (let i = 0; i < roundSequence.length; i++) {
      const roundName = roundSequence[i];
      if (!roundName) continue; // This should never happen, but satisfies TypeScript
      
      const dateStr = currentDate.toISOString().split('T')[0] || '';
      
      futureRounds.push({
        id: roundName.toLowerCase().replace(/\s+/g, '-'),
        type: roundName,
        date: dateStr,
        amount: 0, // To be filled by pro-rata participation
        preMoneyValuation: 25000000 * Math.pow(2.5, i), // Sample escalating valuations
        postMoneyValuation: 35000000 * Math.pow(2.5, i),
        ownership: 20 / Math.pow(1.4, i + 1), // Dilution over rounds
        graduationRate: Math.max(baseGraduationRate - (i * 10), 25), // Decreasing graduation rates
        proRataParticipation: false,
        leadInvestor: '',
        coInvestors: []
      });
      
      // Add 18 months between rounds
      currentDate.setMonth(currentDate.getMonth() + 18);
    }
    
    return futureRounds;
  };

  const handleUpdateExitValuation = (valuation: number, date: string, notes: string, multiple: string) => {
    const updatedCases = investment.performanceCases.map(case_ => 
      case_.id === investment.activeCase 
        ? { ...case_, exitValuation: valuation, exitDate: date, notes, multiple }
        : case_
    );
    setInvestment(prev => ({ 
      ...prev, 
      performanceCases: updatedCases 
    }));
  };

  const RoundCard = ({ round }: { round: InvestmentRound }) => (
    <Card className="mb-4">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{round.type} Round</CardTitle>
              <CardDescription>{round.date}</CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={round.graduationRate > 50 ? "default" : "secondary"}>
              {round.graduationRate}% Graduation
            </Badge>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => handleEditRound(round.id)}
            >
              <Edit3 className="h-4 w-4 mr-1" />
              Edit Event
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-sm text-gray-500">Investment Amount</Label>
            <div className="font-bold text-lg">{formatCurrency(round.amount)}</div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Pre-Money Valuation</Label>
            <div className="font-bold text-lg">{formatCurrency(round.preMoneyValuation)}</div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Post-Money Valuation</Label>
            <div className="font-bold text-lg">{formatCurrency(round.postMoneyValuation)}</div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Ownership</Label>
            <div className="font-bold text-lg">{formatOwnership(round.ownership)}</div>
          </div>
        </div>
        
        {round.proRataParticipation && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Target className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Pro-Rata Reserved</span>
              </div>
              <Button 
                size="sm" 
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleReserveProRata(round.id)}
              >
                Reserve Pro-Rata
              </Button>
            </div>
          </div>
        )}

        {round.leadInvestor && (
          <div className="mt-4">
            <Label className="text-sm text-gray-500">Lead Investor</Label>
            <div className="text-sm font-medium">{round.leadInvestor}</div>
          </div>
        )}

        {round.coInvestors.length > 0 && (
          <div className="mt-2">
            <Label className="text-sm text-gray-500">Co-Investors</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {round.coInvestors.map((investor, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {investor}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const PerformanceCaseSelector = () => (
    <div className="flex items-center space-x-4 mb-6">
      <Label className="text-sm font-medium">Performance Case:</Label>
      <div className="flex space-x-2">
        {investment.performanceCases.map((case_) => (
          <Button
            key={case_.id}
            variant={investment.activeCase === case_.id ? "default" : "outline"}
            size="sm"
            onClick={() => setInvestment(prev => ({ ...prev, activeCase: case_.id }))}
          >
            {case_.name} ({case_.probability}%)
          </Button>
        ))}
      </div>
      <Button size="sm" variant="outline">
        <Plus className="h-4 w-4 mr-1" />
        Add Case
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Investment Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-2xl">{investment.name}</CardTitle>
                <CardDescription>
                  {investment.sector} • {investment.geography}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {!isEditMode && (
                <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit Investment
                </Button>
              )}
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
              {isEditMode && (
                <Button size="sm" onClick={() => { setIsEditMode(false); onComplete?.(); }}>
                  Save Investment
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEditMode ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="investment-name">Investment Name *</Label>
                  <Input
                    id="investment-name"
                    value={investment.name}
                    onChange={(e) => setInvestment(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter company name"
                    className="border-yellow-300 bg-yellow-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website URL</Label>
                  <Input
                    id="website"
                    value={investment.url}
                    onChange={(e) => setInvestment(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://company.com"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sector">Sector</Label>
                  <Input
                    id="sector"
                    value={investment.sector}
                    onChange={(e) => setInvestment(prev => ({ ...prev, sector: e.target.value }))}
                    placeholder="Enter sector"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="geography">Geography</Label>
                  <Input
                    id="geography"
                    value={investment.geography}
                    onChange={(e) => setInvestment(prev => ({ ...prev, geography: e.target.value }))}
                    placeholder="Enter geography"
                  />
                </div>
                <div className="md:col-span-3">
                  <DealTagsEditor
                    selectedTags={investment.tags}
                    onTagsChange={(tags) => setInvestment(prev => ({ ...prev, tags }))}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="management">Management Team</Label>
                  <Textarea
                    id="management"
                    value={investment.managementTeam.join('\n')}
                    onChange={(e) => setInvestment(prev => ({ 
                      ...prev, 
                      managementTeam: e.target.value.split('\n').filter(Boolean)
                    }))}
                    placeholder="CEO: John Smith&#10;CTO: Jane Doe"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partners">Partners</Label>
                  <Textarea
                    id="partners"
                    value={investment.partners.join('\n')}
                    onChange={(e) => setInvestment(prev => ({ 
                      ...prev, 
                      partners: e.target.value.split('\n').filter(Boolean)
                    }))}
                    placeholder="Partner A&#10;Partner B"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label className="text-sm text-gray-500">Website</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Globe className="h-4 w-4 text-gray-400" />
                  {investment.url ? (
                    <a href={investment.url} className="text-blue-600 hover:underline text-sm">
                      {investment.url}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">No website provided</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {investment.tags.length > 0 ? investment.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  )) : (
                    <span className="text-gray-400 text-sm">No tags</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Management Team</Label>
                <div className="text-sm mt-1">
                  {investment.managementTeam.length > 0 ? 
                    investment.managementTeam.join(', ') : 
                    <span className="text-gray-400">Not specified</span>
                  }
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Cases */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Cases</CardTitle>
          <CardDescription>
            Model different outcome scenarios for this investment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Performance Case Tabs */}
          <Tabs defaultValue="case-notes" className="w-full mb-6">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="case-notes">Case Notes</TabsTrigger>
              <TabsTrigger value="marketintel">MarketIntel</TabsTrigger>
              <TabsTrigger value="future">Future</TabsTrigger>
              <TabsTrigger value="clone">Clone</TabsTrigger>
              <TabsTrigger value="sync">Sync</TabsTrigger>
              <TabsTrigger value="liq-prefs">Liq Prefs</TabsTrigger>
              <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
            </TabsList>
            
            <TabsContent value="case-notes" className="mt-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Add notes and comments for this performance case...</p>
              </div>
            </TabsContent>
            
            <TabsContent value="marketintel" className="mt-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Market intelligence and comparable company data...</p>
              </div>
            </TabsContent>
            
            <TabsContent value="future" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Future Rounds Builder</h3>
                    <p className="text-sm text-gray-600">Generate future funding rounds based on sector profiles</p>
                  </div>
                  <Button 
                    onClick={() => setShowFutureRounds(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Build Future Rounds
                  </Button>
                </div>
                
                <div className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Current future rounds configuration:</p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>• Sector Profile: {profileId ? sectorProfiles.find(p => p.id === profileId)?.name || 'Default' : 'Default'}</li>
                    <li>• Entry Round: {entryRound || 'Seed'}</li>
                    <li>• Total Rounds: {activeCase.rounds.length}</li>
                    <li>• Future Rounds: {activeCase.rounds.filter(r => new Date(r.date) > new Date()).length}</li>
                  </ul>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="clone" className="mt-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Clone this performance case to create variations...</p>
              </div>
            </TabsContent>
            
            <TabsContent value="sync" className="mt-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Sync data with external sources...</p>
              </div>
            </TabsContent>
            
            <TabsContent value="liq-prefs" className="mt-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Liquidation preferences and waterfall configuration...</p>
              </div>
            </TabsContent>
            
            <TabsContent value="custom-fields" className="mt-4">
              <CustomFieldsEditor
                fields={[
                  { id: 'field-1', name: 'Internal Status', type: 'color' },
                  { id: 'field-2', name: 'Founding Year', type: 'number' },
                  { id: 'field-3', name: 'Strategic Tags', type: 'tags' },
                  { id: 'field-4', name: 'Deal Source', type: 'text' },
                  { id: 'field-5', name: 'Investment Date', type: 'date' },
                ]}
                values={[
                  { fieldId: 'field-1', value: '#22c55e' },
                  { fieldId: 'field-2', value: 2020 },
                  { fieldId: 'field-3', value: ['High Growth', 'Strategic'] },
                  { fieldId: 'field-4', value: 'Partner Network' },
                ]}
                onValuesChange={(values) => {
                  console.log('Custom field values updated:', values);
                }}
              />
            </TabsContent>
            
            <TabsContent value="results" className="mt-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Performance results and calculations...</p>
              </div>
            </TabsContent>
          </Tabs>
          <PerformanceCaseSelector />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => setShowExitEditor(true)}>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700">
                    {formatCurrency(activeCase.exitValuation)}
                  </div>
                  <div className="text-blue-600 text-sm">Exit Valuation</div>
                  <div className="text-blue-500 text-xs">{activeCase.exitDate}</div>
                  <div className="text-xs text-blue-400 mt-1">Click to edit</div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">
                    {activeCase.probability}%
                  </div>
                  <div className="text-green-600 text-sm">Probability</div>
                  <div className="text-green-500 text-xs">Of This Outcome</div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-700">
                    {activeCase.rounds.length}
                  </div>
                  <div className="text-purple-600 text-sm">Total Rounds</div>
                  <div className="text-purple-500 text-xs">Funding Events</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fund Date Warning */}
          {new Date(activeCase.exitDate) > new Date('2029-12-31') && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <Info className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-700">
                  <p className="font-medium">After Fund Date</p>
                  <p>This exit occurs after the fund end date. Consider extending fund term or adjusting exit timeline.</p>
                </div>
              </div>
            </div>
          )}

          {/* Investment Rounds */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Investment Rounds</h3>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowAddRound(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Next Round
              </Button>
            </div>
            
            {activeCase.rounds.map((round) => (
              <RoundCard key={round.id} round={round} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Future Rounds Builder Dialog */}
      <FutureRoundsBuilder
        open={showFutureRounds}
        onOpenChange={setShowFutureRounds}
        onBuildRounds={handleBuildFutureRounds}
      />

      {/* Exit Valuation Editor Dialog */}
      <ExitValuationEditor
        open={showExitEditor}
        onOpenChange={setShowExitEditor}
        currentValuation={activeCase.exitValuation}
        currentDate={activeCase.exitDate}
        onUpdateExit={handleUpdateExitValuation}
      />

      {/* Additional Investment Information */}
      <Card>
        <CardHeader>
          <CardTitle>Investment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-gray-700">Partners</Label>
              <div className="mt-2 space-y-1">
                {investment.partners.map((partner, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{partner}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium text-gray-700">Board Members</Label>
              <div className="mt-2 space-y-1">
                {investment.boardMembers.map((member, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{member}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
