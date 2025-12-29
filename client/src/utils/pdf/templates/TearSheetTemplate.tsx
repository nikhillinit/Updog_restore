/**
 * TearSheet PDF Template
 *
 * Single investment one-pager for LP reporting.
 * Displays company overview, investment metrics, timeline, and commentary.
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PdfDocument } from '../components/PdfDocument';
import { PdfTable, type TableColumn } from '../components/PdfTable';
import { PdfMetricCard } from '../components/PdfMetricCard';
import { pdfTheme, formatCurrency, formatPercent, formatMultiple, formatDate } from '../index';
import { PDF_FONTS } from '../fonts';
import type { TearSheetData } from '../index';

export interface TearSheetTemplateProps {
  data: TearSheetData;
  showTimeline?: boolean;
  showNotes?: boolean;
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

  // Company Header
  companyHeader: {
    marginBottom: pdfTheme.spacing.section,
  },
  companyName: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 24,
    fontWeight: 700,
    color: pdfTheme.colors.primary,
    marginBottom: 4,
  },
  companySubtitle: {
    fontFamily: PDF_FONTS.body,
    fontSize: 11,
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

  // Summary Box
  summaryBox: {
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    padding: 12,
    borderRadius: 4,
    marginBottom: pdfTheme.spacing.section,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    color: pdfTheme.colors.textMuted,
  },
  summaryValue: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    fontWeight: 600,
    color: pdfTheme.colors.primary,
  },

  // Notes
  notes: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    lineHeight: 1.6,
    color: pdfTheme.colors.textPrimary,
  },
  notesBox: {
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    padding: 12,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: pdfTheme.colors.accent,
  },
});

export const TearSheetTemplate: React.FC<TearSheetTemplateProps> = ({
  data,
  showTimeline = true,
  showNotes = true,
}) => {
  const { companyName, fundName, investmentDate, metrics, timeline, notes } = data;

  // Timeline table columns
  const timelineColumns: TableColumn<NonNullable<TearSheetData['timeline']>[number]>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '25%',
      render: (value) => formatDate(value as string, 'medium'),
    },
    {
      key: 'event',
      header: 'Event',
      width: '45%',
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '30%',
      align: 'right',
      render: (value) => (value ? formatCurrency(value as number, { compact: true }) : '-'),
    },
  ];

  return (
    <PdfDocument
      metadata={{
        title: `Tear Sheet - ${companyName}`,
        subject: `Investment tear sheet for ${companyName}`,
        keywords: ['tear sheet', 'investment', companyName, fundName],
      }}
      header={{
        title: 'Investment Tear Sheet',
        subtitle: fundName,
        showLogo: true,
        showDate: true,
      }}
      footer={{
        showPageNumbers: true,
        showCopyright: true,
        confidential: true,
      }}
    >
      {/* Company Header */}
      <View style={styles.companyHeader}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.companySubtitle}>
          {fundName} | Initial Investment: {formatDate(investmentDate, 'medium')}
        </Text>
      </View>

      {/* Key Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Investment Summary</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="Total Invested"
              value={formatCurrency(metrics.totalInvested, { compact: true })}
              subtitle="Capital deployed"
            />
          </View>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="Current Value"
              value={formatCurrency(metrics.currentValue, { compact: true })}
              subtitle="Fair market value"
              trend={metrics.currentValue > metrics.totalInvested ? 'up' : 'down'}
            />
          </View>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="MOIC"
              value={formatMultiple(metrics.moic)}
              subtitle="Multiple on invested capital"
              highlighted={metrics.moic >= 2}
            />
          </View>
          <View style={styles.metricColumn}>
            <PdfMetricCard
              label="IRR"
              value={formatPercent(metrics.irr)}
              subtitle="Internal rate of return"
              trend={metrics.irr > 0.15 ? 'up' : metrics.irr < 0 ? 'down' : 'neutral'}
            />
          </View>
        </View>
      </View>

      {/* Summary Stats */}
      <View style={styles.section}>
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Unrealized Gain</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(metrics.currentValue - metrics.totalInvested, { compact: true })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Return Multiple</Text>
            <Text style={styles.summaryValue}>{formatMultiple(metrics.moic)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Annualized Return</Text>
            <Text style={styles.summaryValue}>{formatPercent(metrics.irr)}</Text>
          </View>
        </View>
      </View>

      {/* Investment Timeline */}
      {showTimeline && timeline && timeline.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Investment Timeline</Text>
          <PdfTable columns={timelineColumns} data={timeline} compact />
        </View>
      )}

      {/* Manager Notes */}
      {showNotes && notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manager Commentary</Text>
          <View style={styles.notesBox}>
            <Text style={styles.notes}>{notes}</Text>
          </View>
        </View>
      )}
    </PdfDocument>
  );
};

export default TearSheetTemplate;
