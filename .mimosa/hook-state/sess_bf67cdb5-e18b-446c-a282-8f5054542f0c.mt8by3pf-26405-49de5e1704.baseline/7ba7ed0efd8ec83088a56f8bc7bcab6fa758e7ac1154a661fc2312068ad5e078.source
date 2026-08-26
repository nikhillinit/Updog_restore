/** Operating data: insights, cash calls, breakdown, KPI sparklines. */

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
