// scripts/canary.js — Statistical canary gate (simplified)
function zTest(p1, n1, p2, n2) {
  const p = (p1*n1 + p2*n2) / (n1 + n2);
  const z = (p1 - p2) / Math.sqrt(p*(1-p)*(1/n1 + 1/n2));
  // two-tailed p-value approximate
  const pval = 2 * (1 - 0.5*(1 + erf(Math.abs(z)/Math.SQRT2)));
  return { z, p: pval };
}
function erf(x){ // Abramowitz and Stegun approximation
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t=1/(1+p*x);
  const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}
// Placeholder: fetch baseline/canary metrics then compute p-value
console.log('Canary gate scaffold ready.');
process.exit(0);
