/**
 * LP Reporting -- Metrics placeholder page.
 *
 * Phase 1b.1 scaffold. The full DPI / RVPI / TVPI / MOIC / IRR
 * surface (with metric-run dry-run, XIRR diagnostic strip, and metric
 * cards) lands in batch 1b.4.
 *
 * @module client/pages/lp-reporting/metrics
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LpReportingMetricsPage() {
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Metrics</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          DPI, RVPI, TVPI, MOIC, Net IRR, Gross IRR with XIRR convergence diagnostics.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Phase 1b.4 pending</CardTitle>
          <CardDescription>
            The metric-run dry-run cards and XIRR diagnostic strip will land in batch 1b.4. This
            route is scaffolded so navigation and deep-links work today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-charcoal/70 font-poppins">No metrics to display yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
