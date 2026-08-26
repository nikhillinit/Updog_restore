import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConstructionActualComparison } from './construction-actual-comparison';

export default function ProjectedPerformance() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Projected performance is not exposed from this legacy route</CardTitle>
          <CardDescription>
            The canonical deterministic forecasting surface is `/financial-modeling`, and
            publish-to-publish comparison lives on the fund results page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This legacy page no longer renders sample TVPI, pacing, or comparison charts as if they
            were live forecasting data.
          </p>
          <p>
            Reintroduce this surface only after it is wired to authoritative inputs and an explicit
            route decision promotes it back into the governed product perimeter.
          </p>
        </CardContent>
      </Card>

      <ConstructionActualComparison />
    </div>
  );
}
