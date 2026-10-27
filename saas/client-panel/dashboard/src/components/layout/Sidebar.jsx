import { Crown, LogOut } from 'lucide-react';
import Logo from '../ui/Logo';
import { navItems } from './navigation';
import { cx } from '../../lib/format';

function NavLink({ item, active }) {
  const Icon = item.icon;
  return (
    <li>
      <a
        href={`#${item.id}`}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
          active
            ? 'bg-brand-gradient text-white shadow-glow'
            : 'text-slate-300 hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-cream',
        )}
      >
        <Icon
          className={cx('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-muted group-hover:text-cream')}
          aria-hidden="true"
        />
        {item.label}
      </a>
    </li>
  );
}

function ProCard({ license }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div aria-hidden="true" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand-500/20 blur-2xl" />
      <p className="flex items-center gap-2 text-sm font-semibold text-cream">
        <Crown className="h-4 w-4 text-amber-400" aria-hidden="true" />
        NAMY PRO
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {license && !license.active
          ? 'Sua licença expirou. Renove para voltar a publicar.'
          : license
            ? `Seu teste termina em ${license.daysLeft} dia(s). Assine e mantenha o bot no ar.`
            : 'Desbloqueie todo o potencial do seu bot com IA avançada e campanhas ilimitadas.'}
      </p>
      <a
        href="#configuracoes"
        className="mt-3 flex h-9 items-center justify-center rounded-xl bg-brand-gradient text-sm font-medium text-white shadow-glow transition hover:brightness-110"
      >
        Ver planos
      </a>
    </div>
  );
}

function UserCard({ user, onLogout }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl p-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
        {user.name.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-cream">{user.name}</span>
        <span className="block truncate text-xs text-muted" title={user.email}>{user.role}</span>
      </span>
      {onLogout && (
        <button type="button" onClick={onLogout} className="icon-btn h-8 w-8" aria-label="Sair da conta" title="Sair">
          <LogOut className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// Só no desktop (lg). No celular e no tablet a navegação é a barra inferior + o Perfil.
export default function Sidebar({ user, active, onLogout }) {
  return (
    <>
      <aside
        id="sidebar"
        aria-label="Navegação principal"
        className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col border-r border-line bg-ink-900/70 backdrop-blur-xl lg:flex"
      >
        <div className="flex items-center justify-between px-6 pb-6 pt-6">
          <Logo />
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.id} item={item} active={active === item.id} />
            ))}
          </ul>
        </nav>

        <div className="space-y-4 px-4 pb-4 pt-4">
          {user && !['pro', 'premium'].includes(user.plan) && <ProCard license={user.license} />}
          <div className="border-t border-line pt-3">
            {user ? (
              <UserCard user={user} onLogout={onLogout} />
            ) : (
              onLogout && (
                <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl p-2 text-sm text-muted transition-colors hover:bg-white/[0.04] hover:text-cream">
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
                </button>
              )
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
