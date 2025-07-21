export function exportToExcel(data: any, filename: string = 'povc-fund-report') {
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

function generateCSV(data: any): string {
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
  
  const rows = data.portfolioCompanies.map((company: any) => [
    company.name,
    company.sector,
    company.stage,
    `$${(parseFloat(company.investmentAmount) / 1000000).toFixed(1)}M`,
    company.currentValuation ? `$${(parseFloat(company.currentValuation) / 1000000).toFixed(1)}M` : 'N/A',
    company.currentValuation ? (parseFloat(company.currentValuation) / parseFloat(company.investmentAmount)).toFixed(2) + 'x' : 'N/A',
    company.status,
    company.foundedYear || 'N/A'
  ]);
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');
    
  return csvContent;
}
