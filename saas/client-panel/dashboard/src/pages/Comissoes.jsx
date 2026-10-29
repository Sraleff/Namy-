import { useState } from 'react';
import { RefreshCw, Wallet } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Notice, Switch } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']];
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const intervalo = (dias) => [ymd(new Date(Date.now() - (dias - 1) * 86400000)), ymd(new Date())];

function Tabela({ titulo, linhas, vazio, colunaNome }) {
  return (
    <Card>
      <CardHeader title={titulo} />
      {linhas.length === 0 ? <p className="text-xs text-muted">{vazio}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-subtle">
                <th className="pb-2 pr-3 font-medium">{colunaNome}</th>
                <th className="pb-2 pr-3 text-right font-medium">Vendas</th>
                <th className="pb-2 text-right font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.nome} className="border-t border-line">
                  <td className="max-w-[16rem] truncate py-2 pr-3 text-cream" title={l.nome}>{l.nome}</td>
                  <td className="tabular py-2 pr-3 text-right text-muted">{l.vendas}</td>
                  <td className="tabular py-2 text-right text-cream">{brl(l.comissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Cartao({ rotulo, valor, vendas, tom }) {
  return (
    <Card>
      <p className="text-xs text-muted">{rotulo}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${tom || 'text-cream'}`}>{brl(valor)}</p>
      <p className="mt-0.5 text-[11px] text-subtle">{vendas} {vendas === 1 ? 'venda' : 'vendas'}</p>
    </Card>
  );
}

export default function Comissoes() {
  const [dias, setDias] = useState(30);
  const [de, ate] = intervalo(dias);
  const { data: d, loading, error, setData, reload } = useAsync(() => ep.getCommissions(de, ate), [dias]);
  const { data: cfg, setData: setCfg } = useAsync(ep.getCommissionsConfig, []);
  const { busy, msg, run } = useAction();

  const atualizar = () => run('atualizar', () => ep.refreshCommissions(de, ate), 'Relatório atualizado.').then((o) => o && setData(o));
  const alternar = (v) => run('cfg', () => ep.saveCommissionsConfig(v), v ? 'Cada grupo passa a ter o seu link. Vale a partir do próximo envio.' : 'Atribuição por grupo desligada.').then((o) => o && setCfg(o));

  const vazio = d && d.vendas.pendente + d.vendas.concluido + d.vendas.cancelado + d.vendas.outro === 0;

  return (
    <>
      <PageHeader
        title="Comissões"
        subtitle="O que a Shopee registrou para o seu link de afiliado. Comissão pendente ainda pode ser cancelada."
        actions={(
          <>
            <div className="flex rounded-xl border border-line bg-ink-850 p-0.5" role="group" aria-label="Período">
              {PERIODOS.map(([n, rot]) => (
                <button key={n} type="button" aria-pressed={dias === n} onClick={() => setDias(n)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${dias === n ? 'bg-brand-500/20 text-brand-300' : 'text-muted hover:text-cream'}`}>{rot}</button>
              ))}
            </div>
            <Button variant="secondary" icon={RefreshCw} busy={busy === 'atualizar'} onClick={atualizar}>Atualizar</Button>
          </>
        )}
      />
      <Notice className="mb-4" msg={msg} />

      {loading && !d && <Card><p className="text-sm text-muted">Lendo o relatório da Shopee…</p></Card>}
      {error && (
        <Card>
          <EmptyState action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reload()}>Tentar de novo</Button>}>
            {error.message}
          </EmptyState>
        </Card>
      )}

      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao rotulo="Estimada (pendente + concluída)" valor={d.estimado} vendas={d.vendas.pendente + d.vendas.concluido + d.vendas.outro} />
            <Cartao rotulo="Concluída" valor={d.totais.concluido} vendas={d.vendas.concluido} tom="text-emerald-300" />
            <Cartao rotulo="Pendente" valor={d.totais.pendente} vendas={d.vendas.pendente} tom="text-amber-300" />
            <Cartao rotulo="Cancelada" valor={d.totais.cancelado} vendas={d.vendas.cancelado} tom="text-rose-300" />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
            Atualizado em {hora.format(new Date(d.atualizadoEm))} · período {d.periodo.de} a {d.periodo.ate}
            {d.truncado && <Badge variant="warning">Relatório grande: mostrando parte das vendas</Badge>}
          </p>

          {vazio ? (
            <Card className="mt-4">
              <EmptyState icon={Wallet}>
                Nenhuma venda registrada nesse período. As vendas aparecem aqui depois que alguém compra pelo seu link; a Shopee pode levar algumas horas para registrar.
              </EmptyState>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Tabela titulo="Por origem" colunaNome="Origem" linhas={d.porOrigem} vazio="Sem dados." />
              <Tabela titulo="Por nicho" colunaNome="Nicho" linhas={d.porNicho} vazio="As vendas anteriores à atribuição não têm nicho." />
              <Tabela titulo="Por grupo" colunaNome="Grupo" linhas={d.porGrupo} vazio="Ligue a atribuição por grupo abaixo para ver qual grupo vendeu." />
              <Tabela titulo="Produtos" colunaNome="Produto" linhas={d.produtos.map((p) => ({ nome: p.nome || p.itemId, vendas: p.vendas, comissao: p.comissao }))} vazio="Sem dados." />
            </div>
          )}
        </>
      )}

      <Card className="mt-4">
        <CardHeader
          title="Atribuir vendas por grupo"
          subtitle="Cada grupo recebe o seu próprio link de afiliado, e assim dá para ver qual grupo vendeu. Gasta uma chamada de link a mais por grupo e por oferta."
          action={<Switch on={!!(cfg && cfg.porGrupo)} onChange={alternar} disabled={!cfg || busy === 'cfg'} label="Atribuir vendas por grupo" />}
        />
        <p className="text-xs text-muted">Sem isso, as vendas são separadas só por origem (API, banco, Vitrine) e nicho. O número do grupo nunca vai no link, só um código curto.</p>
      </Card>
    </>
  );
}
