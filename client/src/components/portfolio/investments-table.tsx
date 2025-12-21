/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import ColumnConfigurationDialog from "./column-configuration-dialog";
import { 
  Search, 
  Filter, 
  Download, 
  MoreHorizontal, 
  TrendingUp, 
  TrendingDown,
  Eye,
  Calendar,
  Tag,
  FileText
} from "lucide-react";

type Investment = {
  id: string;
  company: string;
  sector: string;
  stage: string;
  entryDate: string;
  totalInvestment: number;
  ownership: number;
  currentValue: number;
  moic: number;
  irr: number;
  lastRound: string;
  postMoneyValuation: number;
  liquidationPreference: number;
  tags: string[];
  status: 'active' | 'exited' | 'written-off';
};

const sampleInvestments: Investment[] = [
  {
    id: "1",
    company: "AlphaTech",
    sector: "SaaS",
    stage: "Series B",
    entryDate: "2021-03-15",
    totalInvestment: 2500000,
    ownership: 12.5,
    currentValue: 8750000,
    moic: 3.5,
    irr: 65.2,
    lastRound: "Series B",
    postMoneyValuation: 70000000,
    liquidationPreference: 2500000,
    tags: ["AI/ML", "B2B"],
    status: "active"
  },
  {
    id: "2", 
    company: "BetaCorp",
    sector: "Fintech",
    stage: "Series A",
    entryDate: "2020-11-22",
    totalInvestment: 1800000,
    ownership: 8.7,
    currentValue: 4320000,
    moic: 2.4,
    irr: 45.1,
    lastRound: "Series A",
    postMoneyValuation: 49600000,
    liquidationPreference: 1800000,
    tags: ["Payments", "B2C"],
    status: "active"
  },
  {
    id: "3",
    company: "GammaSoft",
    sector: "Healthcare",
    stage: "Seed",
    entryDate: "2022-06-10",
    totalInvestment: 750000,
    ownership: 15.2,
    currentValue: 1500000,
    moic: 2.0,
    irr: 38.7,
    lastRound: "Seed",
    postMoneyValuation: 9870000,
    liquidationPreference: 750000,
    tags: ["Digital Health", "B2B"],
    status: "active"
  },
  {
    id: "4",
    company: "DeltaFlow",
    sector: "E-commerce",
    stage: "Series C",
    entryDate: "2019-08-14",
    totalInvestment: 5000000,
    ownership: 6.3,
    currentValue: 22500000,
    moic: 4.5,
    irr: 72.8,
    lastRound: "Series C",
    postMoneyValuation: 357140000,
    liquidationPreference: 5000000,
    tags: ["Marketplace", "B2C"],
    status: "active"
  },
  {
    id: "5",
    company: "EpsilonAI",
    sector: "AI/ML",
    stage: "Exited",
    entryDate: "2018-12-03",
    totalInvestment: 3200000,
    ownership: 9.1,
    currentValue: 12800000,
    moic: 4.0,
    irr: 89.5,
    lastRound: "Acquisition",
    postMoneyValuation: 140659000,
    liquidationPreference: 3200000,
    tags: ["Computer Vision", "B2B"],
    status: "exited"
  }
];

export default function InvestmentsTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvestments, setSelectedInvestments] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<keyof Investment>("moic");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterBy, setFilterBy] = useState({
    sector: "all",
    stage: "all",
    status: "all"
  });
  const [selectedColumns, setSelectedColumns] = useState([
    'name', 'sector', 'entryStage', 'investedToDate', 'currentOwnership', 'unrealizedFMV', 'currentMOIC', 'currentOrRealizedIRR', 'dealTags', 'status'
  ]);

  const filteredInvestments = sampleInvestments
    .filter(investment => {
      const matchesSearch = investment.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           investment.sector.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector = filterBy.sector === "all" || investment.sector === filterBy.sector;
      const matchesStage = filterBy.stage === "all" || investment.stage === filterBy.stage;
      const matchesStatus = filterBy.status === "all" || investment.status === filterBy.status;
      
      return matchesSearch && matchesSector && matchesStage && matchesStatus;
    })
    .sort((a: any, b: any) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      }
      
      return sortOrder === 'desc' 
        ? String(bValue).localeCompare(String(aValue))
        : String(aValue).localeCompare(String(bValue));
    });

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${(amount / 1000).toFixed(0)}K`;
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Active' },
      exited: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Exited' },
      'written-off': { color: 'bg-red-100 text-red-800 border-red-200', label: 'Written Off' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig];
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const handleSort = (column: keyof Investment) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: keyof Investment) => {
    if (sortBy !== column) return null;
    return sortOrder === 'desc' ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Investments Portfolio</CardTitle>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-1" />
              Time Machine
            </Button>
            <Button variant="outline" size="sm">
              <Tag className="w-4 h-4 mr-1" />
              Deal Tags
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-1" />
              Custom Fields
            </Button>
            <ColumnConfigurationDialog 
              selectedColumns={selectedColumns}
              onColumnsChange={setSelectedColumns}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters and Search */}
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={filterBy.sector} onValueChange={(value: any) => setFilterBy(prev => ({ ...prev, sector: value }))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sectors</SelectItem>
                <SelectItem value="SaaS">SaaS</SelectItem>
                <SelectItem value="Fintech">Fintech</SelectItem>
                <SelectItem value="Healthcare">Healthcare</SelectItem>
                <SelectItem value="E-commerce">E-commerce</SelectItem>
                <SelectItem value="AI/ML">AI/ML</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterBy.stage} onValueChange={(value: any) => setFilterBy(prev => ({ ...prev, stage: value }))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="Seed">Seed</SelectItem>
                <SelectItem value="Series A">Series A</SelectItem>
                <SelectItem value="Series B">Series B</SelectItem>
                <SelectItem value="Series C">Series C</SelectItem>
                <SelectItem value="Exited">Exited</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterBy.status} onValueChange={(value: any) => setFilterBy(prev => ({ ...prev, status: value }))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="exited">Exited</SelectItem>
                <SelectItem value="written-off">Written Off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-1" />
              More Filters
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-1" />
              Report
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 py-4 border-y border-gray-200">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{filteredInvestments.length}</div>
            <div className="text-sm text-gray-600">Total Investments</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(filteredInvestments.reduce((sum: any, inv: any) => sum + inv.totalInvestment, 0))}
            </div>
            <div className="text-sm text-gray-600">Total Invested</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(filteredInvestments.reduce((sum: any, inv: any) => sum + inv.currentValue, 0))}
            </div>
            <div className="text-sm text-gray-600">Current Value</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {(filteredInvestments.reduce((sum: any, inv: any) => sum + inv.moic, 0) / filteredInvestments.length || 0).toFixed(1)}x
            </div>
            <div className="text-sm text-gray-600">Avg MOIC</div>
          </div>
        </div>

        {/* Investments Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3">
                  <Checkbox 
                    checked={selectedInvestments.length === filteredInvestments.length}
                    onCheckedChange={(checked: any) => {
                      if (checked) {
                        setSelectedInvestments(filteredInvestments.map(inv => inv.id));
                      } else {
                        setSelectedInvestments([]);
                      }
                    }}
                  />
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('company')}>
                  <div className="flex items-center space-x-1">
                    <span>Company</span>
                    {getSortIcon('company')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('sector')}>
                  <div className="flex items-center space-x-1">
                    <span>Sector</span>
                    {getSortIcon('sector')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('stage')}>
                  <div className="flex items-center space-x-1">
                    <span>Stage</span>
                    {getSortIcon('stage')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('totalInvestment')}>
                  <div className="flex items-center space-x-1">
                    <span>Investment</span>
                    {getSortIcon('totalInvestment')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('ownership')}>
                  <div className="flex items-center space-x-1">
                    <span>Ownership</span>
                    {getSortIcon('ownership')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('currentValue')}>
                  <div className="flex items-center space-x-1">
                    <span>Current Value</span>
                    {getSortIcon('currentValue')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('moic')}>
                  <div className="flex items-center space-x-1">
                    <span>MOIC</span>
                    {getSortIcon('moic')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('irr')}>
                  <div className="flex items-center space-x-1">
                    <span>IRR</span>
                    {getSortIcon('irr')}
                  </div>
                </th>
                <th className="text-left p-3 font-medium">Tags</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvestments.map((investment: any) => (
                <tr key={investment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <Checkbox 
                      checked={selectedInvestments.includes(investment.id)}
                      onCheckedChange={(checked: any) => {
                        if (checked) {
                          setSelectedInvestments(prev => [...prev, investment.id]);
                        } else {
                          setSelectedInvestments(prev => prev.filter(id => id !== investment.id));
                        }
                      }}
                    />
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-blue-600 cursor-pointer hover:text-blue-800">
                      {investment.company}
                    </div>
                    <div className="text-sm text-gray-500">{investment.entryDate}</div>
                  </td>
                  <td className="p-3 text-gray-700">{investment.sector}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">
                      {investment.stage}
                    </Badge>
                  </td>
                  <td className="p-3 font-medium">{formatCurrency(investment.totalInvestment)}</td>
                  <td className="p-3">{formatPercentage(investment.ownership)}</td>
                  <td className="p-3 font-medium">{formatCurrency(investment.currentValue)}</td>
                  <td className="p-3">
                    <span className={`font-medium ${investment.moic >= 2 ? 'text-green-600' : investment.moic >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {investment.moic.toFixed(1)}x
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`font-medium ${investment.irr >= 30 ? 'text-green-600' : investment.irr >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {formatPercentage(investment.irr)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {investment.tags.slice(0, 2).map((tag: any, index: any) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {investment.tags.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{investment.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">{getStatusBadge(investment.status)}</td>
                  <td className="p-3">
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bulk Actions */}
        {selectedInvestments.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-700">
              {selectedInvestments.length} investment{selectedInvestments.length > 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                Export Selected
              </Button>
              <Button variant="outline" size="sm">
                Add Tags
              </Button>
              <Button variant="outline" size="sm">
                Update Status
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
