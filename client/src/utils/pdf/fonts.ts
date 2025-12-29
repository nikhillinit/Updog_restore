/**
 * Font Registration for @react-pdf/renderer
 *
 * Registers Inter and Poppins fonts for PDF generation.
 * Must be called before any PDF rendering.
 *
 * @see https://react-pdf.org/fonts
 */

import { Font } from '@react-pdf/renderer';

// Flag to track if fonts have been registered
let fontsRegistered = false;

/**
 * Register custom fonts for PDF rendering
 *
 * Uses variable font for Inter (single file covers all weights)
 * Uses individual files for Poppins weights
 */
export function registerFonts(): void {
  if (fontsRegistered) {
    return;
  }

  // Register Inter (variable font - covers Regular through Bold)
  Font.register({
    family: 'Inter',
    fonts: [
      {
        src: '/fonts/Inter-Regular.ttf',
        fontWeight: 400,
      },
      {
        src: '/fonts/Inter-Regular.ttf',
        fontWeight: 500,
      },
      {
        src: '/fonts/Inter-Regular.ttf',
        fontWeight: 600,
      },
      {
        src: '/fonts/Inter-Regular.ttf',
        fontWeight: 700,
      },
    ],
  });

  // Register Poppins (individual weight files)
  Font.register({
    family: 'Poppins',
    fonts: [
      {
        src: '/fonts/Poppins-Regular.ttf',
        fontWeight: 400,
      },
      {
        src: '/fonts/Poppins-Medium.ttf',
        fontWeight: 500,
      },
      {
        src: '/fonts/Poppins-SemiBold.ttf',
        fontWeight: 600,
      },
      {
        src: '/fonts/Poppins-Bold.ttf',
        fontWeight: 700,
      },
    ],
  });

  // Disable hyphenation for cleaner PDF output
  Font.registerHyphenationCallback((word) => [word]);

  fontsRegistered = true;
}

/**
 * Check if fonts are registered
 */
export function areFontsRegistered(): boolean {
  return fontsRegistered;
}

/**
 * Font family constants for use in styles
 */
export const PDF_FONTS = {
  heading: 'Inter',
  body: 'Poppins',
  fallback: 'Helvetica',
} as const;

export type PdfFontFamily = (typeof PDF_FONTS)[keyof typeof PDF_FONTS];
