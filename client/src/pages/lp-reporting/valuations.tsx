/**
 * LP Reporting -- Valuations placeholder page.
 *
 * Phase 1b.1 scaffold. The full valuation-marks surface lands in
 * batch 1b.3.
 *
 * @module client/pages/lp-reporting/valuations
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LpReportingValuationsPage() {
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Valuations</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          Per-company valuation marks with confidence levels and source attribution.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Phase 1b.3 pending</CardTitle>
          <CardDescription>
            The valuation marks table and per-company history drawer will land in batch 1b.3. This
            route is scaffolded so navigation and deep-links work today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-charcoal/70 font-poppins">
            No valuation marks to display yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
