import { useRoute, useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Building2, TrendingUp, FileText, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Import existing cap table component
// Update this import path based on your actual file structure
const CapTablePlaceholder = ({ companyId }: { companyId?: string }) => (
  <Card className="p-6 border-[#E0D8D1]">
    <div className="flex items-center gap-3 mb-4">
      <Building2 className="w-6 h-6 text-[#292929]" />
      <h3 className="font-inter font-semibold text-[#292929]">
        Capitalization Table
      </h3>
    </div>
    <p className="font-poppins text-[#292929]/70 text-sm">
      Cap table for company {companyId} will be displayed here.
      This integrates with your existing cap table component.
    </p>
    <div className="mt-4 p-4 bg-[#F2F2F2] rounded-lg">
      <p className="text-xs font-poppins text-[#292929]/60">
        <strong>Integration Note:</strong> Import your existing CapTables component
        and pass the companyId prop. The component is already built - this is just
        the new contextual location.
      </p>
    </div>
  </Card>
);

const CompanySummary = ({ companyId }: { companyId?: string }) => (
  <div className="space-y-6">
    <Card className="p-6 border-[#E0D8D1]">
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="w-6 h-6 text-[#292929]" />
        <h3 className="font-inter font-semibold text-[#292929]">
          Company Overview
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Mock KPI cards */}
        <div className="p-4 bg-[#F2F2F2] rounded-lg">
          <div className="text-xs font-poppins text-[#292929]/60 uppercase mb-1">
            Total Invested
          </div>
          <div className="text-xl font-inter font-bold text-[#292929]">
            $2.5M
          </div>
        </div>
        <div className="p-4 bg-[#F2F2F2] rounded-lg">
          <div className="text-xs font-poppins text-[#292929]/60 uppercase mb-1">
            Current Valuation
          </div>
          <div className="text-xl font-inter font-bold text-[#292929]">
            $12.0M
          </div>
        </div>
        <div className="p-4 bg-[#F2F2F2] rounded-lg">
          <div className="text-xs font-poppins text-[#292929]/60 uppercase mb-1">
            Ownership
          </div>
          <div className="text-xl font-inter font-bold text-[#292929]">
            15.2%
          </div>
        </div>
        <div className="p-4 bg-[#F2F2F2] rounded-lg">
          <div className="text-xs font-poppins text-[#292929]/60 uppercase mb-1">
            MOIC
          </div>
          <div className="text-xl font-inter font-bold text-emerald-600">
            4.8x
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between py-2 border-b border-[#E0D8D1]">
          <span className="font-poppins text-sm text-[#292929]/60">Sector</span>
          <span className="font-poppins text-sm font-medium text-[#292929]">Enterprise SaaS</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[#E0D8D1]">
          <span className="font-poppins text-sm text-[#292929]/60">Stage</span>
          <span className="font-poppins text-sm font-medium text-[#292929]">Series A</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[#E0D8D1]">
          <span className="font-poppins text-sm text-[#292929]/60">Initial Investment</span>
          <span className="font-poppins text-sm font-medium text-[#292929]">Jan 2023</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="font-poppins text-sm text-[#292929]/60">Last Updated</span>
          <span className="font-poppins text-sm font-medium text-[#292929]">Oct 2, 2025</span>
        </div>
      </div>
    </Card>

    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm font-poppins text-blue-800">
        <strong>Coming in Sprint 2:</strong> Full company dashboard with valuation history,
        KPI tracking, document management, and team notes.
      </p>
    </div>
  </div>
);

const InvestmentRounds = ({ companyId }: { companyId?: string }) => (
  <Card className="p-6 border-[#E0D8D1]">
    <div className="flex items-center gap-3 mb-4">
      <TrendingUp className="w-6 h-6 text-[#292929]" />
      <h3 className="font-inter font-semibold text-[#292929]">
        Investment Rounds & Ownership Evolution
      </h3>
    </div>

    <div className="space-y-4">
      {/* Mock round timeline */}
      <div className="flex items-start gap-4 p-4 border border-[#E0D8D1] rounded-lg">
        <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
          <span className="font-inter font-semibold text-emerald-600">A</span>
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-inter font-semibold text-[#292929]">Series A</h4>
              <p className="text-sm font-poppins text-[#292929]/60">January 2023</p>
            </div>
            <div className="text-right">
              <div className="font-inter font-semibold text-[#292929]">$1.5M</div>
              <div className="text-sm font-poppins text-[#292929]/60">Our Investment</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
            <div>
              <div className="font-poppins text-[#292929]/60">Round Size</div>
              <div className="font-poppins font-medium text-[#292929]">$8.0M</div>
            </div>
            <div>
              <div className="font-poppins text-[#292929]/60">Post-Money</div>
              <div className="font-poppins font-medium text-[#292929]">$32.0M</div>
            </div>
            <div>
              <div className="font-poppins text-[#292929]/60">Our Ownership</div>
              <div className="font-poppins font-medium text-[#292929]">18.75%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 p-4 border border-[#E0D8D1] rounded-lg bg-[#F2F2F2]">
        <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="font-inter font-semibold text-blue-600">B</span>
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-inter font-semibold text-[#292929]">Series B</h4>
              <p className="text-sm font-poppins text-[#292929]/60">August 2024</p>
            </div>
            <div className="text-right">
              <div className="font-inter font-semibold text-[#292929]">$1.0M</div>
              <div className="text-sm font-poppins text-[#292929]/60">Our Follow-On</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
            <div>
              <div className="font-poppins text-[#292929]/60">Round Size</div>
              <div className="font-poppins font-medium text-[#292929]">$15.0M</div>
            </div>
            <div>
              <div className="font-poppins text-[#292929]/60">Post-Money</div>
              <div className="font-poppins font-medium text-[#292929]">$80.0M</div>
            </div>
            <div>
              <div className="font-poppins text-[#292929]/60">Our Ownership</div>
              <div className="font-poppins font-medium text-[#292929]">15.2%</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <p className="text-sm font-poppins text-blue-800">
        <strong>Coming in Sprint 2:</strong> Full rounds timeline with dilution tracking,
        pro-rata participation analysis, and ownership evolution chart.
      </p>
    </div>
  </Card>
);

const PerformancePlaceholder = () => (
  <Card className="p-6 border-[#E0D8D1]">
    <div className="flex items-center gap-3 mb-4">
      <BarChart3 className="w-6 h-6 text-[#292929]" />
      <h3 className="font-inter font-semibold text-[#292929]">
        Performance Metrics
      </h3>
    </div>
    <p className="font-poppins text-[#292929]/70 mb-4">
      KPI tracking dashboard with ARR, burn rate, runway, and custom metrics.
    </p>
    <div className="p-4 bg-[#F2F2F2] rounded-lg">
      <p className="text-sm font-poppins text-[#292929]/60">
        Coming in Sprint 3 with KPI manager integration
      </p>
    </div>
  </Card>
);

const DocumentsPlaceholder = () => (
  <Card className="p-6 border-[#E0D8D1]">
    <div className="flex items-center gap-3 mb-4">
      <FileText className="w-6 h-6 text-[#292929]" />
      <h3 className="font-inter font-semibold text-[#292929]">
        Documents & Files
      </h3>
    </div>
    <p className="font-poppins text-[#292929]/70 mb-4">
      Investment memos, board decks, shareholder agreements, and other documents.
    </p>
    <div className="p-4 bg-[#F2F2F2] rounded-lg">
      <p className="text-sm font-poppins text-[#292929]/60">
        Coming in Sprint 3 with file upload and categorization
      </p>
    </div>
  </Card>
);

/**
 * Company Detail Page
 * Shows comprehensive company information with tab navigation
 */
export default function CompanyDetail() {
  const [, params] = useRoute('/portfolio/:id/*');
  const [, navigate] = useLocation();
  const companyId = params?.id;

  // Get active tab from URL or default to 'summary'
  const searchParams = new URLSearchParams(window.location.search);
  const activeTab = searchParams.get('tab') || 'summary';

  const handleTabChange = (value: string) => {
    navigate(`/portfolio/${companyId}?tab=${value}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/portfolio')}
          className="gap-2 font-poppins"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portfolio
        </Button>
      </div>

      {/* Page Header */}
      <div className="border-b border-[#E0D8D1] pb-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-[#292929]" />
          <div>
            <h1 className="text-2xl font-inter font-semibold text-[#292929]">
              Company Details
            </h1>
            <p className="text-sm font-poppins text-[#292929]/60 mt-1">
              Portfolio Company ID: {companyId}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-[#F2F2F2] border border-[#E0D8D1] font-poppins">
          <TabsTrigger value="summary">
            Summary
          </TabsTrigger>
          <TabsTrigger value="rounds">
            Rounds & Ownership
          </TabsTrigger>
          <TabsTrigger value="cap-table">
            Cap Table
          </TabsTrigger>
          <TabsTrigger value="performance" disabled>
            Performance <span className="ml-2 text-xs opacity-60">(Sprint 3)</span>
          </TabsTrigger>
          <TabsTrigger value="documents" disabled>
            Documents <span className="ml-2 text-xs opacity-60">(Sprint 3)</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6">
          <CompanySummary companyId={companyId ?? undefined} />
        </TabsContent>

        <TabsContent value="rounds" className="mt-6">
          <InvestmentRounds companyId={companyId ?? undefined} />
        </TabsContent>

        <TabsContent value="cap-table" className="mt-6">
          <CapTablePlaceholder companyId={companyId ?? undefined} />
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-poppins text-amber-800">
              <strong>🔧 Integration Needed:</strong> Replace CapTablePlaceholder with your
              existing cap table component. Import it and pass the companyId prop.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="mt-6">
          <PerformancePlaceholder />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsPlaceholder />
        </TabsContent>
      </Tabs>
    </div>
  );
}
