/* Example MSW handler to unblock development without a backend */
import { rest } from 'msw';

export const handlers = [
  rest.get('/api/funds/:fundId/kpis', (req, res, ctx) => {
    const fundId = req.params.fundId;
    return res(
      ctx.status(200),
      ctx.json({
        fundId,
        committed: 100000000,
        capitalCalls: [{ date: '2025-01-01', amount: 35000000 }],
        distributions: [{ date: '2025-06-01', amount: 5000000 }],
        navSeries: [{ date: '2025-10-02', value: 40000000 }],
        investments: [{ id: 'I1', companyName: 'DemoCo', initialAmount: 10000000, followOns: [22000000], nav: 35000000 }],
        asOf: '2025-10-02'
      })
    );
  }),
];
