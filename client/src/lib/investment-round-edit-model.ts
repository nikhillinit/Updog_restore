import type {
  InvestmentRoundCreate,
  SecurityType,
} from '@shared/contracts/investments/investment-round.contract';

type SecurityTypeLabel = 'Equity' | 'Convertible Note' | 'SAFE' | 'Warrant' | 'Other';

export interface InvestmentRoundEditForm {
  roundName: string;
  securityType: SecurityType | SecurityTypeLabel;
  /** Date portion only, 'YYYY-MM-DD'. */
  roundDate: string;
  currency: string;
  investmentAmount: number;
  roundSize?: number | null;
  preMoneyValuation?: number | null;
  supersedesRoundId?: number | null;
}

const CURRENCY_LABEL_TO_ISO: Record<string, string> = {
  'United States Dollar ($)': 'USD',
  'Canadian Dollar (CAD)': 'CAD',
};

const SECURITY_TYPE_TO_WIRE: Record<string, SecurityType> = {
  equity: 'equity',
  Equity: 'equity',
  convertible_note: 'convertible_note',
  'Convertible Note': 'convertible_note',
  safe: 'safe',
  SAFE: 'safe',
  warrant: 'warrant',
  Warrant: 'warrant',
  other: 'other',
  Other: 'other',
};

const DECIMAL_STRING_RE = /^-?\d+(\.\d{1,6})?$/;
const ISO_CURRENCY_RE = /^[A-Z]{3}$/;

function toIsoCurrency(currency: string): string {
  const normalized = currency.trim();
  if (ISO_CURRENCY_RE.test(normalized)) {
    return normalized;
  }

  const parenthesizedCode = normalized.match(/\(([A-Z]{3})\)$/)?.[1];
  if (parenthesizedCode) {
    return parenthesizedCode;
  }

  if (normalized.startsWith('Euro')) {
    return 'EUR';
  }

  if (normalized.startsWith('British Pound')) {
    return 'GBP';
  }

  const mapped = CURRENCY_LABEL_TO_ISO[normalized];
  if (mapped) {
    return mapped;
  }

  throw new Error(`Unsupported investment round currency: ${currency}`);
}

function toSecurityType(securityType: InvestmentRoundEditForm['securityType']): SecurityType {
  const mapped = SECURITY_TYPE_TO_WIRE[securityType];
  if (mapped) {
    return mapped;
  }

  throw new Error(`Unsupported investment round security type: ${securityType}`);
}

function toDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('Investment round money values must be finite numbers');
  }

  const normalized = value.toFixed(6).replace(/\.?0+$/, '');
  const decimalString = normalized === '-0' ? '0' : normalized;

  if (!DECIMAL_STRING_RE.test(decimalString)) {
    throw new Error(`Investment round money value is not a decimal string: ${value}`);
  }

  return decimalString;
}

export function toInvestmentRoundCreatePayload(
  form: InvestmentRoundEditForm,
  fundId: number
): InvestmentRoundCreate {
  const payload: InvestmentRoundCreate = {
    fundId,
    roundName: form.roundName,
    securityType: toSecurityType(form.securityType),
    roundDate: form.roundDate,
    currency: toIsoCurrency(form.currency),
    investmentAmount: toDecimalString(form.investmentAmount),
  };

  if (form.roundSize != null) {
    payload.roundSize = toDecimalString(form.roundSize);
  }
  if (form.preMoneyValuation != null) {
    payload.preMoneyValuation = toDecimalString(form.preMoneyValuation);
  }
  if (form.supersedesRoundId != null) {
    payload.supersedesRoundId = form.supersedesRoundId;
  }

  return payload;
}
