import { Calendar, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface ComingSoonPageProps {
  hub: string;
  eta?: string;
  features?: string[];
  showBackButton?: boolean;
}

/**
 * Coming Soon page for features in development
 * Shows planned features, ETA, and architecture readiness
 */
export function ComingSoonPage({
  hub,
  eta = 'Sprint 2',
  features,
  showBackButton = true
}: ComingSoonPageProps) {
  const [, navigate] = useLocation();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-2xl w-full p-8 border-[#E0D8D1] bg-white text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F2F2F2] mb-6">
          <Calendar className="w-8 h-8 text-[#292929]" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-inter font-semibold text-[#292929] mb-3">
          {hub} Hub
        </h1>

        {/* ETA */}
        <p className="text-lg font-poppins text-[#292929]/70 mb-6">
          Coming {eta}
        </p>

        {/* Planned Features */}
        {features && features.length > 0 && (
          <div className="bg-[#F2F2F2] rounded-lg p-6 mb-6 text-left">
            <h3 className="font-inter font-medium text-[#292929] mb-4 text-center">
              Planned Features
            </h3>
            <ul className="space-y-3">
              {features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 font-poppins text-[#292929]/80">
                  <ArrowRight className="w-5 h-5 text-[#292929] flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Architecture Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
          <p className="text-sm font-poppins text-blue-800">
            <strong>📊 Architecture Ready:</strong> The backend infrastructure and data contracts
            for this hub are complete. UI development is scheduled for {eta}.
          </p>
        </div>

        {/* Back Button */}
        {showBackButton && (
          <Button
            variant="outline"
            className="mt-6 font-poppins"
            onClick={() => navigate('/overview')}
          >
            ← Back to Overview
          </Button>
        )}
      </Card>
    </div>
  );
}

/**
 * Pre-configured Coming Soon pages for each hub
 */

export function ModelingHubComingSoon() {
  return (
    <ComingSoonPage
      hub="Modeling"
      eta="Sprint 2-3"
      features={[
        'Construction wizard with 7-step workflow (General Info, Sector Profiles, Capital Allocation, Fees & Expenses, Exit Recycling, Waterfall, Scenarios)',
        'Current state forecast with live portfolio data',
        'Reserve optimization using deterministic binary search engine',
        'Scenario comparison (Construction vs Current)',
        'Fee basis configuration (Committed, Called, Cumulative, FMV)',
        'American/European waterfall modeling with custom tiers',
        'Export models to Excel with full detail',
      ]}
    />
  );
}

export function OperationsHubComingSoon() {
  return (
    <ComingSoonPage
      hub="Operations"
      eta="Sprint 4"
      features={[
        'Capital Calls: Create, schedule, and track LP capital calls',
        'Distributions: Manage distributions to LPs and GPs',
        'Fees & Expenses: Track management fees and fund expenses',
        'Timeline view: Visualize cash flows by month/quarter',
        'LP confirmations: Generate and track audit confirmations',
        'Export to CSV/Excel for accounting systems',
        'Email notifications for upcoming capital calls',
      ]}
    />
  );
}

export function ReportingHubComingSoon() {
  return (
    <ComingSoonPage
      hub="Reporting"
      eta="Sprint 5"
      features={[
        'LP quarterly reports with standard templates',
        'Custom report builder with drag-and-drop fields',
        'Export to PDF, Excel, PowerPoint formats',
        'Saved report presets for recurring reports',
        'Email distribution to LP portal',
        'Regulatory compliance templates (ILPA, GIPS)',
        'Historical comparison reports (YoY, QoQ)',
      ]}
    />
  );
}
