import { getDemoPersona } from './persona';

export function withDemoHeaders(init?: RequestInit): RequestInit {
  const persona = getDemoPersona();
  if (!persona) return init ?? {};
  const demoHeader = JSON.stringify({
    id: `demo-${persona.toLowerCase()}`, role: persona, orgId: 'demo-org', email: `${persona.toLowerCase()}@demo.example.com`
  });
  const headers = new Headers(init?.headers as any);
  headers.set('x-demo-user', demoHeader);
  return { ...(init ?? {}), headers };
}
