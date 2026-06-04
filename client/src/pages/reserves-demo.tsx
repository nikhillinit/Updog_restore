import GraduationReservesDemo from '@/components/reserves/graduation-reserves-demo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calculator, Lightbulb } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function ReservesDemo() {
  return (
    <div className="min-h-screen bg-pov-gray">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center mb-2">
                <Link href="/">
                  <Button variant="ghost" size="sm" className="mr-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
                <Badge variant="outline" className="bg-presson-info/10 text-presson-info">
                  Interactive Demo
                </Badge>
              </div>
              <h1 className="text-3xl font-bold text-pov-charcoal">
                Graduation-Driven Reserves Demo
              </h1>
              <p className="text-charcoal-600 mt-2">
                See how different portfolio strategies impact your follow-on reserve requirements
              </p>
            </div>
          </div>
        </div>

        {/* Methodology Explanation */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <Lightbulb className="w-5 h-5 mr-2 text-presson-warning" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-charcoal-700">
                The <strong>Graduation-Driven Reserves Engine</strong> calculates your follow-on
                capital needs based on expected portfolio company progression through funding
                stages, rather than using arbitrary reserve ratio percentages.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-pov-gray p-4 rounded-lg border border-beige-200">
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 bg-pov-charcoal rounded-full flex items-center justify-center text-pov-white font-bold text-sm">
                      1
                    </div>
                    <span className="ml-3 font-semibold text-pov-charcoal">
                      Graduation Modeling
                    </span>
                  </div>
                  <p className="text-sm text-charcoal-600">
                    Models how many companies will advance from Seed → Series A → Series B → Series
                    C based on your sector assumptions and historical data.
                  </p>
                </div>

                <div className="bg-pov-gray p-4 rounded-lg border border-beige-200">
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 bg-pov-charcoal rounded-full flex items-center justify-center text-pov-white font-bold text-sm">
                      2
                    </div>
                    <span className="ml-3 font-semibold text-pov-charcoal">Follow-on Strategy</span>
                  </div>
                  <p className="text-sm text-charcoal-600">
                    Applies your follow-on check sizes and participation rates to calculate the
                    exact capital needed for each future funding round.
                  </p>
                </div>

                <div className="bg-pov-gray p-4 rounded-lg border border-beige-200">
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 bg-pov-charcoal rounded-full flex items-center justify-center text-pov-white font-bold text-sm">
                      3
                    </div>
                    <span className="ml-3 font-semibold text-pov-charcoal">
                      Reserve Calculation
                    </span>
                  </div>
                  <p className="text-sm text-charcoal-600">
                    Sums up all follow-on capital requirements over your investment horizon to
                    determine the optimal reserve ratio for your fund.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Component */}
        <GraduationReservesDemo />

        {/* Integration Note */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Calculator className="w-5 h-5 mr-2 text-charcoal-600" />
              Integration with Fund Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-pov-gray p-4 rounded-lg">
              <p className="text-charcoal-700 mb-3">
                This graduation-driven approach has been integrated into your Fund Allocation
                Manager, replacing hardcoded reserve ratios with dynamic calculations based on:
              </p>
              <ul className="text-sm text-charcoal-600 space-y-1 ml-4">
                <li>• Your fund's target company count and deployment pace</li>
                <li>• Sector-specific graduation rates and timing assumptions</li>
                <li>• Follow-on check sizes for Series A, B, and C rounds</li>
                <li>• Portfolio company progression modeling over 40+ quarters</li>
              </ul>
              <div className="mt-4">
                <Link href="/allocation-manager">
                  <Button>View Allocation Manager</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
