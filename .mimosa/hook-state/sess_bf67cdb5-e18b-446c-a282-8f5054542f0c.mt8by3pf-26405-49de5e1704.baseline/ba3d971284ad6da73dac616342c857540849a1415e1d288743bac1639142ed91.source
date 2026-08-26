/** Scenarios + sliders + exit cases. */

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
