/**
 * Shared presentational components for PDF reports.
 * Each component is small and stateless, resetting the per-function CC counter.
 *
 * @module server/services/pdf-generation/components
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { baseStyles } from './theme.js';
import { formatDate } from './formatters.js';

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  title: string;
  subtitle: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <View style={baseStyles.header}>
      <Text style={baseStyles.title}>{title}</Text>
      <Text style={baseStyles.subtitle}>{subtitle}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PageFooter
// ---------------------------------------------------------------------------

interface PageFooterProps {
  generatedAt: Date;
}

export function PageFooter({ generatedAt }: PageFooterProps) {
  return (
    <View style={{ ...baseStyles.footer, fixed: true } as never}>
      <Text>{`Generated ${formatDate(generatedAt, 'medium')}`}</Text>
      <Text>{`${generatedAt.getUTCFullYear()} Press On Ventures | Confidential`}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SectionTitle
// ---------------------------------------------------------------------------

export function SectionTitle({ children }: { children: string }) {
  return <Text style={baseStyles.sectionTitle}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// LabelValueRow
// ---------------------------------------------------------------------------

interface LabelValueRowProps {
  label: string;
  value: string;
  valueStyle?: Record<string, unknown>;
}

export function LabelValueRow({ label, value, valueStyle }: LabelValueRowProps) {
  return (
    <View style={baseStyles.row}>
      <Text style={baseStyles.label}>{label}</Text>
      <Text style={valueStyle ? { ...baseStyles.value, ...valueStyle } : baseStyles.value}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TotalRow
// ---------------------------------------------------------------------------

interface TotalRowProps {
  label: string;
  value: string;
}

export function TotalRow({ label, value }: TotalRowProps) {
  return (
    <View style={baseStyles.totalRow}>
      <Text style={baseStyles.totalLabel}>{label}</Text>
      <Text style={baseStyles.totalValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// InfoBox
// ---------------------------------------------------------------------------

interface InfoBoxProps {
  label: string;
  lines: Array<string | false | null | undefined>;
}

export function InfoBox({ label, lines }: InfoBoxProps) {
  return (
    <View style={baseStyles.infoBox}>
      <Text style={baseStyles.infoLabel}>{label}</Text>
      {lines.map(
        (line, i) =>
          line && (
            <Text key={i} style={baseStyles.infoValue}>
              {line}
            </Text>
          )
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// BaseTable
// ---------------------------------------------------------------------------

export interface ColumnDef {
  header: string;
  width: string;
  align?: 'left' | 'right';
}

interface BaseTableProps {
  columns: ColumnDef[];
  rows: Array<{
    key: string | number;
    cells: Array<{ text: string; style?: Record<string, unknown> | undefined }>;
  }>;
}

export function BaseTable({ columns, rows }: BaseTableProps) {
  return (
    <>
      <View style={baseStyles.tableHeader}>
        {columns.map((col, i) => (
          <Text
            key={i}
            style={{
              ...baseStyles.tableHeaderCell,
              width: col.width,
              ...(col.align === 'right' ? { textAlign: 'right' } : {}),
            }}
          >
            {col.header}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.key} style={baseStyles.tableRow}>
          {row.cells.map((cell, ci) => (
            <Text
              key={ci}
              style={{
                ...baseStyles.tableCell,
                width: columns[ci]?.width ?? 'auto',
                ...(columns[ci]?.align === 'right' ? { textAlign: 'right' as const } : {}),
                ...cell.style,
              }}
            >
              {cell.text}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: string;
  subtitle: string;
}

export function MetricCard({ label, value, subtitle }: MetricCardProps) {
  return (
    <View style={baseStyles.metricCard}>
      <Text style={baseStyles.metricLabel}>{label}</Text>
      <Text style={baseStyles.metricValue}>{value}</Text>
      <Text style={baseStyles.metricSubtitle}>{subtitle}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

export function Disclaimer({ text }: { text: string }) {
  return (
    <View style={baseStyles.disclaimer}>
      <Text style={baseStyles.disclaimerText}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Footnotes
// ---------------------------------------------------------------------------

export function Footnotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <View style={{ ...baseStyles.section, marginTop: 8 }}>
      {notes.map((note, i) => (
        <Text key={i} style={baseStyles.disclaimerText}>
          {`${i + 1}. ${note}`}
        </Text>
      ))}
    </View>
  );
}
