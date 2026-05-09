/**
 * LP Reporting -- Imports placeholder page.
 *
 * Phase 1b.1 scaffold. The full ledger / valuation-mark dry-run
 * import surface (CSV / Notion source picker, validate button,
 * reconciliation summary, error tables) lands in batch 1b.5. No
 * commit affordance ever -- Phase 1b is dry-run only.
 *
 * @module client/pages/lp-reporting/imports
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LpReportingImportsPage() {
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Imports</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          Validate ledger and valuation-mark uploads via the protected dry-run endpoints. No commits
          in Phase 1b.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Phase 1b.5 pending</CardTitle>
          <CardDescription>
            The dry-run import surface will land in batch 1b.5. This route is scaffolded so
            navigation and deep-links work today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-charcoal/70 font-poppins">No imports to display yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
