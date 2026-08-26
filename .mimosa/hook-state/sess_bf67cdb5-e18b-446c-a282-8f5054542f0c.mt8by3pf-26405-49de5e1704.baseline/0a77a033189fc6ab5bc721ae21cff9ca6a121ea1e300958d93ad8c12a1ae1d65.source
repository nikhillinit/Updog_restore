interface ExportData {
  portfolioCompanies: Array<{
    name: string;
    sector: string;
    stage: string;
    investmentAmount: string;
    currentValuation?: string;
    status: string;
    foundedYear?: string;
  }>;
}

export function exportToExcel(data: ExportData, filename: string = 'povc-fund-report') {
  // Simple CSV export for demonstration
  // In production, you would use a library like xlsx or similar
  
  const csvContent = generateCSV(data);
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function formatMillions(value: string | undefined): string {
  if (!value) {
    return 'N/A';
  }

  return `$${(parseFloat(value) / 1_000_000).toFixed(1)}M`;
}

function formatMultiple(currentValuation: string | undefined, investmentAmount: string): string {
  if (!currentValuation) {
    return 'N/A';
  }

  return `${(parseFloat(currentValuation) / parseFloat(investmentAmount)).toFixed(2)}x`;
}

function generateCSV(data: ExportData): string {
  if (!data || !data.portfolioCompanies) return '';
  
  const headers = [
    'Company Name',
    'Sector', 
    'Stage',
    'Investment Amount',
    'Current Valuation',
    'Multiple',
    'Status',
    'Founded Year'
  ];
  
  const rows = data.portfolioCompanies.map((company) => [
    company.name,
    company.sector,
    company.stage,
    formatMillions(company.investmentAmount),
    formatMillions(company.currentValuation),
    formatMultiple(company.currentValuation, company.investmentAmount),
    company.status,
    company.foundedYear || 'N/A',
  ]);
  
  const csvContent = [headers, ...rows]
    .map((row) => row.map((field) => `"${field}"`).join(','))
    .join('\n');
    
  return csvContent;
}
