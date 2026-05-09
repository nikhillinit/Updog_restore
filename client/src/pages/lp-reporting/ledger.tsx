/**
 * LP Reporting -- Ledger placeholder page.
 *
 * Phase 1b.1 scaffold. The full ledger surface (cash-flow events
 * table with filters, paid-in / distributions / NAV columns) lands
 * in batch 1b.2.
 *
 * @module client/pages/lp-reporting/ledger
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LpReportingLedgerPage() {
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Ledger</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          Cash-flow events: paid-in capital, distributions, fund expenses.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Phase 1b.2 pending</CardTitle>
          <CardDescription>
            The cash-flow events table will land in the next batch of the LP reporting UI rollout.
            This route is scaffolded so navigation and deep-links work today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-charcoal/70 font-poppins">No ledger data to display yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
