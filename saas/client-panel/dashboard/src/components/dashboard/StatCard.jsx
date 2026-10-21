import { ArrowUp } from 'lucide-react';
import IconTile from '../ui/IconTile';
import { formatNumber } from '../../lib/format';

export default function StatCard({ label, value, delta, icon, tone, trend = 'up' }) {
  return (
    <article className="card group p-5 transition-colors hover:border-white/15">
      <IconTile icon={icon} tone={tone} variant="solid" size="lg" shape="rounded-full" />
      <p className="mt-4 text-[13px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[26px] font-semibold leading-none sm:text-[32px] tracking-tight text-cream">
        {formatNumber(value)}
      </p>
      {delta && (
        <p className={`mt-3 flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-positive' : 'text-subtle'}`}>
          {trend === 'up' && <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
          {delta}
        </p>
      )}
    </article>
  );
}
