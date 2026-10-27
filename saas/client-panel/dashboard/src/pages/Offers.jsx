import { useState } from 'react';
import { Eye, Plus, Power, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import OfertasTabs from '../components/layout/OfertasTabs';
import { Button, Field, Input, Notice, Select, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const MK = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };
const TIPO = { enviado: ['success', 'Enviado'], pulado: ['warning', 'Pulado'], falha: ['danger', 'Falha'] };
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Preview({ data }) {
  if (!data) return null;
  const p = data.previa;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-ink-850 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={p.ok ? 'success' : 'danger'} dot>{p.ok ? 'Pronta para enviar' : 'Barrada'}</Badge>
        <Badge>Nicho provável: {data.nichoProvavel}</Badge>
        {p.marketplaces.map((m) => <Badge key={m} variant="info">{MK[m] || m}</Badge>)}
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-cream">{p.texto}</pre>
      {p.trocas.length > 0 && (
        <ul className="space-y-1 text-[11px] text-subtle">
          {p.trocas.map((t) => <li key={t.de} className="break-all">✓ {MK[t.marketplace]}: {t.para}{t.aviso ? ` (${t.aviso})` : ''}</li>)}
        </ul>
      )}
      {p.erros.length > 0 && (
        <ul className="space-y-1 text-[11px] text-rose-300">
          {p.erros.map((e, i) => <li key={i} className="break-all">✗ {e.motivo}{e.url ? ` — ${e.url}` : ''}</li>)}
        </ul>
      )}
    </div>
  );
}

function AddOffer({ onAdded }) {
  const [texto, setTexto] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const { busy, msg, run } = useAction();

  const check = () => run('prev', () => ep.previewOffer({ texto })).then((o) => o && setPreview(o));
  const add = () => run('add', () => ep.addPool(texto, imageUrl), (o) => (o.duplicado ? 'Essa oferta já estava no banco.' : 'Oferta guardada no banco.'))
    .then((o) => { if (o) { setTexto(''); setImageUrl(''); setPreview(null); onAdded(); } });

  return (
    <Card aria-labelledby="add-title">
      <CardHeader id="add-title" title="Colar oferta" subtitle="Cole a mensagem como está. Emojis, cupons e quebras de linha ficam iguais; só os links mudam." />
      <div className="space-y-3">
        <Field label="Texto da oferta" htmlFor="of-txt">
          <Textarea id="of-txt" rows={7} value={texto} onChange={(e) => { setTexto(e.target.value); setPreview(null); }} placeholder={'🔥 Air Fryer 4L\n💰 R$ 199\n🎟️ Cupom: CASA10\n👉 https://s.shopee.com.br/…'} />
        </Field>
        <Field label="Foto (opcional)" htmlFor="of-img" hint="URL https da imagem do produto.">
          <Input id="of-img" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Eye} busy={busy === 'prev'} disabled={!texto.trim()} onClick={check}>Ver prévia dos links</Button>
          <Button icon={Plus} busy={busy === 'add'} disabled={!texto.trim()} onClick={add}>Guardar no banco</Button>
        </div>
        <Notice msg={msg} />
        <Preview data={preview} />
      </div>
    </Card>
  );
}

function SourceGroups({ summary, onSaved }) {
  const groups = useAsync(ep.waGroups, []);
  const [picked, setPicked] = useState(null);
  const { busy, msg, run } = useAction();
  const saved = new Set((summary?.fontes || []).map((g) => g.jid));
  const destinos = new Set((summary?.grupos || []).map((g) => g.jid));
  const selected = picked ?? saved;
  const list = (groups.data?.groups || []).filter((g) => !destinos.has(g.jid));

  const toggle = (jid) => {
    const next = new Set(selected);
    next.has(jid) ? next.delete(jid) : next.add(jid);
    setPicked(next);
  };
  const save = () => run('save', async () => {
    await ep.saveSourceGroups(list.filter((g) => selected.has(g.jid)).map(({ jid, name }) => ({ jid, name })));
    setPicked(null);
    onSaved();
  }, 'Grupos fonte salvos.');

  return (
    <Card aria-labelledby="src-title">
      <CardHeader
        id="src-title"
        title="Grupos fonte"
        subtitle="Ofertas com link postadas nesses grupos entram no banco automaticamente. Eles nunca recebem disparo."
        action={<Button size="sm" icon={Save} busy={busy === 'save'} disabled={picked === null} onClick={save}>Salvar</Button>}
      />
      {groups.error ? (
        <EmptyState>Conecte o WhatsApp para escolher grupos fonte.</EmptyState>
      ) : (
        <ul className="max-h-64 divide-y divide-line overflow-auto">
          {list.map((g) => (
            <li key={g.jid}>
              <label className="flex cursor-pointer items-center gap-3 py-2 text-sm text-cream">
                <input type="checkbox" checked={selected.has(g.jid)} onChange={() => toggle(g.jid)} className="h-4 w-4 accent-indigo-500" />
                <span className="truncate">{g.name}</span>
              </label>
            </li>
          ))}
          {!groups.loading && !list.length && <li className="py-2 text-xs text-subtle">Nenhum grupo disponível (grupos de divulgação não podem ser fonte).</li>}
        </ul>
      )}
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}

function PoolList({ data, loading, reload }) {
  const { busy, msg, run } = useAction();
  const [preview, setPreview] = useState(null);
  const itens = data?.itens || [];

  return (
    <Card className="p-0" aria-labelledby="pool-title">
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 id="pool-title" className="text-[15px] font-semibold text-cream">Banco de ofertas</h2>
          <p className="text-xs text-muted">Rodízio: cada grupo recebe a mais nova que ainda não recebeu, se combinar com o nicho.</p>
        </div>
        <Button size="sm" variant="secondary" icon={RefreshCw} busy={loading} onClick={() => reload()}>Atualizar</Button>
      </div>
      <Notice className="m-4" msg={msg} />
      {preview && <div className="px-4"><Preview data={preview} /></div>}
      {!loading && !itens.length && <div className="p-4"><EmptyState>Nenhuma oferta no banco. Cole uma acima ou escolha um grupo fonte.</EmptyState></div>}
      <ul className="divide-y divide-line">
        {itens.map((i) => (
          <li key={i.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            {i.imagemUrl ? <img src={i.imagemUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" /> : <div className="h-14 w-14 shrink-0 rounded-lg bg-ink-750" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cream">{i.nome}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge>{i.nicho}</Badge>
                {i.marketplaces.map((m) => <Badge key={m} variant="info">{MK[m] || m}</Badge>)}
                {i.cupons?.map((c) => <Badge key={c} variant="success">Cupom {c}</Badge>)}
                {i.expirado ? <Badge variant="danger">Vencida</Badge> : !i.ativo && <Badge variant="warning">Pausada</Badge>}
                <span className="text-[11px] text-subtle">{i.origem === 'grupo' ? `de ${i.origemGrupo}` : 'colada'} · {i.envios} grupo(s)</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={Eye} busy={busy === `p-${i.id}`} onClick={() => run(`p-${i.id}`, () => ep.previewOffer({ id: i.id })).then((o) => o && setPreview(o))}>Prévia</Button>
              <Button size="sm" variant="secondary" icon={Power} busy={busy === `t-${i.id}`} onClick={() => run(`t-${i.id}`, () => ep.togglePool(i.id, !i.ativo)).then(() => reload({ silent: true }))}>{i.ativo ? 'Pausar' : 'Ativar'}</Button>
              <Button size="sm" variant="danger" icon={Trash2} busy={busy === `r-${i.id}`} aria-label="Remover oferta" onClick={() => run(`r-${i.id}`, () => ep.removePool(i.id)).then(() => reload({ silent: true }))} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Dispatches() {
  const [tipo, setTipo] = useState('');
  const { data, loading, reload } = useAsync(() => ep.listDispatches(tipo), [tipo], { refreshMs: 30000 });
  const rows = data?.rows || [];
  const r = data?.resumo;
  return (
    <Card className="overflow-x-auto p-0" aria-labelledby="disp-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 id="disp-title" className="text-[15px] font-semibold text-cream">Histórico de disparos</h2>
          {r && <p className="text-xs text-muted">Hoje: {r.hoje.enviados} enviados · {r.hoje.pulados} pulados · {r.hoje.falhas} falhas</p>}
        </div>
        <div className="flex gap-2">
          <Select aria-label="Filtrar tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-36">
            <option value="">Todos</option>
            <option value="enviado">Enviados</option>
            <option value="pulado">Pulados</option>
            <option value="falha">Falhas</option>
          </Select>
          <Button variant="secondary" icon={RefreshCw} busy={loading} onClick={() => reload()} aria-label="Atualizar" />
        </div>
      </div>
      {!loading && !rows.length ? (
        <div className="p-4"><EmptyState>Nada registrado ainda.</EmptyState></div>
      ) : (
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-subtle">
              <th scope="col" className="px-4 py-3 font-medium">Quando</th>
              <th scope="col" className="px-4 py-3 font-medium">Tipo</th>
              <th scope="col" className="px-4 py-3 font-medium">Grupo / nicho</th>
              <th scope="col" className="px-4 py-3 font-medium">Oferta</th>
              <th scope="col" className="px-4 py-3 font-medium">Motivo / detalhe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const [variant, label] = TIPO[row.tipo] || TIPO.pulado;
              return (
                <tr key={`${row.at}-${i}`} className="border-b border-line last:border-0 hover:bg-white/[0.02]">
                  <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{fmt.format(new Date(row.at))}</td>
                  <td className="px-4 py-3"><Badge variant={variant}>{label}</Badge></td>
                  <td className="max-w-[180px] px-4 py-3"><span className="block truncate text-cream" title={row.grupo}>{row.grupo || '—'}</span><span className="text-[11px] text-subtle">{row.nicho}</span></td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-cream" title={row.nome}>{row.nome || '—'}</td>
                  <td className="max-w-[280px] px-4 py-3 text-xs text-subtle">
                    {row.motivo || [row.fonte === 'pool' ? 'banco' : row.fonte, row.marketplaces?.map((m) => MK[m]).join(', '), row.imagem && `imagem ${row.imagem}`, row.cupons?.length ? `cupom ${row.cupons.join(', ')}` : ''].filter(Boolean).join(' · ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function Offers() {
  const summary = useAsync(ep.affiliateSummary, []);
  const poolData = useAsync(ep.listPool, []);
  const mk = summary.data?.marketplaces || {};
  const faltando = Object.entries(mk).filter(([, v]) => !v.ok);

  return (
    <>
      <OfertasTabs active="ofertas" />
      <PageHeader title="Banco de ofertas" subtitle="O que você colou, salvou da Vitrine ou a Namy capturou, com a troca automática de links de afiliado e o histórico de disparos." />
      {faltando.length > 0 && (
        <Notice
          className="mb-4"
          msg={{ tone: 'warn', text: `Oferta com link de ${faltando.map(([k]) => MK[k]).join(', ')} será barrada até você configurar: ${faltando.map(([, v]) => v.motivo).join('; ')}. Veja Configurações → Marketplaces.` }}
        />
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AddOffer onAdded={() => poolData.reload({ silent: true })} />
        <SourceGroups summary={summary.data} onSaved={() => summary.reload({ silent: true })} />
      </div>
      <div className="mt-4 space-y-4">
        <PoolList data={poolData.data} loading={poolData.loading} reload={poolData.reload} />
        <Dispatches />
      </div>
    </>
  );
}
