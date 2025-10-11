
import type { FundRawData, FundKpis, Investment } from '@core/types';
export const sum = (arr: number[]) => arr.reduce((a,b)=>a+b,0);
export function calcCalled(cs:{amount:number}[]){return sum(cs.map(c=>c.amount));}
export function calcDistributions(ds:{amount:number}[]){return sum(ds.map(d=>d.amount));}
export function calcLatestNav(ns:{value:number;date:string}[]){return ns.length?ns[ns.length-1].value:0;}
export function calcInvested(inv:Investment[]){return sum(inv.map(i=>i.initialAmount))+sum(inv.flatMap(i=>i.followOns??[]));}
export function calculateDPI(dist:number, called:number){return called>0?dist/called:0;}
export function calculateTVPI(dist:number, nav:number, called:number){return called>0?(dist+nav)/called:0;}
export function calculateIRR(cashflows:number[], guess=0.15):number|null{
  const hasPos=cashflows.some(c=>c>0), hasNeg=cashflows.some(c=>c<0);
  if(!hasPos||!hasNeg) return null;
  let r=guess; const maxIter=50, eps=1e-6;
  const npv=(rate:number)=>cashflows.reduce((acc,cf,t)=>acc+cf/Math.pow(1+rate,t),0);
  const dnpv=(rate:number)=>cashflows.reduce((acc,cf,t)=>t===0?acc:acc-(t*cf)/Math.pow(1+rate,t+1),0);
  for(let i=0;i<maxIter;i++){ const f=npv(r), df=dnpv(r); if(Math.abs(df)<1e-10) break; const nr=r - f/df; if(!isFinite(nr)||nr<=-0.9999) break; if(Math.abs(nr-r)<eps) return nr; r=nr; }
  return null;
}
export function selectFundKpis(data: FundRawData): FundKpis {
  const called=calcCalled(data.capitalCalls);
  const dist=calcDistributions(data.distributions);
  const nav=calcLatestNav(data.navSeries);
  const invested=calcInvested(data.investments);
  const dpi=calculateDPI(dist, called);
  const tvpi=calculateTVPI(dist, nav, called);
  const flows:number[]=[]; data.capitalCalls.forEach(c=>flows.push(-c.amount)); data.distributions.forEach(d=>flows.push(d.amount)); flows.push(nav);
  const irr=calculateIRR(flows);
  return { committed:data.committed, called, uncalled:Math.max(0,data.committed-called), invested, nav, dpi:Number(dpi.toFixed(2)), tvpi:Number(tvpi.toFixed(2)), irr:irr!==null?Number((irr*100).toFixed(2)):null, asOf:data.asOf??new Date().toISOString().slice(0,10) };
}
