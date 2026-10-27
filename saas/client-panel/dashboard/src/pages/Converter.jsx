import { useState } from 'react';
import { AlertTriangle, Check, ClipboardPaste, Copy, ExternalLink, Link2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import { Button, Notice } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { copiar } from '../lib/clipboard';
import { cx } from '../lib/format';

const MAX_TEXTO = 2000;
const LOJAS = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };
// Só para acender a loja enquanto a pessoa cola; quem decide de verdade é o servidor
const RECONHECE = {
  shopee: /(^|[./])(shopee\.com\.br|shope\.ee)\b/i,
  mercadolivre: /(^|[./])(mercadolivre\.com(\.br)?|mercadolibre\.com|meli\.la)\b/i,
  amazon: /(^|[./])(amazon\.com\.br|amzn\.to|a\.co)\b/i,
};
const COR = {
  shopee: 'border-orange-500/60 bg-orange-500/20 text-white [--ponto:#ee4d2d]',
  mercadolivre: 'border-yellow-300/60 bg-yellow-300/15 text-white [--ponto:#ffe600]',
  amazon: 'border-amber-400/60 bg-amber-400/15 text-white [--ponto:#ff9900]',
};

function Resultado({ r }) {
  const [copiado, setCopiado] = useState(false);
  const clicar = async () => {
    if (await copiar(r.para)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    }
  };
  return (
    <li className="card !border-emerald-500/35 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"><Check className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cream">Link convertido</p>
          <p className="text-xs text-muted">{LOJAS[r.marketplace] || r.marketplace || 'Loja'}, com o seu link de afiliado</p>
        </div>
      </div>
      <p className="mt-3 truncate text-xs text-subtle" title={r.de}>De: {r.de}</p>
      <a href={r.para} target="_blank" rel="noopener noreferrer" className="mt-1.5 block break-all rounded-2xl border border-line bg-ink-850 p-3.5 text-[15px] font-semibold text-brand-300 hover:underline">
        {r.para}
      </a>
      {r.aviso && <p className="mt-2 text-xs text-amber-300">{r.aviso}</p>}
      <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-2.5">
        <Button variant={copiado ? 'success' : 'primary'} icon={copiado ? Check : Copy} onClick={clicar} aria-label={`Copiar ${r.para}`}>
          {copiado ? 'Copiado' : 'Copiar link'}
        </Button>
        <a href={r.para} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-ink-800 text-sm font-semibold text-cream transition hover:bg-ink-750 active:scale-[0.97] sm:h-10">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir
        </a>
      </div>
    </li>
  );
}

export default function Converter() {
  const resumo = useAsync(ep.affiliateSummary, []);
  const [texto, setTexto] = useState('');
  const [saida, setSaida] = useState(null);
  const { busy, msg, setMsg, run } = useAction();

  // Loja sem configuração não bloqueia as outras: só avisa
  const lojas = resumo.data?.marketplaces || {};
  const pendentes = Object.entries(lojas).filter(([id, m]) => LOJAS[id] && m && !m.ok);
  const vazio = !texto.trim();
  const podeColar = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  const mudar = (t) => { setTexto(t.slice(0, MAX_TEXTO)); setSaida(null); setMsg(null); };
  const colar = async () => {
    try { mudar(await navigator.clipboard.readText()); } catch { setMsg({ tone: 'warn', text: 'O navegador não deixou ler a área de transferência. Toque no campo e cole com o teclado.' }); }
  };

  const converter = () => {
    setSaida(null);
    return run('conv', () => ep.convertLink(texto)).then((o) => {
      if (!o) return;
      setSaida(o);
      if (o.ok) setMsg({ tone: 'ok', text: `${o.resultados.length} link(s) convertido(s) com a sua conta.` });
      else setMsg({ tone: 'error', text: 'Nenhum link foi convertido. Veja os motivos abaixo.' });
    });
  };

  const copiarTodos = async () => {
    const ok = await copiar(saida.resultados.map((r) => r.para).join('\n'));
    setMsg(ok ? { tone: 'ok', text: 'Links copiados.' } : { tone: 'error', text: 'Não consegui copiar. Copie um por um.' });
  };

  return (
    <>
      <PageHeader title="Converter link" subtitle="Cole o link do produto e receba o seu link de afiliado. Shopee pela API oficial com as suas chaves, Mercado Livre com a sua etiqueta, Amazon com a sua tag." />

      {resumo.error && <Notice className="mb-4" msg={{ tone: 'error', text: `Não consegui verificar as suas lojas: ${resumo.error.message}` }} />}
      {pendentes.length > 0 && (
        <div className="glass mb-4 flex gap-3 rounded-2xl !border-amber-400/30 !bg-amber-400/[0.08] p-4" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div className="min-w-0 text-[13px] text-slate-300">
            {pendentes.map(([id, m]) => <p key={id}><b className="text-cream">{LOJAS[id]}:</b> {m.motivo}</p>)}
            <a href="#configuracoes" className="link-subtle mt-2 inline-block">Abrir Configurações → Marketplaces</a>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-6">
        <section aria-label="Colar link" className="space-y-3">
          <div className="card p-4 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-500/15">
            <label htmlFor="conv-txt" className="sr-only">Link ou texto da oferta</label>
            <textarea
              id="conv-txt"
              rows={4}
              maxLength={MAX_TEXTO}
              value={texto}
              onChange={(e) => mudar(e.target.value)}
              placeholder="Cole aqui o link ou o texto inteiro da oferta (até 5 links)"
              className="min-h-[120px] w-full resize-none bg-transparent text-base leading-relaxed text-cream placeholder:text-subtle focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3">
              <ul className="flex flex-wrap gap-1.5" aria-label="Lojas aceitas">
                {Object.entries(LOJAS).map(([id, nome]) => {
                  const achou = RECONHECE[id].test(texto);
                  const pronta = lojas[id]?.ok;
                  return (
                    <li key={id} className={cx('flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition', achou ? COR[id] : 'border-line text-subtle')}>
                      <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', achou ? 'bg-[var(--ponto)]' : pronta === false ? 'bg-amber-400/70' : 'bg-current opacity-60')} />
                      {nome}
                      {achou && <span className="sr-only">(link reconhecido)</span>}
                    </li>
                  );
                })}
              </ul>
              {podeColar && <Button size="sm" variant="secondary" icon={ClipboardPaste} onClick={colar}>Colar</Button>}
            </div>
          </div>
          <Button size="lg" className="w-full" icon={Link2} busy={busy === 'conv'} disabled={vazio || resumo.loading} onClick={converter}>
            {busy === 'conv' ? 'Convertendo' : 'Converter link'}
          </Button>
          <Notice msg={msg} />
          <p className="text-[11px] text-subtle">
            Nada é enviado para ninguém. Cada link da Shopee usa a API da sua conta, por isso há um limite de 12 conversões por minuto. {texto.length}/{MAX_TEXTO} caracteres.
          </p>
        </section>

        <section aria-label="Resultado" aria-live="polite" className="space-y-3">
          {!saida && (
            <p className="hidden rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted xl:block">O link convertido aparece aqui.</p>
          )}
          {saida?.resultados?.length > 1 && (
            <div className="flex justify-end"><Button size="sm" variant="secondary" icon={Copy} onClick={copiarTodos}>Copiar todos</Button></div>
          )}
          {saida?.resultados?.length > 0 && (
            <ul className="space-y-3" aria-label="Links convertidos">
              {saida.resultados.map((r) => <Resultado key={r.de} r={r} />)}
            </ul>
          )}
          {saida?.erros?.length > 0 && (
            <ul className="space-y-2" aria-label="Links que falharam">
              {saida.erros.map((e) => (
                <li key={e.url} className="flex gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-[13px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                  <span className="min-w-0 break-all">{e.motivo}{e.temporario ? ' (tente de novo em instantes)' : ''}<span className="mt-1 block text-xs text-rose-300/70">{e.url}</span></span>
                </li>
              ))}
            </ul>
          )}
          {saida?.fora?.length > 0 && (
            <ul className="space-y-2" aria-label="Links ignorados">
              {saida.fora.map((f) => (
                <li key={f.url} className="rounded-2xl border border-line bg-ink-800 p-3.5 text-xs text-muted">
                  <Badge variant="neutral" className="mr-2"><Link2 className="h-3 w-3" aria-hidden="true" /> ignorado</Badge>
                  <span className="break-all">{f.url}</span>
                  <span className="mt-1 block text-subtle">{f.motivo}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
