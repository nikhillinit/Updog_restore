import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ConstructionActualComparison() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Construction vs. actual comparison remains deferred</CardTitle>
        <CardDescription>
          Fund-level comparison now lives on the results page. This legacy forecasting slice no
          longer renders sample stage, round-size, or valuation comparison tables as if they were
          authoritative.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Use publish comparison on the fund results surface for the current truth-backed v1
          comparison workflow.
        </p>
        <p>
          Round-level, entry-stage, and valuation-tier breakdowns stay deferred until they can be
          backed by stable server-side provenance instead of static sample arrays.
        </p>
      </CardContent>
    </Card>
  );
}
