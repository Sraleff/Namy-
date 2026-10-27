import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Crown, Download, LogOut, Search, Smartphone } from 'lucide-react';
import IconTile from '../components/ui/IconTile';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import { Notice } from '../components/ui/Form';
import { navItems, extraRoutes, menuGroups, menuLabels } from '../components/layout/navigation';
import { useAsync } from '../hooks/useAsync';
import * as ep from '../services/endpoints';
import * as pwa from '../lib/pwa';
import { cx } from '../lib/format';

const porId = Object.fromEntries([...navItems, ...extraRoutes].map((n) => [n.id, n]));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Barra({ rotulo, usado, max }) {
  const pct = max ? Math.min(100, Math.max(3, (usado / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[13px]">
        <span className="font-medium text-slate-200">{rotulo}</span>
        <span className="tabular text-muted">{usado} de {max}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-label={rotulo} aria-valuenow={usado} aria-valuemin={0} aria-valuemax={max}>
        <span className={cx('block h-full rounded-full', usado >= max ? 'bg-amber-400' : 'bg-brand-gradient')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Plano({ user }) {
  const { data, error, loading } = useAsync(ep.getUso, []);
  const lic = user?.license || {};
  return (
    <section className="card relative mt-3 overflow-hidden p-5" aria-labelledby="plano-tit">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <h2 id="plano-tit" className="flex items-center gap-2 text-lg font-bold text-cream">
          <Crown className="h-5 w-5 text-amber-300" aria-hidden="true" /> {data?.rotulo || user?.role || 'Plano'}
        </h2>
        {lic.active === false
          ? <Badge variant="danger">Vencida</Badge>
          : lic.daysLeft != null && <Badge variant="info" className="tabular">{lic.daysLeft} dia(s)</Badge>}
      </div>
      {loading && !data && <div className="relative mt-4 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
      {error && <Notice className="relative mt-3" msg={{ tone: 'error', text: `Não consegui ler o uso do plano: ${error.message}` }} />}
      {data && (
        <div className="relative mt-4 space-y-3">
          <Barra rotulo="Grupos de divulgação" usado={data.destinos.usado} max={data.destinos.max} />
          <Barra rotulo="Grupos de captura" usado={data.fontes.usado} max={data.fontes.max} />
          {data.enviosPorDia ? <p className="text-xs text-muted">No teste, até {data.enviosPorDia} envios por dia.</p> : null}
        </div>
      )}
      <a href="#configuracoes" className="relative mt-4 flex h-12 items-center justify-center rounded-2xl bg-brand-gradient text-[15px] font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]">
        Ver planos
      </a>
    </section>
  );
}

function Item({ href, onClick, icon, tone, children, extra, as }) {
  const Tag = as || (href ? 'a' : 'button');
  return (
    <li>
      <Tag
        href={href}
        type={Tag === 'button' ? 'button' : undefined}
        onClick={onClick}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] active:bg-white/[0.08] disabled:opacity-60"
      >
        <IconTile icon={icon} tone={tone} size="sm" />
        <span className="min-w-0 flex-1 text-[15px] font-medium text-cream">{children}</span>
        {extra ?? <ChevronRight className="h-4 w-4 text-subtle" aria-hidden="true" />}
      </Tag>
    </li>
  );
}

function Instalar() {
  const [, setVer] = useState(0);
  const [ajuda, setAjuda] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => pwa.aoMudar(() => setVer((v) => v + 1)), []);

  if (pwa.instalado()) {
    return <Item icon={Smartphone} tone="blue" extra={<Badge variant="success">Instalado</Badge>} as="div">App instalado neste aparelho</Item>;
  }
  const clicar = async () => {
    if (!pwa.podeInstalar()) { setAjuda((v) => !v); return; }
    const r = await pwa.instalar();
    if (r === 'accepted') setMsg({ tone: 'ok', text: 'Pronto: a Namy aparece na tela inicial do seu celular.' });
  };
  return (
    <>
      <Item icon={Download} tone="blue" onClick={clicar} extra={pwa.podeInstalar() ? <Badge variant="info">Instalar</Badge> : undefined}>
        Instalar o app no celular
      </Item>
      {ajuda && (
        <li className="px-2.5 pb-2">
          <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-muted">
            {pwa.ehIOS()
              ? 'No Safari, toque em Compartilhar (o quadrado com a seta para cima) e depois em “Adicionar à Tela de Início”.'
              : 'No Chrome, abra o menu ⋮ e toque em “Instalar app” ou “Adicionar à tela inicial”. Se a opção não aparecer, o navegador ainda não liberou a instalação para este endereço.'}
          </p>
        </li>
      )}
      {msg && <li className="px-2.5 pb-2"><Notice msg={msg} /></li>}
    </>
  );
}

export default function Perfil({ user, connection, onLogout }) {
  const [q, setQ] = useState('');
  const grupos = useMemo(() => {
    const t = norm(q.trim());
    return menuGroups
      .map((g) => ({ ...g, itens: g.ids.map((id) => porId[id]).filter(Boolean).filter((n) => !t || norm(menuLabels[n.id] || n.label).includes(t)) }))
      .filter((g) => g.itens.length);
  }, [q]);
  const conectado = connection?.status === 'connected';

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="sr-only">Perfil</h1>
      <a href="#configuracoes" className="card glass-hover flex items-center gap-4 p-5" aria-label="Abrir configurações da conta">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[19px] bg-brand-gradient text-2xl font-bold text-white shadow-glow">
          {user?.name?.charAt(0) || '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-cream">{user?.name || 'Sua conta'}</span>
          <span className="block truncate text-[13px] text-muted">{user?.email}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={conectado ? 'success' : 'danger'} dot>{conectado ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</Badge>
            {connection?.phone && <span className="tabular text-xs text-subtle">{connection.phone}</span>}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
      </a>

      <Plano user={user} />

      <label className="glass mt-5 flex h-12 items-center gap-3 rounded-2xl px-4 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-500/15">
        <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
        <span className="sr-only">Buscar no menu</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Buscar uma função, ex.: cupons" className="min-w-0 flex-1 bg-transparent text-base text-cream placeholder:text-subtle focus:outline-none" />
      </label>

      {grupos.map((g) => (
        <section key={g.title} aria-labelledby={`menu-${g.title}`}>
          <h2 id={`menu-${g.title}`} className="mb-2 ml-1 mt-6 text-[13px] font-semibold text-muted">{g.title}</h2>
          <ul className="card p-1.5">
            {g.itens.map((n) => (
              <Item key={n.id} href={`#${n.id}`} icon={n.icon} tone={g.tone}>{menuLabels[n.id] || n.label}</Item>
            ))}
            {g.title === 'Conta' && !q && (
              <>
                <Instalar />
                {onLogout && <Item icon={LogOut} tone="rose" onClick={onLogout} extra={<span />}>Sair da conta</Item>}
              </>
            )}
          </ul>
        </section>
      ))}
      {!grupos.length && <p className="mt-6 text-center text-sm text-muted">Nenhuma função com esse nome.</p>}
    </div>
  );
}
