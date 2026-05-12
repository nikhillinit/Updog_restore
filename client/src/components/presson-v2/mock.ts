/**
 * Mock fixtures for the Press On v2 reference screens.
 * Static — replace with real selectors when wiring to the data layer.
 */

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

export type Scenario = {
  id: string;
  name: string;
  active?: boolean;
  moic: string;
  tvpi: string;
  irr: string;
};

export const scenarios: Scenario[] = [
  {
    id: 'target-1b',
    name: 'Target $1B fund',
    active: true,
    moic: '3.71×',
    tvpi: '3.34×',
    irr: '22.4%',
  },
  { id: 'aggressive', name: 'Aggressive reserves', moic: '4.12×', tvpi: '3.71×', irr: '26.1%' },
  { id: 'bear-2027', name: 'Bear · 2027 hold', moic: '2.04×', tvpi: '1.88×', irr: '11.6%' },
];

export const sliders = [
  { label: 'Fund size', min: 50, max: 250, value: 150, unit: 'M', prefix: '$' },
  { label: 'Initial check', min: 0.5, max: 1.5, step: 0.1, value: 1.0, unit: 'M', prefix: '$' },
  { label: 'Follow-on reserve', min: 30, max: 80, value: 67, unit: '%' },
  { label: 'Management fee', min: 1.5, max: 2.5, step: 0.1, value: 2.0, unit: '%' },
  { label: 'Series A graduation', min: 30, max: 70, value: 50, unit: '%' },
  { label: 'Series B graduation', min: 30, max: 70, value: 50, unit: '%' },
  { label: 'Series C graduation', min: 30, max: 70, value: 48, unit: '%' },
  { label: 'Target LP return', min: 1.5, max: 5, step: 0.1, value: 3.1, unit: '×' },
];

export type ExitCase = {
  name: string;
  down: { moic: string; val: string };
  base: { moic: string; val: string };
  up: { moic: string; val: string };
};

export const exitCases: ExitCase[] = [
  {
    name: 'AlphaTech',
    down: { moic: '0.22×', val: '$540K' },
    base: { moic: '5.23×', val: '$12.71M' },
    up: { moic: '8.23×', val: '$20.00M' },
  },
  {
    name: 'Amplio',
    down: { moic: '0.00×', val: '$0' },
    base: { moic: '11.82×', val: '$44.60M' },
    up: { moic: '23.53×', val: '$88.81M' },
  },
  {
    name: 'DigitalWave',
    down: { moic: '0.50×', val: '$0.97M' },
    base: { moic: '5.02×', val: '$9.70M' },
    up: { moic: '12.40×', val: '$23.94M' },
  },
  {
    name: 'Imprint',
    down: { moic: '0.40×', val: '$0.60M' },
    base: { moic: '3.20×', val: '$4.81M' },
    up: { moic: '7.10×', val: '$10.62M' },
  },
  {
    name: 'Metaflux',
    down: { moic: '0.50×', val: '$1.37M' },
    base: { moic: '1.80×', val: '$4.93M' },
    up: { moic: '4.20×', val: '$11.50M' },
  },
  {
    name: 'Modulate',
    down: { moic: '1.20×', val: '$1.20M' },
    base: { moic: '3.90×', val: '$3.90M' },
    up: { moic: '8.40×', val: '$8.40M' },
  },
];

export type LP = {
  id: string;
  name: string;
  type: string;
  funds: string;
  committed: string;
  called: string;
  distributed: string;
  lastCall: string;
  missing?: boolean;
  health: number;
};

export const lps: LP[] = [
  {
    id: 'accetta',
    name: 'Accetta Mgmt Co.',
    type: 'Institution',
    funds: 'I · II · IV',
    committed: '$1.67M',
    called: '48%',
    distributed: '$0.41M',
    lastCall: "Feb '25",
    health: 60,
  },
  {
    id: 'abc',
    name: 'ABC Foundation',
    type: 'Foundation',
    funds: 'I',
    committed: '$0.10M',
    called: '62%',
    distributed: '$0.02M',
    lastCall: 'MISSING INFO',
    missing: true,
    health: 46,
  },
  {
    id: 'allison',
    name: 'Allison Heath',
    type: 'HNW',
    funds: 'Meetly SPV',
    committed: '$0.11M',
    called: '100%',
    distributed: '$0.04M',
    lastCall: "Mar '24",
    health: 74,
  },
  {
    id: 'amy',
    name: 'Amy Neal',
    type: 'HNW',
    funds: 'Meetly SPV',
    committed: '$0.13M',
    called: '100%',
    distributed: '$0.05M',
    lastCall: "Mar '24",
    health: 78,
  },
  {
    id: 'andrew',
    name: 'Andrew Gates',
    type: 'HNW',
    funds: 'II · IV',
    committed: '$2.30M',
    called: '44%',
    distributed: '$0.62M',
    lastCall: "Feb '25",
    health: 58,
  },
  {
    id: 'bart',
    name: 'Bartholomew Pension',
    type: 'Institution',
    funds: 'II · III · IV',
    committed: '$25.00M',
    called: '52%',
    distributed: '$8.4M',
    lastCall: "Feb '25",
    health: 80,
  },
  {
    id: 'cedar',
    name: 'Cedar Endowment',
    type: 'Endowment',
    funds: 'I · II · III · IV',
    committed: '$40.00M',
    called: '54%',
    distributed: '$12.1M',
    lastCall: "Feb '25",
    health: 88,
  },
  {
    id: 'dorset',
    name: 'Dorset Family Office',
    type: 'Family',
    funds: 'I · III',
    committed: '$8.50M',
    called: '58%',
    distributed: '$3.4M',
    lastCall: "Jan '25",
    health: 72,
  },
  {
    id: 'evergreen',
    name: 'Evergreen Trust',
    type: 'Trust',
    funds: 'II · IV',
    committed: '$5.00M',
    called: '48%',
    distributed: '$1.6M',
    lastCall: "Feb '25",
    health: 64,
  },
];

export const insights = [
  {
    n: '01',
    text: 'Reserves are <em>concentrating</em>: 70% of remaining reserves earmarked for 4 companies.',
    meta: 'Amplio · Imprint · Modulate · DigitalWave',
  },
  {
    n: '02',
    text: 'B2B SaaS is <em>over-indexed</em> to plan by 1.4× — Agriculture under by 0.7×.',
    meta: 'Construction plan vs. current pacing',
  },
  {
    n: '03',
    text: 'Median holding period is <em>14 months</em> — 22% ahead of vintage benchmark.',
    meta: 'Cambridge Associates 2021 vintage',
  },
];

export const cashCalls = [
  {
    fund: 'Fund IV',
    n: '#07',
    lps: 24,
    amount: '$7,062,500.00',
    due: 'MAY 18',
    status: 'missing' as const,
    note: '1 LP · ABC Foundation',
  },
  {
    fund: 'Fund I',
    n: '#12',
    lps: 11,
    amount: '$1,691,510.00',
    due: 'FEB 28',
    status: 'ready' as const,
    note: '',
  },
  {
    fund: 'Fund II',
    n: '#14 (draft)',
    lps: 19,
    amount: '$2,300,000 EST',
    due: 'NOT SENT',
    status: 'draft' as const,
    note: '',
  },
];

export const cashBreakdown = [
  { cat: 'New investments', prob: '$3.83M', max: '$3.93M', bar: 48, tone: 'ink' as const },
  { cat: 'Follow-ons', prob: '$0.57M', max: '$1.64M', bar: 78, tone: 'warm' as const },
  { cat: 'Management fees', prob: '$0.74M', max: '$0.74M', bar: 4, tone: 'tint' as const },
  { cat: 'Expenses', prob: '$0.78M', max: '$0.78M', bar: 4, tone: 'tint' as const },
];

export const kpiSparklines: Record<
  string,
  { v: string; spark: string; deltaTone: 'pos' | 'neg' | 'mute'; delta: string }
> = {
  ARR: {
    v: '$2.37M',
    spark: 'M0,28 L25,26 L50,20 L75,22 L100,12 L125,18 L150,8 L175,16 L200,22',
    deltaTone: 'neg',
    delta: '−9% QOQ',
  },
  CASH: {
    v: '$3.02M',
    spark: 'M0,4 L25,8 L50,12 L75,16 L100,18 L125,22 L150,26 L175,28 L200,30',
    deltaTone: 'mute',
    delta: '9 MO RUNWAY',
  },
  BURN: {
    v: '$340K',
    spark: 'M0,20 L25,18 L50,16 L75,18 L100,14 L125,16 L150,12 L175,14 L200,10',
    deltaTone: 'mute',
    delta: '▲ 14% QOQ',
  },
  NRR: {
    v: '108%',
    spark: 'M0,16 L25,14 L50,18 L75,14 L100,12 L125,10 L150,12 L175,8 L200,10',
    deltaTone: 'pos',
    delta: '▲ +3pts',
  },
  HEADCOUNT: {
    v: '38',
    spark: 'M0,30 L25,28 L50,24 L75,22 L100,18 L125,16 L150,14 L175,12 L200,10',
    deltaTone: 'mute',
    delta: '+6 SINCE Q3',
  },
  'CAC PAYBACK': {
    v: '14mo',
    spark: 'M0,18 L25,16 L50,20 L75,22 L100,18 L125,14 L150,16 L175,14 L200,12',
    deltaTone: 'pos',
    delta: '▼ from 18mo',
  },
  'GROSS MARGIN': {
    v: '73%',
    spark: 'M0,14 L25,12 L50,14 L75,10 L100,12 L125,10 L150,8 L175,10 L200,8',
    deltaTone: 'pos',
    delta: '▲ +2pts',
  },
  'RULE OF 40': {
    v: '31',
    spark: 'M0,18 L25,16 L50,18 L75,12 L100,18 L125,22 L150,18 L175,22 L200,20',
    deltaTone: 'neg',
    delta: '▼ from 36',
  },
};
