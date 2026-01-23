/**
 * PDF Header Component
 *
 * Branded header for PDF documents with POV logo, title, and date.
 */

import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { pdfTheme } from '../index';
import { PDF_FONTS } from '../fonts';

export interface PdfHeaderProps {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  showDate?: boolean;
  logoSrc?: string;
  /** Pass a specific date for deterministic output */
  asOfDate?: Date;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.border,
    marginBottom: pdfTheme.spacing.section,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: pdfTheme.header.logoWidth,
    height: 'auto',
  },
  titleSection: {
    flexDirection: 'column',
  },
  title: {
    fontFamily: PDF_FONTS.heading,
    fontSize: 18,
    fontWeight: 700,
    color: pdfTheme.colors.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: PDF_FONTS.body,
    fontSize: 11,
    color: pdfTheme.colors.textMuted,
  },
  rightSection: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  date: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textMuted,
  },
});

// POV Logo as base64 data URL (placeholder - replace with actual logo)
const POV_LOGO_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMTIwIDQwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiIGZpbGw9IiMyOTI5MjkiLz48dGV4dCB4PSI2MCIgeT0iMjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByZXNzIE9uIFZlbnR1cmVzPC90ZXh0Pjwvc3ZnPg==';

export const PdfHeader: React.FC<PdfHeaderProps> = ({
  title,
  subtitle,
  showLogo = true,
  showDate = true,
  logoSrc,
  asOfDate,
}) => {
  const dateToUse = asOfDate ?? new Date();
  const currentDate = dateToUse.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <View style={styles.header}>
      <View style={styles.leftSection}>
        {showLogo && (
          <Image
            src={logoSrc || POV_LOGO_PLACEHOLDER}
            style={styles.logo}
          />
        )}
        {(title || subtitle) && (
          <View style={styles.titleSection}>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        )}
      </View>
      <View style={styles.rightSection}>
        {showDate && <Text style={styles.date}>{currentDate}</Text>}
      </View>
    </View>
  );
};

export default PdfHeader;
