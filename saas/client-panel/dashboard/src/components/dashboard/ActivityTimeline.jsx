import { Card, CardHeader, CardLink } from '../ui/Card';
import IconTile from '../ui/IconTile';
import EmptyState from '../ui/EmptyState';

export default function ActivityTimeline({ items = [] }) {
  return (
    <Card aria-labelledby="activity-title" className="h-full">
      <CardHeader id="activity-title" title="Atividades Recentes" action={<CardLink href="#logs" label="Ver todos os logs">Ver todas</CardLink>} />
      {!items.length && <EmptyState>Sem atividades registradas ainda.</EmptyState>}
      <ol className="relative">
        {items.map((a, i) => (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && (
              <span aria-hidden="true" className="absolute left-[17px] top-10 h-[calc(100%-2.75rem)] w-px bg-line" />
            )}
            <IconTile icon={a.icon} tone={a.tone} size="sm" shape="rounded-full" />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="line-clamp-2 text-sm font-medium text-cream" title={a.title}>{a.title}</p>
              <p className="truncate text-xs text-subtle">{a.detail}</p>
            </div>
            <time className="tabular pt-1 text-xs text-subtle">{a.time}</time>
          </li>
        ))}
      </ol>
    </Card>
  );
}
