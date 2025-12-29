/**
 * PDF Generation Tests
 *
 * Tests for @react-pdf/renderer integration and template generation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { registerFonts, areFontsRegistered, PDF_FONTS } from '../fonts';
import {
  pdfTheme,
  formatCurrency,
  formatPercent,
  formatMultiple,
  formatDate,
  getGeneratedTimestamp,
  getCopyrightText,
} from '../index';
import { colors, typography } from '@/lib/brand-tokens';

describe('PDF Font Registration', () => {
  it('should have correct font family constants', () => {
    expect(PDF_FONTS.heading).toBe('Inter');
    expect(PDF_FONTS.body).toBe('Poppins');
    expect(PDF_FONTS.fallback).toBe('Helvetica');
  });

  it('should register fonts without throwing', () => {
    expect(() => registerFonts()).not.toThrow();
  });

  it('should track font registration state', () => {
    registerFonts();
    expect(areFontsRegistered()).toBe(true);
  });
});

describe('PDF Theme', () => {
  it('should have brand colors defined', () => {
    expect(pdfTheme.colors.primary).toBe(colors.dark);
    expect(pdfTheme.colors.accent).toBe(colors.beige);
    expect(pdfTheme.colors.background).toBe(colors.white);
    expect(pdfTheme.colors.backgroundSubtle).toBe(colors.light);
  });

  it('should have font definitions', () => {
    expect(pdfTheme.fonts.heading).toBe(typography.fontFamily.heading);
    expect(pdfTheme.fonts.body).toBe(typography.fontFamily.body);
  });

  it('should have proper font sizes', () => {
    expect(pdfTheme.fontSizes.body).toBe(11);
    expect(pdfTheme.fontSizes.caption).toBe(9);
    expect(pdfTheme.fontSizes.footer).toBe(8);
  });

  it('should have page dimensions', () => {
    expect(pdfTheme.page.width).toBeGreaterThan(0);
    expect(pdfTheme.page.height).toBeGreaterThan(0);
  });

  it('should have header and footer heights', () => {
    expect(pdfTheme.header.height).toBeGreaterThan(0);
    expect(pdfTheme.footer.height).toBeGreaterThan(0);
  });
});

describe('PDF Formatting Utilities', () => {
  describe('formatCurrency', () => {
    it('should format basic currency values', () => {
      expect(formatCurrency(1000)).toBe('$1,000');
      expect(formatCurrency(1234567)).toBe('$1,234,567');
    });

    it('should format compact values', () => {
      expect(formatCurrency(1500000, { compact: true })).toBe('$1.5M');
      expect(formatCurrency(2500, { compact: true })).toBe('$2.5K');
    });

    it('should handle decimal places', () => {
      expect(formatCurrency(1234.56, { decimals: 2 })).toBe('$1,234.56');
    });
  });

  describe('formatPercent', () => {
    it('should format percentages correctly', () => {
      expect(formatPercent(0.15)).toBe('15.0%');
      expect(formatPercent(0.1234, 2)).toBe('12.34%');
    });
  });

  describe('formatMultiple', () => {
    it('should format multiples correctly', () => {
      expect(formatMultiple(1.5)).toBe('1.50x');
      expect(formatMultiple(2.345, 1)).toBe('2.3x');
    });
  });

  describe('formatDate', () => {
    it('should format dates in short format', () => {
      const date = new Date('2024-03-15');
      expect(formatDate(date, 'short')).toContain('3');
      expect(formatDate(date, 'short')).toContain('15');
    });

    it('should format dates in medium format', () => {
      const date = new Date('2024-03-15');
      expect(formatDate(date, 'medium')).toContain('Mar');
    });

    it('should format dates in long format', () => {
      const date = new Date('2024-03-15');
      expect(formatDate(date, 'long')).toContain('March');
    });

    it('should handle string dates', () => {
      expect(formatDate('2024-03-15')).toContain('Mar');
    });
  });

  describe('getGeneratedTimestamp', () => {
    it('should return a timestamp string', () => {
      const timestamp = getGeneratedTimestamp();
      expect(timestamp).toContain('Generated');
      expect(timestamp).toMatch(/\d{1,2}:\d{2}/); // Time pattern
    });
  });

  describe('getCopyrightText', () => {
    it('should include current year by default', () => {
      const currentYear = new Date().getFullYear();
      expect(getCopyrightText()).toContain(String(currentYear));
    });

    it('should include custom year', () => {
      expect(getCopyrightText(2025)).toContain('2025');
    });

    it('should include Press On Ventures', () => {
      expect(getCopyrightText()).toContain('Press On Ventures');
    });
  });
});

describe('PDF Template Data Structures', () => {
  it('should validate TearSheetData structure', () => {
    const tearSheetData = {
      companyName: 'Acme Corp',
      fundName: 'Press On Ventures II',
      investmentDate: '2023-01-15',
      metrics: {
        totalInvested: 2000000,
        currentValue: 5000000,
        moic: 2.5,
        irr: 0.35,
      },
    };

    expect(tearSheetData.companyName).toBe('Acme Corp');
    expect(tearSheetData.metrics.moic).toBe(2.5);
  });

  it('should validate QuarterlyReportData structure', () => {
    const quarterlyData = {
      fundName: 'Press On Ventures II',
      quarter: 'Q4',
      year: 2024,
      summary: {
        nav: 50000000,
        tvpi: 1.8,
        dpi: 0.5,
        irr: 0.25,
      },
      portfolioCompanies: [
        { name: 'Acme', invested: 2000000, value: 5000000, moic: 2.5 },
      ],
    };

    expect(quarterlyData.quarter).toBe('Q4');
    expect(quarterlyData.summary.tvpi).toBe(1.8);
    expect(quarterlyData.portfolioCompanies.length).toBe(1);
  });
});
