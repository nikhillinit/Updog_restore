/**
 * PDF Metric Card Component
 *
 * Displays a single metric/KPI in a card format.
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { pdfTheme } from '../index';
import { PDF_FONTS } from '../fonts';

export interface PdfMetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  highlighted?: boolean;
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
    borderRadius: 4,
    backgroundColor: pdfTheme.colors.background,
  },
  cardHighlighted: {
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    borderColor: pdfTheme.colors.accent,
  },
  label: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 18,
    fontWeight: 700,
    color: pdfTheme.colors.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: PDF_FONTS.body,
    fontSize: 8,
    color: pdfTheme.colors.textMuted,
  },
  trendUp: {
    color: '#10b981', // Success green
  },
  trendDown: {
    color: '#ef4444', // Error red
  },
});

export const PdfMetricCard: React.FC<PdfMetricCardProps> = ({
  label,
  value,
  subtitle,
  trend,
  highlighted = false,
}) => {
  const getTrendStyle = () => {
    if (trend === 'up') return styles.trendUp;
    if (trend === 'down') return styles.trendDown;
    return {};
  };

  const cardStyle = highlighted
    ? [styles.card, styles.cardHighlighted]
    : [styles.card];

  const valueStyle = trend
    ? [styles.value, getTrendStyle()]
    : [styles.value];

  return (
    <View style={cardStyle}>
      <Text style={styles.label}>{label}</Text>
      <Text style={valueStyle}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

export default PdfMetricCard;
