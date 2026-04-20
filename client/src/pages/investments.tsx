import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function InvestmentsPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <Card data-testid="archived-investments-surface">
        <CardHeader>
          <CardTitle>Investments Surface Archived</CardTitle>
          <CardDescription>
            `/investments` is no longer part of the mounted runtime perimeter. Use the live
            portfolio company surfaces instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/portfolio">
            <Button>Go to Portfolio</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
