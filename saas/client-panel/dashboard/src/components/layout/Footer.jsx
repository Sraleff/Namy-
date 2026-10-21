import { Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-line px-4 py-5 text-xs text-subtle sm:flex-row sm:px-6 lg:px-8">
      <p>
        <span className="font-semibold text-muted">NAMY CONTROL</span> v1.0.0 · Painel de Controle Inteligente
      </p>
      <p className="flex items-center gap-1.5">
        Mais conversas. Mais resultados. <Heart className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden="true" />
      </p>
    </footer>
  );
}
