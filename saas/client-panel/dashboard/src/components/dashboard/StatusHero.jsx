import { useState } from 'react';
import { Pause, Play, Send } from 'lucide-react';
import { Button, Notice } from '../ui/Form';
import { cx } from '../../lib/format';
import * as ep from '../../services/endpoints';
import { toggleConfig, USE_MOCK } from '../../services/dashboard';

// Anel com os envios de hoje sobre o limite do dia (já com o limite do plano aplicado)
function Anel({ feito, limite }) {
  const pct = limite ? Math.min(100, (feito / limite) * 100) : 0;
  return (
    <div
      className="relative grid h-[78px] w-[78px] shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(#22c55e ${pct}%, rgb(148 163 184 / 0.16) 0)` }}
      role="img"
      aria-label={`${feito} de ${limite} envios hoje`}
    >
      <span className="absolute inset-[7px] rounded-full bg-[#0c1322]" aria-hidden="true" />
      <span className="relative text-center leading-none" aria-hidden="true">
        <span className="tabular block text-xl font-bold text-cream">{feito}/{limite}</span>
        <span className="text-[10.5px] text-muted">hoje</span>
      </span>
    </div>
  );
}

const textoIntervalo = (i) => String(i || '').replace(/^(\d+)m$/, '$1 min').replace(/^(\d+)h$/, '$1 h');

export default function StatusHero({ resumo, connection, onChanged }) {
  const a = resumo?.automacao || {};
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const conectado = connection?.status === 'connected';
  const temNumeros = a.enviadosHoje != null && a.limiteHoje != null;

  const agir = async (id, fn) => {
    setBusy(id);
    setMsg(null);
    try { await fn(); onChanged?.(); } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(''); }
  };
  const enviar = () => {
    // Mesma confirmação de Automações: publica de verdade nos grupos
    const n = resumo?.grupos?.divulgacao ?? 0;
    if (!window.confirm(`Enviar agora? A Namy manda a próxima oferta para ${n} grupo(s) de divulgação, sem esperar o intervalo nem o horário. O limite do dia continua valendo.`)) return;
    agirEnvio();
  };
  const agirEnvio = () => agir('enviar', async () => {
    const o = await ep.runNow();
    setMsg({ tone: o.ok ? 'ok' : 'warn', text: o.message || (o.ok ? 'Envio feito.' : 'Nada foi enviado agora.') });
  });
  const alternar = () => agir('pausa', async () => {
    if (!USE_MOCK) await toggleConfig('ads.enabled', !a.ligada);
    setMsg({ tone: 'ok', text: a.ligada ? 'Automação pausada. Nada sai até você ligar de novo.' : 'Automação ligada.' });
  });

  return (
    <section aria-labelledby="hero-tit" className="card relative overflow-hidden p-5">
      <div
        aria-hidden="true"
        className={cx('pointer-events-none absolute -right-16 -top-24 h-60 w-60 rounded-full blur-3xl', a.ligada && conectado ? 'bg-emerald-500/25' : 'bg-amber-400/15')}
      />
      <div className="relative flex items-center gap-4">
        {temNumeros && <Anel feito={a.enviadosHoje} limite={a.limiteHoje} />}
        <div className="min-w-0">
          <h2 id="hero-tit" className="flex items-center gap-2 text-[17px] font-bold text-cream">
            <span aria-hidden="true" className={cx('h-2.5 w-2.5 rounded-full', a.ligada ? 'bg-positive shadow-[0_0_0_4px_rgba(34,197,94,0.2)]' : 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.2)]')} />
            {a.ligada ? 'Automação ligada' : 'Automação pausada'}
          </h2>
          {a.ligada && a.intervalo && temNumeros && (
            <p className="mt-0.5 text-[13.5px] text-muted">Envia a cada {textoIntervalo(a.intervalo)}, até {a.limiteHoje} ofertas por dia</p>
          )}
          <p className={cx('mt-0.5 text-[13.5px]', conectado ? 'text-muted' : 'text-rose-300')}>
            {conectado ? `WhatsApp conectado${connection.phone ? ` no número final ${connection.phone.slice(-4)}` : ''}` : 'WhatsApp desconectado'}
          </p>
        </div>
      </div>
      {a.frase && <p className="relative mt-3 rounded-xl bg-ink-850 px-3 py-2 text-xs leading-relaxed text-slate-300">{a.frase}</p>}
      <div className="relative mt-4 grid grid-cols-[1.4fr_1fr] gap-2.5">
        <Button size="lg" icon={Send} busy={busy === 'enviar'} disabled={!conectado || !!busy} onClick={enviar}>Enviar agora</Button>
        <Button size="lg" variant="secondary" icon={a.ligada ? Pause : Play} busy={busy === 'pausa'} disabled={!!busy} onClick={alternar}>
          {a.ligada ? 'Pausar' : 'Ligar'}
        </Button>
      </div>
      <Notice className="relative mt-3" msg={msg} />
    </section>
  );
}
