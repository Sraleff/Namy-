import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { useAsync } from '../../hooks/useAsync';
import * as ep from '../../services/endpoints';

// Some quando tudo está pronto (ou se o servidor não responder: nunca atrapalha o Início)
export default function Onboarding() {
  const { data: d } = useAsync(ep.getOnboarding, [], { refreshMs: 30000 });
  if (!d || d.completo) return null;
  const proxima = d.etapas.find((e) => !e.feito);
  return (
    <Card aria-labelledby="onb-title">
      <CardHeader id="onb-title" title="Primeiros passos" subtitle={`${d.feitas} de ${d.total} prontos. Siga na ordem; cada passo leva você à página certa.`} />
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={d.total} aria-valuenow={d.feitas}>
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${(d.feitas / d.total) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {d.etapas.map((e) => (
          <li key={e.id} className="flex items-start gap-2.5 text-sm">
            {e.feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />}
            <div className="min-w-0">
              <p className={e.feito ? 'text-muted line-through' : 'text-cream'}>{e.titulo}</p>
              <p className="text-xs text-muted">
                {e.detalhe} {!e.feito && proxima && proxima.id === e.id && <a className="link-subtle" href={`#${e.pagina}`}>Ir agora</a>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
