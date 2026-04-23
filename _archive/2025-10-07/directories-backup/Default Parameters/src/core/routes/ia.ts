
export type NavRoute = { path: string; label: string; icon?: string };
export const NEW_ROUTES: NavRoute[] = [
  { path: '/overview', label: 'Overview' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/model', label: 'Model' },
  { path: '/operate', label: 'Operate' },
  { path: '/report', label: 'Report' },
];
export const OLD_TO_NEW_REDIRECTS: Record<string, string> = {
  '/investments': '/portfolio',
  '/investment-table': '/portfolio',
  '/portfolio/companies': '/portfolio',
  '/cap-tables': '/portfolio',
  '/financial-modeling': '/model',
  '/forecasting': '/model',
  '/cash-management': '/operate',
};
