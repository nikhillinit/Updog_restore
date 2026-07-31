import { Decimal } from '../decimal-config';
import { toFixedDecimalString } from '../decimal-string';

/** Ratios use the canonical RatioDecimalStringSchema scale (12 dp). */
const RATIO_SCALE = 12;

export interface GuardedRatios {
  dpi: string | null;
  rvpi: string | null;
  tvpi: string | null;
  moic: string | null;
  warning: {
    code: 'ZERO_CONTRIBUTIONS';
    message: string;
  } | null;
}

export function calculateGuardedRatios(
  distributions: Decimal | string | number,
  currentNav: Decimal | string | number,
  contributions: Decimal | string | number
): GuardedRatios {
  const d = new Decimal(distributions);
  const n = new Decimal(currentNav);
  const c = new Decimal(contributions);

  // DPI/RVPI/TVPI are null before positive LP paid-in — never fabricated zero
  if (c.lte(0)) {
    return {
      dpi: null,
      rvpi: null,
      tvpi: null,
      moic: null,
      warning: {
        code: 'ZERO_CONTRIBUTIONS',
        message:
          'Net contributions are zero or negative; DPI / RVPI / TVPI / MOIC are undefined for this run.',
      },
    };
  }

  const dpiD = d.dividedBy(c);
  const rvpiD = n.dividedBy(c);
  const tvpiD = dpiD.plus(rvpiD);
  const moicD = d.plus(n).dividedBy(c);

  return {
    dpi: toFixedDecimalString(dpiD, RATIO_SCALE),
    rvpi: toFixedDecimalString(rvpiD, RATIO_SCALE),
    tvpi: toFixedDecimalString(tvpiD, RATIO_SCALE),
    moic: toFixedDecimalString(moicD, RATIO_SCALE),
    warning: null,
  };
}
