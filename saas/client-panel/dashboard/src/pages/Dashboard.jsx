import { AlertTriangle } from 'lucide-react';
import Greeting from '../components/dashboard/Greeting';
import StatCard from '../components/dashboard/StatCard';
import MessagesChart from '../components/dashboard/MessagesChart';
import ConnectionStatus from '../components/dashboard/ConnectionStatus';
import CampaignsList from '../components/dashboard/CampaignsList';
import AIFeatures from '../components/dashboard/AIFeatures';
import ActivityTimeline from '../components/dashboard/ActivityTimeline';
import RecentGroups from '../components/dashboard/RecentGroups';
import Onboarding from '../components/dashboard/Onboarding';
import Skeleton from '../components/ui/Skeleton';
import { USE_MOCK } from '../services/dashboard';

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[164px]" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
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

  return (
    <div className="space-y-6">
      {/* Bloco superior: conteúdo principal + coluna direita */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          <Greeting name={data.user.name} />
          {!USE_MOCK && <Onboarding />}

          <section aria-label="Métricas" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {data.stats.map((s) => <StatCard key={s.id} {...s} />)}
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <MessagesChart data={data.messages} demo={data.connection.demo} />
            <ConnectionStatus connection={data.connection} onReconnected={() => onRetry({ silent: true })} />
          </div>
        </div>

        <aside aria-label="Grupos recentes" className="2xl:pt-0">
          <RecentGroups items={data.recentGroups} live={data.meta?.groupsLive ?? true} />
        </aside>
      </div>

      {/* Bloco inferior: 3 colunas */}
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
          <ActivityTimeline items={data.activities} />
        </div>
      </div>
    </div>
  );
}
