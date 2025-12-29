/**
 * PDF Utilities Tests
 * Test suite for PDF export formatting utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pdfTheme,
  pdfStylesDefinition,
  formatCurrency,
  formatPercent,
  formatMultiple,
  formatDate,
  getGeneratedTimestamp,
  getCopyrightText,
  downloadBlob,
} from '@/utils/pdf';

// ============================================================================
// PDF THEME
// ============================================================================

describe('pdfTheme', () => {
  it('has color definitions', () => {
    expect(pdfTheme.colors.primary).toBe('#292929');
    expect(pdfTheme.colors.accent).toBe('#E0D8D1');
    expect(pdfTheme.colors.background).toBe('#FFFFFF');
  });

  it('has font definitions', () => {
    expect(pdfTheme.fonts.heading).toContain('Inter');
    expect(pdfTheme.fonts.body).toContain('Poppins');
  });

  it('has font sizes', () => {
    expect(pdfTheme.fontSizes.body).toBe(11);
    expect(pdfTheme.fontSizes.h1).toBeGreaterThan(pdfTheme.fontSizes.body);
  });

  it('has page dimensions', () => {
    expect(pdfTheme.page.width).toBe(612);
    expect(pdfTheme.page.height).toBe(792);
  });

  it('has spacing definitions', () => {
    expect(pdfTheme.spacing.page.marginTop).toBe(54);
    expect(pdfTheme.spacing.section).toBe(24);
  });
});

// ============================================================================
// PDF STYLES DEFINITION
// ============================================================================

describe('pdfStylesDefinition', () => {
  it('has page styles', () => {
    expect(pdfStylesDefinition.page).toBeDefined();
    expect(pdfStylesDefinition.page.paddingTop).toBe(54);
  });

  it('has typography styles', () => {
    expect(pdfStylesDefinition.h1).toBeDefined();
    expect(pdfStylesDefinition.h1.fontWeight).toBe(700);
    expect(pdfStylesDefinition.body).toBeDefined();
  });

  it('has layout styles', () => {
    expect(pdfStylesDefinition.row.flexDirection).toBe('row');
    expect(pdfStylesDefinition.spaceBetween.justifyContent).toBe('space-between');
  });

  it('has header and footer styles', () => {
    expect(pdfStylesDefinition.header).toBeDefined();
    expect(pdfStylesDefinition.footer).toBeDefined();
    expect(pdfStylesDefinition.footer.position).toBe('absolute');
  });

  it('has table styles', () => {
    expect(pdfStylesDefinition.table).toBeDefined();
    expect(pdfStylesDefinition.tableHeader).toBeDefined();
    expect(pdfStylesDefinition.tableRow).toBeDefined();
    expect(pdfStylesDefinition.tableCell).toBeDefined();
  });

  it('has card styles', () => {
    expect(pdfStylesDefinition.card).toBeDefined();
    expect(pdfStylesDefinition.cardHighlight).toBeDefined();
  });
});

// ============================================================================
// FORMAT CURRENCY
// ============================================================================

describe('formatCurrency', () => {
  it('formats basic currency values', () => {
    expect(formatCurrency(1000)).toBe('$1,000');
    expect(formatCurrency(1234567)).toBe('$1,234,567');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-1000)).toBe('-$1,000');
  });

  it('supports compact notation for millions', () => {
    expect(formatCurrency(1000000, { compact: true })).toBe('$1.0M');
    expect(formatCurrency(2500000, { compact: true })).toBe('$2.5M');
  });

  it('supports compact notation for thousands', () => {
    expect(formatCurrency(1000, { compact: true })).toBe('$1.0K');
    expect(formatCurrency(50000, { compact: true })).toBe('$50.0K');
  });

  it('does not use compact for small values', () => {
    expect(formatCurrency(500, { compact: true })).toBe('$500');
  });

  it('supports decimal places', () => {
    expect(formatCurrency(1234.56, { decimals: 2 })).toBe('$1,234.56');
    expect(formatCurrency(1234, { decimals: 2 })).toBe('$1,234.00');
  });
});

// ============================================================================
// FORMAT PERCENT
// ============================================================================

describe('formatPercent', () => {
  it('formats decimal to percentage', () => {
    expect(formatPercent(0.25)).toBe('25.0%');
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('handles values over 100%', () => {
    expect(formatPercent(1.5)).toBe('150.0%');
  });

  it('handles negative values', () => {
    expect(formatPercent(-0.25)).toBe('-25.0%');
  });

  it('supports custom decimal places', () => {
    expect(formatPercent(0.12345, 2)).toBe('12.35%');
    expect(formatPercent(0.12345, 0)).toBe('12%');
  });
});

// ============================================================================
// FORMAT MULTIPLE
// ============================================================================

describe('formatMultiple', () => {
  it('formats MOIC values', () => {
    expect(formatMultiple(1.5)).toBe('1.50x');
    expect(formatMultiple(2.0)).toBe('2.00x');
    expect(formatMultiple(3.25)).toBe('3.25x');
  });

  it('handles values less than 1', () => {
    expect(formatMultiple(0.5)).toBe('0.50x');
    expect(formatMultiple(0.75)).toBe('0.75x');
  });

  it('handles zero', () => {
    expect(formatMultiple(0)).toBe('0.00x');
  });

  it('supports custom decimal places', () => {
    expect(formatMultiple(2.333, 1)).toBe('2.3x');
    expect(formatMultiple(2.333, 3)).toBe('2.333x');
  });
});

// ============================================================================
// FORMAT DATE
// ============================================================================

describe('formatDate', () => {
  const testDate = new Date('2024-06-15T12:00:00Z');

  it('formats date in medium format by default', () => {
    const result = formatDate(testDate, 'medium');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('formats date in short format', () => {
    const result = formatDate(testDate, 'short');
    expect(result).toContain('6');  // Month
    expect(result).toContain('15'); // Day
  });

  it('formats date in long format', () => {
    const result = formatDate(testDate, 'long');
    expect(result).toContain('June');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('accepts string dates', () => {
    const result = formatDate('2024-06-15', 'medium');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
  });

  it('defaults to medium format', () => {
    const result = formatDate(testDate);
    expect(result).toContain('Jun');
  });
});

// ============================================================================
// GET GENERATED TIMESTAMP
// ============================================================================

describe('getGeneratedTimestamp', () => {
  it('returns a formatted timestamp string', () => {
    const result = getGeneratedTimestamp();
    expect(result).toContain('Generated');
    expect(result).toContain('at');
  });

  it('contains date components', () => {
    const result = getGeneratedTimestamp();
    // Should contain month abbreviation
    expect(result).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
  });
});

// ============================================================================
// GET COPYRIGHT TEXT
// ============================================================================

describe('getCopyrightText', () => {
  it('returns copyright with current year by default', () => {
    const currentYear = new Date().getFullYear();
    const result = getCopyrightText();
    expect(result).toContain(String(currentYear));
    expect(result).toContain('Press On Ventures');
    expect(result).toContain('Confidential');
  });

  it('accepts custom year', () => {
    const result = getCopyrightText(2025);
    expect(result).toContain('2025');
    expect(result).toContain('Press On Ventures');
  });
});

// ============================================================================
// DOWNLOAD BLOB
// ============================================================================

describe('downloadBlob', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let mockLink: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // jsdom doesn't have URL.createObjectURL, so we need to add it
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
    revokeObjectURLMock = vi.fn();
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;

    mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLAnchorElement);
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates object URL from blob', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlob(blob, 'test.pdf');

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
  });

  it('sets download filename', () => {
    const blob = new Blob(['test']);
    downloadBlob(blob, 'report.pdf');

    expect(mockLink.download).toBe('report.pdf');
  });

  it('triggers click on link', () => {
    const blob = new Blob(['test']);
    downloadBlob(blob, 'test.pdf');

    expect(mockLink.click).toHaveBeenCalled();
  });

  it('cleans up after download', () => {
    const blob = new Blob(['test']);
    downloadBlob(blob, 'test.pdf');

    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url');
  });
});
