/**
 * PDF Theme Tokens
 *
 * Standalone theme module to avoid circular imports with ./components and ./templates.
 * Previously these tokens lived in ./index.ts, but vite 6+ enforces strict ESM
 * evaluation order: the `export ... from './components'` re-export in index.ts runs
 * before the `pdfTheme` const is initialized, so component module init saw
 * `pdfTheme` as undefined. Keeping theme definitions in a leaf module (no imports
 * from ./components) breaks the cycle.
 */

import { colors, typography, pdf as pdfTokens } from '@/lib/brand-tokens';

// =============================================================================
// PDF Theme (for @react-pdf/renderer)
// =============================================================================

/**
 * PDF-compatible theme tokens
 * Use with @react-pdf/renderer StyleSheet.create()
 */
export const pdfTheme = {
  colors: {
    primary: colors.dark,
    accent: colors.beige,
    background: colors.white,
    backgroundSubtle: colors.light,
    textPrimary: colors.dark,
    textMuted: colors.darkMuted,
    border: colors.beige,
  },

  fonts: {
    heading: typography.fontFamily.heading,
    body: typography.fontFamily.body,
  },

  fontSizes: {
    h1: pdfTokens.content.lineHeight * 22,
    h2: pdfTokens.content.lineHeight * 16,
    h3: pdfTokens.content.lineHeight * 13,
    h4: pdfTokens.content.lineHeight * 11,
    body: 11,
    caption: 9,
    footer: 8,
  },

  spacing: {
    page: {
      marginTop: pdfTokens.page.marginTop,
      marginBottom: pdfTokens.page.marginBottom,
      marginLeft: pdfTokens.page.marginLeft,
      marginRight: pdfTokens.page.marginRight,
    },
    section: pdfTokens.content.sectionSpacing,
    paragraph: pdfTokens.content.paragraphSpacing,
    gutter: 12,
  },

  page: {
    width: pdfTokens.page.width,
    height: pdfTokens.page.height,
  },

  header: {
    height: pdfTokens.header.height,
    logoWidth: pdfTokens.header.logoWidth,
  },

  footer: {
    height: pdfTokens.footer.height,
  },
} as const;

// =============================================================================
// Style Presets (for StyleSheet.create())
// =============================================================================

/**
 * Common PDF styles to use with @react-pdf/renderer
 */
export const pdfStylesDefinition = {
  // Page
  page: {
    paddingTop: pdfTheme.spacing.page.marginTop,
    paddingBottom: pdfTheme.spacing.page.marginBottom,
    paddingLeft: pdfTheme.spacing.page.marginLeft,
    paddingRight: pdfTheme.spacing.page.marginRight,
    fontFamily: 'Helvetica', // Default until custom fonts registered
    fontSize: pdfTheme.fontSizes.body,
    color: pdfTheme.colors.textPrimary,
    backgroundColor: pdfTheme.colors.background,
  },

  // Typography
  h1: {
    fontSize: pdfTheme.fontSizes.h1,
    fontWeight: 700,
    marginBottom: pdfTheme.spacing.paragraph,
    color: pdfTheme.colors.primary,
  },

  h2: {
    fontSize: pdfTheme.fontSizes.h2,
    fontWeight: 700,
    marginBottom: pdfTheme.spacing.paragraph * 0.75,
    color: pdfTheme.colors.primary,
  },

  h3: {
    fontSize: pdfTheme.fontSizes.h3,
    fontWeight: 600,
    marginBottom: pdfTheme.spacing.paragraph * 0.5,
    color: pdfTheme.colors.primary,
  },

  body: {
    fontSize: pdfTheme.fontSizes.body,
    lineHeight: 1.5,
    color: pdfTheme.colors.textPrimary,
  },

  caption: {
    fontSize: pdfTheme.fontSizes.caption,
    color: pdfTheme.colors.textMuted,
  },

  // Layout
  section: {
    marginBottom: pdfTheme.spacing.section,
  },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  spaceBetween: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },

  // Header
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.border,
    marginBottom: pdfTheme.spacing.section,
  },

  // Footer
  footer: {
    position: 'absolute' as const,
    bottom: pdfTheme.spacing.page.marginBottom,
    left: pdfTheme.spacing.page.marginLeft,
    right: pdfTheme.spacing.page.marginRight,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    fontSize: pdfTheme.fontSizes.footer,
    color: pdfTheme.colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: pdfTheme.colors.border,
    paddingTop: 8,
  },

  // Table
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
  },

  tableHeader: {
    flexDirection: 'row' as const,
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.border,
  },

  tableRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.backgroundSubtle,
  },

  tableCell: {
    padding: 6,
    fontSize: pdfTheme.fontSizes.body,
  },

  tableCellHeader: {
    padding: 8,
    fontSize: pdfTheme.fontSizes.body,
    fontWeight: 600,
  },

  // Cards
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
    borderRadius: 4,
    marginBottom: pdfTheme.spacing.paragraph,
  },

  cardHighlight: {
    padding: 12,
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    borderRadius: 4,
    marginBottom: pdfTheme.spacing.paragraph,
  },
} as const;
