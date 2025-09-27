/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Search, 
  Filter, 
  Download, 
  Plus, 
  ArrowUpDown,
  Tag,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';

interface Investment {
  id: string;
  name: string;
  sector: string;
  stage: string;
  tags: string[];
  totalInvested: number;
  currentValue: number;
  moic: number;
  irr: number;
  ownershipPercentage: number;
  lastRound: string;
  status: 'Active' | 'Exited' | 'Written Off';
  partnerLead: string;
  dateInvested: string;
}

// Enhanced mock data with deal tags
const MOCK_INVESTMENTS: Investment[] = [
  {
    id: 'inv-1',
    name: 'AlphaTech',
    sector: 'SaaS',
    stage: 'Series A',
    tags: ['Governance', 'Warehoused'],
    totalInvested: 1250000,
    currentValue: 2100000,
    moic: 1.68,
    irr: 25.3,
    ownershipPercentage: 8.5,
    lastRound: 'Series A',
    status: 'Active',
    partnerLead: 'Jane Smith',
    dateInvested: '2023-03-15'
  },
  {
    id: 'inv-2',
    name: 'Amplio',
    sector: 'FinTech',
    stage: 'Seed',
    tags: ['Female Founder'],
    totalInvested: 750000,
    currentValue: 1200000,
    moic: 1.60,
    irr: 32.1,
    ownershipPercentage: 12.3,
    lastRound: 'Seed',
    status: 'Active',
    partnerLead: 'John Davis',
    dateInvested: '2023-07-22'
  },
  {
    id: 'inv-3',
    name: 'CatalystLabs',
    sector: 'AI/ML',
    stage: 'Pre-Seed',
    tags: ['AI/ML', 'Female Founder'],
    totalInvested: 500000,
    currentValue: 850000,
    moic: 1.70,
    irr: 45.2,
    ownershipPercentage: 15.2,
    lastRound: 'Pre-Seed',
    status: 'Active',
    partnerLead: 'Sarah Wilson',
    dateInvested: '2024-01-10'
  },
  {
    id: 'inv-4',
    name: 'CybrosX2',
    sector: 'Security',
    stage: 'Series B',
    tags: ['Environmental'],
    totalInvested: 2000000,
    currentValue: 3400000,
    moic: 1.70,
    irr: 28.9,
    ownershipPercentage: 5.8,
    lastRound: 'Series B',
    status: 'Active',
    partnerLead: 'Mike Chen',
    dateInvested: '2022-11-05'
  },
  {
    id: 'inv-5',
    name: 'DigitalWave',
    sector: 'Consumer',
    stage: 'Seed',
    tags: ['Minority Founder'],
    totalInvested: 800000,
    currentValue: 1000000,
    moic: 1.25,
    irr: 15.7,
    ownershipPercentage: 10.1,
    lastRound: 'Seed',
    status: 'Active',
    partnerLead: 'Alex Rodriguez',
    dateInvested: '2023-09-18'
  },
  {
    id: 'inv-6',
    name: 'EchelonTech',
    sector: 'Enterprise',
    stage: 'Series A',
    tags: ['Governance', 'Asia'],
    totalInvested: 1500000,
    currentValue: 2250000,
    moic: 1.50,
    irr: 22.4,
    ownershipPercentage: 7.2,
    lastRound: 'Series A',
    status: 'Active',
    partnerLead: 'Lisa Zhang',
    dateInvested: '2023-05-30'
  },
  {
    id: 'inv-7',
    name: 'Glyphic',
    sector: 'Design Tools',
    stage: 'Seed',
    tags: ['Social', 'Female Founder'],
    totalInvested: 600000,
    currentValue: 420000,
    moic: 0.70,
    irr: -12.5,
    ownershipPercentage: 11.8,
    lastRound: 'Seed',
    status: 'Written Off',
    partnerLead: 'Tom Anderson',
    dateInvested: '2022-08-12'
  },
  {
    id: 'inv-8',
    name: 'InnovateLabs',
    sector: 'DeepTech',
    stage: 'Series A',
    tags: ['AI/ML', 'Asia', 'General'],
    totalInvested: 1800000,
    currentValue: 4200000,
    moic: 2.33,
    irr: 38.6,
    ownershipPercentage: 6.9,
    lastRound: 'Series A',
    status: 'Active',
    partnerLead: 'David Kim',
    dateInvested: '2022-12-03'
  }
];

// All available tags from the predefined list
const ALL_TAGS = [
  'Asia', 'CSR', 'Environmental', 'Female Founder', 'General', 'Governance',
  'Loan', 'Minority Founder', 'Social', 'Warehoused', 'AI/ML', 'B2B', 'B2C',
  'Payments', 'Digital Health', 'Marketplace', 'SaaS', 'FinTech', 'EdTech',
  'PropTech', 'CleanTech', 'DeepTech', 'Hardware', 'Mobile', 'Enterprise', 'Consumer'
];

interface EnhancedInvestmentsTableProps {
  className?: string;
}

export default function EnhancedInvestmentsTable({ className = '' }: EnhancedInvestmentsTableProps) {
  const [investments] = useState<Investment[]>(MOCK_INVESTMENTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortField, setSortField] = useState<keyof Investment>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedInvestments, setSelectedInvestments] = useState<string[]>([]);
  const [showColumnsPopover, setShowColumnsPopover] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    sector: true,
    stage: true,
    tags: true,
    invested: true,
    currentValue: true,
    moic: true,
    irr: true,
    ownership: true,
    status: true,
    partner: true,
    actions: true
  });

  // Get unique values for filters
  const sectors = [...new Set(investments.map(inv => inv.sector))];
  const stages = [...new Set(investments.map(inv => inv.stage))];
  const statuses = [...new Set(investments.map(inv => inv.status))];

  // Filter and sort investments
  const filteredInvestments = useMemo(() => {
    const filtered = investments.filter(investment => {
      const matchesSearch = investment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           investment.sector.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           investment.partnerLead.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSector = selectedSector === 'all' || investment.sector === selectedSector;
      const matchesStage = selectedStage === 'all' || investment.stage === selectedStage;
      const matchesStatus = selectedStatus === 'all' || investment.status === selectedStatus;
      const matchesTags = selectedTags.length === 0 || 
                         selectedTags.some(tag => investment.tags.includes(tag));

      return matchesSearch && matchesSector && matchesStage && matchesStatus && matchesTags;
    });

    // Sort investments
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });

    return filtered;
  }, [investments, searchTerm, selectedSector, selectedStage, selectedStatus, selectedTags, sortField, sortDirection]);

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800 border-green-200';
      case 'Exited': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Written Off': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getMOICColor = (moic: number) => {
    if (moic >= 2.0) return 'text-green-600 font-semibold';
    if (moic >= 1.5) return 'text-blue-600 font-semibold';
    if (moic >= 1.0) return 'text-yellow-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  const handleSort = (field: keyof Investment) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleSelectAll = () => {
    if (selectedInvestments.length === filteredInvestments.length) {
      setSelectedInvestments([]);
    } else {
      setSelectedInvestments(filteredInvestments.map(inv => inv.id));
    }
  };

  const handleSelectInvestment = (id: string) => {
    setSelectedInvestments(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Investments Table</h2>
          <p className="text-sm text-gray-600">
            Showing {filteredInvestments.length} of {investments.length} investments
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Investment
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <Input
                placeholder="Search investments, sectors, or partners..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <Select value={selectedSector} onValueChange={setSelectedSector}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sector" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sectors</SelectItem>
                  {sectors.map(sector => (
                    <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {stages.map(stage => (
                    <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Tags Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Tag className="h-4 w-4 mr-2" />
                    Tags
                    {selectedTags.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {selectedTags.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Filter by Tags</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {ALL_TAGS.map(tag => (
                        <div key={tag} className="flex items-center space-x-2">
                          <Checkbox
                            id={tag}
                            checked={selectedTags.includes(tag)}
                            onCheckedChange={() => handleTagToggle(tag)}
                          />
                          <label htmlFor={tag} className="text-sm font-medium cursor-pointer">
                            {tag}
                          </label>
                        </div>
                      ))}
                    </div>
                    {selectedTags.length > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setSelectedTags([])}
                        className="w-full"
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Columns Selector */}
              <Popover open={showColumnsPopover} onOpenChange={setShowColumnsPopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Show/Hide Columns</h4>
                    {Object.entries(visibleColumns).map(([key, visible]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={key}
                          checked={visible}
                          onCheckedChange={(checked) =>
                            setVisibleColumns(prev => ({ ...prev, [key]: checked }))
                          }
                        />
                        <label htmlFor={key} className="text-sm capitalize cursor-pointer">
                          {key === 'moic' ? 'MOIC' : 
                           key === 'irr' ? 'IRR' :
                           key.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Active Filters */}
          {(selectedTags.length > 0 || selectedSector !== 'all' || selectedStage !== 'all' || selectedStatus !== 'all') && (
            <div className="flex flex-wrap gap-2 mt-4">
              {selectedTags.map(tag => (
                <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => handleTagToggle(tag)}>
                  {tag} ×
                </Badge>
              ))}
              {selectedSector !== 'all' && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedSector('all')}>
                  Sector: {selectedSector} ×
                </Badge>
              )}
              {selectedStage !== 'all' && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedStage('all')}>
                  Stage: {selectedStage} ×
                </Badge>
              )}
              {selectedStatus !== 'all' && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedStatus('all')}>
                  Status: {selectedStatus} ×
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-3 px-4">
                    <Checkbox
                      checked={selectedInvestments.length === filteredInvestments.length && filteredInvestments.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="text-left py-3 px-4">Actions</th>
                  {visibleColumns.name && (
                    <th className="text-left py-3 px-4 cursor-pointer" onClick={() => handleSort('name')}>
                      <div className="flex items-center space-x-1">
                        <span>Name</span>
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.sector && <th className="text-left py-3 px-4">Sector</th>}
                  {visibleColumns.stage && <th className="text-left py-3 px-4">Stage</th>}
                  {visibleColumns.tags && <th className="text-left py-3 px-4">Tags</th>}
                  {visibleColumns.invested && (
                    <th className="text-left py-3 px-4 cursor-pointer" onClick={() => handleSort('totalInvested')}>
                      <div className="flex items-center space-x-1">
                        <span>Invested</span>
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.currentValue && (
                    <th className="text-left py-3 px-4 cursor-pointer" onClick={() => handleSort('currentValue')}>
                      <div className="flex items-center space-x-1">
                        <span>Current Value</span>
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.moic && (
                    <th className="text-left py-3 px-4 cursor-pointer" onClick={() => handleSort('moic')}>
                      <div className="flex items-center space-x-1">
                        <span>MOIC</span>
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.irr && (
                    <th className="text-left py-3 px-4 cursor-pointer" onClick={() => handleSort('irr')}>
                      <div className="flex items-center space-x-1">
                        <span>IRR</span>
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                  )}
                  {visibleColumns.ownership && <th className="text-left py-3 px-4">Ownership</th>}
                  {visibleColumns.status && <th className="text-left py-3 px-4">Status</th>}
                  {visibleColumns.partner && <th className="text-left py-3 px-4">Partner</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredInvestments.map((investment) => (
                  <tr key={investment.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <Checkbox
                        checked={selectedInvestments.includes(investment.id)}
                        onCheckedChange={() => handleSelectInvestment(investment.id)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1">
                        <Button variant="ghost" size="sm">
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    {visibleColumns.name && (
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer">
                            {investment.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {investment.dateInvested}
                          </div>
                        </div>
                      </td>
                    )}
                    {visibleColumns.sector && (
                      <td className="py-3 px-4">
                        <Badge variant="outline">{investment.sector}</Badge>
                      </td>
                    )}
                    {visibleColumns.stage && (
                      <td className="py-3 px-4">{investment.stage}</td>
                    )}
                    {visibleColumns.tags && (
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {investment.tags.slice(0, 2).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                              {tag}
                            </Badge>
                          ))}
                          {investment.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs bg-gray-50">
                              +{investment.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.invested && (
                      <td className="py-3 px-4 font-medium">
                        {formatCurrency(investment.totalInvested)}
                      </td>
                    )}
                    {visibleColumns.currentValue && (
                      <td className="py-3 px-4 font-medium">
                        {formatCurrency(investment.currentValue)}
                      </td>
                    )}
                    {visibleColumns.moic && (
                      <td className="py-3 px-4">
                        <span className={getMOICColor(investment.moic)}>
                          {investment.moic.toFixed(2)}x
                        </span>
                      </td>
                    )}
                    {visibleColumns.irr && (
                      <td className="py-3 px-4">
                        <span className={investment.irr >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {investment.irr.toFixed(1)}%
                        </span>
                      </td>
                    )}
                    {visibleColumns.ownership && (
                      <td className="py-3 px-4">{investment.ownershipPercentage.toFixed(1)}%</td>
                    )}
                    {visibleColumns.status && (
                      <td className="py-3 px-4">
                        <Badge className={getStatusColor(investment.status)}>
                          {investment.status}
                        </Badge>
                      </td>
                    )}
                    {visibleColumns.partner && (
                      <td className="py-3 px-4 text-sm">{investment.partnerLead}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedInvestments.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedInvestments.length} investment{selectedInvestments.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Bulk Edit
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
