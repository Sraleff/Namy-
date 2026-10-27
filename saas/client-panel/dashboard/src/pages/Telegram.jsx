import { useState } from 'react';
import { Plus, RefreshCw, Send, Trash2, Unplug } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Field, Input, Notice, Select, Switch } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const TIPO = { channel: 'Canal', supergroup: 'Grupo', group: 'Grupo' };

function Conectar({ d, onChanged }) {
  const [token, setToken] = useState('');
  const { busy, msg, run } = useAction();
  const conectar = () => run('con', () => ep.telegramConnect(token.trim()), 'Bot conectado.').then((o) => { if (o) { setToken(''); onChanged(o); } });
  const sair = () => {
    if (!window.confirm('Desconectar o bot? O token e a lista de canais são apagados do painel.')) return;
    run('sair', () => ep.telegramDisconnect(), 'Bot desconectado.').then((o) => o && onChanged(o));
  };
  return (
    <Card>
      <CardHeader
        title="1. Bot do Telegram"
        subtitle="Crie um bot no @BotFather (comando /newbot) e cole aqui o token que ele mostrar. O token fica cifrado e nunca aparece de novo no painel."
        action={d.conectado ? <Badge variant={d.tokenInvalido ? 'danger' : 'success'}>{d.tokenInvalido ? 'Token recusado' : `@${d.bot.username}`}</Badge> : <Badge>Não conectado</Badge>}
      />
      {!d.cofre && <Notice className="mb-3" msg={{ tone: 'warn', text: 'O servidor ainda não tem a chave mestra (SAAS_MASTER_KEY): não dá para guardar o token.' }} />}
      {d.tokenInvalido && <Notice className="mb-3" msg={{ tone: 'error', text: 'O Telegram recusou o token (bot apagado ou token trocado no @BotFather). Os envios pararam: cole o token novo.' }} />}
      <div className="flex flex-wrap items-end gap-2">
        <Field label={d.conectado ? 'Trocar o token' : 'Token do bot'} htmlFor="tg-token" className="min-w-[16rem] flex-1">
          <Input id="tg-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:ABC..." />
        </Field>
        <Button icon={Send} busy={busy === 'con'} disabled={!token.trim() || !d.cofre} onClick={conectar}>{d.conectado ? 'Trocar' : 'Conectar'}</Button>
        {d.conectado && <Button variant="secondary" icon={Unplug} busy={busy === 'sair'} onClick={sair}>Desconectar</Button>}
      </div>
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}

function Destinos({ d, onChanged }) {
  const [chat, setChat] = useState('');
  const [nicho, setNicho] = useState('todos');
  const { busy, msg, run } = useAction();
  const add = () => run('add', () => ep.telegramAddDestination({ chat: chat.trim(), nicho }), 'Canal adicionado.').then((o) => { if (o) { setChat(''); onChanged(o); } });
  const rm = (id) => run('rm' + id, () => ep.telegramRemoveDestination(id)).then((o) => o && onChanged(o));
  const trocarNicho = (id, n) => run('n' + id, () => ep.telegramDestinationNiche(id, n)).then((o) => o && onChanged(o));
  const testar = (id) => run('t' + id, () => ep.telegramTest(id), 'Mensagem de teste enviada. Confira no Telegram.');
  return (
    <Card className="mt-4">
      <CardHeader title="2. Canais e grupos" subtitle="Adicione o bot como administrador do canal (com permissão de publicar) ou como membro do grupo. Depois informe o @ do canal ou o ID do grupo." />
      {d.conectado ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="@ do canal ou ID do grupo" htmlFor="tg-chat" className="min-w-[14rem] flex-1">
            <Input id="tg-chat" value={chat} onChange={(e) => setChat(e.target.value)} placeholder="@minhasofertas ou -100..." />
          </Field>
          <Field label="Recebe as ofertas de" htmlFor="tg-nicho">
            <Select id="tg-nicho" value={nicho} onChange={(e) => setNicho(e.target.value)}>
              {d.nichos.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </Select>
          </Field>
          <Button icon={Plus} busy={busy === 'add'} disabled={!chat.trim()} onClick={add}>Adicionar</Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Conecte o bot primeiro.</p>
      )}
      <Notice className="mt-3" msg={msg} />
      {d.destinos.length === 0 ? (
        <div className="mt-3"><EmptyState icon={Send}>Nenhum canal ou grupo ainda.</EmptyState></div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {d.destinos.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream" title={x.titulo}>{x.titulo}</span>
                <span className="block text-[11px] text-muted">{TIPO[x.tipo] || x.tipo} · {x.id}</span>
                {x.ultimoErro && <span className="block text-[11px] text-rose-300">Último erro: {x.ultimoErro}</span>}
              </span>
              <Select aria-label={`Nicho de ${x.titulo}`} value={x.nicho} disabled={busy === 'n' + x.id} onChange={(e) => trocarNicho(x.id, e.target.value)} className="w-auto">
                {d.nichos.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </Select>
              <Button size="sm" variant="secondary" icon={Send} busy={busy === 't' + x.id} onClick={() => testar(x.id)}>Testar</Button>
              <Button size="sm" variant="secondary" icon={Trash2} busy={busy === 'rm' + x.id} onClick={() => rm(x.id)} aria-label={`Remover ${x.titulo}`}>Remover</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Ligar({ d, onChanged }) {
  const { busy, msg, run } = useAction();
  const ligar = (v) => run('on', () => ep.telegramToggle(v), v ? 'Espelho ligado: as próximas ofertas da automação vão também para o Telegram.' : 'Espelho desligado.').then((o) => o && onChanged(o));
  return (
    <Card className="mt-4">
      <CardHeader
        title="3. Espelhar as ofertas"
        subtitle="Cada oferta que a automação manda para os grupos do WhatsApp de um nicho vai também para os canais do Telegram desse nicho, com um link de afiliado separado (origem “telegram” em Comissões). “Todos” recebe a primeira oferta de cada rodada."
        action={<Switch on={d.ativo} onChange={ligar} disabled={busy === 'on'} label="Espelhar no Telegram" />}
      />
      <p className="text-xs text-subtle">Com o WhatsApp desconectado a automação não roda, então o Telegram também não recebe.</p>
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}

export default function Telegram() {
  const { data, error, loading, reload, setData } = useAsync(ep.telegramStatus, []);
  return (
    <>
      <PageHeader title="Telegram" subtitle="Leve as mesmas ofertas para canais e grupos do Telegram, pelo seu próprio bot." actions={<Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Atualizar</Button>} />
      {loading && !data && <Card><p className="text-sm text-muted">Carregando…</p></Card>}
      {error && <Card><EmptyState action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reload()}>Tentar de novo</Button>}>{error.message}</EmptyState></Card>}
      {data && (
        <>
          <Conectar d={data} onChanged={setData} />
          <Destinos d={data} onChanged={setData} />
          <Ligar d={data} onChanged={setData} />
        </>
      )}
    </>
  );
}
