import { bottomNav } from './navigation';
import { cx } from '../../lib/format';

// Barra inferior de app (celular e tablet): vidro flutuante, respeita a área de gestos do sistema.
// No desktop (lg) some e fica a barra lateral de sempre.
export default function BottomNav({ active }) {
  return (
    <nav
      aria-label="Navegação"
      className="glass-pop bottom-safe fixed inset-x-3 z-30 mx-auto grid h-16 max-w-lg grid-cols-5 items-center !rounded-3xl px-1.5 shadow-nav lg:hidden"
    >
      {bottomNav.map(({ id, label, icon: Icon, destaque }) => {
        const atual = active === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={atual ? 'page' : undefined}
            className={cx(
              'group flex flex-col items-center justify-center rounded-2xl text-[11px] font-semibold transition-colors',
              destaque ? '-mt-8 gap-1' : 'h-14 gap-0.5',
              atual ? 'text-cream' : 'text-muted hover:text-cream',
            )}
          >
            {destaque ? (
              <span
                className={cx(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-brand-gradient text-white shadow-glow transition group-hover:-translate-y-0.5 group-active:scale-95',
                  atual && 'ring-4 ring-brand-500/25',
                )}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
            ) : (
              <span
                className={cx(
                  'flex h-7 w-11 items-center justify-center rounded-full transition-colors',
                  atual ? 'bg-brand-500/25 text-brand-300 ring-1 ring-inset ring-brand-300/25' : 'group-hover:bg-white/[0.06]',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            {label}
          </a>
        );
      })}
    </nav>
  );
}
