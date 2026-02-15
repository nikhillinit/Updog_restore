/**
 * Server-Side PDF Generation Service
 *
 * Generates LP reports using @react-pdf/renderer on the server.
 * Supports quarterly reports, K-1 tax summaries, and capital account statements.
 *
 * @module server/services/pdf-generation-service
 */

import React from 'react';
import { pdf, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { db } from '../db';
import { limitedPartners, lpFundCommitments, capitalActivities } from '@shared/schema-lp-reporting';
import { funds } from '@shared/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { toDecimal } from '@shared/lib/decimal-utils';
import { getFundPerformance } from './lp-queries';
import { calculateFundMetrics } from './fund-metrics-calculator';
import { storage } from '../storage';

// ============================================================================
// TYPES
// ============================================================================

export interface K1ReportData {
  partnerName: string;
  partnerAddress?: string;
  partnerTaxId?: string;
  fundName: string;
  taxYear: number;
  partnershipTaxId?: string;
  allocations: {
    ordinaryIncome: number;
    capitalGainsShortTerm: number;
    capitalGainsLongTerm: number;
    section1231Gains: number;
    interestIncome: number;
    dividendIncome: number;
    royalties: number;
    netRentalIncome: number;
    otherIncome: number;
  };
  distributions: Array<{
    date: string;
    type: string;
    amount: number;
  }>;
  capitalAccount: {
    beginningBalance: number;
    contributions: number;
    distributions: number;
    allocatedIncome: number;
    endingBalance: number;
  };
  footnotes?: string[];
  preliminary?: boolean;
  /** ISO timestamp for deterministic PDF output */
  generatedAt?: string;
}

export interface QuarterlyReportData {
  fundName: string;
  quarter: string;
  year: number;
  lpName: string;
  summary: {
    nav: number;
    tvpi: number;
    dpi: number;
    irr: number;
    totalCommitted: number;
    totalCalled: number;
    totalDistributed: number;
    unfunded: number;
  };
  portfolioCompanies: Array<{
    name: string;
    invested: number;
    value: number;
    moic: number;
  }>;
  cashFlows?: Array<{
    date: string;
    type: 'contribution' | 'distribution';
    amount: number;
  }>;
  commentary?: string;
  /** ISO timestamp for deterministic PDF output */
  generatedAt?: string;
}

/** Pre-fetched fund metrics for report builders (DI pattern) */
export interface ReportMetrics {
  irr: number;
  tvpi: number;
  dpi: number;
  portfolioCompanies: Array<{ name: string; invested: number; value: number; moic: number }>;
}

export interface CapitalAccountReportData {
  lpName: string;
  fundName: string;
  asOfDate: string;
  commitment: number;
  transactions: Array<{
    date: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
  }>;
  summary: {
    beginningBalance: number;
    totalContributions: number;
    totalDistributions: number;
    netIncome: number;
    endingBalance: number;
  };
  /** ISO timestamp for deterministic PDF output */
  generatedAt?: string;
}

// ============================================================================
// PDF THEME (Server-side compatible)
// ============================================================================

const colors = {
  primary: '#1a2b4a',
  accent: '#c9b18f',
  background: '#ffffff',
  backgroundSubtle: '#f8f6f3',
  textPrimary: '#1a2b4a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  success: '#10b981',
  error: '#ef4444',
};

// Fonts are deferred to system defaults for deterministic output.
// TODO: Bundle and register local font files to avoid remote fetches.

const fontFamily = 'Helvetica'; // Default to safe font

// ============================================================================
// SHARED STYLES
// ============================================================================

const baseStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily,
    fontSize: 10,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: colors.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: colors.backgroundSubtle,
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundSubtle,
  },
  label: {
    fontSize: 9,
    color: colors.textPrimary,
    width: '65%',
  },
  value: {
    fontSize: 9,
    fontWeight: 600,
    textAlign: 'right',
    width: '35%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.primary,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.primary,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  disclaimer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: colors.backgroundSubtle,
    borderRadius: 4,
  },
  disclaimerText: {
    fontSize: 7,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  infoBox: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
    color: colors.textPrimary,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  column: {
    flex: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.backgroundSubtle,
    borderRadius: 4,
  },
  metricLabel: {
    fontSize: 8,
    color: colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.primary,
  },
  metricSubtitle: {
    fontSize: 7,
    color: colors.textMuted,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSubtle,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundSubtle,
  },
  tableCell: {
    fontSize: 9,
  },
});

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatDate(date: string | Date, format: 'short' | 'medium' | 'long' = 'medium'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        timeZone: 'UTC',
      });
    case 'long':
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    default:
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
  }
}

/**
 * Get timestamp for PDF generation, using provided date for determinism.
 */
function getGeneratedTimestamp(asOfDate?: Date): Date {
  return asOfDate ?? new Date();
}

// ============================================================================
// K-1 TAX SUMMARY PDF COMPONENT
// ============================================================================

function K1TaxSummaryPDF({ data }: { data: K1ReportData }): React.ReactElement {
  const totalAllocations =
    data.allocations.ordinaryIncome +
    data.allocations.capitalGainsShortTerm +
    data.allocations.capitalGainsLongTerm +
    data.allocations.section1231Gains +
    data.allocations.interestIncome +
    data.allocations.dividendIncome +
    data.allocations.royalties +
    data.allocations.netRentalIncome +
    data.allocations.otherIncome;
  const generatedAt = getGeneratedTimestamp(
    data.generatedAt ? new Date(data.generatedAt) : undefined
  );

  return React.createElement(
    Document,
    { title: `K-1 Summary - ${data.partnerName} - ${data.taxYear}` },
    React.createElement(
      Page,
      { size: 'LETTER', style: baseStyles.page },
      // Header
      React.createElement(
        View,
        { style: baseStyles.header },
        React.createElement(Text, { style: baseStyles.title }, 'Schedule K-1 Summary'),
        React.createElement(
          Text,
          { style: baseStyles.subtitle },
          `Tax Year ${data.taxYear} | ${data.fundName}`
        )
      ),
      // Partner and Partnership Info
      React.createElement(
        View,
        { style: baseStyles.twoColumn },
        React.createElement(
          View,
          { style: baseStyles.column },
          React.createElement(
            View,
            { style: baseStyles.infoBox },
            React.createElement(Text, { style: baseStyles.infoLabel }, 'Partner Information'),
            React.createElement(Text, { style: baseStyles.infoValue }, data.partnerName),
            data.partnerAddress &&
              React.createElement(Text, { style: baseStyles.infoValue }, data.partnerAddress),
            data.partnerTaxId &&
              React.createElement(
                Text,
                { style: baseStyles.infoValue },
                `TIN: ${data.partnerTaxId}`
              )
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.column },
          React.createElement(
            View,
            { style: baseStyles.infoBox },
            React.createElement(Text, { style: baseStyles.infoLabel }, 'Partnership Information'),
            React.createElement(Text, { style: baseStyles.infoValue }, data.fundName),
            data.partnershipTaxId &&
              React.createElement(
                Text,
                { style: baseStyles.infoValue },
                `EIN: ${data.partnershipTaxId}`
              )
          )
        )
      ),
      // Allocations Section
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(
          Text,
          { style: baseStyles.sectionTitle },
          "Partner's Distributive Share Items"
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Ordinary business income (loss)'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.ordinaryIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(
            Text,
            { style: baseStyles.label },
            'Net short-term capital gain (loss)'
          ),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.capitalGainsShortTerm)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(
            Text,
            { style: baseStyles.label },
            'Net long-term capital gain (loss)'
          ),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.capitalGainsLongTerm)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Net section 1231 gain (loss)'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.section1231Gains)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Interest income'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.interestIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Ordinary dividends'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.dividendIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Royalties'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.royalties)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(
            Text,
            { style: baseStyles.label },
            'Net rental real estate income (loss)'
          ),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.netRentalIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Other income (loss)'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.allocations.otherIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.totalRow },
          React.createElement(Text, { style: baseStyles.totalLabel }, 'Total Allocations'),
          React.createElement(
            Text,
            { style: baseStyles.totalValue },
            formatCurrency(totalAllocations)
          )
        )
      ),
      // Capital Account Section
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(Text, { style: baseStyles.sectionTitle }, 'Capital Account Analysis'),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Beginning capital account'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.capitalAccount.beginningBalance)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(
            Text,
            { style: baseStyles.label },
            'Capital contributions during year'
          ),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.capitalAccount.contributions)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Distributions during year'),
          React.createElement(
            Text,
            { style: { ...baseStyles.value, color: colors.error } },
            `(${formatCurrency(data.capitalAccount.distributions)})`
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(
            Text,
            { style: baseStyles.label },
            'Current year increase (decrease)'
          ),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.capitalAccount.allocatedIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.totalRow },
          React.createElement(Text, { style: baseStyles.totalLabel }, 'Ending capital account'),
          React.createElement(
            Text,
            { style: baseStyles.totalValue },
            formatCurrency(data.capitalAccount.endingBalance)
          )
        )
      ),
      // Distributions Table (if any)
      data.distributions.length > 0 &&
        React.createElement(
          View,
          { style: baseStyles.section },
          React.createElement(Text, { style: baseStyles.sectionTitle }, 'Distributions'),
          React.createElement(
            View,
            { style: baseStyles.tableHeader },
            React.createElement(
              Text,
              { style: { ...baseStyles.tableHeaderCell, width: '30%' } },
              'Date'
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableHeaderCell, width: '40%' } },
              'Type'
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableHeaderCell, width: '30%', textAlign: 'right' } },
              'Amount'
            )
          ),
          ...data.distributions.map((dist, i) =>
            React.createElement(
              View,
              { key: i, style: baseStyles.tableRow },
              React.createElement(
                Text,
                { style: { ...baseStyles.tableCell, width: '30%' } },
                formatDate(dist.date, 'short')
              ),
              React.createElement(
                Text,
                { style: { ...baseStyles.tableCell, width: '40%' } },
                dist.type
              ),
              React.createElement(
                Text,
                { style: { ...baseStyles.tableCell, width: '30%', textAlign: 'right' } },
                formatCurrency(dist.amount)
              )
            )
          )
        ),
      // Footnotes
      ...(data.footnotes && data.footnotes.length > 0
        ? [
            React.createElement(
              View,
              { style: { ...baseStyles.section, marginTop: 8 } },
              ...data.footnotes.map((note, i) =>
                React.createElement(
                  Text,
                  { key: `fn-${i}`, style: baseStyles.disclaimerText },
                  `${i + 1}. ${note}`
                )
              )
            ),
          ]
        : []),
      // Disclaimer
      React.createElement(
        View,
        { style: baseStyles.disclaimer },
        React.createElement(
          Text,
          { style: baseStyles.disclaimerText },
          'This document is provided for informational purposes only and is not intended to constitute tax advice. Please consult with your tax advisor regarding the proper reporting of these items on your tax return. The official Schedule K-1 (Form 1065) will be provided separately.'
        )
      ),
      // Footer
      React.createElement(
        View,
        { style: baseStyles.footer, fixed: true },
        React.createElement(Text, null, `Generated ${formatDate(generatedAt, 'medium')}`),
        React.createElement(
          Text,
          null,
          `${generatedAt.getUTCFullYear()} Press On Ventures | Confidential`
        )
      )
    )
  );
}

// ============================================================================
// QUARTERLY REPORT PDF COMPONENT
// ============================================================================

function QuarterlyReportPDF({ data }: { data: QuarterlyReportData }): React.ReactElement {
  const totalInvested = data.portfolioCompanies.reduce((sum, co) => sum + co.invested, 0);
  const totalValue = data.portfolioCompanies.reduce((sum, co) => sum + co.value, 0);
  const generatedAt = getGeneratedTimestamp(
    data.generatedAt ? new Date(data.generatedAt) : undefined
  );

  return React.createElement(
    Document,
    { title: `${data.fundName} - ${data.quarter} ${data.year} Quarterly Report` },
    React.createElement(
      Page,
      { size: 'LETTER', style: baseStyles.page },
      // Header
      React.createElement(
        View,
        { style: baseStyles.header },
        React.createElement(Text, { style: baseStyles.title }, data.fundName),
        React.createElement(
          Text,
          { style: baseStyles.subtitle },
          `Quarterly Report | ${data.quarter} ${data.year} | ${data.lpName}`
        )
      ),
      // Key Metrics
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(Text, { style: baseStyles.sectionTitle }, 'Fund Performance'),
        React.createElement(
          View,
          { style: baseStyles.metricsGrid },
          React.createElement(
            View,
            { style: baseStyles.metricCard },
            React.createElement(Text, { style: baseStyles.metricLabel }, 'Net Asset Value'),
            React.createElement(
              Text,
              { style: baseStyles.metricValue },
              formatCurrency(data.summary.nav, true)
            ),
            React.createElement(Text, { style: baseStyles.metricSubtitle }, 'Total portfolio value')
          ),
          React.createElement(
            View,
            { style: baseStyles.metricCard },
            React.createElement(Text, { style: baseStyles.metricLabel }, 'TVPI'),
            React.createElement(
              Text,
              { style: baseStyles.metricValue },
              formatMultiple(data.summary.tvpi)
            ),
            React.createElement(Text, { style: baseStyles.metricSubtitle }, 'Total value / paid-in')
          ),
          React.createElement(
            View,
            { style: baseStyles.metricCard },
            React.createElement(Text, { style: baseStyles.metricLabel }, 'DPI'),
            React.createElement(
              Text,
              { style: baseStyles.metricValue },
              formatMultiple(data.summary.dpi)
            ),
            React.createElement(Text, { style: baseStyles.metricSubtitle }, 'Distributed / paid-in')
          ),
          React.createElement(
            View,
            { style: baseStyles.metricCard },
            React.createElement(Text, { style: baseStyles.metricLabel }, 'Net IRR'),
            React.createElement(
              Text,
              { style: baseStyles.metricValue },
              formatPercent(data.summary.irr)
            ),
            React.createElement(Text, { style: baseStyles.metricSubtitle }, 'Since inception')
          )
        )
      ),
      // Executive Summary
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(
          View,
          { style: { ...baseStyles.disclaimer, marginTop: 0 } },
          React.createElement(
            Text,
            { style: { ...baseStyles.sectionTitle, backgroundColor: 'transparent', padding: 0 } },
            'Executive Summary'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.disclaimerText, fontSize: 9 } },
            `As of ${data.quarter} ${data.year}, ${data.fundName} has deployed ${formatCurrency(totalInvested, true)} across ${data.portfolioCompanies.length} portfolio companies with a current fair market value of ${formatCurrency(totalValue, true)}. The fund has generated a gross TVPI of ${formatMultiple(data.summary.tvpi)} and net IRR of ${formatPercent(data.summary.irr)}.`
          )
        )
      ),
      // LP Capital Summary
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(Text, { style: baseStyles.sectionTitle }, 'Your Capital Summary'),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Total Commitment'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.summary.totalCommitted)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Capital Called'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.summary.totalCalled)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Distributions Received'),
          React.createElement(
            Text,
            { style: { ...baseStyles.value, color: colors.success } },
            formatCurrency(data.summary.totalDistributed)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Unfunded Commitment'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.summary.unfunded)
          )
        )
      ),
      // Portfolio Companies
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(Text, { style: baseStyles.sectionTitle }, 'Portfolio Companies'),
        React.createElement(
          View,
          { style: baseStyles.tableHeader },
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '35%' } },
            'Company'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '20%', textAlign: 'right' } },
            'Invested'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '25%', textAlign: 'right' } },
            'Current Value'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '20%', textAlign: 'right' } },
            'MOIC'
          )
        ),
        ...data.portfolioCompanies.map((co, i) =>
          React.createElement(
            View,
            { key: i, style: baseStyles.tableRow },
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '35%' } },
              co.name
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '20%', textAlign: 'right' } },
              formatCurrency(co.invested, true)
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '25%', textAlign: 'right' } },
              formatCurrency(co.value, true)
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '20%', textAlign: 'right' } },
              formatMultiple(co.moic)
            )
          )
        )
      ),
      // Commentary (if provided)
      data.commentary &&
        React.createElement(
          View,
          { style: baseStyles.section },
          React.createElement(Text, { style: baseStyles.sectionTitle }, 'Manager Commentary'),
          React.createElement(
            View,
            { style: baseStyles.infoBox },
            React.createElement(Text, { style: { fontSize: 9, lineHeight: 1.6 } }, data.commentary)
          )
        ),
      // Footer
      React.createElement(
        View,
        { style: baseStyles.footer, fixed: true },
        React.createElement(Text, null, `Generated ${formatDate(generatedAt, 'medium')}`),
        React.createElement(
          Text,
          null,
          `${generatedAt.getUTCFullYear()} Press On Ventures | Confidential`
        )
      )
    )
  );
}

// ============================================================================
// CAPITAL ACCOUNT STATEMENT PDF COMPONENT
// ============================================================================

function CapitalAccountStatementPDF({
  data,
}: {
  data: CapitalAccountReportData;
}): React.ReactElement {
  const generatedAt = getGeneratedTimestamp(
    data.generatedAt ? new Date(data.generatedAt) : undefined
  );
  return React.createElement(
    Document,
    { title: `Capital Account Statement - ${data.lpName}` },
    React.createElement(
      Page,
      { size: 'LETTER', style: baseStyles.page },
      // Header
      React.createElement(
        View,
        { style: baseStyles.header },
        React.createElement(Text, { style: baseStyles.title }, 'Capital Account Statement'),
        React.createElement(
          Text,
          { style: baseStyles.subtitle },
          `${data.fundName} | As of ${formatDate(data.asOfDate, 'long')}`
        )
      ),
      // LP Info
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(
          View,
          { style: baseStyles.infoBox },
          React.createElement(Text, { style: baseStyles.infoLabel }, 'Limited Partner'),
          React.createElement(Text, { style: baseStyles.infoValue }, data.lpName),
          React.createElement(
            Text,
            { style: { ...baseStyles.infoValue, marginTop: 4 } },
            `Commitment: ${formatCurrency(data.commitment)}`
          )
        )
      ),
      // Account Summary
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(Text, { style: baseStyles.sectionTitle }, 'Account Summary'),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Beginning Balance'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.summary.beginningBalance)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Total Contributions'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.summary.totalContributions)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Total Distributions'),
          React.createElement(
            Text,
            { style: { ...baseStyles.value, color: colors.error } },
            `(${formatCurrency(data.summary.totalDistributions)})`
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.row },
          React.createElement(Text, { style: baseStyles.label }, 'Net Income / (Loss)'),
          React.createElement(
            Text,
            { style: baseStyles.value },
            formatCurrency(data.summary.netIncome)
          )
        ),
        React.createElement(
          View,
          { style: baseStyles.totalRow },
          React.createElement(Text, { style: baseStyles.totalLabel }, 'Ending Balance'),
          React.createElement(
            Text,
            { style: baseStyles.totalValue },
            formatCurrency(data.summary.endingBalance)
          )
        )
      ),
      // Transaction History
      React.createElement(
        View,
        { style: baseStyles.section },
        React.createElement(Text, { style: baseStyles.sectionTitle }, 'Transaction History'),
        React.createElement(
          View,
          { style: baseStyles.tableHeader },
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '15%' } },
            'Date'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '15%' } },
            'Type'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '30%' } },
            'Description'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '20%', textAlign: 'right' } },
            'Amount'
          ),
          React.createElement(
            Text,
            { style: { ...baseStyles.tableHeaderCell, width: '20%', textAlign: 'right' } },
            'Balance'
          )
        ),
        ...data.transactions.map((tx, i) =>
          React.createElement(
            View,
            { key: i, style: baseStyles.tableRow },
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '15%' } },
              formatDate(tx.date, 'short')
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '15%' } },
              tx.type
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '30%' } },
              tx.description
            ),
            React.createElement(
              Text,
              {
                style: {
                  ...baseStyles.tableCell,
                  width: '20%',
                  textAlign: 'right',
                  color: tx.amount < 0 ? colors.error : colors.textPrimary,
                },
              },
              formatCurrency(tx.amount)
            ),
            React.createElement(
              Text,
              { style: { ...baseStyles.tableCell, width: '20%', textAlign: 'right' } },
              formatCurrency(tx.balance)
            )
          )
        )
      ),
      // Footer
      React.createElement(
        View,
        { style: baseStyles.footer, fixed: true },
        React.createElement(Text, null, `Generated ${formatDate(generatedAt, 'medium')}`),
        React.createElement(
          Text,
          null,
          `${generatedAt.getUTCFullYear()} Press On Ventures | Confidential`
        )
      )
    )
  );
}

// ============================================================================
// PDF GENERATION FUNCTIONS
// ============================================================================

/**
 * Convert ReadableStream to Buffer (for Node.js environment)
 */
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return Buffer.from(result);
}

/**
 * Generate K-1 Tax Summary PDF
 */
export async function generateK1PDF(data: K1ReportData): Promise<Buffer> {
  const doc = K1TaxSummaryPDF({ data });
  const pdfStream = await pdf(doc).toBuffer();
  // toBuffer returns a ReadableStream in browser-like environments
  if (pdfStream instanceof ReadableStream) {
    return streamToBuffer(pdfStream as ReadableStream<Uint8Array>);
  }
  return pdfStream as unknown as Buffer;
}

/**
 * Generate Quarterly Report PDF
 */
export async function generateQuarterlyPDF(data: QuarterlyReportData): Promise<Buffer> {
  const doc = QuarterlyReportPDF({ data });
  const pdfStream = await pdf(doc).toBuffer();
  if (pdfStream instanceof ReadableStream) {
    return streamToBuffer(pdfStream as ReadableStream<Uint8Array>);
  }
  return pdfStream as unknown as Buffer;
}

/**
 * Generate Capital Account Statement PDF
 */
export async function generateCapitalAccountPDF(data: CapitalAccountReportData): Promise<Buffer> {
  const doc = CapitalAccountStatementPDF({ data });
  const pdfStream = await pdf(doc).toBuffer();
  if (pdfStream instanceof ReadableStream) {
    return streamToBuffer(pdfStream as ReadableStream<Uint8Array>);
  }
  return pdfStream as unknown as Buffer;
}

// ============================================================================
// DATA FETCHING HELPERS
// ============================================================================

/**
 * Convert cents (bigint) to dollars
 */
function centsToDollars(cents: bigint | null): number {
  if (!cents) return 0;
  return Number(cents) / 100;
}

/**
 * Fetch LP data for report generation
 */
export async function fetchLPReportData(
  lpId: number,
  fundIdFilter?: number[]
): Promise<{
  lp: { id: number; name: string; email: string };
  commitments: Array<{
    commitmentId: number;
    fundId: number;
    fundName: string;
    commitmentAmount: number;
    ownershipPercentage: number;
  }>;
  transactions: Array<{
    commitmentId: number;
    fundId: number | null;
    date: Date;
    type: string;
    amount: number;
    description: string | null;
  }>;
}> {
  // Fetch LP profile
  const [lp] = await db
    .select({
      id: limitedPartners.id,
      name: limitedPartners.name,
      email: limitedPartners.email,
    })
    .from(limitedPartners)
    .where(eq(limitedPartners.id, lpId))
    .limit(1);

  if (!lp) {
    throw new Error(`LP not found: ${lpId}`);
  }

  // Fetch commitments with fund names
  const rawCommitments = await db
    .select({
      commitmentId: lpFundCommitments.id,
      fundId: lpFundCommitments.fundId,
      fundName: funds.name,
      commitmentAmountCents: lpFundCommitments.commitmentAmountCents,
      ownershipPercentage: lpFundCommitments.commitmentPercentage,
    })
    .from(lpFundCommitments)
    .innerJoin(funds, eq(lpFundCommitments.fundId, funds.id))
    .where(eq(lpFundCommitments.lpId, lpId));

  // Convert cents to dollars and filter if needed
  const commitments = rawCommitments
    .filter((c) => !fundIdFilter || fundIdFilter.includes(c.fundId))
    .map((c) => ({
      commitmentId: c.commitmentId,
      fundId: c.fundId,
      fundName: c.fundName || `Fund ${c.fundId}`,
      commitmentAmount: centsToDollars(c.commitmentAmountCents),
      ownershipPercentage: c.ownershipPercentage ? toDecimal(c.ownershipPercentage).toNumber() : 0,
    }));

  // Get commitment IDs for transaction query
  const commitmentIds = commitments.map((c) => c.commitmentId);

  // Fetch transactions for these commitments
  const rawTransactions =
    commitmentIds.length > 0
      ? await db
          .select({
            commitmentId: capitalActivities.commitmentId,
            fundId: capitalActivities.fundId,
            date: capitalActivities.activityDate,
            type: capitalActivities.activityType,
            amountCents: capitalActivities.amountCents,
            description: capitalActivities.description,
          })
          .from(capitalActivities)
          .where(inArray(capitalActivities.commitmentId, commitmentIds))
          .orderBy(desc(capitalActivities.activityDate))
      : [];

  // Convert cents to dollars
  const transactions = rawTransactions.map((t) => ({
    commitmentId: t.commitmentId,
    fundId: t.fundId,
    date: t.date,
    type: t.type,
    amount: centsToDollars(t.amountCents),
    description: t.description,
  }));

  return { lp, commitments, transactions };
}

/**
 * Prefetch real fund metrics for report generation.
 * Returns null if no data available (callers fall back to placeholders).
 */
export async function prefetchReportMetrics(
  lpId: number,
  fundId: number
): Promise<ReportMetrics | null> {
  const perf = await getFundPerformance(lpId, fundId);
  const companies = await storage.getPortfolioCompanies(fundId);

  if (!perf && companies.length === 0) return null;

  const fallback = !perf ? await calculateFundMetrics(fundId) : null;

  const portfolioCompanies = companies
    .filter((c) => {
      const status = (c.status ?? '').toLowerCase();
      return status !== 'exited' && status !== 'liquidated' && status !== 'written-off';
    })
    .map((c) => {
      const invested = toDecimal(c.investmentAmount).toNumber();
      const value = toDecimal(c.currentValuation ?? 0).toNumber();
      return { name: c.name, invested, value, moic: invested > 0 ? value / invested : 0 };
    });

  return {
    irr: perf ? perf.irr : fallback!.irr,
    tvpi: perf ? perf.tvpi : fallback!.tvpi,
    dpi: perf ? perf.dpi : fallback!.dpi,
    portfolioCompanies,
  };
}

/**
 * Build K-1 report data from LP data
 */
export function buildK1ReportData(
  lpData: Awaited<ReturnType<typeof fetchLPReportData>>,
  fundId: number,
  taxYear: number
): K1ReportData {
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }

  // Filter transactions for the tax year and fund
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59);
  const fundTransactions = lpData.transactions.filter(
    (t) => t.commitmentId === commitment.commitmentId && t.date >= yearStart && t.date <= yearEnd
  );

  // Calculate totals
  const contributions = fundTransactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const distributions = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Build distribution list
  const distributionList = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .map((t) => ({
      date: t.date.toISOString().split('T')[0] || '',
      type: t.type === 'recallable_distribution' ? 'Recallable' : 'Cash',
      amount: Math.abs(t.amount),
    }));

  // Placeholder tax allocations (would come from actual tax data in production)
  // These would typically be calculated by the fund administrator
  const totalIncome = distributions * 0.3; // Simplified: 30% of distributions as income
  const allocations = {
    ordinaryIncome: totalIncome * 0.1,
    capitalGainsShortTerm: totalIncome * 0.05,
    capitalGainsLongTerm: totalIncome * 0.75,
    section1231Gains: 0,
    interestIncome: totalIncome * 0.05,
    dividendIncome: totalIncome * 0.05,
    royalties: 0,
    netRentalIncome: 0,
    otherIncome: 0,
  };

  return {
    partnerName: lpData.lp.name,
    fundName: commitment.fundName,
    taxYear,
    allocations,
    distributions: distributionList,
    capitalAccount: {
      beginningBalance: contributions - distributions + totalIncome * 0.5, // Simplified
      contributions,
      distributions,
      allocatedIncome: totalIncome,
      endingBalance: contributions - distributions + totalIncome,
    },
    preliminary: true,
    footnotes: [
      'PRELIMINARY: Tax allocations are estimated from distribution data. Final K-1 will be prepared by the fund administrator.',
      'Consult your tax advisor for reporting requirements.',
    ],
  };
}

/**
 * Build quarterly report data from LP data
 */
export function buildQuarterlyReportData(
  lpData: Awaited<ReturnType<typeof fetchLPReportData>>,
  fundId: number,
  quarter: string,
  year: number,
  metrics?: ReportMetrics
): QuarterlyReportData {
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }

  // Calculate totals from transactions
  const fundTransactions = lpData.transactions.filter(
    (t) => t.commitmentId === commitment.commitmentId
  );

  const totalCalled = fundTransactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDistributed = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const unfunded = commitment.commitmentAmount - totalCalled;

  // Use real metrics if provided, otherwise placeholder fallback
  const irr = metrics?.irr ?? 0.15;
  const tvpi = metrics?.tvpi ?? (totalCalled > 0 ? (totalCalled * 1.15) / totalCalled : 1);
  const dpi = metrics?.dpi ?? (totalCalled > 0 ? totalDistributed / totalCalled : 0);
  const nav = totalCalled * tvpi - totalDistributed;

  // Build cash flows from all transactions (no artificial cap)
  const cashFlows = fundTransactions.map((t) => ({
    date: t.date.toISOString().split('T')[0] || '',
    type: t.type === 'capital_call' ? ('contribution' as const) : ('distribution' as const),
    amount: Math.abs(t.amount),
  }));

  // Use real portfolio companies if provided, otherwise placeholder fallback
  const portfolioCompanies = metrics?.portfolioCompanies ?? [
    { name: 'TechCo Series B', invested: totalCalled * 0.3, value: totalCalled * 0.4, moic: 1.33 },
    {
      name: 'HealthAI Series A',
      invested: totalCalled * 0.25,
      value: totalCalled * 0.35,
      moic: 1.4,
    },
    { name: 'FinanceBot Seed', invested: totalCalled * 0.15, value: totalCalled * 0.12, moic: 0.8 },
    {
      name: 'CloudScale Series C',
      invested: totalCalled * 0.2,
      value: totalCalled * 0.25,
      moic: 1.25,
    },
    { name: 'Other Holdings', invested: totalCalled * 0.1, value: totalCalled * 0.13, moic: 1.3 },
  ];

  return {
    fundName: commitment.fundName,
    quarter,
    year,
    lpName: lpData.lp.name,
    summary: {
      nav,
      tvpi,
      dpi,
      irr,
      totalCommitted: commitment.commitmentAmount,
      totalCalled,
      totalDistributed,
      unfunded,
    },
    portfolioCompanies,
    cashFlows,
    commentary: `${commitment.fundName} continues to execute on its investment thesis, focusing on high-growth technology companies. The portfolio is well-diversified across sectors and stages.`,
  };
}

/**
 * Build capital account report data from LP data
 */
export function buildCapitalAccountReportData(
  lpData: Awaited<ReturnType<typeof fetchLPReportData>>,
  fundId: number,
  asOfDate: Date
): CapitalAccountReportData {
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }

  // Filter transactions up to asOfDate
  const fundTransactions = lpData.transactions
    .filter((t) => t.commitmentId === commitment.commitmentId && t.date <= asOfDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Build transaction history with running balance
  let balance = 0;
  const transactions = fundTransactions.map((t) => {
    const amount = t.type === 'capital_call' ? t.amount : -Math.abs(t.amount);
    balance += amount;
    return {
      date: t.date.toISOString().split('T')[0] || '',
      type: t.type === 'capital_call' ? 'Capital Call' : 'Distribution',
      description:
        t.description ||
        `${t.type === 'capital_call' ? 'Capital contribution' : 'Cash distribution'}`,
      amount,
      balance,
    };
  });

  // Calculate summary
  const totalContributions = fundTransactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDistributions = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return {
    lpName: lpData.lp.name,
    fundName: commitment.fundName,
    asOfDate: asOfDate.toISOString().split('T')[0] || '',
    commitment: commitment.commitmentAmount,
    transactions,
    summary: {
      beginningBalance: (transactions[0]?.balance ?? 0) - (transactions[0]?.amount ?? 0),
      totalContributions,
      totalDistributions,
      netIncome: 0, // No performance allocation source yet
      endingBalance: balance,
    },
  };
}
