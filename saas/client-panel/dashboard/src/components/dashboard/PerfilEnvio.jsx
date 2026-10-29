import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Form';
import * as ep from '../../services/endpoints';

const RISCO = { baixo: ['success', 'Risco baixo'], medio: ['warning', 'Risco médio'], alto: ['danger', 'Risco alto'] };

// ads = rascunho do formulário (ainda não salvo). Escolher um perfil só PREENCHE o formulário.
export default function PerfilEnvio({ ads, onPick }) {
  const [perfis, setPerfis] = useState([]);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => { ep.getProfiles().then((d) => setPerfis(d.perfis || [])).catch((e) => setErro(e.message)); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      ep.checkRisk(ads).then((d) => { setR(d); setErro(''); }).catch((e) => setErro(e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [ads]);

  const aplicar = (p) => onPick({ ...p.ads, window: { ...p.ads.window } });

  return (
    <Card className="mb-4" aria-labelledby="perfil-title">
      <CardHeader
        id="perfil-title"
        title="Perfil de envio"
        subtitle="Escolha um ponto de partida: ele só preenche o formulário abaixo, e nada muda até você clicar em Salvar."
        action={r && (
          <span className="flex items-center gap-2">
            <Badge variant={(RISCO[r.risco.nivel] || RISCO.medio)[0]} dot>{(RISCO[r.risco.nivel] || RISCO.medio)[1]}</Badge>
            {r.atual !== 'personalizado' ? <Badge variant="info">Perfil: {r.atual}</Badge> : <Badge variant="neutral">Personalizado</Badge>}
          </span>
        )}
      />
      <div className="grid gap-3 md:grid-cols-3">
        {perfis.map((p) => (
          <div key={p.id} className={`rounded-xl border p-3 ${r && r.atual === p.id ? 'border-brand-400 bg-brand-500/10' : 'border-line bg-ink-850'}`}>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-cream">
              {p.recomendado && <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />} {p.rotulo}
              {p.recomendado && <Badge variant="success">Recomendado</Badge>}
            </p>
            <p className="mt-1 text-xs text-muted">{p.descricao}</p>
            <p className="mt-1.5 text-[11px] text-subtle">
              {p.ads.dailyLimit} produtos/dia · intervalo {p.ads.intervalMin}–{p.ads.intervalMax} min · pausa entre grupos {p.ads.groupPauseMin}–{p.ads.groupPauseMax} s
            </p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => aplicar(p)}>Usar este perfil</Button>
          </div>
        ))}
      </div>
      {erro && <p role="alert" className="mt-3 text-xs text-rose-300">{erro}</p>}
      {r && r.risco.avisos.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-amber-300">
          {r.risco.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-subtle">
        O WhatsApp não divulga limites oficiais. O perfil e o medidor são precauções, não uma garantia de que o número não será limitado.
        {r ? ` Estimativa: até ${r.risco.porGrupoPorDia} oferta(s) por dia em cada um dos ${r.risco.nGrupos} grupo(s).` : ''}
      </p>
    </Card>
  );
}
