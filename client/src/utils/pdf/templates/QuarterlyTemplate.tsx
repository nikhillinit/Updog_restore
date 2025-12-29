/**
 * Quarterly Report PDF Template
 *
 * Portfolio summary report for LP quarterly updates.
 * Displays fund performance, portfolio companies, and cash flows.
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PdfDocument } from '../components/PdfDocument';
import { PdfTable, type TableColumn } from '../components/PdfTable';
import { PdfMetricCard } from '../components/PdfMetricCard';
import { pdfTheme, formatCurrency, formatPercent, formatMultiple, formatDate } from '../index';
import { PDF_FONTS } from '../fonts';
import type { QuarterlyReportData } from '../index';

export interface QuarterlyTemplateProps {
  data: QuarterlyReportData;
  showCashFlows?: boolean;
  showCommentary?: boolean;
}

const styles = StyleSheet.create({
  // Sections
  section: {
    marginBottom: pdfTheme.spacing.section,
  },
  sectionTitle: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 12,
    fontWeight: 600,
    color: pdfTheme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Report Header
  reportHeader: {
    marginBottom: pdfTheme.spacing.section,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: pdfTheme.colors.accent,
  },
  fundName: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 22,
    fontWeight: 700,
    color: pdfTheme.colors.primary,
    marginBottom: 4,
  },
  periodLabel: {
    fontFamily: PDF_FONTS.body,
    fontSize: 14,
    color: pdfTheme.colors.textMuted,
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: pdfTheme.spacing.section,
  },
  metricColumn: {
    flex: 1,
  },

  // Executive Summary
  summaryBox: {
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    padding: 16,
    borderRadius: 4,
    marginBottom: pdfTheme.spacing.section,
  },
  summaryTitle: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 11,
    fontWeight: 600,
    color: pdfTheme.colors.primary,
    marginBottom: 8,
  },
  summaryText: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    lineHeight: 1.6,
    color: pdfTheme.colors.textPrimary,
  },

  // Cash Flow
  cashFlowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.backgroundSubtle,
  },
  cashFlowDate: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textMuted,
    width: '25%',
  },
  cashFlowType: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textPrimary,
    width: '35%',
  },
  cashFlowAmount: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    fontWeight: 600,
    textAlign: 'right',
    width: '40%',
  },
  contribution: {
    color: '#ef4444',
  },
  distribution: {
    color: '#10b981',
  },

  // Commentary
  commentaryBox: {
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
    borderRadius: 4,
    padding: 12,
  },
  commentaryText: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    lineHeight: 1.6,
    color: pdfTheme.colors.textPrimary,
  },
});

export const QuarterlyTemplate: React.FC<QuarterlyTemplateProps> = ({
  data,
  showCashFlows = true,
  showCommentary = true,
}) => {
  const { fundName, quarter, year, summary, portfolioCompanies, cashFlows, commentary } = data;

  // Portfolio companies table columns
  const portfolioColumns: TableColumn<(typeof portfolioCompanies)[number]>[] = [
    {
      key: 'name',
      header: 'Company',
      width: '35%',
    },
    {
      key: 'invested',
      header: 'Invested',
      width: '20%',
      align: 'right',
      render: (value) => formatCurrency(value as number, { compact: true }),
    },
    {
      key: 'value',
      header: 'Current Value',
      width: '25%',
      align: 'right',
      render: (value) => formatCurrency(value as number, { compact: true }),
    },
    {
      key: 'moic',
      header: 'MOIC',
      width: '20%',
      align: 'right',
      render: (value) => formatMultiple(value as number),
    },
  ];

  // Calculate totals
  const totalInvested = portfolioCompanies.reduce((sum, co) => sum + co.invested, 0);
  const totalValue = portfolioCompanies.reduce((sum, co) => sum + co.value, 0);

  return (
    <PdfDocument
      metadata={{
        title: `${fundName} - ${quarter} ${year} Quarterly Report`,
        subject: `Quarterly performance report for ${fundName}`,
        keywords: ['quarterly report', 'LP report', fundName, `${quarter} ${year}`],
      }}
      header={{
        title: 'Quarterly Report',
        subtitle: `${quarter} ${year}`,
        showLogo: true,
        showDate: true,
      }}
      footer={{
        showPageNumbers: true,
        showCopyright: true,
        confidential: true,
      }}
    >
      {/* Report Header */}
      <View style={styles.reportHeader}>
        <Text style={styles.fundName}>{fundName}</Text>
        <Text style={styles.periodLabel}>
          Quarterly Performance Report | {quarter} {year}
        </Text>
      </View>

      {/* Key Performance Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fund Performance</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="Net Asset Value"
              value={formatCurrency(summary.nav, { compact: true })}
              subtitle="Total portfolio value"
            />
          </View>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="TVPI"
              value={formatMultiple(summary.tvpi)}
              subtitle="Total value / paid-in"
              highlighted={summary.tvpi >= 1.5}
            />
          </View>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="DPI"
              value={formatMultiple(summary.dpi)}
              subtitle="Distributed / paid-in"
            />
          </View>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="Net IRR"
              value={formatPercent(summary.irr)}
              subtitle="Since inception"
              trend={summary.irr > 0.2 ? 'up' : summary.irr < 0 ? 'down' : 'neutral'}
            />
          </View>
        </View>
      </View>

      {/* Executive Summary */}
      <View style={styles.section}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Executive Summary</Text>
          <Text style={styles.summaryText}>
            As of {quarter} {year}, {fundName} has deployed{' '}
            {formatCurrency(totalInvested, { compact: true })} across{' '}
            {portfolioCompanies.length} portfolio companies with a current fair market value of{' '}
            {formatCurrency(totalValue, { compact: true })}. The fund has generated a gross TVPI of{' '}
            {formatMultiple(summary.tvpi)} and net IRR of {formatPercent(summary.irr)}.
          </Text>
        </View>
      </View>

      {/* Portfolio Companies */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Portfolio Companies</Text>
        <PdfTable columns={portfolioColumns} data={portfolioCompanies} />
      </View>

      {/* Cash Flows */}
      {showCashFlows && cashFlows && cashFlows.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Cash Flows</Text>
          {cashFlows.slice(0, 10).map((flow, index) => (
            <View key={index} style={styles.cashFlowRow}>
              <Text style={styles.cashFlowDate}>{formatDate(flow.date, 'short')}</Text>
              <Text style={styles.cashFlowType}>
                {flow.type === 'contribution' ? 'Capital Call' : 'Distribution'}
              </Text>
              <Text
                style={[
                  styles.cashFlowAmount,
                  flow.type === 'contribution' ? styles.contribution : styles.distribution,
                ]}
              >
                {flow.type === 'contribution' ? '-' : '+'}
                {formatCurrency(flow.amount, { compact: true })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Manager Commentary */}
      {showCommentary && commentary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manager Commentary</Text>
          <View style={styles.commentaryBox}>
            <Text style={styles.commentaryText}>{commentary}</Text>
          </View>
        </View>
      )}
    </PdfDocument>
  );
};

export default QuarterlyTemplate;
