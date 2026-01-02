/**
 * Bulk Import Modal for Investments
 * Allows CSV upload and bulk data entry for investments
 */

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, Download, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface BulkImportModalProps {
  onImportComplete: (investments: any[]) => Promise<void>;
  children?: React.ReactNode;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; message: string; data?: any }>;
  warnings: Array<{ row: number; message: string; data?: any }>;
}

const CSV_TEMPLATE_HEADERS = [
  'company_name',
  'investment_date',
  'stage',
  'amount_invested',
  'valuation_pre_money',
  'valuation_post_money',
  'equity_percentage',
  'sector',
  'lead_investor',
  'status',
  'notes'
];

const SAMPLE_DATA = [
  {
    company_name: 'TechCorp Inc.',
    investment_date: '2024-01-15',
    stage: 'Series A',
    amount_invested: '2000000',
    valuation_pre_money: '8000000',
    valuation_post_money: '10000000',
    equity_percentage: '20',
    sector: 'Technology',
    lead_investor: 'Venture Partners',
    status: 'Active',
    notes: 'AI/ML platform for enterprise customers'
  },
  {
    company_name: 'FinTech Pro',
    investment_date: '2024-02-20',
    stage: 'Seed',
    amount_invested: '500000',
    valuation_pre_money: '4500000',
    valuation_post_money: '5000000',
    equity_percentage: '10',
    sector: 'Financial Services',
    lead_investor: 'Growth Capital',
    status: 'Active',
    notes: 'Digital banking platform for SMEs'
  }
];

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  onImportComplete,
  children
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'processing' | 'results'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const generateTemplateCSV = () => {
    const csvContent = [
      CSV_TEMPLATE_HEADERS.join(','),
      ...SAMPLE_DATA.map(row =>
        CSV_TEMPLATE_HEADERS.map(header =>
          `"${(row as any)[header] || ''}"`
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investment_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const firstLine = lines[0];
    if (!firstLine) return [];
    const headers = firstLine.split(',').map(h => h.replace(/"/g, '').trim());
    const data = lines.slice(1).map((line, index) => {
      const values = line.split(',').map(v => v.replace(/"/g, '').trim());
      const row: any = { _rowNumber: index + 2 }; // +2 because of header and 0-indexing

      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });

      return row;
    });

    return data;
  };

  const validateData = (data: any[]): { valid: any[]; errors: Array<{ row: number; message: string; data?: any }> } => {
    const valid: any[] = [];
    const errors: Array<{ row: number; message: string; data?: any }> = [];

    data.forEach((row) => {
      const rowErrors: string[] = [];

      // Required fields validation
      if (!row.company_name) rowErrors.push('Company name is required');
      if (!row.investment_date) rowErrors.push('Investment date is required');
      if (!row.amount_invested) rowErrors.push('Investment amount is required');

      // Date format validation
      if (row.investment_date && isNaN(Date.parse(row.investment_date))) {
        rowErrors.push('Invalid date format (use YYYY-MM-DD)');
      }

      // Numeric validation
      if (row.amount_invested && isNaN(parseFloat(row.amount_invested))) {
        rowErrors.push('Investment amount must be a number');
      }
      if (row.valuation_pre_money && isNaN(parseFloat(row.valuation_pre_money))) {
        rowErrors.push('Pre-money valuation must be a number');
      }
      if (row.equity_percentage && (isNaN(parseFloat(row.equity_percentage)) || parseFloat(row.equity_percentage) < 0 || parseFloat(row.equity_percentage) > 100)) {
        rowErrors.push('Equity percentage must be a number between 0-100');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: row._rowNumber,
          message: rowErrors.join('; '),
          data: row
        });
      } else {
        valid.push({
          ...row,
          amount_invested: parseFloat(row.amount_invested),
          valuation_pre_money: row.valuation_pre_money ? parseFloat(row.valuation_pre_money) : undefined,
          valuation_post_money: row.valuation_post_money ? parseFloat(row.valuation_post_money) : undefined,
          equity_percentage: row.equity_percentage ? parseFloat(row.equity_percentage) : undefined,
          investment_date: new Date(row.investment_date)
        });
      }
    });

    return { valid, errors };
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      console.error('Please select a CSV file');
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setParsedData(parsed);
      setStep('preview');
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleImport = async () => {
    if (!parsedData.length) return;

    setStep('processing');
    setProgress(0);

    const { valid, errors } = validateData(parsedData);

    try {
      // Simulate processing progress
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (valid.length > 0) {
        await onImportComplete(valid);
      }

      setImportResult({
        success: true,
        imported: valid.length,
        errors,
        warnings: []
      });

      setStep('results');
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        errors: [{ row: 0, message: `Import failed: ${error}` }],
        warnings: []
      });
      setStep('results');
    }
  };

  const resetModal = () => {
    setStep('upload');
    setFile(null);
    setParsedData([]);
    setImportResult(null);
    setProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetModal();
    }}>
      <DialogTrigger asChild>
        {children || (
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Bulk Import
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bulk Import Investments
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="font-medium mb-2">Import investments from CSV</h3>
              <p className="text-gray-600 text-sm mb-6">
                Upload a CSV file with your investment data. Download our template to get started.
              </p>

              <Button
                variant="outline"
                onClick={generateTemplateCSV}
                className="gap-2 mb-6"
              >
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <div className="space-y-2">
                <Label htmlFor="csv-upload" className="cursor-pointer">
                  <span className="text-lg font-medium">Choose CSV file</span>
                  <Input
                    id="csv-upload"
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </Label>
                <p className="text-sm text-gray-500">or drag and drop your CSV file here</p>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                <strong>Required columns:</strong> company_name, investment_date, amount_invested<br/>
                <strong>Optional columns:</strong> stage, valuation_pre_money, equity_percentage, sector, lead_investor, status, notes
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Preview Import Data</h3>
              <span className="text-sm text-gray-600">{parsedData.length} rows found</span>
            </div>

            <div className="max-h-64 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {CSV_TEMPLATE_HEADERS.slice(0, 6).map(header => (
                      <th key={header} className="px-3 py-2 text-left font-medium">
                        {header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 10).map((row, index) => (
                    <tr key={index} className="border-t">
                      {CSV_TEMPLATE_HEADERS.slice(0, 6).map(header => (
                        <td key={header} className="px-3 py-2 truncate max-w-32">
                          {(row as any)[header] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedData.length > 10 && (
              <p className="text-sm text-gray-500 text-center">
                Showing first 10 rows. {parsedData.length - 10} more rows will be imported.
              </p>
            )}

            <div className="flex gap-2 pt-4">
              <Button onClick={handleImport} className="flex-1">
                Import {parsedData.length} Investment{parsedData.length !== 1 ? 's' : ''}
              </Button>
              <Button variant="outline" onClick={resetModal}>
                Start Over
              </Button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="space-y-6 text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <div>
              <h3 className="font-medium mb-2">Processing Import...</h3>
              <p className="text-gray-600 text-sm mb-4">Validating and importing your data</p>
              <Progress value={progress} className="w-full max-w-md mx-auto" />
              <p className="text-sm text-gray-500 mt-2">{progress}% complete</p>
            </div>
          </div>
        )}

        {step === 'results' && importResult && (
          <div className="space-y-6">
            <div className="text-center">
              {importResult.success ? (
                <>
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-medium text-green-900 mb-2">Import Completed Successfully!</h3>
                  <p className="text-gray-600">
                    {importResult.imported} investment{importResult.imported !== 1 ? 's' : ''} imported successfully
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="font-medium text-red-900 mb-2">Import Failed</h3>
                  <p className="text-gray-600">Please review the errors below and try again</p>
                </>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-red-900">Errors ({importResult.errors.length})</h4>
                <div className="max-h-48 overflow-auto space-y-1">
                  {importResult.errors.map((error, index) => (
                    <Alert key={index} className="border-red-200">
                      <AlertDescription className="text-sm">
                        <strong>Row {error.row}:</strong> {error.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setIsOpen(false)} className="flex-1">
                Done
              </Button>
              <Button variant="outline" onClick={resetModal}>
                Import More
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BulkImportModal;