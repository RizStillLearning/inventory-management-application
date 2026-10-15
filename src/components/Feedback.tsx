import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

// --- Toasts ----------------------------------------------------------------

type ToastKind = 'success' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(ok: boolean) => void>();
  const nextId = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++nextId.current;
    setToasts((t) => [...t.slice(-2), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = undefined;
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <Modal
        open={pending !== null}
        title={pending?.title ?? ''}
        onClose={() => settle(false)}
        width={440}
        footer={
          <>
            <button type="button" className="btn" onClick={() => settle(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${pending?.danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => settle(true)}
              autoFocus
            >
              {pending?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        <div className="confirm-message">{pending?.message}</div>
      </Modal>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'check' : 'alert'} />
            <span>{t.message}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Dismiss"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}
