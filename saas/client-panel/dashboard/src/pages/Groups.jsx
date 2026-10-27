import { useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Save, Search, Send, UserPlus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { Button, Notice, Select, Switch } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { cx, formatNumber } from '../lib/format';

const TONS = ['bg-indigo-500/20 text-indigo-200', 'bg-violet-500/20 text-violet-200', 'bg-emerald-500/15 text-emerald-200', 'bg-sky-500/15 text-sky-200', 'bg-amber-400/15 text-amber-200'];
const inicial = (nome) => ((String(nome).match(/[\p{L}\p{N}]/u) || ['?'])[0]).toUpperCase();

// Nicho do grupo: só para grupos já salvos na divulgação
function NicheSelect({ group, niches, onSaved }) {
  const [value, setValue] = useState(group.niche || 'geral');
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    const next = e.target.value;
    setValue(next);
    setBusy(true);
    try { await ep.setGroupNiche(group.jid, next); onSaved?.(`Nicho de "${group.name}": ${niches.find((n) => n.id === next)?.label || next}.`); }
    catch (err) { setValue(group.niche || 'geral'); onSaved?.(err.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Select aria-label={`Nicho de ${group.name}`} value={value} onChange={change} disabled={busy} className="!h-10 w-full min-w-0 text-sm sm:w-48">
      {niches.map((n) => <option key={n.id} value={n.id}>Nicho: {n.label}</option>)}
    </Select>
  );
}

// Grupo nas duas listas: a Namy pode reenviar ao grupo o que capturou dele. Resolve de verdade, com confirmação.
function Conflitos({ itens, selecionados, fontes, onResolvido }) {
  const { busy, msg, run } = useAction();
  if (!itens.length) return msg ? <Notice className="mb-4" msg={msg} /> : null;
  const soCaptura = (g) => {
    if (!window.confirm(`Tirar "${g.name}" da divulgação? Ele continua sendo lido como fonte de ofertas.`)) return;
    run(`d-${g.jid}`, () => ep.saveAdGroups(selecionados.filter((s) => s.jid !== g.jid).map(({ jid, name }) => ({ jid, name }))), `"${g.name}" agora é só captura.`).then((o) => o && onResolvido());
  };
  const soDivulgacao = (g) => {
    if (!window.confirm(`Tirar "${g.name}" da captura? Ele continua recebendo as ofertas.`)) return;
    run(`f-${g.jid}`, () => ep.saveSourceGroups(fontes.filter((s) => s.jid !== g.jid).map(({ jid, name }) => ({ jid, name }))), `"${g.name}" agora é só divulgação.`).then((o) => o && onResolvido());
  };
  return (
    <div className="mb-4 space-y-3">
      {itens.map((g) => (
        <div key={g.jid} role="status" className="glass flex gap-3 rounded-2xl !border-amber-400/30 !bg-amber-400/[0.08] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cream">“{g.name}” está nas duas listas</p>
            <p className="mt-0.5 text-[13px] text-slate-300">A Namy pode reenviar ao grupo o que ela mesma capturou dele. Deixe só como divulgação ou só como captura.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" busy={busy === `f-${g.jid}`} onClick={() => soDivulgacao(g)}>Só divulgação</Button>
              <Button variant="secondary" busy={busy === `d-${g.jid}`} onClick={() => soCaptura(g)}>Só captura</Button>
            </div>
          </div>
        </div>
      ))}
      <Notice msg={msg} />
    </div>
  );
}

export default function Groups({ query = '' }) {
  const { data, loading, error, reload } = useAsync(ep.waGroups, []);
  const summary = useAsync(ep.affiliateSummary, []);
  const niches = summary.data?.nichos || [];
  const salvos = data?.selected || [];
  const fontesLista = data?.sources || [];
  const savedBy = new Map(salvos.map((g) => [g.jid, g]));
  const fontes = new Set(fontesLista.map((g) => g.jid)); // grupo fonte (captura) nunca é destino
  const [q, setQ] = useState(query);
  const [aba, setAba] = useState(query ? 'todos' : null); // null = escolhe sozinho quando os dados chegam
  const [picked, setPicked] = useState(null); // Set de jids escolhidos (null = ainda não editado)
  const { busy, msg, setMsg, run } = useAction();
  const nicheSaved = (text, tone = 'ok') => { setMsg({ tone, text }); if (tone === 'ok') reload({ silent: true }); };

  const groups = data?.groups || [];
  const selected = picked ?? new Set(salvos.map((g) => g.jid));
  const abaAtual = aba || (salvos.length ? 'divulgacao' : 'todos');
  const conflitos = salvos.filter((g) => fontes.has(g.jid));
  const filtered = useMemo(
    () => groups
      .filter((g) => abaAtual === 'todos' || (abaAtual === 'divulgacao' ? selected.has(g.jid) : fontes.has(g.jid)))
      .filter((g) => g.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.participants - a.participants),
    [groups, q, abaAtual, selected, fontes],
  );
  const dirty = picked !== null;

  const toggle = (jid) => {
    const next = new Set(selected);
    next.has(jid) ? next.delete(jid) : next.add(jid);
    setPicked(next);
  };

  const save = () => run('save', async () => {
    const list = groups.filter((g) => selected.has(g.jid)).map(({ jid, name }) => ({ jid, name }));
    await ep.saveAdGroups(list);
    setPicked(null);
    await reload({ silent: true });
  }, 'Grupos da divulgação salvos.');

  const ABAS = [
    ['divulgacao', 'Divulgação', selected.size],
    ['captura', 'Captura', fontes.size],
    ['todos', 'Todos', groups.length],
  ];

  return (
    <>
      <PageHeader
        title="Grupos"
        subtitle="Onde a Namy publica, o nicho de cada grupo e de onde ela pega ofertas. Grupo com nicho só recebe oferta compatível."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => { setPicked(null); reload(); }}>Atualizar</Button>}
      />

      {!error && <Conflitos itens={conflitos} selecionados={salvos} fontes={fontesLista} onResolvido={() => { setPicked(null); reload({ silent: true }); }} />}
      <Notice className="mb-4" msg={msg} />

      {error ? (
        <Card>
          <EmptyState action={<a href="#configuracoes" className="link-subtle">Conectar WhatsApp</a>}>
            {/intervalo|limite/i.test(error.message) ? `${error.message}.` : `${error.message}. Conecte o WhatsApp para ver seus grupos.`}
          </EmptyState>
        </Card>
      ) : (
        <>
          <nav aria-label="Tipo de grupo" className="glass grid grid-cols-3 gap-1 rounded-2xl p-1">
            {ABAS.map(([id, rotulo, n]) => (
              <button
                key={id} type="button" aria-pressed={abaAtual === id} onClick={() => setAba(id)}
                className={cx('flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-semibold transition', abaAtual === id ? 'bg-white/10 text-cream shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-muted hover:text-cream')}
              >
                {rotulo} <span className="tabular text-xs text-subtle">{loading && !data ? '' : n}</span>
              </button>
            ))}
          </nav>

          <label className="glass mt-3 flex h-12 items-center gap-3 rounded-2xl px-4 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-500/15">
            <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            <span className="sr-only">Filtrar grupos</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Filtrar por nome…" className="min-w-0 flex-1 bg-transparent text-base text-cream placeholder:text-subtle focus:outline-none sm:text-sm" />
            <span className="tabular hidden text-xs text-subtle sm:block">{loading ? 'Carregando…' : `${filtered.length} grupo(s)`}</span>
          </label>

          {abaAtual === 'captura' && (
            <p className="mt-3 text-xs text-muted">Os grupos de captura são escolhidos em <a href="#ofertas" className="link-subtle">Ofertas</a>. Grupo de captura não recebe ofertas.</p>
          )}
          {abaAtual === 'divulgacao' && <p className="mt-3 text-xs text-muted">Para pôr mais grupos na divulgação, abra a aba Todos e ligue a chave deles.</p>}

          {loading && !data && (
            <ul className="mt-3 grid gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Carregando grupos">
              {Array.from({ length: 4 }).map((_, i) => <li key={i}><Skeleton className="h-[132px] rounded-2xl" /></li>)}
            </ul>
          )}
          {!loading && !filtered.length && <div className="mt-3"><EmptyState>{q ? 'Nenhum grupo com esse nome.' : abaAtual === 'divulgacao' ? 'Nenhum grupo na divulgação ainda. Abra a aba Todos e ligue a chave dos grupos onde a Namy pode publicar.' : 'Nenhum grupo aqui.'}</EmptyState></div>}

          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {filtered.map((g, i) => {
              const on = selected.has(g.jid);
              const fonte = fontes.has(g.jid);
              const salvo = savedBy.get(g.jid);
              return (
                <li key={g.jid} className={cx('card min-w-0 p-4 transition', on && '!border-brand-300/25')}>
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-bold', TONS[i % TONS.length])}>{inicial(g.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-cream" title={g.name}>{g.name}</p>
                      <p className="tabular text-xs text-muted">{formatNumber(g.participants)} pessoas</p>
                    </div>
                    <Switch on={on} disabled={fonte && !on} onChange={() => toggle(g.jid)} label={`${on ? 'Tirar' : 'Pôr'} ${g.name} na divulgação`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {on && <Badge variant="success" dot>{salvo ? 'Recebe ofertas' : 'Vai receber ao salvar'}</Badge>}
                    {!on && dirty && savedBy.has(g.jid) && <Badge variant="neutral">Sai da divulgação ao salvar</Badge>}
                    {fonte && <Badge variant="info">Captura ofertas</Badge>}
                    {fonte && on && <Badge variant="warning">Também é captura</Badge>}
                  </div>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    {on && salvo && niches.length > 0 && (
                      <NicheSelect key={`${g.jid}-${salvo.niche}`} group={salvo} niches={niches} onSaved={nicheSaved} />
                    )}
                    <div className="flex min-w-0 flex-1 flex-wrap gap-2 [&>button]:grow">
                      <Button
                        variant="secondary" icon={Send} busy={busy === `test-${g.jid}`}
                        onClick={() => run(`test-${g.jid}`, () => ep.adTestToGroup(g.jid), (o) => o.message || 'Oferta de teste enviada.')}
                      >
                        Testar anúncio
                      </Button>
                      <Button
                        variant="secondary" icon={UserPlus} busy={busy === `imp-${g.jid}`}
                        onClick={() => run(`imp-${g.jid}`, () => ep.importGroupContacts(g.jid), (o) => `${o.total} contatos registrados (sem autorização: autorize em Contatos).`)}
                      >
                        Importar contatos
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dirty && (
        <div className="glass-pop fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+86px)] z-30 mx-auto flex max-w-lg items-center gap-3 p-3 lg:bottom-6 lg:left-[calc(272px+1.5rem)] lg:right-6 lg:mx-0 lg:max-w-none" role="region" aria-label="Seleção não salva">
          <p className="min-w-0 flex-1 text-[13px] text-slate-200"><b className="tabular">{selected.size}</b> grupo(s) na divulgação. Salve para valer.</p>
          <Button variant="ghost" onClick={() => setPicked(null)}>Descartar</Button>
          <Button icon={Save} busy={busy === 'save'} onClick={save}>Salvar</Button>
        </div>
      )}
    </>
  );
}
