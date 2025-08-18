/**
 * Dynamic export utilities for reserves data
 * Uses lazy loading to keep bundle size small
 */

import { isEnabled } from '@/lib/feature-flags';
import { metrics } from '@/metrics/reserves-metrics';
import type { ReservesOutput, Company } from '@shared/types/reserves-v11';

export interface ExportOptions {
  format: 'csv' | 'excel' | 'json';
  filename?: string;
  includeMetadata?: boolean;
  includeSummary?: boolean;
}

export interface ExportData {
  output: ReservesOutput;
  companies: Company[];
  config?: any;
  timestamp?: Date;
}

/**
 * Export reserves data to CSV format
 */
async function exportToCSV(data: ExportData, options: ExportOptions): Promise<void> {
  const timer = metrics.startTimer('export.csv');
  
  try {
    // Dynamic import of Papa Parse
    const Papa = await import('papaparse');
    
    // Prepare data for CSV
    const rows = data.output.allocations.map(allocation => {
      const company = data.companies.find(c => c.id === allocation.company_id);
      const rank = data.output.metadata.exit_moic_ranking.indexOf(allocation.company_id) + 1;
      
      return {
        Rank: rank,
        'Company ID': allocation.company_id,
        'Company Name': company?.name || 'Unknown',
        Stage: company?.stage || '',
        Sector: company?.sector || '',
        'Initial Investment': (company?.invested_cents || 0) / 100,
        'Exit MOIC': (company?.exit_moic_bps || 0) / 10000,
        'Reserve Allocation': allocation.planned_cents / 100,
        'Reserve %': company?.invested_cents 
          ? ((allocation.planned_cents / company.invested_cents) * 100).toFixed(2) + '%'
          : '0%',
        'Cap Amount': allocation.cap_cents / 100,
        'Allocation Pass': allocation.iteration,
        Reason: allocation.reason
      };
    });
    
    // Add summary rows if requested
    if (options.includeSummary) {
      rows.push({
        Rank: '',
        'Company ID': 'SUMMARY',
        'Company Name': '',
        Stage: '',
        Sector: '',
        'Initial Investment': '',
        'Exit MOIC': '',
        'Reserve Allocation': '',
        'Reserve %': '',
        'Cap Amount': '',
        'Allocation Pass': '',
        Reason: ''
      });
      
      rows.push({
        Rank: '',
        'Company ID': 'Total Available',
        'Company Name': data.output.metadata.total_available_cents / 100,
        Stage: '',
        Sector: '',
        'Initial Investment': '',
        'Exit MOIC': '',
        'Reserve Allocation': '',
        'Reserve %': '',
        'Cap Amount': '',
        'Allocation Pass': '',
        Reason: ''
      });
      
      rows.push({
        Rank: '',
        'Company ID': 'Total Allocated',
        'Company Name': data.output.metadata.total_allocated_cents / 100,
        Stage: '',
        Sector: '',
        'Initial Investment': '',
        'Exit MOIC': '',
        'Reserve Allocation': '',
        'Reserve %': '',
        'Cap Amount': '',
        'Allocation Pass': '',
        Reason: ''
      });
      
      rows.push({
        Rank: '',
        'Company ID': 'Remaining',
        'Company Name': data.output.remaining_cents / 100,
        Stage: '',
        Sector: '',
        'Initial Investment': '',
        'Exit MOIC': '',
        'Reserve Allocation': '',
        'Reserve %': '',
        'Cap Amount': '',
        'Allocation Pass': '',
        Reason: ''
      });
    }
    
    // Convert to CSV
    const csv = Papa.default.unparse(rows);
    
    // Download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || `reserves-allocation-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    metrics.recordDuration('export.csv.success', performance.now());
    
  } catch (error) {
    metrics.recordError(`CSV export failed: ${error}`);
    throw error;
  } finally {
    timer.end();
  }
}

/**
 * Export reserves data to Excel format
 */
async function exportToExcel(data: ExportData, options: ExportOptions): Promise<void> {
  const timer = metrics.startTimer('export.excel');
  
  try {
    // Dynamic import of xlsx
    const XLSX = await import('xlsx');
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Main allocations sheet
    const allocationsData = data.output.allocations.map(allocation => {
      const company = data.companies.find(c => c.id === allocation.company_id);
      const rank = data.output.metadata.exit_moic_ranking.indexOf(allocation.company_id) + 1;
      
      return {
        Rank: rank,
        'Company ID': allocation.company_id,
        'Company Name': company?.name || 'Unknown',
        Stage: company?.stage || '',
        Sector: company?.sector || '',
        'Initial Investment ($)': (company?.invested_cents || 0) / 100,
        'Exit MOIC': (company?.exit_moic_bps || 0) / 10000,
        'Reserve Allocation ($)': allocation.planned_cents / 100,
        'Reserve %': company?.invested_cents 
          ? ((allocation.planned_cents / company.invested_cents) * 100)
          : 0,
        'Cap Amount ($)': allocation.cap_cents / 100,
        'Allocation Pass': allocation.iteration,
        Reason: allocation.reason
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(allocationsData);
    
    // Auto-size columns
    const colWidths = [
      { wch: 6 },   // Rank
      { wch: 15 },  // Company ID
      { wch: 25 },  // Company Name
      { wch: 10 },  // Stage
      { wch: 12 },  // Sector
      { wch: 18 },  // Initial Investment
      { wch: 10 },  // Exit MOIC
      { wch: 20 },  // Reserve Allocation
      { wch: 12 },  // Reserve %
      { wch: 15 },  // Cap Amount
      { wch: 15 },  // Allocation Pass
      { wch: 40 }   // Reason
    ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Allocations');
    
    // Summary sheet
    if (options.includeSummary) {
      const summaryData = [
        { Metric: 'Total Available Reserves', Value: data.output.metadata.total_available_cents / 100 },
        { Metric: 'Total Allocated', Value: data.output.metadata.total_allocated_cents / 100 },
        { Metric: 'Remaining Reserves', Value: data.output.remaining_cents / 100 },
        { Metric: 'Companies Funded', Value: data.output.metadata.companies_funded },
        { Metric: 'Utilization %', 
          Value: ((data.output.metadata.total_allocated_cents / data.output.metadata.total_available_cents) * 100).toFixed(2) + '%' },
        { Metric: 'Conservation Check', Value: data.output.metadata.conservation_check ? 'Passed' : 'Warning' },
        { Metric: 'Max Iterations', Value: data.output.metadata.max_iterations },
        { Metric: 'Export Date', Value: new Date().toISOString() }
      ];
      
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    }
    
    // Metadata sheet
    if (options.includeMetadata && data.config) {
      const metadataData = [
        { Parameter: 'Reserve Percentage', Value: (data.config.reserve_bps / 100) + '%' },
        { Parameter: 'Remain Passes', Value: data.config.remain_passes },
        { Parameter: 'Cap Policy', Value: data.config.cap_policy?.kind || 'fixed_percent' },
        { Parameter: 'Default Cap %', Value: (data.config.cap_policy?.default_percent * 100) + '%' },
        { Parameter: 'Audit Level', Value: data.config.audit_level }
      ];
      
      const metadataWs = XLSX.utils.json_to_sheet(metadataData);
      metadataWs['!cols'] = [{ wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, metadataWs, 'Configuration');
    }
    
    // Write file
    XLSX.writeFile(wb, options.filename || `reserves-allocation-${Date.now()}.xlsx`);
    
    metrics.recordDuration('export.excel.success', performance.now());
    
  } catch (error) {
    metrics.recordError(`Excel export failed: ${error}`);
    throw error;
  } finally {
    timer.end();
  }
}

/**
 * Export reserves data to JSON format
 */
async function exportToJSON(data: ExportData, options: ExportOptions): Promise<void> {
  const timer = metrics.startTimer('export.json');
  
  try {
    const exportData = {
      timestamp: data.timestamp || new Date(),
      output: data.output,
      companies: options.includeMetadata ? data.companies : undefined,
      config: options.includeMetadata ? data.config : undefined,
      summary: options.includeSummary ? {
        totalAvailable: data.output.metadata.total_available_cents / 100,
        totalAllocated: data.output.metadata.total_allocated_cents / 100,
        remaining: data.output.remaining_cents / 100,
        companiesFunded: data.output.metadata.companies_funded,
        utilization: (data.output.metadata.total_allocated_cents / data.output.metadata.total_available_cents) * 100
      } : undefined
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || `reserves-allocation-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    metrics.recordDuration('export.json.success', performance.now());
    
  } finally {
    timer.end();
  }
}

/**
 * Main export function with format detection
 */
export async function exportReserves(
  data: ExportData,
  options: ExportOptions
): Promise<void> {
  // Check if async export is enabled
  if (!isEnabled('export_async')) {
    throw new Error('Async export is not enabled');
  }
  
  const timer = metrics.startTimer('export.total');
  
  try {
    switch (options.format) {
      case 'csv':
        await exportToCSV(data, options);
        break;
        
      case 'excel':
        await exportToExcel(data, options);
        break;
        
      case 'json':
        await exportToJSON(data, options);
        break;
        
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
    
    // Record successful export
    metrics.recordDuration('export.success', performance.now());
    
  } catch (error) {
    metrics.recordError(`Export failed: ${error}`);
    throw error;
  } finally {
    timer.end();
  }
}

/**
 * Check if export format is supported
 */
export function isExportSupported(format: string): boolean {
  return ['csv', 'excel', 'json'].includes(format);
}

/**
 * Get suggested filename for export
 */
export function getSuggestedFilename(format: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const extension = format === 'excel' ? 'xlsx' : format;
  return `reserves-allocation-${timestamp}.${extension}`;
}