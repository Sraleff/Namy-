import { Users } from 'lucide-react';
import { Card, CardHeader, CardLink } from '../ui/Card';
import IconTile from '../ui/IconTile';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { formatDate, formatNumber } from '../../lib/format';

const status = {
  done: { label: 'Concluída', variant: 'success' },
  running: { label: 'Enviando', variant: 'info' },
  scheduled: { label: 'Agendada', variant: 'warning' },
  paused: { label: 'Pausada', variant: 'warning' },
  draft: { label: 'Rascunho', variant: 'neutral' },
  failed: { label: 'Cancelada', variant: 'danger' },
};

export default function CampaignsList({ items = [] }) {
  return (
    <Card aria-labelledby="campaigns-title" className="h-full">
      <CardHeader id="campaigns-title" title="Campanhas" action={<CardLink href="#campanhas" label="Ver todas as campanhas">Ver todas</CardLink>} />
      {!items.length && <EmptyState>Nenhuma campanha ainda. <a href="#campanhas/nova" className="link-subtle">Criar a primeira</a></EmptyState>}
      <ul className="-mx-2 space-y-1">
        {items.map((c) => {
          const s = status[c.status] ?? status.done;
          return (
            <li key={c.id}>
              <a href={`#campanhas/${c.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
                <IconTile icon={c.icon} tone={c.tone} variant="solid" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-cream">{c.name}</p>
                  <p className="truncate text-xs text-subtle">{c.status === 'draft' ? 'Atualizada em' : 'Enviada em'} {formatDate(c.sentAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={s.variant}>{s.label}</Badge>
                  <p className="tabular flex items-center gap-1 text-[11px] text-muted" title="Entregues / total">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Entregues:</span>
                    {formatNumber(c.delivered)}/{formatNumber(c.total)}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
