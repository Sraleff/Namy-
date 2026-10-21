import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, Pause, Play, Plus, RotateCcw, ShoppingBag, Users, X, XCircle } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { cx, formatDate } from '../lib/format';

const STATUS = {
  rascunho: ['neutral', 'Rascunho'],
  agendada: ['warning', 'Agendada'],
  rodando: ['info', 'Enviando'],
  pausada: ['warning', 'Pausada'],
  cancelada: ['danger', 'Cancelada'],
  concluida: ['success', 'Concluída'],
};
const TIPOS = { grupo: 'Divulgar um grupo', oferta: 'Oferta Shopee', promocao: 'Promoção com desconto real' };

function NewCampaign({ onCreated, onCancel }) {
  const [f, setF] = useState({ name: '', type: 'oferta', message: '', scheduledAt: '', intervalSec: 30, dailyCap: 20, cooldownHours: 24 });
  const { busy, msg, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const body = { ...f, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null };
    run('create', () => ep.createCampaign(body)).then((o) => o && onCreated(o.campaign));
  };

  return (
    <Card aria-labelledby="new-title">
      <CardHeader id="new-title" title="Nova campanha" action={<button type="button" onClick={onCancel} className="icon-btn h-8 w-8" aria-label="Fechar"><X className="h-4 w-4" /></button>} />
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="nc-name" className="sm:col-span-2"><Input id="nc-name" required maxLength={80} value={f.name} onChange={set('name')} placeholder="Ex.: Ofertas de sexta" /></Field>
        <Field label="Tipo" htmlFor="nc-type">
          <Select id="nc-type" value={f.type} onChange={set('type')}>
            {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Agendar para (opcional)" htmlFor="nc-when"><Input id="nc-when" type="datetime-local" value={f.scheduledAt} onChange={set('scheduledAt')} /></Field>
        <Field label="Mensagem" htmlFor="nc-msg" className="sm:col-span-2" hint={f.type === 'grupo' ? 'O link do grupo é adicionado no final.' : 'Ofertas usam o texto gerado pela API; isto é só um complemento.'}>
          <Textarea id="nc-msg" maxLength={1000} value={f.message} onChange={set('message')} />
        </Field>
        <Field label="Intervalo entre envios (s)" htmlFor="nc-int" hint="20 a 3600"><Input id="nc-int" type="number" min={20} max={3600} value={f.intervalSec} onChange={set('intervalSec')} /></Field>
        <Field label="Limite por dia" htmlFor="nc-cap" hint="1 a 50"><Input id="nc-cap" type="number" min={1} max={50} value={f.dailyCap} onChange={set('dailyCap')} /></Field>
        <Notice msg={msg} className="sm:col-span-2" />
        <div className="sm:col-span-2"><Button type="submit" icon={Plus} busy={busy === 'create'}>Criar rascunho</Button></div>
      </form>
    </Card>
  );
}

function Step({ n, title, done, children }) {
  return (
    <div className="relative pl-9">
      <span className={cx('absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-emerald-500 text-white' : 'bg-ink-700 text-muted')}>
        {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : n}
      </span>
      <p className="text-sm font-medium text-cream">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function CampaignDetail({ camp, report, onUpdated, onClose }) {
  const { busy, msg, run } = useAction();
  const contacts = useAsync(ep.listContacts, [camp.id]);
  const groups = useAsync(ep.waGroups, [camp.id], { enabled: camp.type === 'grupo' });
  const [jid, setJid] = useState(camp.groupJid || '');
  const [pasted, setPasted] = useState('');
  const authorized = (contacts.data?.contacts || []).filter((c) => c.consent === 'autorizado');
  const [chosen, setChosen] = useState(() => new Set((camp.recipients || []).map((r) => r.contactId)));
  const editable = camp.status === 'rascunho' || camp.status === 'pausada';
  const draft = camp.status === 'rascunho';
  const [variant, label] = STATUS[camp.status] || STATUS.rascunho;

  useEffect(() => setChosen(new Set((camp.recipients || []).map((r) => r.contactId))), [camp]);

  const act = (key, fn, ok) => run(key, fn, ok).then((o) => o?.campaign && onUpdated(o.campaign));
  const hasContent = camp.type === 'grupo' ? !!camp.inviteUrl : !!camp.content?.link;

  return (
    <Card aria-labelledby="det-title">
      <CardHeader
        id="det-title"
        title={camp.name}
        subtitle={`${TIPOS[camp.type]} · criada em ${formatDate(camp.createdAt.slice(0, 10))}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={variant}>{label}</Badge>
            <button type="button" onClick={onClose} className="icon-btn h-8 w-8" aria-label="Fechar detalhes"><X className="h-4 w-4" /></button>
          </div>
        }
      />

      {report && (
        <dl className="mb-5 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
          {[['Destinatários', report.destinatarios], ['Na fila', report.fila], ['Aceitos', report.aceitos], ['Incertos', report.incertos], ['Falhas', report.falhas]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-ink-850 px-2 py-3">
              <dd className="tabular text-lg font-semibold text-cream">{v}</dd>
              <dt className="text-[11px] text-subtle">{l}</dt>
            </div>
          ))}
        </dl>
      )}
      {camp.lastError && <Notice className="mb-4" msg={{ tone: 'warn', text: camp.lastError }} />}

      <div className="space-y-6">
        <Step n={1} title={camp.type === 'grupo' ? 'Link do grupo' : 'Oferta da Shopee'} done={hasContent}>
          {camp.type === 'grupo' ? (
            <div className="space-y-2">
              {camp.inviteUrl && <p className="break-all text-xs text-brand-300">{camp.inviteUrl}</p>}
              {draft && (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select aria-label="Grupo" value={jid} onChange={(e) => setJid(e.target.value)} className="flex-1">
                      <option value="">{groups.error ? 'WhatsApp desconectado' : 'Escolha o grupo…'}</option>
                      {(groups.data?.groups || []).map((g) => <option key={g.jid} value={g.jid}>{g.name}</option>)}
                    </Select>
                    <Button variant="secondary" icon={Link2} disabled={!jid} busy={busy === 'inv'} onClick={() => act('inv', () => ep.fetchInvite(jid, camp.id), 'Link do grupo obtido.')}>Buscar link</Button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input aria-label="Colar link de convite" placeholder="ou cole https://chat.whatsapp.com/…" value={pasted} onChange={(e) => setPasted(e.target.value)} className="flex-1" />
                    <Button variant="secondary" disabled={!pasted} busy={busy === 'paste'} onClick={() => act('paste', () => ep.pasteInvite(camp.id, pasted), 'Link salvo.')}>Usar link</Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {camp.content?.nome && (
                <div className="rounded-xl bg-ink-850 p-3 text-xs">
                  <p className="font-medium text-cream">{camp.content.nome}</p>
                  {camp.content.desconto ? <p className="text-emerald-300">{camp.content.desconto}% de desconto</p> : null}
                  <p className="mt-1 break-all text-brand-300">{camp.content.link}</p>
                </div>
              )}
              {draft && <Button variant="secondary" icon={ShoppingBag} busy={busy === 'offer'} onClick={() => act('offer', () => ep.attachOffer(camp.id), (o) => o.aviso || 'Oferta anexada.')}>{camp.content ? 'Trocar oferta' : 'Buscar oferta'}</Button>}
            </div>
          )}
        </Step>

        <Step n={2} title={`Destinatários (${chosen.size})`} done={(camp.recipients || []).length > 0}>
          {!authorized.length ? (
            <p className="text-xs text-subtle">Nenhum contato autorizado. Autorize em <a href="#contatos" className="link-subtle">Contatos</a>.</p>
          ) : (
            <>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2 scrollbar-thin">
                {authorized.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                    <input
                      type="checkbox" className="h-4 w-4 accent-indigo-500" disabled={!editable} checked={chosen.has(c.id)}
                      onChange={() => { const n = new Set(chosen); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setChosen(n); }}
                    />
                    <span className="truncate text-cream">{c.label}</span>
                    <span className="tabular ml-auto text-xs text-subtle">{c.phone && `+${c.phone}`}</span>
                  </label>
                ))}
              </div>
              {editable && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setChosen(new Set(authorized.map((c) => c.id)))}>Marcar todos</Button>
                  <Button size="sm" variant="secondary" icon={Users} busy={busy === 'rec'} onClick={() => act('rec', () => ep.setRecipients(camp.id, [...chosen]), (o) => `Lista salva${o.pulados?.length ? ` (${o.pulados.length} pulados)` : ''}.`)}>Salvar lista</Button>
                </div>
              )}
            </>
          )}
        </Step>

        <Step n={3} title="Aprovar e enviar" done={!draft}>
          <p className="mb-2 text-xs text-subtle">Os envios saem um a um, respeitando intervalo de {camp.intervalSec}s e limite de {camp.dailyCap}/dia.</p>
          <div className="flex flex-wrap gap-2">
            {(draft || camp.status === 'agendada') && <Button icon={CheckCircle2} busy={busy === 'ok'} onClick={() => act('ok', () => ep.campaignAction('aprovar', camp.id), 'Campanha aprovada.')}>Aprovar</Button>}
            {['rodando', 'agendada'].includes(camp.status) && <Button variant="secondary" icon={Pause} busy={busy === 'pause'} onClick={() => act('pause', () => ep.campaignAction('pausar', camp.id), 'Pausada.')}>Pausar</Button>}
            {camp.status === 'pausada' && <Button icon={Play} busy={busy === 'go'} onClick={() => act('go', () => ep.campaignAction('retomar', camp.id), 'Retomada.')}>Retomar</Button>}
            {report?.incertos > 0 && !['cancelada', 'concluida'].includes(camp.status) && (
              <Button variant="secondary" icon={RotateCcw} busy={busy === 'retry'} onClick={() => act('retry', () => ep.campaignAction('reenviar-incertos', camp.id), (o) => `${o.reabertos} reabertos.`)}>Reenviar incertos</Button>
            )}
            {!['cancelada', 'concluida'].includes(camp.status) && (
              <Button variant="danger" icon={XCircle} busy={busy === 'cancel'} onClick={() => window.confirm('Cancelar esta campanha?') && act('cancel', () => ep.campaignAction('cancelar', camp.id), 'Cancelada.')}>Cancelar</Button>
            )}
          </div>
        </Step>
      </div>
      <Notice className="mt-5" msg={msg} />
    </Card>
  );
}

export default function Campaigns({ param = '' }) {
  const { data, loading, error, reload, setData } = useAsync(ep.listCampaigns, [], { refreshMs: 15000 });
  const [creating, setCreating] = useState(param === 'nova');
  const [openId, setOpenId] = useState(param && param !== 'nova' ? param : null);
  const [filter, setFilter] = useState('');

  const campaigns = data?.campaigns || [];
  const reports = useMemo(() => Object.fromEntries((data?.relatorio || []).map((r) => [r.id, r])), [data]);
  const list = campaigns.filter((c) => !filter || c.status === filter);
  const open = campaigns.find((c) => c.id === openId);

  const updated = (camp) => {
    setData((d) => ({ ...d, campaigns: d.campaigns.some((c) => c.id === camp.id) ? d.campaigns.map((c) => (c.id === camp.id ? camp : c)) : [camp, ...d.campaigns] }));
    reload({ silent: true });
  };

  return (
    <>
      <PageHeader
        title="Campanhas"
        subtitle="Mensagens no privado só para contatos que autorizaram."
        actions={
          <>
            <Select aria-label="Filtrar status" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
              <option value="">Todos status</option>
              {Object.entries(STATUS).map(([v, [, l]]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Button icon={Plus} onClick={() => { setCreating(true); setOpenId(null); }}>Nova campanha</Button>
          </>
        }
      />
      {error && <Notice className="mb-4" msg={{ tone: 'error', text: error.message }} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="p-0">
          {!loading && !list.length && <div className="p-4"><EmptyState>Nenhuma campanha ainda.</EmptyState></div>}
          <ul className="divide-y divide-line">
            {list.map((c) => {
              const [variant, label] = STATUS[c.status] || STATUS.rascunho;
              const r = reports[c.id];
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setOpenId(c.id); setCreating(false); }}
                    className={cx('flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.03]', openId === c.id && 'bg-brand-500/[0.07]')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-cream">{c.name}</span>
                      <span className="block text-xs text-subtle">{TIPOS[c.type]} · {formatDate((c.updatedAt || c.createdAt).slice(0, 10))}</span>
                    </span>
                    {r && <span className="tabular hidden text-xs text-muted sm:block">{r.aceitos}/{r.destinatarios}</span>}
                    <Badge variant={variant}>{label}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div>
          {creating && <NewCampaign onCancel={() => setCreating(false)} onCreated={(camp) => { setCreating(false); updated(camp); setOpenId(camp.id); }} />}
          {!creating && open && <CampaignDetail camp={open} report={reports[open.id]} onUpdated={updated} onClose={() => setOpenId(null)} />}
          {!creating && !open && (
            <Card><EmptyState action={<Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Nova campanha</Button>}>Selecione uma campanha para ver detalhes.</EmptyState></Card>
          )}
        </div>
      </div>
    </>
  );
}
