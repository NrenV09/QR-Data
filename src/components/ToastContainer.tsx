import React from 'react';
import { CheckCircle2, Info, AlertTriangle, X, Sparkles } from 'lucide-react';

export type ToastTone = 'success' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  timestamp: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const icon =
          toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toast.tone === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-[var(--m3-primary)] shrink-0" />
          );

        const borderClass =
          toast.tone === 'success'
            ? 'border-emerald-500/30'
            : toast.tone === 'warning'
            ? 'border-amber-500/30'
            : 'border-[var(--m3-outline)]';

        return (
          <div
            key={toast.id}
            role="status"
            style={{ borderRadius: 'var(--m3-radius-md)' }}
            className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 bg-[var(--m3-surface-container-high)]/95 backdrop-blur-xl border ${borderClass} shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_16px_36px_-8px_rgba(0,0,0,0.65)] transition-all duration-200`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="mt-0.5">{icon}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-tight text-[var(--m3-on-surface)] truncate">
                    {toast.title}
                  </span>
                  <span className="text-[10px] font-mono m3-text-muted tabular-nums shrink-0">
                    {toast.timestamp}
                  </span>
                </div>
                {toast.description && (
                  <p className="text-[11px] font-mono m3-text-muted mt-0.5 truncate">
                    {toast.description}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg m3-text-muted hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container)] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
