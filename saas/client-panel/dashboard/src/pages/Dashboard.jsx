import { AlertTriangle, Link2, ListPlus, Send, Tag, Users, Wallet } from 'lucide-react';
import Greeting from '../components/dashboard/Greeting';
import StatCard from '../components/dashboard/StatCard';
import StatusHero from '../components/dashboard/StatusHero';
import MessagesChart from '../components/dashboard/MessagesChart';
import ConnectionStatus from '../components/dashboard/ConnectionStatus';
import CampaignsList from '../components/dashboard/CampaignsList';
import AIFeatures from '../components/dashboard/AIFeatures';
import ActivityTimeline from '../components/dashboard/ActivityTimeline';
import RecentGroups from '../components/dashboard/RecentGroups';
import Onboarding from '../components/dashboard/Onboarding';
import IconTile from '../components/ui/IconTile';
import Skeleton from '../components/ui/Skeleton';
import { USE_MOCK } from '../services/dashboard';
import { cx, formatNumber } from '../lib/format';

const reais = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando painel">
      <Skeleton className="h-[190px] rounded-2xl" />
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-2xl" />)}
      </div>
    </div>
  );
}

function Atalho({ href, icon, tone, children }) {
  return (
    <a href={href} className="card glass-hover flex flex-col items-center gap-2 px-2 pb-3 pt-3.5 text-center text-[13px] font-semibold leading-tight text-cream">
      <IconTile icon={icon} tone={tone} size="lg" shape="rounded-2xl" />
      {children}
    </a>
  );
}

function Numero({ href, icon: Icone, rotulo, valor, dica, children }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag href={href} className={cx('card flex min-h-[112px] flex-col gap-0.5 p-4', href && 'glass-hover')}>
      <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {Icone && <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {rotulo}
      </span>
      {children || <span className="tabular mt-auto text-2xl font-bold tracking-tight text-cream">{valor}</span>}
      {dica && <span className="text-xs text-subtle">{dica}</span>}
    </Tag>
  );
}

function Envios7Dias({ dias = [] }) {
  const max = Math.max(1, ...dias.map((d) => d.sent));
  return (
    <div className="mt-auto flex h-9 items-end gap-1.5" role="img" aria-label={`Envios por dia: ${dias.map((d) => d.sent).join(', ')}`}>
      {dias.map((d, i) => (
        <span
          key={d.date}
          className={cx('min-h-[3px] flex-1 rounded', i === dias.length - 1 ? 'bg-brand-gradient' : 'bg-ink-700')}
          style={{ height: `${Math.max(8, (d.sent / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Resumo({ data }) {
  const r = data.resumo || {};
  const g = r.grupos || {};
  return (
    <section aria-label="Resumo" className="grid grid-cols-2 gap-2.5 sm:gap-3">
      {r.ofertasNoBanco != null && (
        <Numero href="#ofertas" icon={Tag} rotulo="Ofertas no banco" valor={formatNumber(r.ofertasNoBanco)} dica="prontas para enviar" />
      )}
      <Numero href="#grupos" icon={Users} rotulo="Grupos na divulgação" dica={`${g.captura ?? 0} de captura`}>
        <span className="tabular mt-auto text-2xl font-bold tracking-tight text-cream">
          {g.divulgacao ?? 0}{g.total != null && <span className="text-sm font-semibold text-muted"> de {g.total}</span>}
        </span>
      </Numero>
      {r.comissao ? (
        <Numero href="#comissoes" icon={Wallet} rotulo="Comissão pendente" valor={reais(r.comissao.pendente)} dica={`${r.comissao.vendasPendentes} venda(s) aguardando`} />
      ) : (
        <Numero href="#comissoes" icon={Wallet} rotulo="Comissões" dica="abra para buscar o relatório">
          <span className="mt-auto text-sm font-semibold text-brand-300">Ver comissões</span>
        </Numero>
      )}
      <Numero icon={Send} rotulo="Envios, 7 dias">
        <Envios7Dias dias={data.messages} />
      </Numero>
    </section>
  );
}

function Conflitos({ itens = [] }) {
  if (!itens.length) return null;
  const nomes = itens.map((g) => `“${g.name}”`).join(', ');
  return (
    <div role="status" className="glass flex gap-3 rounded-2xl !border-amber-400/30 !bg-amber-400/[0.08] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-cream">{itens.length === 1 ? 'Um grupo está como captura e divulgação' : `${itens.length} grupos estão como captura e divulgação`}</p>
        <p className="mt-0.5 text-[13px] text-slate-300">{nomes} recebe as ofertas e também é lido como fonte. Escolha uma função para ele.</p>
        <a href="#grupos" className="mt-3 inline-flex h-10 items-center rounded-xl border border-line-strong bg-ink-800 px-3.5 text-[13px] font-semibold text-cream transition hover:bg-ink-750 active:scale-[0.97]">
          Resolver em Grupos
        </a>
      </div>
    </div>
  );
}

export default function Dashboard({ data, loading, error, onRetry, onChange }) {
  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center" role="alert">
        <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
        <p className="text-sm text-cream">Não foi possível carregar o painel.</p>
        <p className="text-xs text-muted">{error.message}</p>
        <button type="button" onClick={() => onRetry()} className="mt-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white">
          Tentar novamente
        </button>
      </div>
    );
  }

  const silencioso = () => onRetry({ silent: true });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only md:hidden">Início</h1>
      <div className="hidden md:block"><Greeting name={data.user.name} /></div>

      {/* Bloco principal: situação + atalhos | resumo + atividade */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0 space-y-4">
          {data.resumo && <StatusHero resumo={data.resumo} connection={data.connection} onChanged={silencioso} />}
          <nav aria-label="Atalhos" className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <Atalho href="#conversor" icon={Link2} tone="indigo">Converter link</Atalho>
            <Atalho href="#ofertas" icon={ListPlus} tone="violet">Adicionar oferta</Atalho>
            <Atalho href="#grupos" icon={Users} tone="green">Meus grupos</Atalho>
          </nav>
          <Conflitos itens={data.resumo?.conflitos} />
          {!USE_MOCK && <Onboarding />}
        </div>
        <div className="min-w-0 space-y-4">
          {data.resumo && <Resumo data={data} />}
          <ActivityTimeline items={data.activities} />
        </div>
      </div>

      <section aria-label="Mais números" className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        {data.stats.map((s) => <StatCard key={s.id} {...s} />)}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <MessagesChart data={data.messages} demo={data.connection.demo} />
        <ConnectionStatus connection={data.connection} onReconnected={silencioso} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <CampaignsList items={data.campaigns} />
        <AIFeatures
          items={data.aiFeatures}
          onChanged={(id, active) => {
            // Atualiza na hora e confirma com o servidor
            onChange((d) => ({ ...d, aiFeatures: d.aiFeatures.map((f) => (f.id === id ? { ...f, active } : f)) }));
            if (!USE_MOCK) onRetry({ silent: true });
          }}
        />
        <div className="lg:col-span-2 2xl:col-span-1">
          <RecentGroups items={data.recentGroups} live={data.meta?.groupsLive ?? true} />
        </div>
      </div>
    </div>
  );
}
