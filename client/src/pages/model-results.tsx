import { Link, Redirect } from 'wouter';
import { BarChart3 } from 'lucide-react';
import { useFundContext } from '@/contexts/FundContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ModelResults() {
  const { currentFund } = useFundContext();

  if (currentFund?.id) {
    return <Redirect to={`/fund-model-results/${currentFund.id}`} />;
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Model Results</h1>
        <p className="text-muted-foreground mt-2">
          Select a fund before opening the canonical model results workspace.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-charcoal/10 p-2 text-charcoal">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Select a fund to view model results</CardTitle>
              <CardDescription>
                Results are fund-scoped and load through /fund-model-results/:fundId once a fund is
                available.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use fund setup to create or choose the fund context, or return to the dashboard if you
            already have a fund selected in another workspace.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/fund-setup">Set up a fund</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
