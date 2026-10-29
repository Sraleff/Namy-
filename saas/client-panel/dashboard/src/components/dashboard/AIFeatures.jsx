import { useState } from 'react';
import { Card, CardHeader, CardLink } from '../ui/Card';
import IconTile from '../ui/IconTile';
import Badge from '../ui/Badge';
import { toggleConfig, USE_MOCK } from '../../services/dashboard';
import { cx } from '../../lib/format';

function Switch({ on, busy, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
        on ? 'bg-brand-500' : 'bg-ink-700',
      )}
    >
      <span className={cx('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

// Itens com `toggle` (ex.: 'ads.enabled') viram switch ligado ao PUT /config.
export default function AIFeatures({ items = [], onChanged }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const flip = async (f) => {
    setBusy(f.id);
    setError('');
    try {
      if (!USE_MOCK) await toggleConfig(f.toggle, !f.active);
      onChanged?.(f.id, !f.active);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card aria-labelledby="ai-title" className="h-full">
      <CardHeader id="ai-title" title="Inteligência & Automação" action={<CardLink href="#automacoes" label="Configurar automações">Configurar</CardLink>} />
      {error && <p role="alert" className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
      <ul className="-mx-2 space-y-1">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
            <IconTile icon={f.icon} tone={f.active ? 'indigo' : 'blue'} shape="rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-cream">{f.name}</span>
                <Badge variant={f.active ? 'success' : 'neutral'}>{f.active ? 'Ativo' : 'Inativo'}</Badge>
              </span>
              <span className="mt-0.5 block truncate text-xs text-subtle" title={f.description}>{f.description}</span>
            </span>
            {f.toggle && (
              <Switch on={f.active} busy={busy === f.id} onClick={() => flip(f)} label={`${f.active ? 'Desligar' : 'Ligar'} ${f.name}`} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
