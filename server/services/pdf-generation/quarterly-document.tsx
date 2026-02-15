/**
 * Quarterly Report PDF document.
 * JSX conversion of the original monolithic QuarterlyReportPDF.
 *
 * @module server/services/pdf-generation/quarterly-document
 */

import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { baseStyles } from './theme.js';
import {
  formatCurrency,
  formatPercent,
  formatMultiple,
  getGeneratedTimestamp,
} from './formatters.js';
import {
  PageHeader,
  PageFooter,
  SectionTitle,
  LabelValueRow,
  MetricCard,
  BaseTable,
} from './components.js';
import { colors } from './theme.js';
import type { QuarterlyReportData } from './types.js';

// ---------------------------------------------------------------------------
// View-model: derive portfolio totals (no React)
// ---------------------------------------------------------------------------

function computePortfolioTotals(companies: QuarterlyReportData['portfolioCompanies']) {
  return {
    totalInvested: companies.reduce((sum, co) => sum + co.invested, 0),
    totalValue: companies.reduce((sum, co) => sum + co.value, 0),
  };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function PerformanceMetrics({ summary }: { summary: QuarterlyReportData['summary'] }) {
  return (
    <View style={baseStyles.section}>
      <SectionTitle>Fund Performance</SectionTitle>
      <View style={baseStyles.metricsGrid}>
        <MetricCard
          label="Net Asset Value"
          value={formatCurrency(summary.nav, true)}
          subtitle="Total portfolio value"
        />
        <MetricCard
          label="TVPI"
          value={formatMultiple(summary.tvpi)}
          subtitle="Total value / paid-in"
        />
        <MetricCard
          label="DPI"
          value={formatMultiple(summary.dpi)}
          subtitle="Distributed / paid-in"
        />
        <MetricCard label="Net IRR" value={formatPercent(summary.irr)} subtitle="Since inception" />
      </View>
    </View>
  );
}

function ExecutiveSummary({
  data,
  totals,
}: {
  data: QuarterlyReportData;
  totals: { totalInvested: number; totalValue: number };
}) {
  return (
    <View style={baseStyles.section}>
      <View style={{ ...baseStyles.disclaimer, marginTop: 0 }}>
        <Text style={{ ...baseStyles.sectionTitle, backgroundColor: 'transparent', padding: 0 }}>
          Executive Summary
        </Text>
        <Text style={{ ...baseStyles.disclaimerText, fontSize: 9 }}>
          {`As of ${data.quarter} ${data.year}, ${data.fundName} has deployed ${formatCurrency(totals.totalInvested, true)} across ${data.portfolioCompanies.length} portfolio companies with a current fair market value of ${formatCurrency(totals.totalValue, true)}. The fund has generated a gross TVPI of ${formatMultiple(data.summary.tvpi)} and net IRR of ${formatPercent(data.summary.irr)}.`}
        </Text>
      </View>
    </View>
  );
}

function CapitalSummary({ summary }: { summary: QuarterlyReportData['summary'] }) {
  return (
    <View style={baseStyles.section}>
      <SectionTitle>Your Capital Summary</SectionTitle>
      <LabelValueRow label="Total Commitment" value={formatCurrency(summary.totalCommitted)} />
      <LabelValueRow label="Capital Called" value={formatCurrency(summary.totalCalled)} />
      <LabelValueRow
        label="Distributions Received"
        value={formatCurrency(summary.totalDistributed)}
        valueStyle={{ color: colors.success }}
      />
      <LabelValueRow label="Unfunded Commitment" value={formatCurrency(summary.unfunded)} />
    </View>
  );
}

function PortfolioTable({ companies }: { companies: QuarterlyReportData['portfolioCompanies'] }) {
  const columns = [
    { header: 'Company', width: '35%' },
    { header: 'Invested', width: '20%', align: 'right' as const },
    { header: 'Current Value', width: '25%', align: 'right' as const },
    { header: 'MOIC', width: '20%', align: 'right' as const },
  ];

  const rows = companies.map((co, i) => ({
    key: i,
    cells: [
      { text: co.name },
      { text: formatCurrency(co.invested, true) },
      { text: formatCurrency(co.value, true) },
      { text: formatMultiple(co.moic) },
    ],
  }));

  return (
    <View style={baseStyles.section}>
      <SectionTitle>Portfolio Companies</SectionTitle>
      <BaseTable columns={columns} rows={rows} />
    </View>
  );
}

function Commentary({ text }: { text: string }) {
  return (
    <View style={baseStyles.section}>
      <SectionTitle>Manager Commentary</SectionTitle>
      <View style={baseStyles.infoBox}>
        <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{text}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function QuarterlyReportPDF({ data }: { data: QuarterlyReportData }): React.ReactElement {
  const totals = computePortfolioTotals(data.portfolioCompanies);
  const generatedAt = getGeneratedTimestamp(
    data.generatedAt ? new Date(data.generatedAt) : undefined
  );

  return (
    <Document title={`${data.fundName} - ${data.quarter} ${data.year} Quarterly Report`}>
      <Page size="LETTER" style={baseStyles.page}>
        <PageHeader
          title={data.fundName}
          subtitle={`Quarterly Report | ${data.quarter} ${data.year} | ${data.lpName}`}
        />
        <PerformanceMetrics summary={data.summary} />
        <ExecutiveSummary data={data} totals={totals} />
        <CapitalSummary summary={data.summary} />
        <PortfolioTable companies={data.portfolioCompanies} />
        {data.commentary && <Commentary text={data.commentary} />}
        <PageFooter generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
