/**
 * UI primitives: spinners, empty/error states, modal (mobile bottom sheet),
 * toggle switch and booking status chip.
 */
import { useEffect } from 'react';
import { AlertTriangle, CalendarX2, Loader2, X } from 'lucide-react';
import t from '../i18n/ar';

/** Inline loading spinner. */
export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

/** Full-page loading state with Arabic text. */
export function FullSpinner({ text = t.app.loading }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner size={34} className="text-gold-400" />
      <p className="text-sm font-semibold">{text}</p>
    </div>
  );
}

/** Empty state with an icon, title and optional action. */
export function EmptyState({ icon: Icon = CalendarX2, title, body, action }) {
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-3 animate-fade-up">
      <div className="w-14 h-14 rounded-2xl bg-ink-600 flex items-center justify-center text-gold-400">
        <Icon size={26} />
      </div>
      <h3 className="font-extrabold text-slate-100">{title}</h3>
      {body && <p className="text-sm text-slate-400 leading-relaxed">{body}</p>}
      {action}
    </div>
  );
}

/** Error state with a retry button. */
export function ErrorState({ error, onRetry, title = t.errors.loadFailed }) {
  return (
    <div className="card p-6 flex flex-col items-center text-center gap-3 border-red-500/30">
      <AlertTriangle size={28} className="text-red-400" />
      <h3 className="font-extrabold text-slate-100">{title}</h3>
      <p className="text-xs text-slate-400 break-all max-w-sm">
        {error?.message?.includes('permission') ? t.errors.permission : t.errors.generic}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline btn-sm mt-1">
          {t.app.retry}
        </button>
      )}
    </div>
  );
}

/** Modal that behaves like a bottom sheet on phones and a dialog on desktop. */
export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={`relative flex min-h-0 w-full shrink-0 flex-col ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}
          bg-ink-800 border-t sm:border border-ink-500 rounded-t-3xl sm:rounded-3xl animate-fade-up shadow-card`}
        style={{
          maxHeight:
            'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-3 border-b border-ink-500/70">
          <h3 className="font-extrabold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-ink-600 hover:text-white"
            aria-label={t.app.close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 [webkit-overflow-scrolling:touch]">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-ink-500/70 px-5 py-4 safe-bottom">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** Styled confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = t.app.confirm,
  cancelLabel = t.app.cancel,
  busy = false,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner size={16} /> : <AlertTriangle size={16} />}
            {busy ? t.app.loading : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 flex items-center justify-center shrink-0">
          <AlertTriangle size={21} />
        </div>
        <p className="text-sm text-slate-300 leading-relaxed pt-1.5">{message}</p>
      </div>
    </Modal>
  );
}

/** Form field wrapper with label + error message. */
export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-400 mt-1 font-semibold">{error}</p>}
    </div>
  );
}

/** Toggle switch (used for the shop open/close control and active flags). */
export function Toggle({ checked, onChange, disabled, size = 'md', ariaLabel }) {
  const h = size === 'lg' ? 'h-9 w-[68px]' : 'h-6 w-11';
  const dot = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
  const shift = size === 'lg' ? 'translate-x-[-36px]' : 'translate-x-[-20px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative ${h} rounded-full transition-colors duration-300 shrink-0 disabled:opacity-40
        ${checked ? 'bg-emerald-500/80' : 'bg-ink-500'}`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 right-1 ${dot} rounded-full bg-white shadow transition-transform duration-300
          ${checked ? shift : ''}`}
      />
    </button>
  );
}

/** Colored chip for a booking status. */
export function StatusChip({ status }) {
  const map = {
    pending: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    accepted: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    accepted_modified: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
    declined: 'bg-red-500/15 text-red-300 border border-red-500/30',
    cancelled: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
    in_progress: 'bg-gold-500/15 text-gold-300 border border-gold-500/30 animate-pulse-ring',
    completed: 'bg-emerald-700/20 text-emerald-400 border border-emerald-700/40',
    no_show: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  };
  const label = t.status[status] || status;
  return <span className={`chip ${map[status] || map.pending}`}>{label}</span>;
}

/** Small gold-bordered card used for stat tiles. */
export function StatTile({ label, value, icon: Icon, hint }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      {Icon && (
        <div className="w-10 h-10 rounded-xl bg-gold-500/10 text-gold-400 flex items-center justify-center shrink-0">
          <Icon size={19} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xl font-extrabold text-slate-100 leading-tight">{value}</p>
        <p className="text-xs text-slate-400 font-semibold truncate">{label}</p>
        {hint && <p className="text-[10px] text-slate-500 truncate">{hint}</p>}
      </div>
    </div>
  );
}
