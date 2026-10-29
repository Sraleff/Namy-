import { useEffect, useState } from 'react';
import { Bot, MessageSquareText, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Switch } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const COMANDOS = [
  ['!status', 'como está a automação agora'],
  ['!pausar / !retomar', 'pausa e volta a enviar'],
  ['!enviar', 'faz um envio agora'],
  ['!fila', 'as próximas ofertas do banco'],
  ['!oferta <texto>', 'guarda uma oferta (ou responda a uma mensagem com !oferta)'],
  ['!comissao', 'último resumo de comissões'],
];
const UPGRADE = { tone: 'warn', text: 'Faz parte do plano Pro. Veja os planos em Configurações.' };

function Comandos({ d, onChanged }) {
  const { busy, msg, run } = useAction();
  const ligar = (v) => run('cmd', () => ep.brainCommands(v), v ? 'Comandos ligados.' : 'Comandos desligados.').then((o) => o && onChanged(o));
  return (
    <Card>
      <CardHeader
        title="Comandos pelo celular"
        subtitle="No WhatsApp do número conectado, abra a conversa com você mesmo (“Mensagem para você”) e mande !ajuda. A Namy só responde ali, nunca em conversa com outra pessoa."
        action={<Switch on={d.comandos.ativo} onChange={ligar} disabled={busy === 'cmd'} label="Ligar os comandos" />}
      />
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {COMANDOS.map(([c, t]) => (
          <li key={c} className="rounded-lg border border-line px-3 py-2 text-xs"><code className="text-brand-300">{c}</code> <span className="text-muted">— {t}</span></li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-subtle">O !nicho continua funcionando dentro de cada grupo.</p>
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}

function LinhaModeracao({ g, conf, onChanged, liberado }) {
  const [f, setF] = useState(conf || { antiLink: false, antiFlood: false, avisar: false, removerApos: 0 });
  const { busy, msg, run } = useAction();
  useEffect(() => { setF(conf || { antiLink: false, antiFlood: false, avisar: false, removerApos: 0 }); }, [conf]);
  const salvar = () => run('mod', () => ep.brainModeration({ jid: g.jid, ...f }), 'Salvo.').then((o) => o && onChanged(o));
  const ligado = f.antiLink || f.antiFlood;
  return (
    <li className="rounded-xl border border-line px-3 py-2">
      <p className="truncate text-sm text-cream" title={g.name}>{g.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!liberado} checked={f.antiLink} onChange={(e) => setF({ ...f, antiLink: e.target.checked })} className="h-4 w-4 accent-indigo-500" /> Apagar links</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!liberado} checked={f.antiFlood} onChange={(e) => setF({ ...f, antiFlood: e.target.checked })} className="h-4 w-4 accent-indigo-500" /> Apagar excesso (6+ em 30 s)</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!liberado || !ligado} checked={f.avisar} onChange={(e) => setF({ ...f, avisar: e.target.checked })} className="h-4 w-4 accent-indigo-500" /> Avisar no grupo</label>
        <span className="flex items-center gap-1.5">Remover depois de
          <Select aria-label={`Remover em ${g.name}`} disabled={!liberado || !ligado} value={f.removerApos} onChange={(e) => setF({ ...f, removerApos: Number(e.target.value) })} className="w-auto">
            <option value={0}>nunca</option><option value={3}>3 infrações</option><option value={5}>5 infrações</option>
          </Select>
        </span>
        <Button size="sm" icon={Save} busy={busy === 'mod'} disabled={!liberado} onClick={salvar}>Salvar</Button>
      </div>
      <Notice className="mt-2" msg={msg} />
    </li>
  );
}

function Moderacao({ d, onChanged }) {
  return (
    <Card className="mt-4">
      <CardHeader title="Moderação dos grupos" subtitle="O seu número precisa ser admin do grupo. Admins nunca são moderados. Não guardamos quem mandou: os Logs mostram só quantas mensagens foram apagadas." />
      {!d.plano.moderacao && <Notice className="mb-3" msg={UPGRADE} />}
      {d.destinos.length === 0 ? <EmptyState icon={ShieldCheck}>Salve grupos de destino na aba Grupos primeiro.</EmptyState> : (
        <ul className="space-y-1.5">
          {d.destinos.map((g) => <LinhaModeracao key={g.jid} g={g} conf={d.moderacao.grupos[g.jid]} onChanged={onChanged} liberado={d.plano.moderacao} />)}
        </ul>
      )}
    </Card>
  );
}

function Assistente({ d, onChanged }) {
  const [f, setF] = useState(d.ia);
  const { busy, msg, run } = useAction();
  useEffect(() => { setF(d.ia); }, [d.ia]);
  const alternar = (jid) => setF({ ...f, grupos: f.grupos.includes(jid) ? f.grupos.filter((j) => j !== jid) : [...f.grupos, jid] });
  const salvar = () => run('ia', () => ep.brainAssistant(f), 'Assistente salvo.').then((o) => o && onChanged(o));
  const liberado = d.plano.assistente;
  return (
    <Card className="mt-4">
      <CardHeader
        title="Assistente com IA"
        subtitle="Responde quando alguém menciona o seu número ou responde a uma mensagem dele, só nos grupos marcados. Usa a IA e a chave que você salvou em Inteligência Artificial. Nunca escreve preço nem link: para isso, manda conferir a última oferta."
        action={<Switch on={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} disabled={!liberado} label="Ligar o assistente" />}
      />
      {!liberado && <Notice className="mb-3" msg={UPGRADE} />}
      {liberado && !d.iaPronta && <Notice className="mb-3" msg={{ tone: 'warn', text: 'Escolha a IA e salve a sua chave em Inteligência Artificial antes de ligar o assistente.' }} />}
      {d.iaPronta && <p className="mb-3 text-xs text-muted">IA em uso: {d.iaProvedor}.</p>}
      {d.destinos.length === 0 ? <EmptyState icon={Bot}>Salve grupos de destino na aba Grupos primeiro.</EmptyState> : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {d.destinos.map((g) => (
            <li key={g.jid}>
              <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-cream">
                <input type="checkbox" disabled={!liberado} checked={f.grupos.includes(g.jid)} onChange={() => alternar(g.jid)} className="h-4 w-4 shrink-0 accent-indigo-500" />
                <span className="truncate" title={g.name}>{g.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Respostas por hora em cada grupo" htmlFor="ia-lim" hint="Cada pessoa recebe no máximo 1 resposta por minuto.">
          <Input id="ia-lim" type="number" min={1} max={30} disabled={!liberado} value={f.limiteHora} onChange={(e) => setF({ ...f, limiteHora: Number(e.target.value) })} className="w-28" />
        </Field>
        <Button icon={Save} busy={busy === 'ia'} disabled={!liberado} onClick={salvar}>Salvar</Button>
      </div>
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}

export default function Cerebro() {
  const { data, error, loading, reload, setData } = useAsync(ep.getBrain, []);
  return (
    <>
      <PageHeader
        title="Assistente"
        subtitle="A Namy trabalhando no seu WhatsApp: comandos pelo celular, moderação dos grupos e respostas com IA."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Atualizar</Button>}
      />
      {loading && !data && <Card><p className="text-sm text-muted">Carregando…</p></Card>}
      {error && <Card><EmptyState action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reload()}>Tentar de novo</Button>}>{error.message}</EmptyState></Card>}
      {data && (
        <>
          {!data.whatsapp && <Notice className="mb-4" msg={{ tone: 'warn', text: 'O WhatsApp está desconectado: comandos, moderação e assistente só funcionam com ele conectado.' }} />}
          <Comandos d={data} onChanged={setData} />
          <Moderacao d={data} onChanged={setData} />
          <Assistente d={data} onChanged={setData} />
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-subtle"><MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> Nada do que as pessoas escrevem nos grupos é guardado.</p>
        </>
      )}
    </>
  );
}
