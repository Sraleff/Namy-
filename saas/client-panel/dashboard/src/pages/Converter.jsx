import { useState } from 'react';
import { AlertTriangle, Check, Copy, Link2, Wand2 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import { Button, Field, Notice, Textarea } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';

const MAX_TEXTO = 2000;
const LOJAS = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sem permissão de clipboard (http, navegador antigo): cai no método clássico
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function LinhaResultado({ r }) {
  const [copiado, setCopiado] = useState(false);
  const clicar = async () => {
    if (await copiar(r.para)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    }
  };
  return (
    <li className="rounded-xl border border-line bg-ink-850 p-3">
      <p className="truncate text-[11px] text-subtle" title={r.de}>{r.marketplace && <Badge variant="neutral" className="mr-1.5">{LOJAS[r.marketplace] || r.marketplace}</Badge>}{r.de}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <a href={r.para} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-brand-300 hover:underline">
          {r.para}
        </a>
        <Button size="sm" variant="secondary" icon={copiado ? Check : Copy} onClick={clicar} aria-label={`Copiar ${r.para}`}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      {r.aviso && <p className="mt-1.5 text-[11px] text-amber-300">{r.aviso}</p>}
    </li>
  );
}

export default function Converter() {
  const resumo = useAsync(ep.affiliateSummary, []);
  const [texto, setTexto] = useState('');
  const [saida, setSaida] = useState(null);
  const { busy, msg, setMsg, run } = useAction();

  // Loja sem configuração não bloqueia as outras: só avisa
  const pendentes = Object.entries(resumo.data?.marketplaces || {}).filter(([id, m]) => LOJAS[id] && m && !m.ok);
  const vazio = !texto.trim();

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
      <PageHeader
        title="Conversor de link"
        subtitle="Cole um link da Shopee, do Mercado Livre ou da Amazon e receba o seu link de afiliado: Shopee pela API oficial com as suas chaves, Mercado Livre com a sua etiqueta, Amazon com a sua tag."
      />

      {resumo.error && <Notice className="mb-4" msg={{ tone: 'error', text: `Não consegui verificar as suas lojas: ${resumo.error.message}` }} />}
      {pendentes.length > 0 && (
        <Notice
          className="mb-4"
          msg={{ tone: 'warn', text: pendentes.map(([id, m]) => `${LOJAS[id]}: ${m.motivo}`).join(' · ') }}
        />
      )}
      {pendentes.length > 0 && <p className="-mt-2 mb-4 text-xs text-muted"><a href="#configuracoes" className="link-subtle">Abrir Configurações → Marketplaces</a></p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card aria-labelledby="conv-title">
          <CardHeader id="conv-title" title="Colar link" subtitle="Até 5 links por vez. O restante do texto é ignorado." />
          <div className="space-y-3">
            <Field label="Link do produto" htmlFor="conv-txt" hint={`${texto.length}/${MAX_TEXTO} caracteres`}>
              <Textarea
                id="conv-txt"
                rows={5}
                maxLength={MAX_TEXTO}
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setSaida(null); setMsg(null); }}
                placeholder="https://shopee.com.br/produto-i.123.456 ou link do Mercado Livre / Amazon"
              />
            </Field>
            <Button icon={Wand2} busy={busy === 'conv'} disabled={vazio || resumo.loading} onClick={converter}>
              Converter
            </Button>
            <Notice msg={msg} />
            <p className="text-[11px] text-subtle">
              Nada é enviado para ninguém. Cada link da Shopee usa a API da sua conta, por isso há um limite de 12 conversões por minuto.
            </p>
          </div>
        </Card>

        <Card aria-labelledby="res-title">
          <CardHeader
            id="res-title"
            title="Resultado"
            action={saida?.resultados?.length > 1 && <Button size="sm" variant="secondary" icon={Copy} onClick={copiarTodos}>Copiar todos</Button>}
          />
          {!saida && <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">O link convertido aparece aqui.</p>}
          {saida?.resultados?.length > 0 && (
            <ul className="space-y-2" aria-label="Links convertidos">
              {saida.resultados.map((r) => <LinhaResultado key={r.de} r={r} />)}
            </ul>
          )}
          {saida?.erros?.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="Links que falharam">
              {saida.erros.map((e) => (
                <li key={e.url} className="flex gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-all">{e.motivo}{e.temporario ? ' (tente de novo em instantes)' : ''} — {e.url}</span>
                </li>
              ))}
            </ul>
          )}
          {saida?.fora?.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="Links ignorados">
              {saida.fora.map((f) => (
                <li key={f.url} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-muted">
                  <Badge variant="neutral" className="mr-2"><Link2 className="h-3 w-3" aria-hidden="true" /> ignorado</Badge>
                  <span className="break-all">{f.url}</span>
                  <span className="mt-1 block text-subtle">{f.motivo}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
