import React from 'react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: string; type: ToastType; message: string; at: number; ttl: number };

const MAX_TOASTS = 3;
const DEFAULT_TTL = 3000;
const bus = new EventTarget();

export function pushToast(message: string, type: ToastType = 'info', ttl = DEFAULT_TTL) {
  bus.dispatchEvent(new CustomEvent('toast:add', { detail: { message, type, ttl } }));
}
export const toastSuccess = (m: string) => pushToast(m, 'success');
export const toastError = (m: string) => pushToast(m, 'error');
export const toastInfo = (m: string) => pushToast(m, 'info');

export function ToastViewport() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    function onAdd(e: Event) {
      const { message, type, ttl } = (e as CustomEvent).detail as { message: string; type: ToastType; ttl: number };
      const t: Toast = { id: Math.random().toString(36).slice(2), type, message, at: Date.now(), ttl };
      setToasts((prev) => {
        const next = [...prev, t];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ttl);
    }
    bus.addEventListener('toast:add', onAdd as any);
    return () => bus.removeEventListener('toast:add', onAdd as any);
  }, []);

  if (!toasts.length) return null;
  return (
    <div aria-live="polite" aria-atomic="true" role="status"
         style={{ position:'fixed', right:16, top:16, display:'flex', flexDirection:'column', gap:8, zIndex:9999 }}>
      {toasts.map((t) => (
        <div key={t.id}
             style={{
               minWidth:260, maxWidth:420, padding:'10px 12px', borderRadius:8,
               color:'#111', background: t.type==='error' ? '#fecaca' : t.type==='success' ? '#bbf7d0' : '#e5e7eb',
               border:'1px solid rgba(0,0,0,.08)', boxShadow:'0 8px 20px rgba(0,0,0,.08)'
             }}>
          <strong style={{marginRight:6}}>
            {t.type === 'error' ? 'Error' : t.type === 'success' ? 'Saved' : 'Notice'}:
          </strong>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
