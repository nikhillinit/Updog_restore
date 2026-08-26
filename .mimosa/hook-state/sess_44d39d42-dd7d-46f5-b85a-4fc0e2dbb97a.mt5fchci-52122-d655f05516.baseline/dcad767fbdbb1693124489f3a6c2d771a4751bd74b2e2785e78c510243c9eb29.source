import React from 'react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: string; type: ToastType; message: string; at: number; ttl: number };
type ToastAddDetail = Pick<Toast, 'message' | 'type' | 'ttl'>;

const TOAST_COLOR_CLASSES: Record<ToastType, string> = {
  success: 'bg-success/10 text-success-dark border-success/50',
  error: 'bg-error/10 text-error-dark border-error/50',
  info: 'bg-presson-info/10 text-presson-info border-presson-info/30',
};

const MAX_TOASTS = 3;
const DEFAULT_TTL = 3000;
const bus = new EventTarget();

export function pushToast(message: string, type: ToastType = 'info', ttl = DEFAULT_TTL) {
  bus.dispatchEvent(
    new CustomEvent<ToastAddDetail>('toast:add', { detail: { message, type, ttl } })
  );
}
export const toastSuccess = (m: string) => pushToast(m, 'success');
export const toastError = (m: string) => pushToast(m, 'error');
export const toastInfo = (m: string) => pushToast(m, 'info');

export function ToastViewport() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    function onAdd(e: Event) {
      const { message, type, ttl } = (e as CustomEvent<ToastAddDetail>).detail;
      const t: Toast = {
        id: Math.random().toString(36).slice(2),
        type,
        message,
        at: Date.now(),
        ttl,
      };
      setToasts((prev) => {
        const next = [...prev, t];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ttl);
    }
    bus.addEventListener('toast:add', onAdd);
    return () => bus.removeEventListener('toast:add', onAdd);
  }, []);

  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      role="status"
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`border ${TOAST_COLOR_CLASSES[t.type]}`}
          style={{
            minWidth: 260,
            maxWidth: 420,
            padding: '10px 12px',
            borderRadius: 8,
            boxShadow: '0 8px 20px rgba(0,0,0,.08)',
          }}
        >
          <strong style={{ marginRight: 6 }}>
            {t.type === 'error' ? 'Error' : t.type === 'success' ? 'Saved' : 'Notice'}:
          </strong>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
