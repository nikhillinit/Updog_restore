/**
 * PDF Document Wrapper Component
 *
 * Base wrapper for all PDF documents with branded header, footer, and metadata.
 */

import React from 'react';
import { Document, Page, View, StyleSheet } from '@react-pdf/renderer';
import { pdfTheme } from '../index';
import { registerFonts, PDF_FONTS } from '../fonts';
import { PdfHeader, type PdfHeaderProps } from './PdfHeader';
import { PdfFooter, type PdfFooterProps } from './PdfFooter';

// Ensure fonts are registered
registerFonts();

export interface PdfMetadata {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdAt?: Date;
}

export interface PdfDocumentProps {
  metadata: PdfMetadata;
  header?: PdfHeaderProps | false;
  footer?: PdfFooterProps | false;
  children: React.ReactNode;
  orientation?: 'portrait' | 'landscape';
}

const styles = StyleSheet.create({
  page: {
    paddingTop: pdfTheme.spacing.page.marginTop,
    paddingBottom: pdfTheme.spacing.page.marginBottom + 20, // Extra space for footer
    paddingLeft: pdfTheme.spacing.page.marginLeft,
    paddingRight: pdfTheme.spacing.page.marginRight,
    fontFamily: PDF_FONTS.body,
    fontSize: pdfTheme.fontSizes.body,
    color: pdfTheme.colors.textPrimary,
    backgroundColor: pdfTheme.colors.background,
  },
  content: {
    flex: 1,
  },
});

export const PdfDocument: React.FC<PdfDocumentProps> = ({
  metadata,
  header,
  footer,
  children,
  orientation = 'portrait',
}) => {
  const defaultHeader: PdfHeaderProps = {
    title: metadata.title,
    showLogo: true,
    showDate: true,
  };

  const defaultFooter: PdfFooterProps = {
    showPageNumbers: true,
    showCopyright: true,
    confidential: true,
  };

  // Build document props, omitting undefined values for exactOptionalPropertyTypes
  const documentProps: Record<string, string> = {
    title: metadata.title,
    author: metadata.author || 'Press On Ventures',
    creator: 'Updawg by Press On Ventures',
    producer: '@react-pdf/renderer',
  };
  if (metadata.subject) documentProps['subject'] = metadata.subject;
  if (metadata.keywords?.length) documentProps['keywords'] = metadata.keywords.join(', ');

  return (
    <Document {...documentProps}>
      <Page size="LETTER" orientation={orientation} style={styles.page}>
        {header !== false && (
          <PdfHeader {...(header || defaultHeader)} />
        )}
        <View style={styles.content}>{children}</View>
        {footer !== false && (
          <PdfFooter {...(footer || defaultFooter)} />
        )}
      </Page>
    </Document>
  );
};

export default PdfDocument;
