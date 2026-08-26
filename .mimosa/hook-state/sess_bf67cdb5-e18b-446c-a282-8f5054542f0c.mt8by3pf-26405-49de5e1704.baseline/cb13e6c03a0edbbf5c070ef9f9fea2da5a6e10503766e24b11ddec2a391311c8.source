/**
 * DataTable Usage Examples
 * Demonstrates how to use the generic DataTable component
 */

import { DataTable } from './DataTable';

// Example 1: Simple company data
interface Company {
  name: string;
  sector: string;
  revenue: number;
  employees: number;
  founded: number;
}

export function CompanyTableExample() {
  const companies: Company[] = [
    { name: 'Acme Corp', sector: 'Technology', revenue: 125.5, employees: 450, founded: 2015 },
    { name: 'Beta Inc', sector: 'Healthcare', revenue: 89.2, employees: 320, founded: 2018 },
    { name: 'Gamma LLC', sector: 'Finance', revenue: 210.8, employees: 680, founded: 2012 },
    { name: 'Delta Systems', sector: 'Technology', revenue: 156.3, employees: 520, founded: 2016 },
  ];

  return (
    <DataTable
      columns={[
        { key: 'name', label: 'Company Name' },
        { key: 'sector', label: 'Sector' },
        { key: 'revenue', label: 'Revenue ($M)', align: 'right' },
        { key: 'employees', label: 'Employees', align: 'right' },
        { key: 'founded', label: 'Founded', align: 'right' },
      ]}
      rows={companies}
    />
  );
}

// Example 2: Portfolio performance data
interface PortfolioMetric {
  quarter: string;
  invested: number;
  realized: number;
  unrealized: number;
  moic: number;
}

export function PortfolioMetricsExample() {
  const metrics: PortfolioMetric[] = [
    { quarter: 'Q1 2024', invested: 50.0, realized: 15.5, unrealized: 85.2, moic: 2.01 },
    { quarter: 'Q2 2024', invested: 75.0, realized: 22.8, unrealized: 112.4, moic: 1.80 },
    { quarter: 'Q3 2024', invested: 100.0, realized: 45.2, unrealized: 145.8, moic: 1.91 },
    { quarter: 'Q4 2024', invested: 125.0, realized: 62.5, unrealized: 178.3, moic: 1.93 },
  ];

  return (
    <DataTable
      columns={[
        { key: 'quarter', label: 'Quarter' },
        { key: 'invested', label: 'Invested ($M)', align: 'right' },
        { key: 'realized', label: 'Realized ($M)', align: 'right' },
        { key: 'unrealized', label: 'Unrealized ($M)', align: 'right' },
        { key: 'moic', label: 'MOIC', align: 'right' },
      ]}
      rows={metrics}
    />
  );
}

// Example 3: Mixed data types
interface Investment {
  id: string;
  company: string;
  stage: string;
  amount: number;
  date: string;
  active: string;
}

export function InvestmentTableExample() {
  const investments: Investment[] = [
    { id: 'INV-001', company: 'StartupX', stage: 'Series A', amount: 5.0, date: '2024-01-15', active: 'Yes' },
    { id: 'INV-002', company: 'VentureY', stage: 'Seed', amount: 2.5, date: '2024-02-20', active: 'Yes' },
    { id: 'INV-003', company: 'ScaleZ', stage: 'Series B', amount: 10.0, date: '2024-03-10', active: 'No' },
  ];

  return (
    <DataTable
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'company', label: 'Company' },
        { key: 'stage', label: 'Stage' },
        { key: 'amount', label: 'Amount ($M)', align: 'right' },
        { key: 'date', label: 'Date' },
        { key: 'active', label: 'Active' },
      ]}
      rows={investments}
    />
  );
}
