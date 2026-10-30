/**
 * Tiny toast system (Arabic messages, no extra dependency).
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import t from '../i18n/ar';

const ToastCtx = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'border-emerald-500/50 text-emerald-200',
  error: 'border-red-500/50 text-red-200',
  info: 'border-gold-500/50 text-gold-200',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = 'success', duration = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list, { id, message, type }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed top-3 inset-x-0 z-[100] flex flex-col items-center gap-2 px-3 pointer-events-none">
        {toasts.map((x) => {
          const Icon = ICONS[x.type] || Info;
          return (
            <div
              key={x.id}
              className={`pointer-events-auto w-full max-w-md card border ${COLORS[x.type] || COLORS.info} px-4 py-3 flex items-start gap-3 animate-fade-up bg-ink-700/95 backdrop-blur`}
              role="status"
            >
              <Icon size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-semibold flex-1 text-slate-100">{x.message}</p>
              <button
                onClick={() => dismiss(x.id)}
                className="text-slate-400 hover:text-white p-1"
                aria-label={t.app.close}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
