/**
 * LP Reporting -- decimal-string formatters.
 *
 * Pure functions: decimal-string in (or null), display string out.
 * Null inputs render as the LP-friendly placeholder `--` rather than
 * `0` or `N/A` (the locked metric-run results schema allows null for
 * ratios that are undefined when contributions are zero).
 *
 * NEVER call `Number(value)` on a decimal-string. Money values can
 * exceed `Number.MAX_SAFE_INTEGER` ($9.007T) and silently lose
 * precision well below that. We parse via `decimal.js`, format the
 * integer part via `Intl.NumberFormat` over a `BigInt` (precision-
 * preserving), and reassemble with the locale's currency symbol via
 * `formatToParts`.
 *
 * @module client/lib/format/lp-reporting/decimal
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import Decimal from '@shared/lib/decimal-config';

const PLACEHOLDER = '--';

/**
 * Pull the locale-correct currency symbol, group separator, and
 * decimal separator out of `Intl.NumberFormat` without ever passing
 * a `number` through it. We format `0` as a probe and read the parts.
 */
interface CurrencyFormatChrome {
  symbol: string;
  symbolBefore: boolean;
  groupSeparator: string;
  decimalSeparator: string;
  literalAfterSymbol: string;
}

function readCurrencyChrome(currency: string): CurrencyFormatChrome {
  const probe = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // BigInt input keeps full precision; format `0n` to inspect chrome.
  const parts = probe.formatToParts(0n);

  let symbol = '';
  let symbolBefore = false;
  let decimalSeparator = '.';
  let groupSeparator = ',';
  let literalAfterSymbol = '';
  let seenInteger = false;
  let seenSymbol = false;

  for (const part of parts) {
    if (part.type === 'currency') {
      symbol = part.value;
      seenSymbol = true;
      if (!seenInteger) {
        symbolBefore = true;
      }
    } else if (part.type === 'integer') {
      seenInteger = true;
    } else if (part.type === 'decimal') {
      decimalSeparator = part.value;
    } else if (part.type === 'group') {
      groupSeparator = part.value;
    } else if (part.type === 'literal' && seenSymbol && !seenInteger) {
      literalAfterSymbol = part.value;
    }
  }

  return { symbol, symbolBefore, groupSeparator, decimalSeparator, literalAfterSymbol };
}

/**
 * Apply locale grouping to a non-negative integer string using the
 * provided separator. We avoid `Number(value)` by walking the string
 * from right to left.
 */
function groupIntegerString(integerPart: string, separator: string): string {
  if (integerPart.length <= 3) {
    return integerPart;
  }

  const out: string[] = [];
  let i = integerPart.length;
  while (i > 3) {
    out.unshift(integerPart.slice(i - 3, i));
    i -= 3;
  }
  out.unshift(integerPart.slice(0, i));
  return out.join(separator);
}

/**
 * Format a decimal-string money amount for display.
 *
 * Parses the input with `decimal.js` (string-only) and renders the
 * integer + fraction halves separately so amounts beyond
 * `Number.MAX_SAFE_INTEGER` keep full precision. Returns the
 * LP-friendly placeholder for `null`.
 */
export function formatDecimalCurrency(value: string | null, currency: string = 'USD'): string {
  if (value === null) {
    return PLACEHOLDER;
  }

  const decimal = new Decimal(value);
  const fixed = decimal.toFixed(2); // string, e.g. "-9007199254740993.00"

  const negative = fixed.startsWith('-');
  const absolute = negative ? fixed.slice(1) : fixed;
  const dotIndex = absolute.indexOf('.');
  const integerPart = dotIndex === -1 ? absolute : absolute.slice(0, dotIndex);
  const fractionPart = dotIndex === -1 ? '00' : absolute.slice(dotIndex + 1);

  const chrome = readCurrencyChrome(currency);
  const groupedInteger = groupIntegerString(integerPart, chrome.groupSeparator);
  const amountBody = `${groupedInteger}${chrome.decimalSeparator}${fractionPart}`;
  const amountWithSymbol = chrome.symbolBefore
    ? `${chrome.symbol}${chrome.literalAfterSymbol}${amountBody}`
    : `${amountBody}${chrome.literalAfterSymbol}${chrome.symbol}`;

  return negative ? `-${amountWithSymbol}` : amountWithSymbol;
}

/**
 * Format a decimal-string ratio (TVPI, MOIC, DPI, RVPI) for display.
 *
 * Returns e.g. `"1.25x"`. Returns the placeholder for `null`.
 */
export function formatDecimalRatio(value: string | null, precision: number = 2): string {
  if (value === null) {
    return PLACEHOLDER;
  }

  const decimal = new Decimal(value);
  return `${decimal.toFixed(precision)}x`;
}

/**
 * Format a decimal-string IRR (already a ratio, e.g. `"0.15"` for
 * 15%) as a percentage display string.
 *
 * Returns e.g. `"15.00%"`. Returns the placeholder for `null`.
 */
export function formatIrr(value: string | null): string {
  if (value === null) {
    return PLACEHOLDER;
  }

  const decimal = new Decimal(value).times(100);
  return `${decimal.toFixed(2)}%`;
}
