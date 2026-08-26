/**
 * K-1 Tax Summary PDF document.
 * JSX conversion of the original monolithic K1TaxSummaryPDF.
 *
 * @module server/services/pdf-generation/k1-document
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
  Disclaimer,
  Footnotes,
} from './components.js';
import type { K1ReportData } from './types.js';

// ---------------------------------------------------------------------------
// View-model: derive totals from raw data (no React)
// ---------------------------------------------------------------------------

function computeTotalAllocations(a: K1ReportData['allocations']): number {
  return (
    a.ordinaryIncome +
    a.capitalGainsShortTerm +
    a.capitalGainsLongTerm +
    a.section1231Gains +
    a.interestIncome +
    a.dividendIncome +
    a.royalties +
    a.netRentalIncome +
    a.otherIncome
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function PartnerPartnershipInfo({ data }: { data: K1ReportData }) {
  return (
    <View style={baseStyles.twoColumn}>
      <View style={baseStyles.column}>
        <InfoBox
          label="Partner Information"
          lines={[
            data.partnerName,
            data.partnerAddress,
            data.partnerTaxId && `TIN: ${data.partnerTaxId}`,
          ]}
        />
      </View>
      <View style={baseStyles.column}>
        <InfoBox
          label="Partnership Information"
          lines={[data.fundName, data.partnershipTaxId && `EIN: ${data.partnershipTaxId}`]}
        />
      </View>
    </View>
  );
}

function AllocationsSection({
  allocations,
  total,
}: {
  allocations: K1ReportData['allocations'];
  total: number;
}) {
  const rows: Array<[string, number]> = [
    ['Ordinary business income (loss)', allocations.ordinaryIncome],
    ['Net short-term capital gain (loss)', allocations.capitalGainsShortTerm],
    ['Net long-term capital gain (loss)', allocations.capitalGainsLongTerm],
    ['Net section 1231 gain (loss)', allocations.section1231Gains],
    ['Interest income', allocations.interestIncome],
    ['Ordinary dividends', allocations.dividendIncome],
    ['Royalties', allocations.royalties],
    ['Net rental real estate income (loss)', allocations.netRentalIncome],
    ['Other income (loss)', allocations.otherIncome],
  ];

  return (
    <View style={baseStyles.section}>
      <SectionTitle>{"Partner's Distributive Share Items"}</SectionTitle>
      {rows.map(([label, val]) => (
        <LabelValueRow key={label} label={label} value={formatCurrency(val)} />
      ))}
      <TotalRow label="Total Allocations" value={formatCurrency(total)} />
    </View>
  );
}

function CapitalAccountSection({ ca }: { ca: K1ReportData['capitalAccount'] }) {
  return (
    <View style={baseStyles.section}>
      <SectionTitle>Capital Account Analysis</SectionTitle>
      <LabelValueRow
        label="Beginning capital account"
        value={formatCurrency(ca.beginningBalance)}
      />
      <LabelValueRow
        label="Capital contributions during year"
        value={formatCurrency(ca.contributions)}
      />
      <LabelValueRow
        label="Distributions during year"
        value={`(${formatCurrency(ca.distributions)})`}
        valueStyle={{ color: colors.error }}
      />
      <LabelValueRow
        label="Current year increase (decrease)"
        value={formatCurrency(ca.allocatedIncome)}
      />
      <TotalRow label="Ending capital account" value={formatCurrency(ca.endingBalance)} />
    </View>
  );
}

function DistributionsSection({ distributions }: { distributions: K1ReportData['distributions'] }) {
  if (distributions.length === 0) return null;

  const columns = [
    { header: 'Date', width: '30%' },
    { header: 'Type', width: '40%' },
    { header: 'Amount', width: '30%', align: 'right' as const },
  ];

  const rows = distributions.map((dist, i) => ({
    key: i,
    cells: [
      { text: formatDate(dist.date, 'short') },
      { text: dist.type },
      { text: formatCurrency(dist.amount) },
    ],
  }));

  return (
    <View style={baseStyles.section}>
      <SectionTitle>Distributions</SectionTitle>
      <BaseTable columns={columns} rows={rows} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function K1TaxSummaryPDF({ data }: { data: K1ReportData }): React.ReactElement {
  const totalAllocations = computeTotalAllocations(data.allocations);
  const generatedAt = getGeneratedTimestamp(
    data.generatedAt ? new Date(data.generatedAt) : undefined
  );

  return (
    <Document title={`K-1 Summary - ${data.partnerName} - ${data.taxYear}`}>
      <Page size="LETTER" style={baseStyles.page}>
        <PageHeader
          title="Schedule K-1 Summary"
          subtitle={`Tax Year ${data.taxYear} | ${data.fundName}`}
        />
        <PartnerPartnershipInfo data={data} />
        <AllocationsSection allocations={data.allocations} total={totalAllocations} />
        <CapitalAccountSection ca={data.capitalAccount} />
        <DistributionsSection distributions={data.distributions} />
        <Footnotes notes={data.footnotes ?? []} />
        <Disclaimer text="This document is provided for informational purposes only and is not intended to constitute tax advice. Please consult with your tax advisor regarding the proper reporting of these items on your tax return. The official Schedule K-1 (Form 1065) will be provided separately." />
        <PageFooter generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
