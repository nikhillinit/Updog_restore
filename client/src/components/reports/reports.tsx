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
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Download, 
  Star, 
  Building2, 
  TrendingUp, 
  BarChart3, 
  Users, 
  Calendar,
  DollarSign,
  Target,
  Briefcase,
  ArrowUpRight
} from "lucide-react";

interface ReportItem {
  id: string;
  title: string;
  description: string;
  recommended: boolean;
  category: 'investment' | 'fund';
  icon: any;
}

const reportItems: ReportItem[] = [
  // Investment Reports
  {
    id: 'tear-sheets',
    title: 'Tear Sheets',
    description: 'One-pagers summarizing key statistics for each portfolio company',
    recommended: true,
    category: 'investment',
    icon: FileText
  },
  {
    id: 'portfolio-summary',
    title: 'Portfolio Summary',
    description: 'Performance summary by investment',
    recommended: true,
    category: 'investment',
    icon: Building2
  },
  {
    id: 'investment-history',
    title: 'Investment History',
    description: 'Historical investment rounds and exits',
    recommended: true,
    category: 'investment',
    icon: Calendar
  },
  {
    id: 'all-rounds-exits',
    title: 'All Investment Rounds and Exits',
    description: 'All Financings and Exits',
    recommended: false,
    category: 'investment',
    icon: TrendingUp
  },
  {
    id: 'portfolio-summary-cases',
    title: 'Portfolio Summary with Cases',
    description: 'Summary of investment performance with performance cases',
    recommended: false,
    category: 'investment',
    icon: BarChart3
  },
  {
    id: 'graduations-entry',
    title: 'Graduations by Entry Round',
    description: 'Historical investment graduations by entry round',
    recommended: false,
    category: 'investment',
    icon: Target
  },
  {
    id: 'liquidation-preferences',
    title: 'Liquidation Preferences',
    description: 'Liquidation preferences by investment',
    recommended: false,
    category: 'investment',
    icon: DollarSign
  },
  // Fund Reports
  {
    id: 'construction-summary',
    title: 'Construction Summary',
    description: 'Construction parameters in a single report',
    recommended: true,
    category: 'fund',
    icon: Briefcase
  },
  {
    id: 'fund-performance-summary',
    title: 'Fund Performance Summary',
    description: 'Overall fund performance reports summarizing capital deployment, number of investments and waterfall returns',
    recommended: true,
    category: 'fund',
    icon: TrendingUp
  },
  {
    id: 'fund-performance-construction',
    title: 'Fund Performance With Construction Comparison Report',
    description: 'Overall fund performance reports summarizing capital deployment, number of investments and waterfall returns',
    recommended: false,
    category: 'fund',
    icon: BarChart3
  },
  {
    id: 'detailed-cash-flow',
    title: 'Detailed Cash Flow',
    description: 'Cash flows in each period',
    recommended: false,
    category: 'fund',
    icon: DollarSign
  },
  {
    id: 'partners-capital',
    title: 'Partners Capital',
    description: 'Partners Capital Flows',
    recommended: false,
    category: 'fund',
    icon: Users
  },
  {
    id: 'lp-performance',
    title: 'LP Performance',
    description: 'Capital Calls and Distributions by LP',
    recommended: false,
    category: 'fund',
    icon: Users
  }
];

export default function Reports() {
  const { currentFund, isLoading } = useFundContext();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'investment' | 'fund'>('all');
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  if (isLoading || !currentFund) {
    return (
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="animate-pulse space-y-8">
          <div className="h-20 bg-gray-200 rounded-xl"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_: any, i: any) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleGenerateReport = async (reportId: string) => {
    setGeneratingReport(reportId);
    
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setGeneratingReport(null);
    
    // In a real implementation, this would trigger the report generation
    console.log(`Generating report: ${reportId}`);
  };

  const filteredReports = reportItems.filter(report => 
    selectedCategory === 'all' || report.category === selectedCategory
  );

  const investmentReports = reportItems.filter(report => report.category === 'investment');
  const fundReports = reportItems.filter(report => report.category === 'fund');

  const ReportCard = ({ report }: { report: ReportItem }) => {
    const Icon = report.icon;
    const isGenerating = generatingReport === report.id;

    return (
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Icon className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  {report.recommended && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                      <Star className="h-3 w-3 mr-1" />
                      Recommended
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="text-sm text-gray-600 mb-4 leading-relaxed">
            {report.description}
          </CardDescription>
          <Button 
            onClick={() => handleGenerateReport(report.id)}
            disabled={isGenerating}
            className="w-full"
            variant="outline"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentFund.name} / Reports</h1>
            <p className="text-gray-600 mt-2">
              Generate comprehensive reports and documentation for your fund performance and portfolio companies
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Export All
            </Button>
            <Button size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Custom Report
            </Button>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex space-x-2 mb-8">
        <Button 
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          onClick={() => setSelectedCategory('all')}
          size="sm"
        >
          All Reports
        </Button>
        <Button 
          variant={selectedCategory === 'investment' ? 'default' : 'outline'}
          onClick={() => setSelectedCategory('investment')}
          size="sm"
        >
          Investment Reports
        </Button>
        <Button 
          variant={selectedCategory === 'fund' ? 'default' : 'outline'}
          onClick={() => setSelectedCategory('fund')}
          size="sm"
        >
          Fund Reports
        </Button>
      </div>

      {/* Reports Sections */}
      {selectedCategory === 'all' ? (
        <div className="space-y-12">
          {/* Investment Reports Section */}
          <div>
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Investment Reports</h2>
                <p className="text-gray-600">Portfolio company performance and investment tracking</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {investmentReports.map((report: any) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </div>

          <Separator />

          {/* Fund Reports Section */}
          <div>
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-green-50 rounded-lg">
                <Briefcase className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Fund Reports</h2>
                <p className="text-gray-600">Overall fund performance and management reports</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {fundReports.map((report: any) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReports.map((report: any) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}

      {/* Report Generation Status */}
      {generatingReport && (
        <div className="fixed bottom-6 right-6 bg-white shadow-lg border border-gray-200 rounded-lg p-4 max-w-sm">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <div>
              <div className="font-medium text-gray-900">Generating Report</div>
              <div className="text-sm text-gray-600">This may take a few moments...</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
