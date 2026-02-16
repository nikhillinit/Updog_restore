/**
 * ImportDealsModal - Two-phase CSV import with preview and deduplication
 *
 * Phase 1: Upload CSV -> validate + preview (shows duplicates, invalid rows)
 * Phase 2: Confirm import with skip_duplicates or import_all mode
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { parseMoney, parseIntSafe } from '@/utils/parse-helpers';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_ROWS = 1000;
const MAX_COLUMNS = 30;

const KNOWN_HEADERS: Record<string, string> = {
  companyname: 'companyName',
  sector: 'sector',
  stage: 'stage',
  sourcetype: 'sourceType',
  dealsize: 'dealSize',
  valuation: 'valuation',
  status: 'status',
  priority: 'priority',
  foundedyear: 'foundedYear',
  employeecount: 'employeeCount',
  revenue: 'revenue',
  description: 'description',
  website: 'website',
  contactname: 'contactName',
  contactemail: 'contactEmail',
  contactphone: 'contactPhone',
  sourcenotes: 'sourceNotes',
  nextaction: 'nextAction',
};

interface ImportDealsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundId?: number;
}

interface PreviewData {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  toImport: number;
  invalidRows: Array<{ index: number; errors: string[] }>;
  duplicateRows: Array<{ index: number; existingId: number; companyName: string }>;
}

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  failedRows: Array<{ index: number; message: string }>;
  total: number;
}

type Phase = 'upload' | 'preview' | 'done';

function parseCSV(text: string): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header: string) => {
      const normalized = header
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
      return KNOWN_HEADERS[normalized] ?? '';
    },
  });

  if (result.meta.fields && result.meta.fields.length > MAX_COLUMNS) {
    throw new Error(`CSV has ${result.meta.fields.length} columns (max ${MAX_COLUMNS})`);
  }

  if (result.data.length > MAX_ROWS) {
    throw new Error(`CSV has ${result.data.length} rows (max ${MAX_ROWS})`);
  }

  return result.data.map((raw) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!key) continue;
      const val = typeof value === 'string' ? value.trim() : '';
      if (key === 'dealSize' || key === 'valuation' || key === 'revenue') {
        mapped[key] = parseMoney(val);
      } else if (key === 'foundedYear' || key === 'employeeCount') {
        mapped[key] = parseIntSafe(val);
      } else if (val) {
        mapped[key] = val;
      }
    }
    return mapped;
  });
}

export function ImportDealsModal({ open, onOpenChange, fundId }: ImportDealsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>('upload');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      return apiRequest<{ success: boolean; data: PreviewData }>(
        'POST',
        '/api/deals/opportunities/import/preview',
        { rows, fundId }
      );
    },
    onSuccess: (result) => {
      setPreview(result.data);
      setPhase('preview');
    },
    onError: (error: Error) => {
      toast({
        title: 'Preview failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (mode: 'skip_duplicates' | 'import_all') => {
      // Filter to only valid rows for import (server does its own validation too)
      return apiRequest<{ success: boolean; data: ImportResult }>(
        'POST',
        '/api/deals/opportunities/import',
        { rows: parsedRows, fundId, mode }
      );
    },
    onSuccess: (result) => {
      setImportResult(result.data);
      setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['/api/deals/opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals/pipeline'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (selectedFile: File) => {
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV file.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast({
        title: 'File too large',
        description: `Maximum file size is 2 MB. Your file is ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB.`,
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
    selectedFile.text().then((text) => {
      try {
        const rows = parseCSV(text);
        setParsedRows(rows);
        previewMutation.mutate(rows);
      } catch (err) {
        toast({
          title: 'Parse error',
          description: err instanceof Error ? err.message : 'Failed to parse CSV',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileChange(droppedFile);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fundId]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClose = () => {
    if (previewMutation.isPending || importMutation.isPending) return;
    setFile(null);
    setPreview(null);
    setParsedRows([]);
    setImportResult(null);
    setPhase('upload');
    setIsDragging(false);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const headers = [
      'companyName',
      'sector',
      'stage',
      'sourceType',
      'dealSize',
      'valuation',
      'status',
      'priority',
      'foundedYear',
      'employeeCount',
      'revenue',
      'description',
      'website',
      'contactName',
      'contactEmail',
      'contactPhone',
      'sourceNotes',
      'nextAction',
    ].join(',');
    const example = [
      'Acme Inc',
      'FinTech',
      'Seed',
      'Referral',
      '1000000',
      '5000000',
      'lead',
      'high',
      '2021',
      '25',
      '500000',
      'AI-powered payment processing',
      'https://acme.com',
      'John Doe',
      'john@acme.com',
      '+1234567890',
      'Warm intro from portfolio founder',
      'Schedule initial pitch',
    ].join(',');
    const csv = `${headers}\n${example}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deals_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPending = previewMutation.isPending || importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-inter text-pov-charcoal">Import Deals</DialogTitle>
          <DialogDescription className="font-poppins">
            {phase === 'upload' && 'Upload a CSV file to import multiple deals at once.'}
            {phase === 'preview' && 'Review the import summary before confirming.'}
            {phase === 'done' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          {phase === 'upload' && (
            <>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <span className="font-poppins text-sm text-gray-600">Download template CSV</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                  className="border-pov-beige"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>

              {/* Drop Zone */}
              {!file ? (
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById('csv-upload')?.click();
                    }
                  }}
                  aria-label="Drop CSV file here or press Enter to select file"
                  className={cn(
                    'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                    isDragging
                      ? 'border-pov-charcoal bg-pov-charcoal/5'
                      : 'border-pov-beige hover:border-pov-charcoal/50'
                  )}
                >
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                  <p className="font-inter font-medium text-pov-charcoal mb-1">
                    Drop your CSV file here
                  </p>
                  <p className="font-poppins text-sm text-gray-500 mb-3">or click to browse</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                    className="hidden"
                    id="csv-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('csv-upload')?.click()}
                    className="border-pov-beige"
                  >
                    Select File
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-green-600" />
                      <span className="font-poppins font-medium text-sm">{file.name}</span>
                      <span className="font-poppins text-xs text-gray-400">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    {previewMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin text-pov-charcoal" />
                    )}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 font-poppins space-y-1">
                <p>Required columns: companyName, sector, stage, sourceType</p>
                <p>
                  Stage values: Pre-seed, Seed, Series A, Series B, Series C, Growth, Late Stage
                </p>
              </div>
            </>
          )}

          {/* Preview Phase */}
          {phase === 'preview' && preview && (
            <div className="space-y-3">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="font-inter font-bold text-lg text-pov-charcoal">{preview.total}</p>
                  <p className="font-poppins text-xs text-gray-500">Total rows</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="font-inter font-bold text-lg text-green-700">{preview.toImport}</p>
                  <p className="font-poppins text-xs text-green-600">Ready to import</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg text-center">
                  <p className="font-inter font-bold text-lg text-amber-700">
                    {preview.duplicates}
                  </p>
                  <p className="font-poppins text-xs text-amber-600">Duplicates</p>
                </div>
              </div>

              {/* Invalid Rows */}
              {preview.invalid > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {preview.invalid} row{preview.invalid > 1 ? 's' : ''} have validation errors and
                    will be skipped.
                    {preview.invalidRows.slice(0, 3).map((r) => (
                      <div key={r.index} className="text-xs mt-1">
                        Row {r.index + 2}: {r.errors.join('; ')}
                      </div>
                    ))}
                    {preview.invalidRows.length > 3 && (
                      <div className="text-xs mt-1">
                        ...and {preview.invalidRows.length - 3} more
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Duplicate Warning */}
              {preview.duplicates > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {preview.duplicates} deal{preview.duplicates > 1 ? 's' : ''} already exist:{' '}
                    {preview.duplicateRows
                      .slice(0, 5)
                      .map((d) => d.companyName)
                      .join(', ')}
                    {preview.duplicateRows.length > 5 &&
                      ` ...and ${preview.duplicateRows.length - 5} more`}
                  </AlertDescription>
                </Alert>
              )}

              {preview.toImport === 0 && preview.duplicates === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No valid rows to import. Fix the CSV and try again.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Done Phase */}
          {phase === 'done' && importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-inter font-semibold text-green-800">
                    {importResult.imported} deal{importResult.imported !== 1 ? 's' : ''} imported
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="font-poppins text-xs text-green-600">
                      {importResult.skipped} duplicates skipped
                    </p>
                  )}
                  {importResult.failed > 0 && (
                    <p className="font-poppins text-xs text-red-600">
                      {importResult.failed} failed
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {phase === 'upload' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-pov-beige"
            >
              Cancel
            </Button>
          )}

          {phase === 'preview' && preview && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setParsedRows([]);
                  setPhase('upload');
                }}
                disabled={isPending}
                className="border-pov-beige"
              >
                Back
              </Button>
              {preview.toImport > 0 && (
                <Button
                  type="button"
                  onClick={() => importMutation.mutate('skip_duplicates')}
                  disabled={isPending}
                  className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${preview.toImport} deal${preview.toImport !== 1 ? 's' : ''}`
                  )}
                </Button>
              )}
            </>
          )}

          {phase === 'done' && (
            <Button
              type="button"
              onClick={handleClose}
              className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
