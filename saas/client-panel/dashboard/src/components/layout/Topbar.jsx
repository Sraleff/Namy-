import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, Menu, Search, SunMedium } from 'lucide-react';
import Badge from '../ui/Badge';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cx } from '../../lib/format';
import { navItems } from './navigation';
import { go } from '../../lib/route';

const statusMap = {
  connected: { label: 'WhatsApp Conectado', dot: 'bg-positive' },
  connecting: { label: 'Conectando…', dot: 'bg-amber-400 animate-pulse' },
  disconnected: { label: 'WhatsApp Desconectado', dot: 'bg-rose-500' },
};

function SearchField() {
  const inputRef = useRef(null);

  // Atalho Ctrl/⌘ + K para focar a busca
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative min-w-0 flex-1 md:max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        // Nome de seção abre a seção; número vai para Contatos; o resto filtra Grupos
        const q = inputRef.current.value.trim();
        if (!q) return;
        const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const nav = navItems.find((n) => norm(n.label).startsWith(norm(q)));
        if (nav) go(nav.id);
        else go(/^\+?\d[\d\s-]{3,}$/.test(q) ? 'contatos' : 'grupos', q.replace(/^\+/, ''));
        inputRef.current.blur();
      }}
    >
      <label htmlFor="global-search" className="sr-only">Buscar</label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        placeholder="Buscar por grupos, contatos ou comandos..."
        className="h-11 w-full rounded-xl border border-line bg-ink-800 pl-11 pr-16 text-sm text-cream placeholder:text-subtle transition-colors focus:border-brand-500/60 focus:bg-ink-750 focus:outline-none focus:ring-0"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-ink-750 px-1.5 py-0.5 text-[10px] font-medium text-subtle sm:block">
        Ctrl K
      </kbd>
    </form>
  );
}

function ConnectionPill({ connection }) {
  const s = statusMap[connection?.status] ?? statusMap.disconnected;
  return (
    <a
      href="#configuracoes"
      className="hidden h-12 items-center gap-3 rounded-xl border border-line bg-ink-800 pl-2 pr-3 transition-colors hover:bg-ink-750 md:flex"
      aria-label={`${s.label}. Gerenciar conexão`}
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <WhatsAppIcon className="h-[18px] w-[18px]" />
        <span className={cx('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-ink-800', s.dot)} />
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-medium text-cream">{s.label}</span>
        {connection?.demo && <Badge variant="info" className="mt-0.5 !px-1.5 !py-0 !text-[9px] uppercase tracking-wider">Demo</Badge>}
      </span>
      <ChevronDown className="ml-2 h-4 w-4 text-subtle" aria-hidden="true" />
    </a>
  );
}

function Notifications({ items = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  const unread = items.filter((n) => n.unread).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="icon-btn relative"
        aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-ink-800" />}
      </button>

      {open && (
        <div className="card absolute right-0 top-12 z-50 w-80 p-2" role="dialog" aria-label="Notificações">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-subtle">Notificações</p>
          {!items.length && <p className="px-3 pb-3 text-sm text-muted">Nada novo por aqui.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <a href="#logs" className="flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.unread ? 'bg-brand-400' : 'bg-transparent')} aria-hidden="true" />
                  <span>
                    <span className="block text-sm text-cream">{n.title}</span>
                    <span className="block text-xs text-subtle">{n.time}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ connection, notifications, onOpenMenu }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink-950/80 backdrop-blur-xl">
      <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="icon-btn lg:hidden"
          onClick={onOpenMenu}
          aria-label="Abrir menu"
          aria-controls="sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <SearchField />

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ConnectionPill connection={connection} />
          <Notifications items={notifications} />
          <button type="button" className="icon-btn hidden w-auto gap-1 px-3 sm:inline-flex" aria-label="Preferências de aparência">
            <SunMedium className="h-[18px] w-[18px]" />
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
