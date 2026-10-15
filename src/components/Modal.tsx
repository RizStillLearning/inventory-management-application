import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** "drawer" slides in from the right; "dialog" is centered. */
  variant?: 'dialog' | 'drawer';
  width?: number;
}

/** Native <dialog> gives focus trapping, Esc to close and a top layer for free. */
export function Modal({ open, title, onClose, children, footer, variant = 'dialog', width }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal--${variant}`}
      style={width ? { width: `min(${width}px, 100vw - 32px)` } : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // Click on the backdrop (the dialog element itself, outside its content) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
    >
      {open && (
        <div className="modal__inner">
          <header className="modal__header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
