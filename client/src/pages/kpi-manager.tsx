/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Upload, 
  Send, 
  Copy, 
  Check, 
  X, 
  Info,
  BarChart3,
  Users,
  FileText,
  Settings,
  Download,
  Calculator
} from "lucide-react";

type KPI = {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative';
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  startDate: string;
  term: number;
  termUnit: 'quarters' | 'months' | 'years';
  numberFormat: string;
  askToUploadDocuments: boolean;
  showFullProjectionPeriod: boolean;
  hidePastHistoricals: boolean;
  description?: string;
  companyComments?: boolean;
};

type KPIData = {
  kpiId: string;
  period: string;
  value: string | number;
  type: 'actual' | 'projected';
  comments?: string;
  documents?: string[];
};

type Contact = {
  investment: string;
  contact: string;
  status: 'valid' | 'invalid';
};

type KPIRequest = {
  id: string;
  company: string;
  status: 'pending' | 'sent' | 'completed' | 'review';
  reportingPeriod: string;
  createdDate: string;
  lastUpdated: string;
  passcode?: string;
};

export default function KPIManager() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCompany, setSelectedCompany] = useState("AlphaTech");
  const [showKPIDefinition, setShowKPIDefinition] = useState(false);
  const [showRequestCreator, setShowRequestCreator] = useState(false);
  
  // Sample data based on Tactyc screenshots
  const companies = ["AlphaTech", "Amplio", "CatalystLabs", "Cybrosys Technologies", "DigitalWave"];
  
  const [_kpis] = useState<KPI[]>([
    {
      id: "arr",
      name: "ARR",
      type: "quantitative",
      frequency: "quarterly",
      startDate: "2021-01",
      term: 66,
      termUnit: "quarters",
      numberFormat: "United States Dollar ($)",
      askToUploadDocuments: true,
      showFullProjectionPeriod: true,
      hidePastHistoricals: false
    },
    {
      id: "sales",
      name: "Sales",
      type: "quantitative",
      frequency: "quarterly",
      startDate: "2021-01",
      term: 24,
      termUnit: "quarters",
      numberFormat: "United States Dollar ($)",
      askToUploadDocuments: false,
      showFullProjectionPeriod: true,
      hidePastHistoricals: false
    },
    {
      id: "cash-balance",
      name: "Cash Balance",
      type: "quantitative",
      frequency: "semi-annual",
      startDate: "2021-01",
      term: 12,
      termUnit: "quarters",
      numberFormat: "United States Dollar ($)",
      askToUploadDocuments: false,
      showFullProjectionPeriod: false,
      hidePastHistoricals: false
    }
  ]);

  const [contacts] = useState<Contact[]>([
    { investment: "AlphaTech", contact: "anubhav+3@tactyc.io", status: "valid" },
    { investment: "Amplio", contact: "anubhav+4@tactyc.io", status: "valid" },
    { investment: "CatalystLabs", contact: "anubhav+5@tactyc.io", status: "valid" },
    { investment: "Cybrosys Technologies", contact: "anubhav+6@tactyc.io", status: "valid" },
    { investment: "DigitalWave", contact: "anubhav+7@tactyc.io", status: "valid" }
  ]);

  const sampleKPIData = {
    "arr": [
      { period: "Jan 2021", value: "C$1,900,000", type: "actual" },
      { period: "Jul 2021", value: "C$2,100,000", type: "actual" },
      { period: "Jan 2022", value: "C$2,200,000", type: "actual" },
      { period: "Jul 2022", value: "C$2,315,250", type: "actual" },
      { period: "Jan 2023", value: "C$2,400,000", type: "actual" },
      { period: "Jul 2023", value: "C$2,500,000", type: "projected" }
    ],
    "sales": [
      { period: "Jan 2021", value: "$4,010,042", type: "actual" },
      { period: "Apr 2021", value: "$4,210,544", type: "actual" },
      { period: "Jul 2021", value: "$4,421,071", type: "actual" },
      { period: "Oct 2021", value: "$4,642,125", type: "actual" },
      { period: "Jan 2022", value: "$4,874,231", type: "actual" },
      { period: "Apr 2022", value: "$5,117,943", type: "projected" }
    ]
  };

  const [newKPI, setNewKPI] = useState<Partial<KPI>>({
    type: "quantitative",
    frequency: "quarterly",
    numberFormat: "United States Dollar ($)",
    askToUploadDocuments: false,
    showFullProjectionPeriod: true,
    hidePastHistoricals: false,
    term: 66,
    termUnit: "quarters"
  });

  const KPIDefinitionForm = () => (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5" />
          <span>KPI Definition</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="kpi-name">KPI Name</Label>
          <Input
            id="kpi-name"
            value={newKPI.name || ""}
            onChange={(e) => setNewKPI(prev => ({ ...prev, name: e.target.value }))}
            placeholder="ARR"
            className="border-gray-300"
          />
        </div>

        <div className="space-y-3">
          <Label>Type</Label>
          <Select value={newKPI.type} onValueChange={(value: 'quantitative' | 'qualitative') => setNewKPI(prev => ({ ...prev, type: value }))}>
            <SelectTrigger className="border-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quantitative">Quantitative</SelectItem>
              <SelectItem value="qualitative">Qualitative</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>Frequency</Label>
          <Select value={newKPI.frequency} onValueChange={(value: any) => setNewKPI(prev => ({ ...prev, frequency: value }))}>
            <SelectTrigger className="border-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="semi-annual">Semi-Annual</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>Start Date</Label>
          <Input
            type="month"
            value={newKPI.startDate || ""}
            onChange={(e) => setNewKPI(prev => ({ ...prev, startDate: e.target.value }))}
            className="border-gray-300"
          />
        </div>

        <div className="space-y-3">
          <Label>Term</Label>
          <div className="flex space-x-2">
            <Input
              type="number"
              value={newKPI.term || ""}
              onChange={(e) => setNewKPI(prev => ({ ...prev, term: parseInt(e.target.value) }))}
              className="flex-1 border-gray-300"
              placeholder="66"
            />
            <Select value={newKPI.termUnit} onValueChange={(value: any) => setNewKPI(prev => ({ ...prev, termUnit: value }))}>
              <SelectTrigger className="w-32 border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quarters">quarters</SelectItem>
                <SelectItem value="months">months</SelectItem>
                <SelectItem value="years">years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Number Format</Label>
          <Select value={newKPI.numberFormat} onValueChange={(value) => setNewKPI(prev => ({ ...prev, numberFormat: value }))}>
            <SelectTrigger className="border-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="United States Dollar ($)">United States Dollar ($)</SelectItem>
              <SelectItem value="Euro (€)">Euro (€)</SelectItem>
              <SelectItem value="Percentage (%)">Percentage (%)</SelectItem>
              <SelectItem value="Number">Number</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          <Label className="text-base font-medium">KPI Requests Configuration</Label>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="upload-docs"
              checked={newKPI.askToUploadDocuments}
              onCheckedChange={(checked) => setNewKPI(prev => ({ ...prev, askToUploadDocuments: !!checked }))}
            />
            <Label htmlFor="upload-docs" className="text-sm">Ask to upload documents</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-projection"
              checked={newKPI.showFullProjectionPeriod}
              onCheckedChange={(checked) => setNewKPI(prev => ({ ...prev, showFullProjectionPeriod: !!checked }))}
            />
            <Label htmlFor="show-projection" className="text-sm">Show full projection period</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="hide-historicals"
              checked={newKPI.hidePastHistoricals}
              onCheckedChange={(checked) => setNewKPI(prev => ({ ...prev, hidePastHistoricals: !!checked }))}
            />
            <Label htmlFor="hide-historicals" className="text-sm">Hide past historicals</Label>
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <Button onClick={() => setShowKPIDefinition(false)} className="flex-1">
            Save KPI
          </Button>
          <Button variant="outline" onClick={() => setShowKPIDefinition(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const KPIRequestCreator = () => (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Create KPI Requests</span>
          <Button variant="ghost" size="sm" onClick={() => setShowRequestCreator(false)}>
            <X className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-gray-600">
          Tactyc will now create a custom <strong>Request URL</strong>.
        </p>
        <p className="text-sm text-gray-600">
          Please send this request URLs to your contact at the portfolio company to request a KPI update.
        </p>

        <div className="space-y-4">
          <Button variant="outline" className="w-full justify-start text-left">
            <span className="mr-2">▼</span>
            Visible Metrics (Optional)
          </Button>
          <div className="ml-6 space-y-2">
            <p className="text-sm text-gray-600">
              Only selected metrics <strong>will be visible</strong> to the portfolio company in their KPI request form.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox id="arr-visible" defaultChecked />
              <Label htmlFor="arr-visible" className="text-sm">ARR</Label>
            </div>
          </div>

          <Button variant="outline" className="w-full justify-start text-left">
            <span className="mr-2">▼</span>
            Passcode Protection (Optional)
          </Button>
          <div className="ml-6 space-y-3">
            <p className="text-sm text-gray-600">
              To ensure these Request URLs are accessible only by intended parties, specify an optional passcode below. If left blank, anyone with access to the URL can update the KPI data.
            </p>
            <div className="relative">
              <Input 
                placeholder="Optional passcode" 
                className="border-gray-300 pr-10"
              />
              <Button variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                <Info className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <Button className="flex-1">
            Create Request
          </Button>
          <Button variant="outline" onClick={() => setShowRequestCreator(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">KPI Manager</h1>
            <p className="text-gray-600 mt-1">Monitor and track portfolio company performance metrics</p>
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" onClick={() => setShowKPIDefinition(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add KPI
            </Button>
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Import Excel
            </Button>
            <Button variant="outline" disabled className="opacity-50">
              <Settings className="w-4 h-4 mr-2" />
              Sync Notion
            </Button>
            <Button>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Overlays */}
        {showKPIDefinition && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <KPIDefinitionForm />
          </div>
        )}

        {showRequestCreator && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <KPIRequestCreator />
          </div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <span>Manage KPIs</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>KPI Requests</span>
            </TabsTrigger>
            <TabsTrigger value="valuation" className="flex items-center space-x-2">
              <Calculator className="w-4 h-4" />
              <span>Valuation Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Contacts</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Company Selector */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{selectedCompany}</CardTitle>
                  <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map(company => (
                        <SelectItem key={company} value={company}>{company}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {/* KPI Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left p-2 w-8">
                          <Checkbox />
                        </th>
                        <th className="text-left p-2 font-medium text-blue-600">Quantitative KPIs</th>
                        <th className="text-left p-2 font-medium">Value Type</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Frequency</th>
                        <th className="text-left p-2 font-medium">Period 1</th>
                        <th className="text-left p-2 font-medium">Period 2</th>
                        <th className="text-left p-2 font-medium">Period 3</th>
                        <th className="text-left p-2 font-medium">Period 4</th>
                        <th className="text-left p-2 font-medium">Period 5</th>
                        <th className="text-left p-2 font-medium">Period 6</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-2"><Checkbox /></td>
                        <td className="p-2">
                          <span className="text-blue-600 font-medium">ARR</span>
                        </td>
                        <td className="p-2">Quantitative</td>
                        <td className="p-2">Actual</td>
                        <td className="p-2">Semi-Annual</td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">C$1,900,000</div>
                          <div className="text-xs text-gray-500">Jan 2021</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">C$2,100,000</div>
                          <div className="text-xs text-gray-500">Jul 2021</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">C$2,200,000</div>
                          <div className="text-xs text-gray-500">Jan 2022</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">C$2,315,250</div>
                          <div className="text-xs text-gray-500">Jul 2022</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">C$2,400,000</div>
                          <div className="text-xs text-gray-500">Jan 2023</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">C$2,500,000</div>
                          <div className="text-xs text-gray-500">Jul 2023</div>
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-2"><Checkbox /></td>
                        <td className="p-2">
                          <span className="text-blue-600 font-medium">Sales</span>
                        </td>
                        <td className="p-2">Quantitative</td>
                        <td className="p-2">Actual</td>
                        <td className="p-2">Quarterly</td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">$4,010,042</div>
                          <div className="text-xs text-gray-500">Jan 2021</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">$4,210,544</div>
                          <div className="text-xs text-gray-500">Apr 2021</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">$4,421,071</div>
                          <div className="text-xs text-gray-500">Jul 2021</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">$4,642,125</div>
                          <div className="text-xs text-gray-500">Oct 2021</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">$4,874,231</div>
                          <div className="text-xs text-gray-500">Jan 2022</div>
                        </td>
                        <td className="p-2">
                          <div className="text-blue-600 font-medium">$5,117,943</div>
                          <div className="text-xs text-gray-500">Apr 2022</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Chart Section */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="flex items-center space-x-2 mb-4">
                    <span className="font-medium">ARR</span>
                    <Info className="w-4 h-4 text-gray-400" />
                  </div>
                  
                  <div className="bg-white rounded-lg border p-6">
                    <div className="h-80 relative">
                      {/* Simple Bar Chart Implementation */}
                      <div className="flex items-end justify-between h-full space-x-4 pt-8">
                        {["Jan 2021", "Jul 2021", "Jan 2022", "Jul 2022", "Jan 2023", "Jul 2023"].map((period, index) => {
                          const values = [1.9, 2.1, 2.2, 2.315, 2.4, 2.5];
                          const isProjected = index >= 5;
                          const height = (values[index] / 2.5) * 100;
                          
                          return (
                            <div key={period} className="flex flex-col items-center flex-1">
                              <div className="flex space-x-1 mb-2">
                                <div 
                                  className={`w-8 ${isProjected ? 'bg-gray-400' : 'bg-blue-500'} rounded-t`}
                                  style={{ height: `${height * 2}px` }}
                                />
                                <div 
                                  className="w-8 bg-gray-800 rounded-t"
                                  style={{ height: `${height * 2}px` }}
                                />
                              </div>
                              <div className="text-xs text-gray-600 text-center">
                                <div>{period}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Y-axis labels */}
                      <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 -ml-12">
                        <span>6M</span>
                        <span>4M</span>
                        <span>2M</span>
                        <span>0</span>
                      </div>
                      
                      {/* Legend */}
                      <div className="absolute bottom-0 right-0 flex items-center space-x-4 text-xs">
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-3 bg-blue-500 rounded"></div>
                          <span>Actual</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-3 bg-gray-400 rounded"></div>
                          <span>Projected</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>KPI Requests</CardTitle>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      Send Selected
                    </Button>
                    <Button onClick={() => setShowRequestCreator(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create KPI Request(s)
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Request Status Summary */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">3</div>
                    <div className="text-sm text-yellow-700">Pending Update</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">2</div>
                    <div className="text-sm text-blue-700">Sent</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">1</div>
                    <div className="text-sm text-orange-700">Pending Review</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">4</div>
                    <div className="text-sm text-green-700">Completed</div>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { company: "AlphaTech", status: "Pending Review", updated: "2 hours ago", color: "orange" },
                    { company: "Amplio", status: "Pending Update", updated: "Dec 15, 2023", color: "yellow" },
                    { company: "CatalystLabs", status: "Sent", updated: "Dec 18, 2023", color: "blue" },
                    { company: "Cybrosys Technologies", status: "Completed", updated: "Dec 20, 2023", color: "green" },
                    { company: "DigitalWave", status: "Pending Update", updated: "Dec 10, 2023", color: "yellow" }
                  ].map((request, _index) => (
                    <div key={request.company} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center space-x-4">
                        <Checkbox />
                        <div>
                          <p className="font-medium">{request.company}</p>
                          <p className="text-sm text-gray-500">Last updated: {request.updated}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge 
                          variant="outline" 
                          className={`
                            ${request.color === 'orange' ? 'text-orange-600 border-orange-200 bg-orange-50' : ''}
                            ${request.color === 'yellow' ? 'text-yellow-600 border-yellow-200 bg-yellow-50' : ''}
                            ${request.color === 'blue' ? 'text-blue-600 border-blue-200 bg-blue-50' : ''}
                            ${request.color === 'green' ? 'text-green-600 border-green-200 bg-green-50' : ''}
                          `}
                        >
                          {request.status}
                        </Badge>
                        {request.status === "Pending Review" && (
                          <Button variant="outline" size="sm" className="text-green-600">
                            <Check className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        )}
                        {request.status === "Pending Update" && (
                          <Button variant="outline" size="sm">
                            <Send className="w-4 h-4 mr-1" />
                            Send
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bulk Actions */}
                <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-600">Select requests to perform bulk actions</p>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-1" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm">
                      Archive Selected
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="valuation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Valuation Analysis</CardTitle>
                <p className="text-sm text-gray-600">
                  Automated valuation multiple analysis. Tactyc will automatically compute valuation multiples on collected KPIs by matching up the KPI provided at each date with the valuation of the company as of that date.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Analysis Configuration */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label>Compute Valuation Multiple on:</Label>
                      <Select defaultValue="ARR">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ARR">ARR</SelectItem>
                          <SelectItem value="Sales">Sales</SelectItem>
                          <SelectItem value="Revenue">Revenue</SelectItem>
                          <SelectItem value="EBITDA">EBITDA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label>Entry Round:</Label>
                      <Select defaultValue="Seed">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="Seed">Seed</SelectItem>
                          <SelectItem value="Series A">Series A</SelectItem>
                          <SelectItem value="Series B">Series B</SelectItem>
                          <SelectItem value="Series C">Series C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label>Sector:</Label>
                      <Select defaultValue="All">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="SaaS">SaaS</SelectItem>
                          <SelectItem value="Fintech">Fintech</SelectItem>
                          <SelectItem value="Healthcare">Healthcare</SelectItem>
                          <SelectItem value="E-commerce">E-commerce</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label>Geography:</Label>
                      <Select defaultValue="All">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="North America">North America</SelectItem>
                          <SelectItem value="Europe">Europe</SelectItem>
                          <SelectItem value="Asia">Asia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label>Tag:</Label>
                      <Select defaultValue="All">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="AI/ML">AI/ML</SelectItem>
                          <SelectItem value="B2B">B2B</SelectItem>
                          <SelectItem value="B2C">B2C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label>Average Method:</Label>
                      <div className="flex space-x-2">
                        <Button variant="default" size="sm" className="bg-blue-600">
                          Mean
                        </Button>
                        <Button variant="outline" size="sm">
                          Median
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Compute Analysis
                  </Button>
                </div>

                {/* Results Table */}
                <div className="pt-6 border-t border-gray-200">
                  <h3 className="text-lg font-medium mb-4">Valuation/ARR Multiple</h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-300">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 p-3 text-left font-medium">Company</th>
                          <th className="border border-gray-300 p-3 text-left font-medium">Round 1</th>
                          <th className="border border-gray-300 p-3 text-left font-medium">Round 2</th>
                          <th className="border border-gray-300 p-3 text-left font-medium">Round 3</th>
                          <th className="border border-gray-300 p-3 text-left font-medium">Round 4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { company: "AlphaTech", round1: "27.39x", round2: "10.31x", round3: "5.81x", round4: "-" },
                          { company: "CatalystLabs", round1: "22.50x", round2: "-", round3: "-", round4: "-" },
                          { company: "CybrosX2", round1: "11.20x", round2: "11.67x", round3: "-", round4: "-" },
                          { company: "DigitalWave", round1: "23.97x", round2: "11.10x", round3: "11.10x", round4: "-" },
                          { company: "EchelonTech", round1: "-", round2: "7.60x", round3: "12.37x", round4: "-" },
                          { company: "Glyphic", round1: "-", round2: "-", round3: "-", round4: "-" },
                          { company: "Hypernoval", round1: "-", round2: "-", round3: "-", round4: "-" },
                          { company: "InfinityTech", round1: "14.01x", round2: "3.99x", round3: "-", round4: "-" },
                          { company: "Metaflux", round1: "25.00x", round2: "10.00x", round3: "-", round4: "-" },
                          { company: "ParadigmShift", round1: "7.00x", round2: "-", round3: "-", round4: "-" },
                          { company: "Speculative", round1: "-", round2: "-", round3: "-", round4: "-" },
                          { company: "Synapse", round1: "-", round2: "-", round3: "-", round4: "-" },
                          { company: "Vantage", round1: "4.68x", round2: "-", round3: "-", round4: "-" },
                          { company: "Yanbal", round1: "2.49x", round2: "9.70x", round3: "7.05x", round4: "5.31x" }
                        ].map((row, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="border border-gray-300 p-3 font-medium">{row.company}</td>
                            <td className="border border-gray-300 p-3 text-center">{row.round1}</td>
                            <td className="border border-gray-300 p-3 text-center">{row.round2}</td>
                            <td className="border border-gray-300 p-3 text-center">{row.round3}</td>
                            <td className="border border-gray-300 p-3 text-center">{row.round4}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Statistics */}
                  <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">18.7x</div>
                      <div className="text-sm text-blue-700">Average Multiple (Mean)</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">11.2x</div>
                      <div className="text-sm text-green-700">Average Multiple (Median)</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-gray-600">14</div>
                      <div className="text-sm text-gray-700">Companies Analyzed</div>
                    </div>
                  </div>

                  {/* Export Options */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button variant="outline">
                      <FileText className="w-4 h-4 mr-2" />
                      Export PDF
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>KPI Contacts List</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">Set contact information for automated email notifications</p>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline">
                      Import
                    </Button>
                    <Button>
                      Save Contacts
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left p-3 font-medium">Investment</th>
                        <th className="text-left p-3 font-medium">Contact</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact, index) => (
                        <tr key={index} className="border-b border-gray-100">
                          <td className="p-3">{contact.investment}</td>
                          <td className="p-3">
                            <Input 
                              value={contact.contact}
                              className="border-0 p-0 h-auto bg-transparent"
                              readOnly
                            />
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-green-600 border-green-200">
                              <Check className="w-3 h-3 mr-1" />
                              Valid Email
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>KPI Manager Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Approve KPI Requests</p>
                    <p className="text-sm text-gray-600">Automatically approve all incoming KPI data without manual review</p>
                  </div>
                  <Checkbox />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-gray-600">Receive email notifications when KPI requests are submitted</p>
                  </div>
                  <Checkbox defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Default Request Frequency</p>
                    <p className="text-sm text-gray-600">How often to automatically send KPI requests to portfolio companies</p>
                  </div>
                  <Select defaultValue="quarterly">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-4">Integration Settings</h3>
                  
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-black rounded text-white text-xs flex items-center justify-center font-bold">N</div>
                        <span className="font-medium">Notion Integration</span>
                        <Badge variant="outline" className="text-gray-500">Not Connected</Badge>
                      </div>
                      <Button variant="outline" size="sm" disabled className="opacity-50">
                        Connect
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600">
                      Connect your Notion workspace to sync KPI data automatically. Portfolio companies can update metrics directly in Notion.
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        <span className="font-medium">Excel Integration</span>
                        <Badge variant="outline" className="text-green-600 border-green-200">Active</Badge>
                      </div>
                      <Button variant="outline" size="sm">
                        Configure
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600">
                      Import and export KPI data using Excel templates. Supports bulk data uploads and automated formatting.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-4">Data Management</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Data Retention Period</p>
                        <p className="text-sm text-gray-600">How long to keep historical KPI data</p>
                      </div>
                      <Select defaultValue="unlimited">
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1year">1 Year</SelectItem>
                          <SelectItem value="3years">3 Years</SelectItem>
                          <SelectItem value="5years">5 Years</SelectItem>
                          <SelectItem value="unlimited">Unlimited</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Backup KPI Data</p>
                        <p className="text-sm text-gray-600">Automatically backup KPI data to external storage</p>
                      </div>
                      <Checkbox defaultChecked />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
