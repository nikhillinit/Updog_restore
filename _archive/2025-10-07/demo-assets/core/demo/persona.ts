export type Persona = 'GP' | 'LP' | 'Admin';
export function setDemoPersona(role: Persona) { if (typeof window !== 'undefined') localStorage.setItem('DEMO_PERSONA', role); }
export function getDemoPersona(): Persona | null {
  if (typeof window === 'undefined') return null;
  const r = localStorage.getItem('DEMO_PERSONA') as Persona | null;
  return (r === 'GP' || r === 'LP' || r === 'Admin') ? r : null;
}
export function resetDemo() {
  if (typeof window === 'undefined') return;
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('FF_') || k === 'DEMO_PERSONA' || k === 'DEMO_TOOLBAR') localStorage.removeItem(k);
  });
  location.reload();
}
export function isDemoMode(): boolean {
  if (import.meta.env.PROD) return false;
  if (typeof window === 'undefined') return false;
  const qs = new URLSearchParams(window.location.search);
  return qs.has('demo') || localStorage.getItem('DEMO_TOOLBAR') === '1';
}
