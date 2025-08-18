// Attach stratifiers (tier, ring) to spans/metrics
import { trace } from '@opentelemetry/api';
export type UserTier = 'internal'|'beta'|'free'|'pro'|'enterprise';
export function withStratifiers(attrs: Record<string,string>) {
  const span = trace.getActiveSpan();
  if (span) for (const [k,v] of Object.entries(attrs)) span.setAttribute(k, v);
}
export function tagRequestForCanary(req:any) {
  const tier:UserTier = (req.headers['x-user-tier'] as any) || 'free';
  const ring = (req.headers['x-deploy-ring'] as any) || 'control';
  withStratifiers({ 'user.tier': tier, 'deploy.ring': ring });
}
