/** Companies, sectors, decisions, watch list. */

export type Company = {
  id: string;
  name: string;
  stage: 'S' | 'A' | 'B' | 'C';
  sector: string;
  cost: string;
  fmv: string;
  moic: string;
  irr: string;
  irrNeg?: boolean;
  bar: number;
  barNeg?: boolean;
  lastMark: string;
  markNeg?: boolean;
  highlight?: boolean;
  ownership?: string;
  arr?: string;
  arrDeltaQoq?: string;
  arrDeltaNeg?: boolean;
};

export const fund = {
  name: 'Krakatoa Ventures',
  fundName: 'Fund II',
  vintage: '2021',
};

export const decisions = [
  {
    title: 'Authorize Bridge Round — Amplio',
    due: 'DUE FRI',
    urgent: true,
    sub: '$1.2M follow-on · pulls reserves to 51.4%',
  },
  {
    title: 'Sign LP capital call — $7.06M',
    due: 'DUE FRI',
    urgent: true,
    sub: 'Fund IV · 24 LPs · missing info on 1',
  },
  {
    title: "Approve Q3'25 valuation marks",
    due: 'MAY 19',
    urgent: false,
    sub: '38 of 57 companies · 6 flagged for review',
  },
  {
    title: 'Review SOI for Q3 2022',
    due: 'MAY 23',
    urgent: false,
    sub: '2 entities · with Katie S.',
  },
];

export const watchList = [
  {
    name: 'Amplio',
    sector: 'Agriculture',
    stage: 'Series C',
    fmv: '$18.1M',
    moic: '2.41×',
    arr: '$3.77M',
    arrDelta: '−14%',
    arrNeg: true,
    runway: 4,
    runwayNeg: true,
    trigger: 'RUNWAY',
    note: 'Bridge term sheet circulated',
  },
  {
    name: 'DigitalWave',
    sector: 'B2B SaaS',
    stage: 'Series B',
    fmv: '$9.7M',
    moic: '1.88×',
    arr: '$2.37M',
    arrDelta: '−9%',
    arrNeg: true,
    runway: 9,
    runwayNeg: false,
    trigger: 'ARR',
    note: 'CEO requested 30m call',
  },
  {
    name: 'CatalystLabs',
    sector: 'BioTech',
    stage: 'Series A',
    fmv: '$1.3M',
    moic: '0.42×',
    arr: '$6.64M',
    arrDelta: '+22%',
    arrNeg: false,
    runway: 14,
    runwayNeg: false,
    trigger: 'MARK ↓',
    note: 'Down-round priced at 0.4× last',
  },
  {
    name: 'Modulate',
    sector: 'Agriculture',
    stage: 'Seed',
    fmv: '$3.9M',
    moic: '1.95×',
    arr: '$2.00M',
    arrDelta: '+8%',
    arrNeg: false,
    runway: 12,
    runwayNeg: false,
    trigger: 'KPI',
    note: 'Hit Q2 plan early',
  },
];

export const companies: Company[] = [
  {
    id: 'alphatech',
    name: 'AlphaTech',
    stage: 'B',
    sector: 'B2B SaaS',
    cost: '$2.43M',
    fmv: '$6.17M',
    moic: '2.54×',
    irr: '26.6%',
    bar: 54,
    lastMark: 'Apr 24',
    ownership: '4.2%',
    arr: '$1.92M',
    arrDeltaQoq: '+18%',
  },
  {
    id: 'imprint',
    name: 'Imprint',
    stage: 'A',
    sector: 'B2B SaaS',
    cost: '$1.50M',
    fmv: '$3.55M',
    moic: '2.36×',
    irr: '21.0%',
    bar: 42,
    lastMark: 'May 24',
    ownership: '3.8%',
  },
  {
    id: 'digitalwave',
    name: 'DigitalWave',
    stage: 'B',
    sector: 'B2B SaaS',
    cost: '$1.93M',
    fmv: '$9.70M',
    moic: '5.02×',
    irr: '38.1%',
    bar: 78,
    lastMark: 'MAY 24 · WATCH',
    highlight: true,
    ownership: '5.0%',
    arr: '$2.37M',
    arrDeltaQoq: '−9%',
    arrDeltaNeg: true,
  },
  {
    id: 'metaflux',
    name: 'Metaflux',
    stage: 'B',
    sector: 'Cloud',
    cost: '$2.74M',
    fmv: '$3.55M',
    moic: '1.30×',
    irr: '6.1%',
    bar: 24,
    lastMark: 'May 24',
    ownership: '6.1%',
  },
  {
    id: 'amplio',
    name: 'Amplio',
    stage: 'C',
    sector: 'Agriculture',
    cost: '$3.77M',
    fmv: '$18.14M',
    moic: '4.81×',
    irr: '31.4%',
    bar: 88,
    lastMark: 'Mar 24',
    ownership: '7.2%',
  },
  {
    id: 'modulate',
    name: 'Modulate',
    stage: 'S',
    sector: 'Agriculture',
    cost: '$1.00M',
    fmv: '$3.86M',
    moic: '3.86×',
    irr: '28.2%',
    bar: 68,
    lastMark: 'May 24',
    ownership: '8.4%',
  },
  {
    id: 'neuromax',
    name: 'Neuromax',
    stage: 'B',
    sector: 'Agriculture',
    cost: '$4.42M',
    fmv: '$3.32M',
    moic: '0.75×',
    irr: '−5.2%',
    irrNeg: true,
    bar: 34,
    barNeg: true,
    lastMark: 'MAY 24 · MARK ↓',
    markNeg: true,
    ownership: '5.9%',
  },
  {
    id: 'betahex',
    name: 'BetaHex',
    stage: 'A',
    sector: 'Fintech',
    cost: '$2.18M',
    fmv: '$1.95M',
    moic: '0.89×',
    irr: '−2.3%',
    irrNeg: true,
    bar: 18,
    barNeg: true,
    lastMark: 'May 24',
    ownership: '4.0%',
  },
];

export const sectorGroups = [
  {
    name: 'B2B SaaS',
    count: 12,
    cost: '$11.8M',
    fmv: '$34.4M',
    moic: '2.92×',
    ids: ['alphatech', 'imprint', 'digitalwave', 'metaflux'],
  },
  {
    name: 'Agriculture',
    count: 8,
    cost: '$9.2M',
    fmv: '$28.5M',
    moic: '3.10×',
    ids: ['amplio', 'modulate', 'neuromax'],
  },
  {
    name: 'Fintech',
    count: 6,
    cost: '$4.1M',
    fmv: '$5.8M',
    moic: '1.41×',
    ids: ['betahex'],
  },
];
