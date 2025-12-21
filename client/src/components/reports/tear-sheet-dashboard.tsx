/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  Filter, 
  Download, 
  Edit3, 
  History, 
  FileText,
  ExternalLink,
  User,
  Clock,
  Save,
  X
} from 'lucide-react';

interface TearSheet {
  id: string;
  companyId: string;
  companyName: string;
  sector: string;
  stage: string;
  lastModified: string;
  modifiedBy: string;
  version: number;
  status: 'draft' | 'review' | 'published';
  data: {
    website: string;
    fiscalYear: string;
    location: string;
    investmentLead: string;
    percentOfFund: string;
    classification: string;
    collection: string;
    expectedExitValue: string;
    founderMaturity: string;
    boardComposition: string[];
    coInvestors: string[];
    dealTeamNotes: string;
    factorRating: string;
    health: string;
    likeCompany: string;
    parentEntity: string;
    proRata: string;
    revenueNotes: string;
  };
  commentary: {
    id: string;
    content: string;
    author: string;
    createdAt: string;
    version: number;
    previousAnswer?: string;
  };
  contacts: {
    name: string;
    role: string;
    initial: string;
    color: string;
  }[];
}

interface AuditLogEntry {
  id: string;
  tearSheetId: string;
  companyName: string;
  action: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  author: string;
  timestamp: string;
  version: number;
}

// Mock data - in real app, this would come from API
const MOCK_TEAR_SHEETS: TearSheet[] = [
  {
    id: 'ts-1',
    companyId: 'comp-1',
    companyName: 'AirChair',
    sector: 'SaaS',
    stage: 'Series A',
    lastModified: '2025-01-20T15:30:00Z',
    modifiedBy: 'Ethan Finkel',
    version: 3,
    status: 'published',
    data: {
      website: 'http://www.airchair.com',
      fiscalYear: '12/31',
      location: 'San Francisco, CA',
      investmentLead: 'Lane Altbaum',
      percentOfFund: '11.47%',
      classification: 'Core',
      collection: 'Offset',
      expectedExitValue: '$1B',
      founderMaturity: "Doesn't know anything",
      boardComposition: ['David', 'Jackson', 'Chloe'],
      coInvestors: ['Pier 5 Ventures', 'The Best VC Firm', 'JMK Capital', 'Ethan Finkel', 'Miller and Associates'],
      dealTeamNotes: 'Example of deal team notes',
      factorRating: 'High',
      health: "Jury's Out",
      likeCompany: 'Like',
      parentEntity: 'SPV [',
      proRata: 'Super Pro Rata',
      revenueNotes: ''
    },
    commentary: {
      id: 'comm-1',
      content: 'While the competitive landscape is evolving, their speed of execution, product depth, and growing brand recognition make it a strong contender in the category.',
      author: 'Ethan Finkel',
      createdAt: '2025-01-20T15:30:00Z',
      version: 2,
      previousAnswer: 'Great - Really think the CEO is doing a great job with hiring SWEs.'
    },
    contacts: [
      { name: 'Ethan Finkel', role: 'Solutions Architect', initial: 'E', color: 'bg-blue-600' },
      { name: 'Xiaozhou Wang', role: '', initial: 'X', color: 'bg-teal-600' },
      { name: 'Ann Demirtjis', role: 'CEO', initial: 'A', color: 'bg-green-600' }
    ]
  },
  {
    id: 'ts-2',
    companyId: 'comp-2',
    companyName: 'DataFlow Systems',
    sector: 'Enterprise',
    stage: 'Seed',
    lastModified: '2025-01-19T10:15:00Z',
    modifiedBy: 'Sarah Chen',
    version: 1,
    status: 'draft',
    data: {
      website: 'http://www.dataflow.io',
      fiscalYear: '12/31',
      location: 'Austin, TX',
      investmentLead: 'Sarah Chen',
      percentOfFund: '2.3%',
      classification: 'Growth',
      collection: 'Core',
      expectedExitValue: '$500M',
      founderMaturity: 'Experienced',
      boardComposition: ['Sarah', 'Mike', 'Jennifer'],
      coInvestors: ['Austin Ventures', 'Scale Venture Partners'],
      dealTeamNotes: 'Strong technical team with enterprise sales experience',
      factorRating: 'Medium',
      health: 'Healthy',
      likeCompany: 'Love',
      parentEntity: 'Direct',
      proRata: 'Pro Rata',
      revenueNotes: 'ARR growing 15% month-over-month'
    },
    commentary: {
      id: 'comm-2',
      content: 'Exceptional product-market fit with enterprise customers showing strong adoption rates. Technical differentiation is clear.',
      author: 'Sarah Chen',
      createdAt: '2025-01-19T10:15:00Z',
      version: 1
    },
    contacts: [
      { name: 'Sarah Chen', role: 'Partner', initial: 'S', color: 'bg-purple-600' },
      { name: 'Mike Rodriguez', role: 'CTO', initial: 'M', color: 'bg-orange-600' }
    ]
  }
];

const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: 'audit-1',
    tearSheetId: 'ts-1',
    companyName: 'AirChair',
    action: 'Commentary Updated',
    field: 'Company Sentiment',
    oldValue: 'Great - Really think the CEO is doing a great job with hiring SWEs.',
    newValue: 'While the competitive landscape is evolving, their speed of execution, product depth, and growing brand recognition make it a strong contender in the category.',
    author: 'Ethan Finkel',
    timestamp: '2025-01-20T15:30:00Z',
    version: 3
  },
  {
    id: 'audit-2',
    tearSheetId: 'ts-1',
    companyName: 'AirChair',
    action: 'Field Updated',
    field: 'Health Status',
    oldValue: 'Healthy',
    newValue: "Jury's Out",
    author: 'Lane Altbaum',
    timestamp: '2025-01-20T14:22:00Z',
    version: 2
  },
  {
    id: 'audit-3',
    tearSheetId: 'ts-2',
    companyName: 'DataFlow Systems',
    action: 'Tear Sheet Created',
    field: 'Initial Creation',
    author: 'Sarah Chen',
    timestamp: '2025-01-19T10:15:00Z',
    version: 1
  }
];

export default function TearSheetDashboard() {
  const [tearSheets, setTearSheets] = useState<TearSheet[]>(MOCK_TEAR_SHEETS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTearSheet, setSelectedTearSheet] = useState<TearSheet | null>(null);
  const [isEditingCommentary, setIsEditingCommentary] = useState(false);
  const [commentaryDraft, setCommentaryDraft] = useState('');
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(MOCK_AUDIT_LOG);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  // Filter tear sheets based on search and filters
  const filteredTearSheets = tearSheets.filter(sheet => {
    const matchesSearch = sheet.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sheet.sector.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = selectedSector === 'all' || sheet.sector === selectedSector;
    const matchesStatus = selectedStatus === 'all' || sheet.status === selectedStatus;
    
    return matchesSearch && matchesSector && matchesStatus;
  });

  const handleCommentaryEdit = (tearSheet: TearSheet) => {
    setSelectedTearSheet(tearSheet);
    setCommentaryDraft(tearSheet.commentary.content);
    setIsEditingCommentary(true);
  };

  const saveCommentary = () => {
    if (!selectedTearSheet) return;

    const updatedTearSheet = {
      ...selectedTearSheet,
      commentary: {
        ...selectedTearSheet.commentary,
        previousAnswer: selectedTearSheet.commentary.content,
        content: commentaryDraft,
        version: selectedTearSheet.commentary.version + 1,
        createdAt: new Date().toISOString()
      },
      version: selectedTearSheet.version + 1,
      lastModified: new Date().toISOString(),
      modifiedBy: 'Current User' // In real app, get from auth context
    };

    setTearSheets(prev => 
      prev.map(sheet => 
        sheet.id === selectedTearSheet.id ? updatedTearSheet : sheet
      )
    );

    // Add audit log entry
    const auditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      tearSheetId: selectedTearSheet.id,
      companyName: selectedTearSheet.companyName,
      action: 'Commentary Updated',
      field: 'Company Sentiment',
      oldValue: selectedTearSheet.commentary.content,
      newValue: commentaryDraft,
      author: 'Current User',
      timestamp: new Date().toISOString(),
      version: updatedTearSheet.version
    };

    setAuditLog(prev => [auditEntry, ...prev]);
    setIsEditingCommentary(false);
    setSelectedTearSheet(null);
  };

  const exportToPDF = (tearSheet: TearSheet) => {
    // In real app, this would generate and download PDF
    console.log('Exporting to PDF:', tearSheet.companyName);
  };

  const renderTearSheetCard = (tearSheet: TearSheet) => (
    <Card key={tearSheet.id} className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {tearSheet.companyName.charAt(0)}
              </span>
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {tearSheet.companyName}
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </CardTitle>
              <p className="text-sm text-gray-600">
                as of March 31, 2025
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={tearSheet.status === 'published' ? 'default' : 'secondary'}>
              v{tearSheet.version}
            </Badge>
            <Badge variant="outline">
              {tearSheet.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Company Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs uppercase">Fiscal Year</div>
            <div className="font-medium">{tearSheet.data.fiscalYear}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Location</div>
            <div className="font-medium">{tearSheet.data.location}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Investment Lead</div>
            <div className="font-medium">{tearSheet.data.investmentLead}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">% of Fund</div>
            <div className="font-medium">{tearSheet.data.percentOfFund}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Classification</div>
            <Badge variant="outline">{tearSheet.data.classification}</Badge>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Expected Exit Value</div>
            <div className="font-medium">{tearSheet.data.expectedExitValue}</div>
          </div>
        </div>

        {/* Board Composition */}
        <div>
          <div className="text-gray-500 text-xs uppercase mb-2">Board Composition</div>
          <div className="flex flex-wrap gap-1">
            {tearSheet.data.boardComposition.map((member: any, idx: any) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {member}
              </Badge>
            ))}
          </div>
        </div>

        {/* Co-Investors */}
        <div>
          <div className="text-gray-500 text-xs uppercase mb-2">Co-Investors</div>
          <div className="flex flex-wrap gap-1">
            {tearSheet.data.coInvestors.map((investor: any, idx: any) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {investor}
              </Badge>
            ))}
          </div>
        </div>

        {/* Contacts */}
        <div className="flex items-center justify-between">
          <div className="text-gray-500 text-xs uppercase">Contact</div>
          <div className="flex items-center space-x-2">
            {tearSheet.contacts.map((contact: any, idx: any) => (
              <div key={idx} className="flex items-center space-x-1">
                <div className={`w-6 h-6 rounded-full ${contact.color} text-white text-xs flex items-center justify-center`}>
                  {contact.initial}
                </div>
                <div className="text-sm">
                  <div className="font-medium">{contact.name}</div>
                  {contact.role && <div className="text-gray-500 text-xs">{contact.role}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Company Sentiment */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Company Sentiment</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCommentaryEdit(tearSheet)}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </div>
          
          {tearSheet.commentary.previousAnswer && (
            <div className="mb-2 p-2 bg-gray-50 rounded text-sm">
              <div className="text-gray-500 text-xs mb-1">Previous answer (as of Q4 2024)</div>
              <div className="italic">{tearSheet.commentary.previousAnswer}</div>
            </div>
          )}
          
          <div className="p-3 bg-blue-50 rounded">
            <p className="text-sm">{tearSheet.commentary.content}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <User className="h-3 w-3" />
            <span>Modified by {tearSheet.modifiedBy}</span>
            <Clock className="h-3 w-3 ml-2" />
            <span>{new Date(tearSheet.lastModified).toLocaleDateString()}</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setShowAuditTrail(true)}>
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToPDF(tearSheet)}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tear Sheets</h1>
          <p className="text-gray-600">Portfolio company tear sheets with LP commentary and audit trails</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Create Tear Sheet
          </Button>
          <Button>
            <Download className="h-4 w-4 mr-2" />
            Export All
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
          <Input
            placeholder="Search companies, sectors, or team members..."
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={selectedSector} onValueChange={setSelectedSector}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sectors</SelectItem>
              <SelectItem value="SaaS">SaaS</SelectItem>
              <SelectItem value="Enterprise">Enterprise</SelectItem>
              <SelectItem value="FinTech">FinTech</SelectItem>
              <SelectItem value="HealthTech">HealthTech</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Showing {filteredTearSheets.length} of {tearSheets.length} tear sheets
        </p>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            More Filters
          </Button>
        </div>
      </div>

      {/* Tear Sheets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredTearSheets.map(renderTearSheetCard)}
      </div>

      {/* Commentary Edit Dialog */}
      <Dialog open={isEditingCommentary} onOpenChange={setIsEditingCommentary}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Company Sentiment</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedTearSheet?.commentary.previousAnswer && (
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm font-medium mb-2">Previous Answer</div>
                <p className="text-sm italic">{selectedTearSheet.commentary.previousAnswer}</p>
              </div>
            )}
            
            <div>
              <label className="text-sm font-medium mb-2 block">Current Commentary</label>
              <Textarea
                value={commentaryDraft}
                onChange={(e: any) => setCommentaryDraft(e.target.value)}
                placeholder="Enter your commentary about this company..."
                rows={6}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Version {selectedTearSheet?.commentary.version || 1} • 
                Last updated {selectedTearSheet?.commentary.createdAt ? new Date(selectedTearSheet.commentary.createdAt).toLocaleDateString() : 'Never'}
              </div>
              
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={() => setIsEditingCommentary(false)}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={saveCommentary}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Commentary
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit Trail Dialog */}
      <Dialog open={showAuditTrail} onOpenChange={setShowAuditTrail}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Trail</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {auditLog.map((entry: any) => (
              <div key={entry.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">
                    {entry.companyName} - {entry.action}
                  </div>
                  <Badge variant="outline">v{entry.version}</Badge>
                </div>
                
                <div className="text-sm text-gray-600 mb-2">
                  {entry.field} updated by {entry.author} on {new Date(entry.timestamp).toLocaleString()}
                </div>
                
                {entry.oldValue && entry.newValue && (
                  <div className="space-y-2">
                    <div className="p-2 bg-red-50 rounded border-l-2 border-red-300">
                      <div className="text-xs text-red-600 font-medium">Previous Value:</div>
                      <div className="text-sm">{entry.oldValue}</div>
                    </div>
                    <div className="p-2 bg-green-50 rounded border-l-2 border-green-300">
                      <div className="text-xs text-green-600 font-medium">New Value:</div>
                      <div className="text-sm">{entry.newValue}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
