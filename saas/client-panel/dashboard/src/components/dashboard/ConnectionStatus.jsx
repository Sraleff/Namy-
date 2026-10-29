import { useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import { reconnectWhatsApp, USE_MOCK } from '../../services/dashboard';
import { cx } from '../../lib/format';
import { Card, CardHeader } from '../ui/Card';
import WhatsAppIcon from '../ui/WhatsAppIcon';

const labels = {
  connected: { text: 'Conectado', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25' },
  connecting: { text: 'Conectando…', cls: 'bg-amber-400/15 text-amber-300 ring-amber-400/25' },
  disconnected: { text: 'Desconectado', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/25' },
};

export default function ConnectionStatus({ connection, onReconnected }) {
  const s = labels[connection.status] ?? labels.disconnected;
  const ok = connection.status === 'connected';
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const reconnect = async () => {
    if (USE_MOCK) return;
    setBusy(true);
    setMsg('');
    try {
      await reconnectWhatsApp();
      onReconnected?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="conn-title" className="flex flex-col">
      <CardHeader id="conn-title" title="Status da Conexão" />

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <WhatsAppIcon className="h-6 w-6" />
        </span>
        <span className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset ${s.cls}`} role="status">
          {s.text}
        </span>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="text-cream">{connection.label}</div>
        <div className="flex gap-2">
          <dt className="text-muted">Número:</dt>
          <dd className="tabular text-cream">{connection.phone}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">Versão:</dt>
          <dd className="tabular text-cream">{connection.version}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        {ok && !msg ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-positive">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Tudo funcionando normalmente!
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {msg || connection.error || 'WhatsApp desconectado.'}{' '}
              <a href="#configuracoes" className="link-subtle">Conectar agora</a>
            </span>
          </p>
        )}
        <button type="button" onClick={reconnect} disabled={busy} className="icon-btn h-8 w-8 shrink-0 disabled:opacity-50" aria-label="Reconectar sessão" title="Reconectar">
          <RotateCw className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
      </div>
    </Card>
  );
}
