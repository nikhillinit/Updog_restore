/**
 * PDF theme: colors, fonts, and shared StyleSheet.
 * @module server/services/pdf-generation/theme
 */

import { StyleSheet } from '@react-pdf/renderer';

export const colors = {
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

export const fontFamily = 'Helvetica';

export const baseStyles = StyleSheet.create({
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
