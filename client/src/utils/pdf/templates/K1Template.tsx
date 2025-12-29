/**
 * K-1 Summary PDF Template
 *
 * Tax summary document for LP annual reporting.
 * Displays allocations, distributions, and tax-related information.
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { PdfDocument } from '../components/PdfDocument';
import { PdfTable, type TableColumn } from '../components/PdfTable';
import { pdfTheme, formatCurrency, formatDate } from '../index';
import { PDF_FONTS } from '../fonts';

export interface K1Data {
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
  distributions: {
    date: string;
    type: string;
    amount: number;
  }[];
  capitalAccount: {
    beginningBalance: number;
    contributions: number;
    distributions: number;
    allocatedIncome: number;
    endingBalance: number;
  };
  footnotes?: string[];
}

export interface K1TemplateProps {
  data: K1Data;
  showDistributions?: boolean;
  showFootnotes?: boolean;
}

const styles = StyleSheet.create({
  // Sections
  section: {
    marginBottom: pdfTheme.spacing.section,
  },
  sectionTitle: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 11,
    fontWeight: 600,
    color: pdfTheme.colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    padding: 6,
  },

  // Header
  headerBox: {
    borderWidth: 1,
    borderColor: pdfTheme.colors.primary,
    padding: 12,
    marginBottom: pdfTheme.spacing.section,
  },
  headerTitle: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 16,
    fontWeight: 700,
    color: pdfTheme.colors.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    color: pdfTheme.colors.textMuted,
    textAlign: 'center',
  },

  // Two column layout
  twoColumn: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: pdfTheme.spacing.section,
  },
  column: {
    flex: 1,
  },

  // Info boxes
  infoBox: {
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
    padding: 10,
    marginBottom: 8,
  },
  infoLabel: {
    fontFamily: PDF_FONTS.body,
    fontSize: 8,
    color: pdfTheme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: PDF_FONTS.body,
    fontSize: 10,
    color: pdfTheme.colors.textPrimary,
  },

  // Allocation rows
  allocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.backgroundSubtle,
  },
  allocationLabel: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textPrimary,
    width: '70%',
  },
  allocationValue: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    fontWeight: 600,
    color: pdfTheme.colors.textPrimary,
    textAlign: 'right',
    width: '30%',
  },
  allocationTotal: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 10,
    fontWeight: 700,
    color: pdfTheme.colors.primary,
  },

  // Capital account
  capitalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.border,
  },
  capitalLabel: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textPrimary,
  },
  capitalValue: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    fontWeight: 600,
  },

  // Footnotes
  footnote: {
    fontFamily: PDF_FONTS.body,
    fontSize: 8,
    color: pdfTheme.colors.textMuted,
    marginBottom: 4,
  },

  // Disclaimer
  disclaimer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    borderRadius: 4,
  },
  disclaimerText: {
    fontFamily: PDF_FONTS.body,
    fontSize: 7,
    color: pdfTheme.colors.textMuted,
    lineHeight: 1.4,
  },
});

export const K1Template: React.FC<K1TemplateProps> = ({
  data,
  showDistributions = true,
  showFootnotes = true,
}) => {
  const { partnerName, fundName, taxYear, allocations, distributions, capitalAccount, footnotes } =
    data;

  // Distribution table columns
  const distributionColumns: TableColumn<(typeof distributions)[number]>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '30%',
      render: (value) => formatDate(value as string, 'short'),
    },
    {
      key: 'type',
      header: 'Type',
      width: '40%',
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '30%',
      align: 'right',
      render: (value) => formatCurrency(value as number),
    },
  ];

  // Calculate total allocations
  const totalAllocations =
    allocations.ordinaryIncome +
    allocations.capitalGainsShortTerm +
    allocations.capitalGainsLongTerm +
    allocations.section1231Gains +
    allocations.interestIncome +
    allocations.dividendIncome +
    allocations.royalties +
    allocations.netRentalIncome +
    allocations.otherIncome;

  return (
    <PdfDocument
      metadata={{
        title: `Schedule K-1 Summary - ${partnerName} - ${taxYear}`,
        subject: `Tax year ${taxYear} K-1 summary for ${partnerName}`,
        keywords: ['K-1', 'tax', 'schedule', fundName, String(taxYear)],
      }}
      header={{
        title: 'Schedule K-1 Summary',
        subtitle: `Tax Year ${taxYear}`,
        showLogo: true,
        showDate: true,
      }}
      footer={{
        showPageNumbers: true,
        showCopyright: true,
        confidential: true,
        customText: 'For Informational Purposes Only',
      }}
    >
      {/* Document Header */}
      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>Partner&apos;s Share of Income, Deductions, Credits</Text>
        <Text style={styles.headerSubtitle}>
          Schedule K-1 (Form 1065) Summary | Tax Year {taxYear}
        </Text>
      </View>

      {/* Partner and Partnership Info */}
      <View style={styles.twoColumn}>
        <View style={styles.column}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Partner Information</Text>
            <Text style={styles.infoValue}>{partnerName}</Text>
            {data.partnerAddress && (
              <Text style={styles.infoValue}>{data.partnerAddress}</Text>
            )}
            {data.partnerTaxId && (
              <Text style={styles.infoValue}>TIN: {data.partnerTaxId}</Text>
            )}
          </View>
        </View>
        <View style={styles.column}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Partnership Information</Text>
            <Text style={styles.infoValue}>{fundName}</Text>
            {data.partnershipTaxId && (
              <Text style={styles.infoValue}>EIN: {data.partnershipTaxId}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Income Allocations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Partner&apos;s Distributive Share Items</Text>

        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Ordinary business income (loss)</Text>
          <Text style={styles.allocationValue}>{formatCurrency(allocations.ordinaryIncome)}</Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Net short-term capital gain (loss)</Text>
          <Text style={styles.allocationValue}>
            {formatCurrency(allocations.capitalGainsShortTerm)}
          </Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Net long-term capital gain (loss)</Text>
          <Text style={styles.allocationValue}>
            {formatCurrency(allocations.capitalGainsLongTerm)}
          </Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Net section 1231 gain (loss)</Text>
          <Text style={styles.allocationValue}>
            {formatCurrency(allocations.section1231Gains)}
          </Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Interest income</Text>
          <Text style={styles.allocationValue}>{formatCurrency(allocations.interestIncome)}</Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Ordinary dividends</Text>
          <Text style={styles.allocationValue}>{formatCurrency(allocations.dividendIncome)}</Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Royalties</Text>
          <Text style={styles.allocationValue}>{formatCurrency(allocations.royalties)}</Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Net rental real estate income (loss)</Text>
          <Text style={styles.allocationValue}>{formatCurrency(allocations.netRentalIncome)}</Text>
        </View>
        <View style={styles.allocationRow}>
          <Text style={styles.allocationLabel}>Other income (loss)</Text>
          <Text style={styles.allocationValue}>{formatCurrency(allocations.otherIncome)}</Text>
        </View>
        <View style={[styles.allocationRow, { borderBottomWidth: 2 }]}>
          <Text style={[styles.allocationLabel, styles.allocationTotal]}>
            Total Allocations
          </Text>
          <Text style={[styles.allocationValue, styles.allocationTotal]}>
            {formatCurrency(totalAllocations)}
          </Text>
        </View>
      </View>

      {/* Capital Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Capital Account Analysis</Text>

        <View style={styles.capitalRow}>
          <Text style={styles.capitalLabel}>Beginning capital account</Text>
          <Text style={styles.capitalValue}>
            {formatCurrency(capitalAccount.beginningBalance)}
          </Text>
        </View>
        <View style={styles.capitalRow}>
          <Text style={styles.capitalLabel}>Capital contributions during year</Text>
          <Text style={styles.capitalValue}>{formatCurrency(capitalAccount.contributions)}</Text>
        </View>
        <View style={styles.capitalRow}>
          <Text style={styles.capitalLabel}>Distributions during year</Text>
          <Text style={[styles.capitalValue, { color: '#ef4444' }]}>
            ({formatCurrency(capitalAccount.distributions)})
          </Text>
        </View>
        <View style={styles.capitalRow}>
          <Text style={styles.capitalLabel}>Current year increase (decrease)</Text>
          <Text style={styles.capitalValue}>{formatCurrency(capitalAccount.allocatedIncome)}</Text>
        </View>
        <View style={[styles.capitalRow, { backgroundColor: pdfTheme.colors.backgroundSubtle }]}>
          <Text style={[styles.capitalLabel, { fontWeight: 700 }]}>Ending capital account</Text>
          <Text style={[styles.capitalValue, { fontWeight: 700 }]}>
            {formatCurrency(capitalAccount.endingBalance)}
          </Text>
        </View>
      </View>

      {/* Distributions */}
      {showDistributions && distributions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Distributions</Text>
          <PdfTable columns={distributionColumns} data={distributions} compact />
        </View>
      )}

      {/* Footnotes */}
      {showFootnotes && footnotes && footnotes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          {footnotes.map((note, index) => (
            <Text key={index} style={styles.footnote}>
              {index + 1}. {note}
            </Text>
          ))}
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          This document is provided for informational purposes only and is not intended to
          constitute tax advice. Please consult with your tax advisor regarding the proper
          reporting of these items on your tax return. The official Schedule K-1 (Form 1065) will
          be provided separately.
        </Text>
      </View>
    </PdfDocument>
  );
};

export default K1Template;
