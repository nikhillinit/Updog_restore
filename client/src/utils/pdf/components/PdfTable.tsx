/**
 * PDF Table Component
 *
 * Reusable table component for PDF documents.
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { pdfTheme } from '../index';
import { PDF_FONTS } from '../fonts';

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T, index: number) => string | React.ReactNode;
}

export interface PdfTableProps<T extends Record<string, unknown>> {
  columns: TableColumn<T>[];
  data: T[];
  showHeader?: boolean;
  striped?: boolean;
  compact?: boolean;
}

const createStyles = (compact: boolean) =>
  StyleSheet.create({
    table: {
      width: '100%',
      borderWidth: 1,
      borderColor: pdfTheme.colors.border,
      borderRadius: 2,
    },
    headerRow: {
      flexDirection: 'row',
      backgroundColor: pdfTheme.colors.backgroundSubtle,
      borderBottomWidth: 1,
      borderBottomColor: pdfTheme.colors.border,
    },
    row: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: pdfTheme.colors.backgroundSubtle,
    },
    rowStriped: {
      backgroundColor: 'rgba(242, 242, 242, 0.5)',
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    headerCell: {
      padding: compact ? 4 : 8,
      fontFamily: PDF_FONTS.heading,
      fontSize: compact ? 9 : 10,
      fontWeight: 600,
      color: pdfTheme.colors.primary,
    },
    cell: {
      padding: compact ? 4 : 6,
      fontFamily: PDF_FONTS.body,
      fontSize: compact ? 9 : 10,
      color: pdfTheme.colors.textPrimary,
    },
    alignLeft: {
      textAlign: 'left',
    },
    alignCenter: {
      textAlign: 'center',
    },
    alignRight: {
      textAlign: 'right',
    },
  });

export function PdfTable<T extends Record<string, unknown>>({
  columns,
  data,
  showHeader = true,
  striped = true,
  compact = false,
}: PdfTableProps<T>): React.ReactElement {
  const styles = createStyles(compact);

  const getCellStyle = (
    column: TableColumn<T>,
    isHeader: boolean
  ): Style[] => {
    const baseStyle = isHeader ? styles.headerCell : styles.cell;
    const alignStyle =
      column.align === 'center'
        ? styles.alignCenter
        : column.align === 'right'
          ? styles.alignRight
          : styles.alignLeft;

    const widthStyle: Style = column.width
      ? { width: column.width as number | `${number}%` }
      : { flex: 1 };

    return [baseStyle, alignStyle, widthStyle];
  };

  const getCellValue = (row: T, column: TableColumn<T>, index: number): string => {
    if (column.render) {
      const rendered = column.render(row[column.key as keyof T], row, index);
      return typeof rendered === 'string' ? rendered : String(rendered);
    }
    const value = row[column.key as keyof T];
    return value != null ? String(value) : '';
  };

  return (
    <View style={styles.table}>
      {showHeader && (
        <View style={styles.headerRow}>
          {columns.map((column) => (
            <Text key={String(column.key)} style={getCellStyle(column, true)}>
              {column.header}
            </Text>
          ))}
        </View>
      )}
      {data.map((row, rowIndex) => {
        const rowStyles: Style[] = [styles.row];
        if (striped && rowIndex % 2 === 1) rowStyles.push(styles.rowStriped);
        if (rowIndex === data.length - 1) rowStyles.push(styles.lastRow);
        return (
        <View
          key={rowIndex}
          style={rowStyles}
        >
          {columns.map((column) => (
            <Text key={String(column.key)} style={getCellStyle(column, false)}>
              {getCellValue(row, column, rowIndex)}
            </Text>
          ))}
        </View>
        );
      })}
    </View>
  );
}

export default PdfTable;
