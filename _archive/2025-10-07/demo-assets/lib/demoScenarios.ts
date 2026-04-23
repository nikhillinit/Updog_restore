export const DEMO_SCENARIOS = [
  {
    id: 'demo-baseline',
    name: '📊 Baseline (Conservative)',
    params_json: { policy: 'baseline', followOn: 'standard' },
    result_summary_json: { TVPI: '2.10×', DPI: '1.30×', NAV: '$35.0M', IRR: '15.0%' },
    created_by: 'demo-user', created_at: new Date(Date.now() - 86400000).toISOString(),
    org_id: 'demo-org', fund_id: 'demo-fund-2025',
  },
  {
    id: 'demo-aggressive',
    name: '🚀 Aggressive Follow-On',
    params_json: { policy: 'aggressive', followOn: 'max' },
    result_summary_json: { TVPI: '2.80×', DPI: '1.50×', NAV: '$42.3M', IRR: '22.0%' },
    created_by: 'demo-user', created_at: new Date().toISOString(),
    org_id: 'demo-org', fund_id: 'demo-fund-2025',
  },
  {
    id: 'demo-downside',
    name: '⚠️ Downside Case',
    params_json: { policy: 'downside', followOn: 'reduced' },
    result_summary_json: { TVPI: '1.40×', DPI: '0.90×', NAV: '$22.0M', IRR: '8.0%' },
    created_by: 'demo-user', created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    org_id: 'demo-org', fund_id: 'demo-fund-2025',
  },
];
