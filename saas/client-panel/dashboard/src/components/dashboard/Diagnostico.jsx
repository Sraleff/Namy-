import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Form';
import { useAsync } from '../../hooks/useAsync';
import * as ep from '../../services/endpoints';

const NIVEL = {
  ok: { Icon: CheckCircle2, cor: 'text-emerald-400' },
  info: { Icon: Info, cor: 'text-brand-300' },
  aviso: { Icon: AlertTriangle, cor: 'text-amber-300' },
  bloqueio: { Icon: XCircle, cor: 'text-rose-400' },
};
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Diagnostico() {
  const { data: d, error, loading, reload } = useAsync(ep.getDiagnostic, [], { refreshMs: 30000 });
  return (
    <Card className="mb-4" aria-labelledby="diag-title">
      <CardHeader
        id="diag-title"
        title="Por que não enviou?"
        subtitle="Confere agora o que impede ou atrasa os envios automáticos. Só lê, não envia nada."
        action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reload({ silent: true })}>Conferir</Button>}
      />
      {loading && !d && <p className="text-sm text-muted">Conferindo…</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error.message}</p>}
      {d && (
        <>
          <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${d.pode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{d.frase}</p>
          <ul className="space-y-2">
            {d.checks.map((c) => {
              const { Icon, cor } = NIVEL[c.nivel] || NIVEL.info;
              return (
                <li key={c.id} className="flex items-start gap-2.5 text-sm">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-cream">{c.titulo}</p>
                    {c.detalhe && <p className="text-xs text-muted">{c.detalhe}{c.pagina && c.nivel !== 'ok' ? <> <a className="link-subtle" href={`#${c.pagina}`}>Abrir</a></> : null}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          {d.motivosPulo.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted">Motivos mais comuns (últimas 24 h)</p>
              <ul className="space-y-1">
                {d.motivosPulo.map((m) => (
                  <li key={m.motivo} className="flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="truncate" title={m.motivo}>{m.motivo}</span>
                    <Badge variant="neutral">{m.qtd}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-subtle">
            Hoje: {d.hoje.enviados} de {d.hoje.limite} produtos{d.ultimoEnvio ? ` · último envio: ${hora.format(new Date(d.ultimoEnvio.em))}${d.ultimoEnvio.grupo ? ` em ${d.ultimoEnvio.grupo}` : ''}` : ' · nenhum envio registrado ainda'}
          </p>
        </>
      )}
    </Card>
  );
}
