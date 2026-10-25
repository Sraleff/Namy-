import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Save, UsersRound } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']];
const dm = (s) => s.slice(5).split('-').reverse().join('/');
const sinal = (n) => (n > 0 ? `+${n}` : String(n));

function Barras({ dias }) {
  const max = Math.max(1, ...dias.map((d) => Math.max(d.entrou, d.saiu)));
  return (
    <div className="flex h-24 items-end gap-px" role="img" aria-label="Entradas (verde) e saídas (vermelho) por dia">
      {dias.map((d) => (
        <div key={d.dia} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px" title={`${dm(d.dia)}: ${d.entrou} entraram, ${d.saiu} saíram`}>
          <div className="w-full rounded-sm bg-emerald-400/70" style={{ height: `${(d.entrou / max) * 48}%` }} />
          <div className="w-full rounded-sm bg-rose-400/70" style={{ height: `${(d.saiu / max) * 48}%` }} />
        </div>
      ))}
    </div>
  );
}

function Cartao({ rotulo, valor, tom }) {
  return (
    <Card>
      <p className="text-xs text-muted">{rotulo}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${tom || 'text-cream'}`}>{valor}</p>
    </Card>
  );
}

export default function Membros() {
  const [dias, setDias] = useState(30);
  const { data: d, error, loading, reload } = useAsync(() => ep.getMembers(dias), [dias], { refreshMs: 60000 });
  const { busy, msg, run } = useAction();
  const lim = useAction();
  const [l, setL] = useState(null);
  useEffect(() => { if (d && !l) setL(d.limites); }, [d, l]);

  const atualizar = () => run('atualizar', () => ep.refreshMembers(), 'Tamanho dos grupos atualizado.').then((o) => { if (o) reload({ silent: true }); });
  const salvarLim = () => lim.run('lim', () => ep.saveMembersConfig(l), 'Limites salvos.').then((o) => o && reload({ silent: true }));

  return (
    <>
      <PageHeader
        title="Membros"
        subtitle="Quantas pessoas entraram e saíram dos seus grupos de destino. Guardamos só as contagens: nenhum número ou nome de membro."
        actions={(
          <>
            <div className="flex rounded-xl border border-line bg-ink-850 p-0.5" role="group" aria-label="Período">
              {PERIODOS.map(([n, rot]) => (
                <button key={n} type="button" aria-pressed={dias === n} onClick={() => setDias(n)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${dias === n ? 'bg-brand-500/20 text-brand-300' : 'text-muted hover:text-cream'}`}>{rot}</button>
              ))}
            </div>
            <Button variant="secondary" icon={RefreshCw} busy={busy === 'atualizar'} onClick={atualizar}>Atualizar tamanho</Button>
          </>
        )}
      />
      <Notice className="mb-4" msg={msg} />
      {loading && !d && <Card><p className="text-sm text-muted">Carregando…</p></Card>}
      {error && <Card><EmptyState action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reload()}>Tentar de novo</Button>}>{error.message}</EmptyState></Card>}

      {d && (
        <>
          {!d.whatsapp && <Notice className="mb-4" msg={{ tone: 'warn', text: 'O WhatsApp está desconectado: entradas e saídas deste período não são registradas.' }} />}
          {d.alertas > 0 && (
            <Notice className="mb-4" msg={{ tone: 'warn', text: `${d.alertas} grupo(s) com queda de membros hoje. Veja a tabela abaixo.` }} />
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Cartao rotulo="Entraram" valor={d.entrou} tom="text-emerald-300" />
            <Cartao rotulo="Saíram" valor={d.saiu} tom="text-rose-300" />
            <Cartao rotulo="Saldo" valor={sinal(d.saldo)} tom={d.saldo < 0 ? 'text-rose-300' : 'text-cream'} />
          </div>
          <p className="mt-2 text-[11px] text-subtle">
            {d.monitorandoDesde ? `Contando desde ${d.monitorandoDesde.split('-').reverse().join('/')}. O WhatsApp não fornece o histórico anterior.` : 'Ainda não houve entradas nem saídas registradas. A contagem começa agora.'}
          </p>

          <Card className="mt-4">
            <CardHeader title="Por dia" subtitle="Verde: entraram. Vermelho: saíram." />
            <Barras dias={d.porDia} />
          </Card>

          <Card className="mt-4">
            <CardHeader title="Por grupo" />
            {d.grupos.length === 0 ? (
              <EmptyState icon={UsersRound}>Salve grupos de destino na aba Grupos para monitorá-los.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-subtle">
                      <th className="pb-2 pr-3 font-medium">Grupo</th>
                      <th className="pb-2 pr-3 text-right font-medium">Tamanho</th>
                      <th className="pb-2 pr-3 text-right font-medium">Entraram</th>
                      <th className="pb-2 pr-3 text-right font-medium">Saíram</th>
                      <th className="pb-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.grupos.map((g) => (
                      <tr key={g.jid} className="border-t border-line">
                        <td className="max-w-[16rem] truncate py-2 pr-3 text-cream" title={g.name}>
                          {g.name} {g.alerta && <Badge variant="danger" className="ml-1"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Queda hoje</Badge>}
                        </td>
                        <td className="tabular py-2 pr-3 text-right text-muted">{g.tamanho == null ? '—' : g.tamanho}</td>
                        <td className="tabular py-2 pr-3 text-right text-emerald-300">{g.entrou}</td>
                        <td className="tabular py-2 pr-3 text-right text-rose-300">{g.saiu}</td>
                        <td className="tabular py-2 text-right text-cream">{sinal(g.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {l && (
            <Card className="mt-4">
              <CardHeader title="Alerta de queda" subtitle="Um grupo entra em alerta quando saem mais pessoas do que entram hoje e as saídas passam do maior valor entre o mínimo e a porcentagem do grupo. O alerta só aparece aqui e nos Logs; nada é enviado a ninguém." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mínimo de saídas no dia" htmlFor="mb-min"><Input id="mb-min" type="number" min={1} max={200} value={l.minSaidas} onChange={(e) => setL({ ...l, minSaidas: Number(e.target.value) })} /></Field>
                <Field label="Ou porcentagem do grupo" htmlFor="mb-pct" hint="Vale o maior dos dois."><Input id="mb-pct" type="number" min={1} max={50} value={l.pct} onChange={(e) => setL({ ...l, pct: Number(e.target.value) })} /></Field>
              </div>
              <Notice className="mt-3" msg={lim.msg} />
              <div className="mt-3"><Button size="sm" icon={Save} busy={lim.busy === 'lim'} onClick={salvarLim}>Salvar limites</Button></div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
