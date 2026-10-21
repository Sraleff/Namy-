import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Notice, Select } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import * as ep from '../services/endpoints';

const LEVEL = { info: ['info', 'Info'], warn: ['warning', 'Aviso'], error: ['danger', 'Erro'] };
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Logs() {
  const { data, loading, error, reload } = useAsync(ep.getLogs, [], { refreshMs: 15000 });
  const [source, setSource] = useState('');
  const logs = data?.logs || [];
  const sources = useMemo(() => [...new Set(logs.map((l) => l.source))], [logs]);
  const list = logs.filter((l) => !source || l.source === source);

  return (
    <>
      <PageHeader
        title="Logs & Atividades"
        subtitle="Últimos 80 eventos da sua conta (anúncios, central, pagamentos)."
        actions={
          <>
            <Select aria-label="Filtrar origem" value={source} onChange={(e) => setSource(e.target.value)} className="w-40">
              <option value="">Todas origens</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Button variant="secondary" icon={RefreshCw} busy={loading} onClick={() => reload()}>Atualizar</Button>
          </>
        }
      />
      {error && <Notice className="mb-4" msg={{ tone: 'error', text: error.message }} />}
      <Card className="overflow-x-auto p-0">
        {!loading && !list.length ? (
          <div className="p-4"><EmptyState>Nenhum evento registrado ainda.</EmptyState></div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th scope="col" className="px-4 py-3 font-medium">Quando</th>
                <th scope="col" className="px-4 py-3 font-medium">Origem</th>
                <th scope="col" className="px-4 py-3 font-medium">Mensagem</th>
                <th scope="col" className="px-4 py-3 font-medium">Grupo</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Nível</th>
              </tr>
            </thead>
            <tbody>
              {list.map((l, i) => {
                const [variant, label] = l.ok === false ? LEVEL.error : LEVEL[l.level] || LEVEL.info;
                return (
                  <tr key={`${l.at}-${i}`} className="border-b border-line last:border-0 hover:bg-white/[0.02]">
                    <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{fmt.format(new Date(l.at))}</td>
                    <td className="px-4 py-3 capitalize text-muted">{l.source}</td>
                    <td className="px-4 py-3 text-cream">{l.message}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-subtle" title={l.group}>{l.group || '—'}</td>
                    <td className="px-4 py-3 text-right"><Badge variant={variant}>{label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
