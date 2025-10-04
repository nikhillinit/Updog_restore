
import { describe, it, expect } from 'vitest';
import { calculateTVPI, calculateDPI, calculateIRR, selectFundKpis } from '../fundKpis';
describe('fundKpis selectors', ()=>{
  it('calculates TVPI correctly', ()=>{ expect(calculateTVPI(10_000_000, 40_000_000, 35_000_000)).toBeCloseTo(1.42857,5); });
  it('calculates DPI correctly', ()=>{ expect(calculateDPI(5_000_000, 35_000_000)).toBeCloseTo(0.142857,5); });
  it('returns null IRR for one-sided cashflows', ()=>{ expect(calculateIRR([-100,-50,-25])).toBeNull(); expect(calculateIRR([100,50,25])).toBeNull(); });
  it('estimates IRR for a simple project', ()=>{ const irr=calculateIRR([-100,30,40,50]); expect(irr).greaterThan(0.12); expect(irr).lessThan(0.13); });
  it('aggregates fund KPIs', ()=>{ const data:any={ fundId:'F1', committed:100_000_000, capitalCalls:[{date:'2025-01-01',amount:10_000_000},{date:'2025-02-01',amount:5_000_000}], distributions:[{date:'2025-03-01',amount:1_000_000}], navSeries:[{date:'2025-01-31',value:5_000_000},{date:'2025-03-31',value:16_000_000}], investments:[{id:'I1',companyName:'Acme',initialAmount:3_000_000,followOns:[1_000_000],nav:4_500_000}], asOf:'2025-10-02'}; const k=selectFundKpis(data); expect(k.called).toBe(15_000_000); expect(k.uncalled).toBe(85_000_000); expect(k.nav).toBe(16_000_000); });
});
