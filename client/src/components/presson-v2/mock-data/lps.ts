/** Limited partners (LP register). */

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
