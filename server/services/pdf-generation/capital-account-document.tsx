/**
 * Capital Account Statement PDF document.
 * JSX conversion of the original monolithic CapitalAccountStatementPDF.
 *
 * @module server/services/pdf-generation/capital-account-document
 */

import React from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import { baseStyles, colors } from './theme.js';
import { formatCurrency, formatDate, getGeneratedTimestamp } from './formatters.js';
import {
  PageHeader,
  PageFooter,
  SectionTitle,
  LabelValueRow,
  TotalRow,
  InfoBox,
  BaseTable,
} from './components.js';
import type { CapitalAccountReportData } from './types.js';

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function LPInfoSection({ data }: { data: CapitalAccountReportData }) {
  return (
    <View style={baseStyles.section}>
      <InfoBox
        label="Limited Partner"
        lines={[data.lpName, `Commitment: ${formatCurrency(data.commitment)}`]}
      />
    </View>
  );
}

function AccountSummary({ summary }: { summary: CapitalAccountReportData['summary'] }) {
  return (
    <View style={baseStyles.section}>
      <SectionTitle>Account Summary</SectionTitle>
      <LabelValueRow label="Beginning Balance" value={formatCurrency(summary.beginningBalance)} />
      <LabelValueRow
        label="Total Contributions"
        value={formatCurrency(summary.totalContributions)}
      />
      <LabelValueRow
        label="Total Distributions"
        value={`(${formatCurrency(summary.totalDistributions)})`}
        valueStyle={{ color: colors.error }}
      />
      <LabelValueRow label="Net Income / (Loss)" value={formatCurrency(summary.netIncome)} />
      <TotalRow label="Ending Balance" value={formatCurrency(summary.endingBalance)} />
    </View>
  );
}

function TransactionHistory({
  transactions,
}: {
  transactions: CapitalAccountReportData['transactions'];
}) {
  const columns = [
    { header: 'Date', width: '15%' },
    { header: 'Type', width: '15%' },
    { header: 'Description', width: '30%' },
    { header: 'Amount', width: '20%', align: 'right' as const },
    { header: 'Balance', width: '20%', align: 'right' as const },
  ];

  const rows = transactions.map((tx, i) => ({
    key: i,
    cells: [
      { text: formatDate(tx.date, 'short') },
      { text: tx.type },
      { text: tx.description },
      {
        text: formatCurrency(tx.amount),
        style: tx.amount < 0 ? { color: colors.error } : undefined,
      },
      { text: formatCurrency(tx.balance) },
    ],
  }));

  return (
    <View style={baseStyles.section}>
      <SectionTitle>Transaction History</SectionTitle>
      <BaseTable columns={columns} rows={rows} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function CapitalAccountStatementPDF({
  data,
}: {
  data: CapitalAccountReportData;
}): React.ReactElement {
  const generatedAt = getGeneratedTimestamp(
    data.generatedAt ? new Date(data.generatedAt) : undefined
  );

  return (
    <Document title={`Capital Account Statement - ${data.lpName}`}>
      <Page size="LETTER" style={baseStyles.page}>
        <PageHeader
          title="Capital Account Statement"
          subtitle={`${data.fundName} | As of ${formatDate(data.asOfDate, 'long')}`}
        />
        <LPInfoSection data={data} />
        <AccountSummary summary={data.summary} />
        <TransactionHistory transactions={data.transactions} />
        <PageFooter generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
