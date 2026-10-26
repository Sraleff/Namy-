import { AlertTriangle, Info } from 'lucide-react';

const PASSOS_TOM = {
  conectar: 'border-brand-400/40 bg-brand-500/10',
  aguardar: 'border-line bg-ink-850',
  reconectar: 'border-amber-400/40 bg-amber-400/10',
  esquecer: 'border-amber-400/40 bg-amber-400/10',
};
const ACAO = {
  conectar: 'Use o formulário acima.',
  reconectar: 'Use o botão Reconectar abaixo.',
  esquecer: 'Use o botão "Desconectar e esquecer" abaixo e depois conecte de novo.',
  aguardar: '',
};

// ajuda = { codigo, titulo, porque, passos[], acao } vinda do servidor (waAjuda.js); null quando conectado
export default function AjudaWhatsApp({ ajuda }) {
  if (!ajuda) return null;
  const Icon = ['aguardar', 'conectar'].includes(ajuda.acao) ? Info : AlertTriangle;
  return (
    <section className={`mt-4 rounded-xl border p-4 ${PASSOS_TOM[ajuda.acao] || PASSOS_TOM.aguardar}`} aria-label="Ajuda da conexão" role="status">
      <p className="flex items-center gap-2 text-sm font-semibold text-cream">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {ajuda.titulo}
      </p>
      {ajuda.porque && <p className="mt-1 text-xs text-muted">{ajuda.porque}</p>}
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
        {ajuda.passos.map((p) => <li key={p}>{p}</li>)}
      </ol>
      {ACAO[ajuda.acao] && <p className="mt-2 text-[11px] text-subtle">{ACAO[ajuda.acao]}</p>}
    </section>
  );
}
