import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForecastingPage() {
  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Forecasting</h1>
        <p className="text-muted-foreground">
          This legacy route is intentionally kept non-authoritative while the canonical deterministic
          and comparison surfaces remain elsewhere.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Legacy forecasting route remains deferred</CardTitle>
          <CardDescription>
            `/financial-modeling` is the current deterministic forecasting surface. Fund-level
            publish comparison lives on the fund results page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Sample fund summaries, projection charts, and construction-vs-actual comparison tables
            have been removed from this route so it does not present placeholder data as product
            truth.
          </p>
          <p>
            If this route is revived later, it should return only with authoritative backend wiring
            and an explicit route-governance decision.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
