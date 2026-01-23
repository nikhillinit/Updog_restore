/**
 * ReviewStep - Step 7: Review & Create
 *
 * Final step in the fund setup wizard showing a summary of all configurations
 * and allowing the user to create the fund.
 */

import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertTriangle, ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import { useFundContext } from '@/contexts/FundContext';
import { cn, formatCurrency } from '@/lib/utils';

interface SummarySection {
  title: string;
  items: Array<{ label: string; value: string | number; status?: 'ok' | 'warning' | 'missing' }>;
}

export default function ReviewStep() {
  const [, setLocation] = useLocation();
  const { currentFund } = useFundContext();

  // Build summary from fund data
  const sections = useMemo<SummarySection[]>(() => {
    if (!currentFund) return [];

    return [
      {
        title: 'Fund Basics',
        items: [
          { label: 'Fund Name', value: currentFund.name || 'Unnamed Fund', status: currentFund.name ? 'ok' : 'missing' },
          { label: 'Fund Size', value: formatCurrency(currentFund.totalCommitment ?? 0), status: currentFund.totalCommitment ? 'ok' : 'warning' },
          { label: 'Vintage Year', value: currentFund.vintageYear ?? 'Not set', status: currentFund.vintageYear ? 'ok' : 'warning' },
          { label: 'Fund Life', value: currentFund.fundLife ? `${currentFund.fundLife} years` : 'Not set', status: currentFund.fundLife ? 'ok' : 'warning' },
        ],
      },
      {
        title: 'Economics',
        items: [
          { label: 'Management Fee', value: currentFund.managementFee ? `${(currentFund.managementFee * 100).toFixed(2)}%` : 'Not set', status: currentFund.managementFee !== undefined ? 'ok' : 'warning' },
          { label: 'Carry', value: currentFund.carry ? `${(currentFund.carry * 100).toFixed(0)}%` : 'Not set', status: currentFund.carry !== undefined ? 'ok' : 'warning' },
          { label: 'Preferred Return', value: currentFund.preferredReturn ? `${(currentFund.preferredReturn * 100).toFixed(0)}%` : 'Not set', status: currentFund.preferredReturn !== undefined ? 'ok' : 'warning' },
        ],
      },
      {
        title: 'Investment Strategy',
        items: [
          { label: 'Target Companies', value: currentFund.targetCompanies ?? 'Not configured', status: currentFund.targetCompanies ? 'ok' : 'warning' },
          { label: 'Reserve Ratio', value: currentFund.reserveRatio ? `${(currentFund.reserveRatio * 100).toFixed(0)}%` : 'Not set', status: currentFund.reserveRatio !== undefined ? 'ok' : 'warning' },
        ],
      },
    ];
  }, [currentFund]);

  // Validation summary
  const validationSummary = useMemo(() => {
    const allItems = sections.flatMap(s => s.items);
    const ok = allItems.filter(i => i.status === 'ok').length;
    const warnings = allItems.filter(i => i.status === 'warning').length;
    const missing = allItems.filter(i => i.status === 'missing').length;
    return { ok, warnings, missing, total: allItems.length };
  }, [sections]);

  const handleBack = () => {
    setLocation('/fund-setup?step=6');
  };

  const handleCreate = () => {
    // In a real implementation, this would trigger fund creation API
    // For now, redirect to dashboard
    setLocation('/');
  };

  const getStatusIcon = (status?: 'ok' | 'warning' | 'missing') => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'missing':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-8" data-testid="review-step">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-presson-text">Review & Create Fund</h1>
        <p className="text-presson-textMuted">
          Review your fund configuration before creating. You can go back to any step to make changes.
        </p>
      </div>

      {/* Validation Summary */}
      <Alert
        className={cn(
          'border-l-4',
          validationSummary.missing > 0
            ? 'border-l-red-500 bg-red-50'
            : validationSummary.warnings > 0
              ? 'border-l-amber-500 bg-amber-50'
              : 'border-l-green-500 bg-green-50'
        )}
      >
        <AlertTitle className="flex items-center gap-2">
          {validationSummary.missing > 0 ? (
            <>
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Missing Required Fields
            </>
          ) : validationSummary.warnings > 0 ? (
            <>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Some Fields Need Attention
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              Ready to Create
            </>
          )}
        </AlertTitle>
        <AlertDescription>
          {validationSummary.ok} of {validationSummary.total} fields configured
          {validationSummary.warnings > 0 && ` (${validationSummary.warnings} warnings)`}
          {validationSummary.missing > 0 && ` (${validationSummary.missing} missing)`}
        </AlertDescription>
      </Alert>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} className="border-presson-borderSubtle">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-presson-text">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-presson-textMuted">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-presson-text">{item.value}</span>
                    {getStatusIcon(item.status)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Step 6
        </Button>

        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-sm">
            Step 7 of 7
          </Badge>

          <Button
            onClick={handleCreate}
            disabled={validationSummary.missing > 0}
            className="gap-2 bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
            data-testid="create-fund-button"
          >
            <Rocket className="h-4 w-4" />
            Create Fund
          </Button>
        </div>
      </div>
    </div>
  );
}
