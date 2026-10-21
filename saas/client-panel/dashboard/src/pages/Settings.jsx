import { useEffect, useRef, useState } from 'react';
import { CreditCard, LogOut, Plug, PlugZap, RotateCw, Save } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import { Button, Field, Input, Notice } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { formatDate } from '../lib/format';

const STATUS = {
  connected: ['success', 'Conectado'],
  connecting: ['warning', 'Conectando…'],
  waiting_code: ['warning', 'Aguardando QR / código'],
  reconnecting: ['warning', 'Reconectando…'],
  error: ['danger', 'Erro'],
  disconnected: ['neutral', 'Desconectado'],
};

function WhatsAppCard({ initialPhone, onChanged }) {
  const [st, setSt] = useState(null);
  const [phone, setPhone] = useState(initialPhone || '');
  const { busy, msg, run } = useAction();
  const timer = useRef(null);
  const prev = useRef(null);

  // Enquanto pareia, consulta a cada 2,5s (QR e código mudam); conectado, a cada 10s
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      let next = 2500;
      try {
        const s = await ep.waStatus();
        if (!alive) return;
        setSt(s);
        if (s.status !== prev.current && (s.status === 'connected' || prev.current === 'connected')) onChanged?.();
        prev.current = s.status;
        if (s.connected) next = 10000;
      } catch { /* mantém último estado */ }
      if (alive) timer.current = setTimeout(tick, next);
    };
    tick();
    return () => { alive = false; clearTimeout(timer.current); };
  }, [onChanged]);

  const [variant, label] = STATUS[st?.status] || STATUS.disconnected;
  const connected = st?.connected;
  const pairing = ['connecting', 'waiting_code', 'reconnecting'].includes(st?.status);

  return (
    <Card aria-labelledby="wa-title">
      <CardHeader id="wa-title" title="Conexão do WhatsApp" subtitle="Sessão real no servidor (Baileys)" action={<Badge variant={variant} dot>{label}</Badge>} />

      {!connected && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); run('connect', () => ep.waConnect(phone), 'Gerando QR Code e código de pareamento…').then((o) => o && setSt((x) => ({ ...x, ...o }))); }}
        >
          <Field label="Número com DDI + DDD" htmlFor="wa-phone" className="flex-1" hint="Ex.: 5511999999999 — o mesmo número do WhatsApp que vai virar bot.">
            <Input id="wa-phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="5511999999999" />
          </Field>
          <Button type="submit" icon={PlugZap} busy={busy === 'connect'} disabled={phone.length < 10} className="sm:mb-[22px]">Conectar</Button>
        </form>
      )}

      {(st?.pairingCode || st?.qrDataUrl) && !connected && (
        <div className="mt-5 grid gap-5 rounded-xl border border-line bg-ink-850 p-5 md:grid-cols-2">
          {st.pairingCode && (
            <div>
              <p className="text-xs font-medium text-muted">Código de pareamento</p>
              <p className="tabular mt-2 font-mono text-3xl font-bold tracking-[0.25em] text-cream">{st.pairingCode}</p>
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → <b className="text-muted">Conectar com número de telefone</b> e digite o código.
              </p>
            </div>
          )}
          {st.qrDataUrl && (
            <div className="flex flex-col items-center gap-2">
              <img src={st.qrDataUrl} alt="QR Code para conectar o WhatsApp" className="h-48 w-48 rounded-lg bg-white p-2" />
              <p className="text-xs text-subtle">Ou escaneie em Aparelhos conectados</p>
            </div>
          )}
        </div>
      )}

      {connected && (
        <p className="text-sm text-muted">
          Conectado como <span className="tabular text-cream">+{st.phone}</span>. O bot já pode publicar e responder.
        </p>
      )}

      {st?.error && <Notice className="mt-4" msg={{ tone: 'warn', text: st.error }} />}
      <Notice className="mt-4" msg={msg} />

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" size="sm" icon={RotateCw} busy={busy === 'rec'} onClick={() => run('rec', ep.waReconnect, 'Reconectando…')}>Reconectar</Button>
        {(connected || pairing) && (
          <Button variant="secondary" size="sm" icon={Plug} busy={busy === 'stop'} onClick={() => run('stop', () => ep.waDisconnect(false), 'Sessão pausada. Os dados de login continuam salvos.')}>Pausar sessão</Button>
        )}
        <Button
          variant="danger" size="sm" icon={LogOut} busy={busy === 'out'}
          onClick={() => window.confirm('Desconectar e apagar o pareamento? Vai precisar parear de novo.') && run('out', () => ep.waDisconnect(true), 'WhatsApp desconectado.')}
        >
          Desconectar e esquecer
        </Button>
      </div>
    </Card>
  );
}

function BotCard({ cfg, onSaved }) {
  const [botName, setBotName] = useState(cfg.botName || '');
  const { busy, msg, run } = useAction();
  return (
    <Card aria-labelledby="bot-title">
      <CardHeader id="bot-title" title="Bot" />
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); run('save', () => ep.saveConfig({ botName }), 'Salvo.').then((c) => c && onSaved(c)); }}
      >
        <Field label="Nome do bot" htmlFor="bot-name">
          <Input id="bot-name" value={botName} maxLength={40} onChange={(e) => setBotName(e.target.value)} />
        </Field>
        <Field label="Prefixo dos comandos">
          <Input value={cfg.prefix || '!'} disabled />
        </Field>
        <Notice msg={msg} />
        <Button type="submit" icon={Save} busy={busy === 'save'}>Salvar</Button>
      </form>
    </Card>
  );
}

function PlanCard({ cfg, onSynced }) {
  const plans = useAsync(ep.getPlans, []);
  const { busy, msg, setMsg, run } = useAction();
  const lic = cfg.license || {};
  const exp = lic.expiresAt ? new Date(lic.expiresAt) : null;
  const active = lic.active && exp && exp > new Date();

  // Volta do Mercado Pago: /app/?pago=ok&payment_id=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const pago = q.get('pago');
    const paymentId = (q.get('payment_id') || q.get('collection_id') || '').replace(/\D/g, '');
    if (!pago && !paymentId) return;
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    if (pago === 'falhou') return setMsg({ tone: 'error', text: 'Pagamento não aprovado.' });
    if (!paymentId) return setMsg({ tone: 'info', text: 'Pagamento pendente. A licença atualiza quando o Mercado Pago aprovar.' });
    run('sync', () => ep.syncPayment(paymentId), (o) => (o.status === 'approved' ? 'Pagamento confirmado. Licença atualizada!' : `Mercado Pago: ${o.status || 'pendente'}`))
      .then((o) => o?.config && onSynced(o.config));
  }, [run, setMsg, onSynced]);

  const pay = (plan) => run(plan, async () => {
    const out = await ep.checkout(plan);
    const url = out.initPoint || out.sandboxInitPoint;
    if (!url) throw new Error('Checkout sem link');
    window.location.href = url;
  });

  return (
    <Card aria-labelledby="plan-title" id="plano">
      <CardHeader id="plan-title" title="Conta e plano" action={<Badge variant={active ? 'success' : 'danger'}>{active ? 'Ativa' : 'Inativa'}</Badge>} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-subtle">E-mail</dt><dd className="truncate text-cream">{cfg.email}</dd></div>
        <div><dt className="text-xs text-subtle">Plano</dt><dd className="capitalize text-cream">{lic.plan || '—'}</dd></div>
        <div><dt className="text-xs text-subtle">Vence em</dt><dd className="text-cream">{exp ? formatDate(exp.toISOString().slice(0, 10)) : '—'}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        {(plans.data?.plans || []).map((p) => (
          <Button key={p.id} icon={CreditCard} busy={busy === p.id} disabled={!plans.data?.configured} onClick={() => pay(p.id)} variant={p.id === 'mensal' ? 'primary' : 'secondary'}>
            {p.label} — R$ {p.price}
          </Button>
        ))}
      </div>
      {plans.data && !plans.data.configured && (
        <p className="mt-3 text-xs text-subtle">Checkout do Mercado Pago ainda não configurado neste servidor (MP_ACCESS_TOKEN). O teste de 30 dias segue valendo.</p>
      )}
      <Notice className="mt-3" msg={msg} />
    </Card>
  );
}

export default function Settings({ onDataChanged }) {
  const { data: cfg, loading, error, setData } = useAsync(ep.getConfig, []);

  if (loading && !cfg) return <PageHeader title="Configurações" subtitle="Carregando…" />;
  if (error) return <Notice msg={{ tone: 'error', text: error.message }} />;

  return (
    <>
      <PageHeader title="Configurações" subtitle="WhatsApp, bot e assinatura." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <WhatsAppCard initialPhone={cfg.phone} onChanged={onDataChanged} />
        <div className="space-y-4">
          <BotCard cfg={cfg} onSaved={setData} />
          <PlanCard cfg={cfg} onSynced={setData} />
        </div>
      </div>
    </>
  );
}
