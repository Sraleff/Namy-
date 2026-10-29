import { ofertasTabs } from './navigation';
import { cx } from '../../lib/format';

// Banco, Fila e Vitrine são uma área só: abas no topo das três páginas
export default function OfertasTabs({ active }) {
  return (
    <nav aria-label="Ofertas" className="glass mb-5 grid grid-cols-3 gap-1 rounded-2xl p-1 sm:inline-grid sm:min-w-[360px]">
      {ofertasTabs.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          aria-current={active === t.id ? 'page' : undefined}
          className={cx(
            'flex h-10 items-center justify-center rounded-xl px-4 text-[13.5px] font-semibold transition',
            active === t.id ? 'bg-white/10 text-cream shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-muted hover:bg-white/[0.04] hover:text-cream',
          )}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
