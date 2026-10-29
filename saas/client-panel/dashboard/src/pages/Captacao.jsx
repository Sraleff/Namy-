import { useEffect, useState } from 'react';
import { Copy, ExternalLink, FlaskConical, Megaphone, RefreshCw, Save, Store, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Switch, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const LOJAS = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };
const HORAS = [[6, '6 horas'], [12, '12 horas'], [24, '1 dia'], [48, '2 dias'], [72, '3 dias'], [168, '7 dias']];
const CONVITE = { ok: ['success', 'Convite ok'], erro: ['danger', 'Sem convite'], 'ainda não lido': ['neutral', 'Ainda não lido'] };
const soma = (lista, campo) => lista.reduce((t, d) => t + (d[campo] || 0), 0);

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sem permissão de clipboard (http, navegador antigo): cai no método clássico
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function Endereco({ url, ativo }) {
  const [copiado, setCopiado] = useState(false);
  const fazer = async () => { if (await copiar(url)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); } };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-850 p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-xs text-cream" title={url}>{url}</code>
      <Button size="sm" variant="secondary" icon={Copy} onClick={fazer}>{copiado ? 'Copiado' : 'Copiar'}</Button>
      {ativo && <a href={url} target="_blank" rel="noreferrer" className="icon-btn h-8 w-8" aria-label="Abrir em outra aba" title="Abrir"><ExternalLink className="h-3.5 w-3.5" /></a>}
    </div>
  );
}

function LinkDeGrupos({ d, onChanged }) {
  const [f, setF] = useState(d.grupos);
  const { busy, msg, run } = useAction();
  const teste = useAction();
  const [escolhido, setEscolhido] = useState(null);
  useEffect(() => { setF(d.grupos); }, [d.grupos]);
  const alternar = (jid) => setF({ ...f, jids: f.jids.includes(jid) ? f.jids.filter((j) => j !== jid) : [...f.jids, jid] });
  const salvar = () => run('save', () => ep.saveCaptacaoGrupos(f), 'Link de grupos salvo.').then((o) => o && onChanged(o));
  const testar = () => teste.run('teste', () => ep.testCaptacao(), (o) => (o.ok ? '' : o.mensagem)).then((o) => {
    if (!o) return;
    setEscolhido(o.ok ? o.grupo : null);
    onChanged({ ...d, status: o.status });
  });
  const status = new Map((d.status || []).map((s) => [s.jid, s]));
  const cliques7 = soma(d.cliques.porDia, 'grupos');

  return (
    <Card>
      <CardHeader
        title="Link de grupos"
        subtitle="Um único link para divulgar. Cada pessoa cai no grupo que ainda tem vaga, e o convite é lido do próprio WhatsApp."
        action={<Switch on={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} label="Ligar o link de grupos" />}
      />
      <Endereco url={d.urls.grupos} ativo={d.grupos.ativo} />
      <p className="mt-2 text-[11px] text-subtle">{cliques7} entrada(s) pelo link nos últimos 7 dias.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Título da página" htmlFor="cg-titulo"><Input id="cg-titulo" maxLength={80} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Achadinhos da Ana" /></Field>
        <Field label="Como distribuir" htmlFor="cg-modo">
          <Select id="cg-modo" value={f.modo} onChange={(e) => setF({ ...f, modo: e.target.value })}>
            <option value="sequencial">Enche um grupo por vez, na ordem</option>
            <option value="equilibrado">Manda para o grupo com menos gente</option>
          </Select>
        </Field>
        <Field label="Descrição" htmlFor="cg-desc" className="sm:col-span-2"><Textarea id="cg-desc" rows={2} maxLength={300} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Ofertas da Shopee com cupom todo dia." /></Field>
        <Field label="Limite de pessoas por grupo" htmlFor="cg-lim" hint="O WhatsApp aceita até 1024. Deixe uma folga para quem entra por convite direto.">
          <Input id="cg-lim" type="number" min={10} max={1024} value={f.limite} onChange={(e) => setF({ ...f, limite: Number(e.target.value) })} />
        </Field>
      </div>

      <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-subtle">Grupos do link (na ordem em que enchem)</p>
      {d.destinos.length === 0 ? (
        <EmptyState icon={Megaphone}>Salve grupos de destino na aba Grupos primeiro.</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {d.destinos.map((g) => {
            const on = f.jids.includes(g.jid);
            const s = status.get(g.jid);
            const [tom, rot] = CONVITE[(s && s.convite) || 'ainda não lido'] || CONVITE['ainda não lido'];
            return (
              <li key={g.jid} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-cream">
                  <input type="checkbox" checked={on} onChange={() => alternar(g.jid)} className="h-4 w-4 shrink-0 accent-indigo-500" />
                  <span className="truncate" title={g.name}>{on ? `${f.jids.indexOf(g.jid) + 1}. ` : ''}{g.name}</span>
                </label>
                {s && s.tamanho != null && <span className="tabular text-xs text-muted">{s.tamanho} pessoas{s.cheio ? ' · cheio' : ''}</span>}
                {s && s.noWhatsapp === false && <Badge variant="danger">A conta não está no grupo</Badge>}
                {on && <Badge variant={tom}>{rot}</Badge>}
                {s && s.erro && <span className="w-full text-[11px] text-rose-300">{s.erro}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-subtle">Para ler o convite, o seu número precisa ser admin do grupo. O tamanho dos grupos é lido a cada 5 minutos.</p>

      {escolhido && <Notice className="mt-3" msg={{ tone: 'ok', text: `Agora o link levaria para "${escolhido.nome}"${escolhido.tamanho != null ? ` (${escolhido.tamanho} pessoas)` : ''}.` }} />}
      <Notice className="mt-3" msg={teste.msg} />
      <Notice className="mt-3" msg={msg} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={Save} busy={busy === 'save'} onClick={salvar}>Salvar</Button>
        <Button variant="secondary" icon={FlaskConical} busy={teste.busy === 'teste'} disabled={!d.grupos.jids.length} onClick={testar}>Testar agora</Button>
      </div>
    </Card>
  );
}

function VitrinePublica({ d, onChanged }) {
  const [f, setF] = useState(d.vitrine);
  const { busy, msg, run } = useAction();
  useEffect(() => { setF(d.vitrine); }, [d.vitrine]);
  const salvar = () => run('save', () => ep.saveCaptacaoVitrine(f), 'Vitrine salva.').then((o) => o && onChanged(o));
  const remover = (id) => run('rm' + id, () => ep.removeCaptacaoItem(id), 'Oferta tirada da vitrine.').then((o) => o && onChanged(o));
  const cliques7 = soma(d.cliques.porDia, 'vitrine');

  return (
    <Card className="mt-4">
      <CardHeader
        title="Vitrine pública"
        subtitle="Uma página com as ofertas que você enviou aos grupos. Cada oferta usa um link seu, separado em Comissões como origem “pagina”."
        action={<Switch on={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} label="Ligar a vitrine pública" />}
      />
      <Endereco url={d.urls.vitrine} ativo={d.vitrine.ativo} />
      <p className="mt-2 text-[11px] text-subtle">{cliques7} clique(s) em ofertas nos últimos 7 dias.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Título da página" htmlFor="cv-titulo"><Input id="cv-titulo" maxLength={80} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Ofertas do dia" /></Field>
        <Field label="Cada oferta fica na vitrine por" htmlFor="cv-horas">
          <Select id="cv-horas" value={f.horas} onChange={(e) => setF({ ...f, horas: Number(e.target.value) })}>
            {HORAS.map(([h, rot]) => <option key={h} value={h}>{rot}</option>)}
          </Select>
        </Field>
        <Field label="Descrição" htmlFor="cv-desc" className="sm:col-span-2"><Textarea id="cv-desc" rows={2} maxLength={300} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-cream">
        <Switch on={f.botaoGrupo} onChange={(v) => setF({ ...f, botaoGrupo: v })} label="Mostrar o botão do link de grupos" />
        <span>Mostrar o botão “Receber ofertas no WhatsApp” (usa o link de grupos, se estiver ligado)</span>
      </div>
      <Notice className="mt-3" msg={msg} />
      <div className="mt-3"><Button icon={Save} busy={busy === 'save'} onClick={salvar}>Salvar</Button></div>

      <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-subtle">Ofertas na vitrine agora</p>
      {d.itens.length === 0 ? (
        <EmptyState icon={Store}>{d.vitrine.ativo ? 'As ofertas aparecem aqui quando saírem para os grupos (automação ou Vitrine).' : 'Ligue a vitrine: as próximas ofertas enviadas aos grupos aparecem aqui.'}</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {d.itens.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              {i.imageUrl ? <img src={i.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-ink-850" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream" title={i.nome}>{i.nome}</span>
                <span className="block text-[11px] text-muted">{[i.preco, LOJAS[i.marketplace], `${i.cliques} clique(s)`].filter(Boolean).join(' · ')}</span>
              </span>
              <Button size="sm" variant="secondary" icon={Trash2} busy={busy === 'rm' + i.id} onClick={() => remover(i.id)} aria-label={`Tirar ${i.nome} da vitrine`}>Tirar</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Captacao() {
  const { data, error, loading, reload, setData } = useAsync(ep.getCaptacao, [], { refreshMs: 60000 });
  const end = useAction();
  const trocar = () => {
    if (!window.confirm('Gerar um endereço novo? Os links antigos (de grupos e da vitrine) param de funcionar na hora.')) return;
    end.run('end', () => ep.newCaptacaoAddress(), 'Endereço novo gerado. Atualize onde você divulgou o link antigo.').then((o) => o && setData(o));
  };

  return (
    <>
      <PageHeader
        title="Captação"
        subtitle="Um link para divulgar seus grupos e uma vitrine pública com as suas ofertas. O visitante não é registrado: guardamos só a contagem de cliques."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Atualizar</Button>}
      />
      {loading && !data && <Card><p className="text-sm text-muted">Carregando…</p></Card>}
      {error && <Card><EmptyState action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reload()}>Tentar de novo</Button>}>{error.message}</EmptyState></Card>}
      {data && (
        <>
          {data.local && <Notice className="mb-4" msg={{ tone: 'warn', text: 'Estes endereços só abrem neste computador. Para divulgar, o painel precisa estar publicado na internet (PUBLIC_URL no .env do servidor).' }} />}
          {!data.whatsapp && <Notice className="mb-4" msg={{ tone: 'warn', text: 'WhatsApp desconectado: o link usa os convites que já foram lidos. Grupos sem convite lido só entram quando reconectar.' }} />}
          <LinkDeGrupos d={data} onChanged={setData} />
          <VitrinePublica d={data} onChanged={setData} />
          <Card className="mt-4">
            <CardHeader title="Endereço" subtitle="O endereço é aleatório e não mostra seu e-mail nem seu número. Se ele vazar para quem não deve, gere outro." />
            <Notice className="mb-3" msg={end.msg} />
            <Button variant="secondary" icon={RefreshCw} busy={end.busy === 'end'} onClick={trocar}>Gerar endereço novo</Button>
          </Card>
        </>
      )}
    </>
  );
}
