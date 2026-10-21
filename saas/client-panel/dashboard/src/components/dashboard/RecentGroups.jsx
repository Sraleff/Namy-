import { Card, CardHeader, CardLink } from '../ui/Card';
import IconTile from '../ui/IconTile';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { formatNumber } from '../../lib/format';

export default function RecentGroups({ items = [], live = true }) {
  return (
    <Card aria-labelledby="groups-title" className="h-full">
      <CardHeader
        id="groups-title"
        title="Grupos"
        subtitle={live ? 'Maiores grupos do seu WhatsApp' : 'Salvos (WhatsApp offline)'}
        action={<CardLink href="#grupos" label="Gerenciar grupos">Gerenciar</CardLink>}
      />
      {!items.length ? (
        <EmptyState>Conecte o WhatsApp para listar seus grupos.</EmptyState>
      ) : (
        <ul className="-mx-2 space-y-1">
          {items.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
              <IconTile icon={g.icon} tone={g.tone} variant="solid" size="lg" shape="rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-cream" title={g.name}>{g.name}</span>
                <span className="block text-xs text-subtle">
                  {g.members == null ? 'membros indisponíveis' : `${formatNumber(g.members)} membros`}
                </span>
              </span>
              {g.selected && <Badge variant="info">Divulgação</Badge>}
              {g.lastActivity && (
                <span className="text-xs text-subtle">
                  <span className="sr-only">Última atividade há </span>• {g.lastActivity}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
