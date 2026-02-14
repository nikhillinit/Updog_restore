/**
 * ImportDealsModal - Modal for importing deals from CSV
 *
 * Provides a drag-and-drop interface for uploading CSV files
 * containing deal data for bulk import.
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
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, X, Loader2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_ROWS = 1000;
const MAX_COLUMNS = 30;
const MAX_MONEY_VALUE = 1e12;

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

interface CsvRow {
  companyName: string;
  sector: string;
  stage: string;
  sourceType: string;
  dealSize?: string;
  valuation?: string;
  status?: string;
  priority?: string;
  foundedYear?: string;
  employeeCount?: string;
  revenue?: string;
  description?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  sourceNotes?: string;
  nextAction?: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; message: string }>;
}

export function ImportDealsModal({ open, onOpenChange, fundId }: ImportDealsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<CsvRow[] | null>(null);

  const parseCSV = useCallback((text: string): CsvRow[] => {
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

    const rows: CsvRow[] = [];
    const data = result.data.slice(0, MAX_ROWS);
    for (const raw of data) {
      const mapped: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (key && KNOWN_HEADERS[key.toLowerCase().replace(/[\s_-]+/g, '')] !== undefined) {
          mapped[key] = typeof value === 'string' ? value : '';
        }
      }
      rows.push(mapped as unknown as CsvRow);
    }

    if (result.data.length > MAX_ROWS) {
      throw new Error(`CSV has ${result.data.length} rows (max ${MAX_ROWS})`);
    }

    return rows;
  }, []);

  const parseMoney = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0 || num > MAX_MONEY_VALUE) return undefined;
    return num;
  };

  const parseIntSafe = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const num = parseInt(value, 10);
    if (!Number.isFinite(num) || num < 0) return undefined;
    return num;
  };

  const importMutation = useMutation({
    mutationFn: async (importFile: File): Promise<ImportResult> => {
      if (importFile.size > MAX_FILE_SIZE) {
        throw new Error(`File is ${(importFile.size / 1024 / 1024).toFixed(1)} MB (max 2 MB)`);
      }

      const text = await importFile.text();
      const rows = parseCSV(text);

      const validRows: Array<{ row: CsvRow; csvLine: number }> = [];
      const errors: Array<{ row: number; message: string }> = [];

      rows.forEach((row, index) => {
        const csvLine = index + 2; // +1 for 0-index, +1 for header row

        if (!row.companyName?.trim()) {
          errors.push({ row: csvLine, message: 'Company name is required' });
          return;
        }
        if (!row.sector?.trim()) {
          errors.push({ row: csvLine, message: 'Sector is required' });
          return;
        }
        if (!row.stage?.trim()) {
          errors.push({ row: csvLine, message: 'Stage is required' });
          return;
        }
        if (!row.sourceType?.trim()) {
          errors.push({ row: csvLine, message: 'Source type is required' });
          return;
        }

        validRows.push({ row, csvLine });
      });

      let imported = 0;
      for (const { row, csvLine } of validRows) {
        try {
          const response = await fetch('/api/deals/opportunities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              companyName: row.companyName,
              sector: row.sector,
              stage: row.stage,
              sourceType: row.sourceType,
              status: row.status || undefined,
              priority: row.priority || undefined,
              fundId,
              dealSize: parseMoney(row.dealSize),
              valuation: parseMoney(row.valuation),
              foundedYear: parseIntSafe(row.foundedYear),
              employeeCount: parseIntSafe(row.employeeCount),
              revenue: parseMoney(row.revenue),
            }),
          });

          if (response.ok) {
            imported++;
          } else {
            const error = await response.json();
            errors.push({ row: csvLine, message: error.message || 'Failed to import' });
          }
        } catch (err) {
          errors.push({
            row: csvLine,
            message: err instanceof Error ? err.message : 'Network error',
          });
        }
      }

      return {
        success: errors.length === 0,
        imported,
        errors,
      };
    },
    onSuccess: (result) => {
      if (result.errors.length === 0) {
        toast({
          title: 'Import successful',
          description: `${result.imported} deals imported successfully.`,
        });
      } else if (result.imported > 0) {
        toast({
          title: 'Import partially successful',
          description: `${result.imported} deals imported, ${result.errors.length} errors.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Import failed',
          description: `No deals imported. ${result.errors.length} errors found.`,
          variant: 'destructive',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/deals/opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals/pipeline'] });
      handleClose();
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

    // Parse preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows.slice(0, 5)); // Show first 5 rows (stored in _preview for future use)
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClose = () => {
    setFile(null);
    setPreview(null);
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-inter text-pov-charcoal">Import Deals</DialogTitle>
          <DialogDescription className="font-poppins">
            Upload a CSV file to import multiple deals at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
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
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <span className="font-poppins font-medium text-sm">{file.name}</span>
                  <span className="font-poppins text-xs text-gray-400">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Preview */}
              {preview && preview.length > 0 && (
                <div className="mt-3">
                  <p className="font-poppins text-xs text-gray-500 mb-2">
                    Preview ({preview.length} rows):
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-1 px-2 font-medium text-gray-600">Company</th>
                          <th className="text-left py-1 px-2 font-medium text-gray-600">Sector</th>
                          <th className="text-left py-1 px-2 font-medium text-gray-600">Stage</th>
                          <th className="text-left py-1 px-2 font-medium text-gray-600">
                            Deal Size
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row: CsvRow, index: number) => (
                          <tr key={index} className="border-b border-gray-100">
                            <td className="py-1 px-2 truncate max-w-[120px]">{row.companyName}</td>
                            <td className="py-1 px-2">{row.sector}</td>
                            <td className="py-1 px-2">{row.stage}</td>
                            <td className="py-1 px-2">{row.dealSize ? `$${row.dealSize}` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="text-xs text-gray-500 font-poppins space-y-1">
            <p>Required columns: companyName, sector, stage, sourceType</p>
            <p>Optional columns: dealSize, valuation, status, priority, etc.</p>
            <p>Stage values: Pre-seed, Seed, Series A, Series B, Series C, Growth, Late Stage</p>
            <p>Source values: Referral, Cold outreach, Inbound, Event, Network, Other</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="border-pov-beige"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => file && importMutation.mutate(file)}
            disabled={!file || importMutation.isPending}
            className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              'Import Deals'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
