/**
 * PDF Footer Component
 *
 * Footer with page numbers, copyright, and confidentiality notice.
 */

import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { pdfTheme, getCopyrightText } from '../index';
import { PDF_FONTS } from '../fonts';

export interface PdfFooterProps {
  showPageNumbers?: boolean;
  showCopyright?: boolean;
  customText?: string;
  confidential?: boolean;
  /** Pass a specific year for deterministic output */
  copyrightYear?: number;
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: pdfTheme.spacing.page.marginBottom,
    left: pdfTheme.spacing.page.marginLeft,
    right: pdfTheme.spacing.page.marginRight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: pdfTheme.colors.border,
    paddingTop: 8,
  },
  leftSection: {
    flexDirection: 'column',
  },
  centerSection: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  rightSection: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  text: {
    fontFamily: PDF_FONTS.body,
    fontSize: 8,
    color: pdfTheme.colors.textMuted,
  },
  confidential: {
    fontFamily: PDF_FONTS.body,
    fontSize: 7,
    color: pdfTheme.colors.textMuted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pageNumber: {
    fontFamily: PDF_FONTS.body,
    fontSize: 9,
    color: pdfTheme.colors.textPrimary,
  },
});

export const PdfFooter: React.FC<PdfFooterProps> = ({
  showPageNumbers = true,
  showCopyright = true,
  customText,
  confidential = true,
  copyrightYear,
}) => {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.leftSection}>
        {confidential && (
          <Text style={styles.confidential}>Confidential</Text>
        )}
        {showCopyright && (
          <Text style={styles.text}>{getCopyrightText(copyrightYear)}</Text>
        )}
      </View>
      <View style={styles.centerSection}>
        {customText && <Text style={styles.text}>{customText}</Text>}
      </View>
      <View style={styles.rightSection}>
        {showPageNumbers && (
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        )}
      </View>
    </View>
  );
};

export default PdfFooter;
