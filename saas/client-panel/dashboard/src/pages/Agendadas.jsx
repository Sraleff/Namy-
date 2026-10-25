import { useEffect, useState } from 'react';
import { CalendarClock, Pencil, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Switch, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ymd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const RESULTADO = { ok: ['success', 'Enviada'], parcial: ['warning', 'Parcial'], falhou: ['danger', 'Falhou'], perdida: ['neutral', 'Perdida'] };

function resumoRec(r) {
  if (r.tipo === 'uma') return `Uma vez, ${r.data.split('-').reverse().join('/')} às ${r.hora}`;
  if (r.tipo === 'diaria') return `Todo dia às ${r.hora}`;
  if (r.tipo === 'semanal') return `${r.dias.map((d) => DIAS[d]).join(', ')} às ${r.hora}`;
  return `A cada ${r.cadaDias} dia(s) às ${r.hora}`;
}

const NOVA = { nome: '', texto: '', imagemUrl: '', destinos: [], recorrencia: { tipo: 'diaria', hora: '09:00', dias: [1, 2, 3, 4, 5], cadaDias: 2, data: '' } };

function Editor({ inicial, grupos, onClose, onSaved }) {
  const [f, setF] = useState(inicial ? { ...inicial, recorrencia: { ...NOVA.recorrencia, data: ymd(), ...inicial.recorrencia } } : { ...NOVA, recorrencia: { ...NOVA.recorrencia, data: ymd() } });
  const [proximas, setProximas] = useState([]);
  const { busy, msg, run } = useAction();
  const r = f.recorrencia;
  const setRec = (patch) => setF({ ...f, recorrencia: { ...r, ...patch } });

  useEffect(() => {
    const t = setTimeout(() => {
      ep.previewSchedule(r).then((o) => setProximas(o.proximas || [])).catch(() => setProximas([]));
    }, 400);
    return () => clearTimeout(t);
  }, [r]);

  const alternarGrupo = (jid) => setF({ ...f, destinos: f.destinos.includes(jid) ? f.destinos.filter((j) => j !== jid) : [...f.destinos, jid] });
  const alternarDia = (d) => setRec({ dias: r.dias.includes(d) ? r.dias.filter((x) => x !== d) : [...r.dias, d] });

  const salvar = async () => {
    const corpo = { nome: f.nome, texto: f.texto, imagemUrl: f.imagemUrl, destinos: f.destinos, recorrencia: r };
    const out = await run('save', () => (f.id ? ep.editSchedule({ id: f.id, ...corpo }) : ep.createSchedule(corpo)));
    if (out) onSaved();
  };

  return (
    <Card className="mb-4">
      <CardHeader title={f.id ? 'Editar agenda' : 'Nova agenda'} subtitle="A agenda nasce pausada. Você liga depois, na lista." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Nome" htmlFor="ag-nome"><Input id="ag-nome" value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Bom dia com cupom" /></Field>
          <Field label="Mensagem" htmlFor="ag-texto" hint="Links de Shopee, Mercado Livre e Amazon são trocados pelos seus. Link de convite do seu grupo fica como está.">
            <Textarea id="ag-texto" rows={7} maxLength={3500} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
          </Field>
          <Field label="Imagem (link https, opcional)" htmlFor="ag-img"><Input id="ag-img" type="url" value={f.imagemUrl} onChange={(e) => setF({ ...f, imagemUrl: e.target.value })} placeholder="https://…" /></Field>
        </div>
        <div className="space-y-3">
          <Field label="Quando" htmlFor="ag-tipo">
            <Select id="ag-tipo" value={r.tipo} onChange={(e) => setRec({ tipo: e.target.value })}>
              <option value="uma">Uma vez</option>
              <option value="diaria">Todo dia</option>
              <option value="semanal">Dias da semana</option>
              <option value="cada">A cada N dias</option>
            </Select>
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            {r.tipo === 'uma' && <Field label="Data" htmlFor="ag-data"><Input id="ag-data" type="date" value={r.data} onChange={(e) => setRec({ data: e.target.value })} /></Field>}
            {r.tipo === 'cada' && <Field label="A cada (dias)" htmlFor="ag-cada"><Input id="ag-cada" type="number" min={1} max={60} value={r.cadaDias} onChange={(e) => setRec({ cadaDias: Number(e.target.value) })} /></Field>}
            <Field label="Horário (Brasília)" htmlFor="ag-hora"><Input id="ag-hora" type="time" value={r.hora} onChange={(e) => setRec({ hora: e.target.value })} /></Field>
          </div>
          {r.tipo === 'semanal' && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
              {DIAS.map((d, i) => (
                <button key={d} type="button" aria-pressed={r.dias.includes(i)} onClick={() => alternarDia(i)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${r.dias.includes(i) ? 'border-brand-400 bg-brand-500/20 text-brand-300' : 'border-line text-muted hover:text-cream'}`}>{d}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted">
            {proximas.length ? `Próximas: ${proximas.map((p) => quando.format(new Date(p))).join(' · ')}` : 'Sem próxima data com essa configuração.'}
          </p>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted">Grupos de destino ({f.destinos.length})</legend>
            {grupos.length === 0 ? <p className="text-xs text-muted">Salve grupos de destino na aba Grupos primeiro.</p> : (
              <div className="max-h-44 space-y-1 overflow-auto rounded-xl border border-line bg-ink-850 p-2">
                {grupos.map((g) => (
                  <label key={g.jid} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-cream hover:bg-white/5">
                    <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={f.destinos.includes(g.jid)} onChange={() => alternarGrupo(g.jid)} />
                    <span className="truncate">{g.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
      </div>
      <Notice className="mt-3" msg={msg} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={Save} busy={busy === 'save'} onClick={salvar}>Salvar agenda</Button>
        <Button variant="ghost" icon={X} onClick={onClose}>Cancelar</Button>
      </div>
    </Card>
  );
}

function Linha({ ag, nomes, onChanged, onEdit }) {
  const { busy, msg, run } = useAction();
  const lista = ag.destinos.map((j) => nomes[j] || 'grupo removido').join(', ');
  const ligar = (ativo) => {
    if (ativo && !window.confirm(`Ligar "${ag.nome}"?\n\nA mensagem será enviada automaticamente para:\n${lista}\n\nQuando: ${resumoRec(ag.recorrencia)}.`)) return;
    run('ativo', () => ep.toggleSchedule(ag.id, ativo), ativo ? 'Agenda ligada.' : 'Agenda pausada.').then((o) => o && onChanged());
  };
  const agora = () => {
    if (!window.confirm(`Enviar "${ag.nome}" AGORA para:\n${lista}?`)) return;
    run('agora', () => ep.sendScheduleNow(ag.id)).then((o) => o && onChanged());
  };
  const apagar = () => {
    if (!window.confirm(`Apagar a agenda "${ag.nome}"?`)) return;
    run('apagar', () => ep.removeSchedule(ag.id)).then((o) => o && onChanged());
  };
  const u = ag.ultimaExecucao;
  const [tom, rot] = u ? RESULTADO[u.resultado] || ['neutral', u.resultado] : [];
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-cream">{ag.nome}</h3>
            <Badge variant={ag.ativo ? 'success' : 'neutral'}>{ag.ativo ? 'Ligada' : 'Pausada'}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">{resumoRec(ag.recorrencia)} · {ag.destinos.length} grupo(s)</p>
          <p className="mt-0.5 text-xs text-subtle">{ag.ativo && ag.proximaEm ? `Próximo envio: ${quando.format(new Date(ag.proximaEm))}` : 'Sem envio programado.'}</p>
          {u && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              Última: {quando.format(new Date(u.em))} <Badge variant={tom}>{rot}</Badge> {u.enviados} enviado(s){u.falhas ? `, ${u.falhas} falha(s)` : ''}
              {u.motivo && <span className="text-subtle">· {u.motivo}</span>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch on={ag.ativo} onChange={ligar} disabled={busy === 'ativo'} label={`Ligar ${ag.nome}`} />
          <Button size="sm" variant="secondary" icon={Send} busy={busy === 'agora'} onClick={agora}>Enviar agora</Button>
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(ag)}>Editar</Button>
          <Button size="sm" variant="danger" icon={Trash2} busy={busy === 'apagar'} onClick={apagar}>Apagar</Button>
        </div>
      </div>
      <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-850 p-3 font-sans text-xs text-muted">{ag.texto}</pre>
      {u && u.grupos && u.grupos.some((g) => !g.ok) && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-rose-300">
          {u.grupos.filter((g) => !g.ok).slice(0, 5).map((g) => <li key={g.jid}>{g.name}: {g.erro}</li>)}
        </ul>
      )}
      <Notice className="mt-2" msg={msg} />
    </Card>
  );
}

export default function Agendadas() {
  const { data: d, error, loading, reload } = useAsync(ep.listSchedules, [], { refreshMs: 30000 });
  const [editor, setEditor] = useState(null);
  const lim = useAction();
  const [l, setL] = useState(null);

  useEffect(() => { if (d && !l) setL(d.limites); }, [d, l]);

  const nomes = d ? Object.fromEntries(d.grupos.map((g) => [g.jid, g.name])) : {};
  const recarregar = () => { setEditor(null); reload({ silent: true }); };
  const salvarLim = () => lim.run('lim', () => ep.saveScheduleLimits(l), 'Limites salvos.').then((o) => o && reload({ silent: true }));

  return (
    <>
      <PageHeader
        title="Mensagens agendadas"
        subtitle="Textos que saem sozinhos nos grupos, no dia e hora que você escolher. Cada agenda nasce pausada."
        actions={<Button icon={Plus} onClick={() => setEditor(false)} disabled={!d}>Nova agenda</Button>}
      />
      {loading && !d && <Card><p className="text-sm text-muted">Carregando…</p></Card>}
      {error && <Card><EmptyState action={<Button size="sm" variant="secondary" onClick={() => reload()}>Tentar de novo</Button>}>{error.message}</EmptyState></Card>}
      {d && editor !== null && <Editor key={editor ? editor.id : 'nova'} inicial={editor || undefined} grupos={d.grupos} onClose={() => setEditor(null)} onSaved={recarregar} />}
      {d && (d.agendas.length === 0 && editor === null ? (
        <Card><EmptyState icon={CalendarClock}>Nenhuma agenda ainda. Crie a primeira em “Nova agenda”.</EmptyState></Card>
      ) : d.agendas.map((a) => <Linha key={a.id} ag={a} nomes={nomes} onChanged={recarregar} onEdit={(x) => setEditor(x)} />))}

      {d && l && (
        <Card className="mt-4">
          <CardHeader title="Segurança dos envios" subtitle={`Quanto mais rápido e para mais grupos, maior o risco de o WhatsApp limitar o número. Se o painel ficar fora do ar, a agenda ainda sai até ${d.tolerancia} min depois; passou disso, é pulada.`} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Máximo de grupos por envio" htmlFor="lim-g"><Input id="lim-g" type="number" min={1} max={30} value={l.maxGrupos} onChange={(e) => setL({ ...l, maxGrupos: Number(e.target.value) })} /></Field>
            <Field label="Pausa mínima (s)" htmlFor="lim-a"><Input id="lim-a" type="number" min={3} max={60} value={l.pausaMin} onChange={(e) => setL({ ...l, pausaMin: Number(e.target.value) })} /></Field>
            <Field label="Pausa máxima (s)" htmlFor="lim-b"><Input id="lim-b" type="number" min={3} max={120} value={l.pausaMax} onChange={(e) => setL({ ...l, pausaMax: Number(e.target.value) })} /></Field>
          </div>
          <Notice className="mt-3" msg={lim.msg} />
          <div className="mt-3"><Button size="sm" icon={Save} busy={lim.busy === 'lim'} onClick={salvarLim}>Salvar limites</Button></div>
        </Card>
      )}
    </>
  );
}
