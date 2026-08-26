/**
 * LP Reports Page
 *
 * Report center with generation wizard and download history.
 *
 * @module client/pages/lp/reports
 */

import { useState } from 'react';
import { useLPReports, useGenerateLPReport } from '@/hooks/useLPReports';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import type { ReportType, ReportFormat } from '@shared/types/lp-api';

// ============================================================================
// COMPONENT
// ============================================================================

export default function LPReports() {
  const { data: reportsData } = useLPReports({ limit: 20 });
  const { mutate: generateReport, isPending } = useGenerateLPReport();

  const [selectedType, setSelectedType] = useState<ReportType>('quarterly_statement');
  const [selectedFormat] = useState<ReportFormat>('pdf');

  const handleGenerate = () => {
    generateReport({
      reportType: selectedType,
      format: selectedFormat,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-success-dark" />;
      case 'generating':
      case 'pending':
        return <Clock className="h-4 w-4 text-warning-dark" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-error-dark" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-inter text-pov-charcoal">Reports</h1>
        <p className="text-charcoal-600 font-poppins mt-1">Generate and download LP reports</p>
      </div>

      {/* Report Generation */}
      <Card className="bg-white rounded-xl border border-beige-200 shadow-md">
        <CardHeader>
          <CardTitle className="font-inter text-lg text-pov-charcoal">
            Generate New Report
          </CardTitle>
          <CardDescription className="font-poppins text-sm text-charcoal-600">
            Create quarterly statements, annual reports, and K-1 tax documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant={selectedType === 'quarterly_statement' ? 'default' : 'outline'}
              className="h-24 flex flex-col items-center gap-2"
              onClick={() => setSelectedType('quarterly_statement')}
            >
              <FileText className="h-6 w-6" />
              <span>Quarterly Statement</span>
            </Button>
            <Button
              variant={selectedType === 'annual_statement' ? 'default' : 'outline'}
              className="h-24 flex flex-col items-center gap-2"
              onClick={() => setSelectedType('annual_statement')}
            >
              <FileText className="h-6 w-6" />
              <span>Annual Statement</span>
            </Button>
            <Button
              variant={selectedType === 'k1_tax' ? 'default' : 'outline'}
              className="h-24 flex flex-col items-center gap-2"
              onClick={() => setSelectedType('k1_tax')}
            >
              <FileText className="h-6 w-6" />
              <span>K-1 Tax Form</span>
            </Button>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={handleGenerate} disabled={isPending}>
              {isPending ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report History */}
      <Card className="bg-white rounded-xl border border-beige-200 shadow-md">
        <CardHeader>
          <CardTitle className="font-inter text-lg text-pov-charcoal">Report History</CardTitle>
          <CardDescription className="font-poppins text-sm text-charcoal-600">
            Previously generated reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportsData && reportsData.reports.length > 0 ? (
            <div className="space-y-3">
              {reportsData.reports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-4 border border-beige-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(report.status)}
                    <div>
                      <div className="font-inter font-medium text-pov-charcoal">
                        {report.reportType
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </div>
                      <div className="text-sm font-poppins text-charcoal-600">
                        {report.generatedAt
                          ? new Date(report.generatedAt).toLocaleDateString()
                          : 'Processing...'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant={report.status === 'ready' ? 'default' : 'outline'}>
                      {report.status}
                    </Badge>
                    {report.status === 'ready' && report.downloadUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={report.downloadUrl} download>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-charcoal-400 font-poppins">
              No reports generated yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
