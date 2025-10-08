/**
 * KpiCard Component - Usage Examples
 *
 * This file demonstrates how to use the KpiCard component with Press On Ventures brand styling.
 * The component is designed to display financial metrics with labels, values, deltas, and intent indicators.
 */

import { KpiCard } from './KpiCard';

export function KpiCardExamples() {
  return (
    <div className="p-8 bg-beige/10 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-12">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-charcoal mb-2">KpiCard Component Examples</h1>
          <p className="text-charcoal/70">Financial metrics with Press On Ventures brand styling</p>
        </div>

        {/* Basic Usage */}
        <section>
          <h2 className="text-2xl font-bold text-charcoal mb-4">Basic Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Net IRR"
              value="24.5%"
            />
            <KpiCard
              label="Total Fund Size"
              value="$100M"
            />
            <KpiCard
              label="Portfolio Companies"
              value="30"
            />
            <KpiCard
              label="Deployed Capital"
              value="$65.2M"
            />
          </div>
        </section>

        {/* With Positive Delta */}
        <section>
          <h2 className="text-2xl font-bold text-charcoal mb-4">Positive Performance Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Net IRR"
              value="24.5%"
              delta="+2.1%"
              intent="positive"
            />
            <KpiCard
              label="Total Value"
              value="$125.3M"
              delta="+8.5%"
              intent="positive"
            />
            <KpiCard
              label="Active Investments"
              value="28"
              delta="+4"
              intent="positive"
            />
            <KpiCard
              label="Avg Check Size"
              value="$2.2M"
              delta="+$0.3M"
              intent="positive"
            />
          </div>
        </section>

        {/* With Negative Delta */}
        <section>
          <h2 className="text-2xl font-bold text-charcoal mb-4">Negative Performance Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Unrealized Loss"
              value="$3.2M"
              delta="-5.2%"
              intent="negative"
            />
            <KpiCard
              label="Write-offs"
              value="2"
              delta="+2"
              intent="negative"
            />
            <KpiCard
              label="Burn Rate"
              value="$850K/mo"
              delta="+15%"
              intent="negative"
            />
            <KpiCard
              label="Runway"
              value="14 months"
              delta="-3 mo"
              intent="negative"
            />
          </div>
        </section>

        {/* With Neutral Delta */}
        <section>
          <h2 className="text-2xl font-bold text-charcoal mb-4">Neutral Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Reserved Capital"
              value="$35M"
              delta="0%"
              intent="neutral"
            />
            <KpiCard
              label="Fund Term"
              value="10 years"
              delta="unchanged"
              intent="neutral"
            />
            <KpiCard
              label="Management Fee"
              value="2.0%"
              delta="stable"
              intent="neutral"
            />
            <KpiCard
              label="Carry"
              value="20%"
              delta="fixed"
              intent="neutral"
            />
          </div>
        </section>

        {/* Real-world Dashboard Example */}
        <section>
          <h2 className="text-2xl font-bold text-charcoal mb-4">Fund Dashboard Example</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Total Commitment"
              value="$100.0M"
              delta="+$0M"
              intent="neutral"
            />
            <KpiCard
              label="Deployed Capital"
              value="$65.2M"
              delta="+$5.5M"
              intent="positive"
            />
            <KpiCard
              label="Deployment Rate"
              value="65.2%"
              delta="+5.5%"
              intent="positive"
            />
            <KpiCard
              label="Current IRR"
              value="24.5%"
              delta="+2.1%"
              intent="positive"
            />
          </div>
        </section>

        {/* Custom Styling Example */}
        <section>
          <h2 className="text-2xl font-bold text-charcoal mb-4">Custom Styling</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Highlighted Metric"
              value="99.9%"
              delta="+10%"
              intent="positive"
              className="ring-2 ring-success"
            />
            <KpiCard
              label="Large Card"
              value="$500M"
              delta="+25%"
              intent="positive"
              className="col-span-2"
            />
            <KpiCard
              label="Alert Metric"
              value="Critical"
              delta="-50%"
              intent="negative"
              className="ring-2 ring-error"
            />
          </div>
        </section>

        {/* Code Example */}
        <section className="bg-white p-6 rounded-lg border border-lightGray">
          <h2 className="text-2xl font-bold text-charcoal mb-4">Code Example</h2>
          <pre className="bg-charcoal text-white p-4 rounded-lg overflow-x-auto">
            <code>{`import { KpiCard } from '@/components/ui/KpiCard';

export function MyDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <KpiCard
        label="Net IRR"
        value="24.5%"
        delta="+2.1%"
        intent="positive"
      />
      <KpiCard
        label="Total Fund Size"
        value="$100M"
      />
      <KpiCard
        label="Portfolio Companies"
        value="30"
        delta="+3"
        intent="positive"
      />
      <KpiCard
        label="Current Losses"
        value="$2.1M"
        delta="-5%"
        intent="negative"
      />
    </div>
  );
}`}</code>
          </pre>
        </section>

        {/* Props Documentation */}
        <section className="bg-white p-6 rounded-lg border border-lightGray">
          <h2 className="text-2xl font-bold text-charcoal mb-4">Props</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-charcoal">label: string (required)</h3>
              <p className="text-charcoal/70">The metric label displayed above the value</p>
            </div>
            <div>
              <h3 className="font-bold text-charcoal">value: string (required)</h3>
              <p className="text-charcoal/70">The formatted metric value (pre-formatted externally)</p>
            </div>
            <div>
              <h3 className="font-bold text-charcoal">delta?: string (optional)</h3>
              <p className="text-charcoal/70">Change indicator (e.g., "+2.3%" or "-5%")</p>
            </div>
            <div>
              <h3 className="font-bold text-charcoal">intent?: 'positive' | 'negative' | 'neutral' (optional)</h3>
              <p className="text-charcoal/70">Determines the color of the delta (default: 'neutral')</p>
              <ul className="mt-2 space-y-1 ml-4">
                <li className="text-success">• positive: green color (#10b981)</li>
                <li className="text-error">• negative: red color (#ef4444)</li>
                <li className="text-charcoal/60">• neutral: charcoal 60% opacity</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-charcoal">className?: string (optional)</h3>
              <p className="text-charcoal/70">Additional CSS classes for custom styling</p>
            </div>
          </div>
        </section>

        {/* Design Notes */}
        <section className="bg-beige/30 p-6 rounded-lg border border-beige">
          <h2 className="text-2xl font-bold text-charcoal mb-4">Design Notes</h2>
          <ul className="space-y-2 text-charcoal/70">
            <li>• Uses Press On Ventures brand colors (charcoal #292929, beige #E0D8D1)</li>
            <li>• Includes tabular-nums class for proper numeric alignment</li>
            <li>• Card styling with border-lightGray (#F2F2F2) and shadow-card</li>
            <li>• Hover effect with elevated shadow for better interaction feedback</li>
            <li>• Responsive grid layouts work well with 1-4 columns</li>
            <li>• Values should be pre-formatted (component displays as-is)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// Example with real data formatting
export function KpiCardWithFormattedData() {
  // Example data
  const fundSize = 100000000; // $100M
  const deployedCapital = 65200000; // $65.2M
  const portfolioCompanies = 30;
  const currentIRR = 0.245; // 24.5%

  // Format helpers
  const formatCurrency = (value: number) => {
    const millions = value / 1000000;
    return `$${millions.toFixed(1)}M`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatDelta = (current: number, previous: number) => {
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${((diff / previous) * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-8">
      <KpiCard
        label="Total Fund Size"
        value={formatCurrency(fundSize)}
      />
      <KpiCard
        label="Deployed Capital"
        value={formatCurrency(deployedCapital)}
        delta={formatDelta(deployedCapital, 59700000)}
        intent="positive"
      />
      <KpiCard
        label="Portfolio Companies"
        value={portfolioCompanies.toString()}
        delta="+3"
        intent="positive"
      />
      <KpiCard
        label="Current IRR"
        value={formatPercent(currentIRR)}
        delta="+2.1%"
        intent="positive"
      />
    </div>
  );
}
