import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Folha de baixo para cima no celular; janela central a partir do sm. Esc ou toque fora fecha.
// Vai direto para o <body>: dentro de um card com vidro (backdrop-filter) ou transform,
// um elemento "fixed" ficaria preso ao card em vez de cobrir a tela.
export default function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const antes = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      antes?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3px]" />
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-pop relative max-h-[88vh] w-full max-w-lg overflow-y-auto !rounded-b-none !rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3 focus:outline-none sm:!rounded-[28px] sm:pb-6"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25 sm:hidden" />
        <button type="button" onClick={onClose} className="icon-btn absolute right-3 top-3 hidden h-9 w-9 sm:inline-flex" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}
