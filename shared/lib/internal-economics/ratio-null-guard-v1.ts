import { Decimal } from '../decimal-config';

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
    dpi: dpiD.toFixed(6),
    rvpi: rvpiD.toFixed(6),
    tvpi: tvpiD.toFixed(6),
    moic: moicD.toFixed(6),
    warning: null,
  };
}
