import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, ListPlus, Search, Send, Star } from 'lucide-react';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Sheet from '../components/ui/Sheet';
import OfertasTabs from '../components/layout/OfertasTabs';
import { Button, Notice } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { copiar } from '../lib/clipboard';
import { cx, formatNumber } from '../lib/format';

const precoInicial = (p) => String(p || '').split(' – ')[0];

// Aviso curto que some sozinho, logo acima da barra inferior
function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  const el = toast && (
    <div role="status" className={cx(
      'fixed bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lift backdrop-blur-xl lg:bottom-8',
      toast.ok ? 'border-emerald-500/45 bg-emerald-950/80 text-emerald-200' : 'border-rose-500/45 bg-rose-950/80 text-rose-200',
    )}>
      {toast.ok && <Check className="h-4 w-4" aria-hidden="true" />}{toast.text}
    </div>
  );
  return [el, (text, ok = true) => setToast({ text, ok })];
}

function EnviarPainel({ oferta, destinos, onEnviado }) {
  const [escolhidos, setEscolhidos] = useState(() => new Set());
  const [forcar, setForcar] = useState(false);
  const [saida, setSaida] = useState(null);
  const { busy, msg, run } = useAction();

  const alternar = (jid) => setEscolhidos((s) => {
    const n = new Set(s);
    n.has(jid) ? n.delete(jid) : n.add(jid);
    return n;
  });

  const enviar = async () => {
    const jids = [...escolhidos];
    const nomes = destinos.filter((g) => escolhidos.has(g.jid)).map((g) => g.name).join(', ');
    // Confirmação explícita: lista os grupos que vão receber
    if (!window.confirm(`Enviar "${oferta.nome}" agora para: ${nomes}?`)) return;
    const out = await run('send', () => ep.sendShowcase({ itemId: oferta.productId, jids, forcarNicho: forcar }));
    if (out) {
      setSaida(out);
      if (out.enviados > 0) onEnviado();
    }
  };

  if (!destinos.length) {
    return (
      <p className="mt-4 rounded-xl bg-ink-850 p-3 text-xs text-muted">
        Você ainda não tem grupos de destino. <a href="#grupos" className="link-subtle">Escolha em Grupos</a> onde o bot pode publicar.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-[13px] text-muted">Enviar agora para (nenhum vem marcado):</p>
      <ul className="space-y-2">
        {destinos.map((g) => {
          const on = escolhidos.has(g.jid);
          return (
            <li key={g.jid}>
              <label className={cx('flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition', on ? 'border-brand-300/50 bg-brand-500/15' : 'border-line bg-ink-800 hover:border-line-strong')}>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-indigo-500" checked={on} onChange={() => alternar(g.jid)} />
                <span className="min-w-0 flex-1 truncate text-sm text-cream">{g.name}</span>
                <Badge>{g.niche || 'geral'}</Badge>
              </label>
            </li>
          );
        })}
      </ul>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />
        Enviar mesmo se a oferta estiver fora do nicho do grupo
      </label>
      <Notice className="mt-3" msg={msg} />
      {saida && (
        <ul className="mt-2 space-y-1 text-xs" aria-label="Resultado do envio">
          {saida.results.map((r) => (
            <li key={r.jid} className={r.ok ? 'text-emerald-300' : r.pulado ? 'text-amber-300' : 'text-rose-300'}>
              {r.ok ? '✓ Enviado' : r.pulado ? '↷ Pulado' : '✗ Falhou'}: {r.name}{r.motivo ? ` (${r.motivo})` : ''}{r.error ? ` (${r.error})` : ''}
            </li>
          ))}
        </ul>
      )}
      <Button size="lg" className="mt-3 w-full" icon={Send} busy={busy === 'send'} disabled={!escolhidos.size} onClick={enviar}>
        {escolhidos.size ? `Enviar para ${escolhidos.size} grupo(s)` : 'Escolha um grupo'}
      </Button>
    </div>
  );
}

function Divulgar({ oferta, destinos, estado, onFila, onEnviado, onCopiar, onClose }) {
  const { busy, msg, run } = useAction();
  const salvar = () => run('save', () => ep.saveShowcase(oferta.productId), (o) => (o.duplicado ? 'Essa oferta já estava na fila.' : 'Salva na fila.'))
    .then((o) => o && onFila());
  return (
    <Sheet open onClose={onClose} title={`Divulgar ${oferta.nome}`}>
      <div className="flex gap-4 pr-0 sm:pr-10">
        {oferta.imageUrl
          ? <img src={oferta.imageUrl} alt="" referrerPolicy="no-referrer" className="h-24 w-24 shrink-0 rounded-2xl bg-white object-cover" />
          : <span className="h-24 w-24 shrink-0 rounded-2xl bg-ink-850" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="line-clamp-3 text-base font-semibold leading-snug text-cream">{oferta.nome}</h2>
          <p className="tabular mt-1 text-lg font-bold text-cream">{oferta.preco}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
            {oferta.shopName || 'Loja não informada'}
            {oferta.ratingStar && <><Star className="ml-1 h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />{oferta.ratingStar}</>}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-ink-850 py-1.5 pl-3.5 pr-1.5">
        <a href={oferta.link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-brand-300 hover:underline">{oferta.link}</a>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => onCopiar(oferta.link)}>Copiar</Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Button variant="secondary" icon={estado.naFila ? Check : ListPlus} busy={busy === 'save'} disabled={estado.naFila} onClick={salvar}>
          {estado.naFila ? 'Na fila' : 'Pôr na fila'}
        </Button>
        <a href={oferta.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-ink-800 text-sm font-semibold text-cream transition hover:bg-ink-750 active:scale-[0.97] sm:h-10">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver na Shopee
        </a>
      </div>
      <Notice className="mt-3" msg={msg} />

      <EnviarPainel oferta={oferta} destinos={destinos} onEnviado={onEnviado} />
    </Sheet>
  );
}

function Cartao({ oferta, destinos, onCopiar }) {
  const [naFila, setNaFila] = useState(oferta.naFila);
  const [enviado, setEnviado] = useState(oferta.enviadoRecente);
  const [aberto, setAberto] = useState(false);

  return (
    <li className="card glass-hover flex flex-col overflow-hidden">
      <button type="button" onClick={() => setAberto(true)} className="relative block aspect-square w-full bg-white text-left" aria-label={`Ver detalhes de ${oferta.nome}`}>
        {oferta.imageUrl ? (
          <img
            src={oferta.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        ) : <span className="block h-full w-full bg-ink-850" aria-hidden="true" />}
        {oferta.desconto ? <span className="tabular absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">-{oferta.desconto}%</span> : null}
        {(enviado || naFila) && (
          <span className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {enviado && <span className="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 backdrop-blur"><Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />Já enviada</span>}
            {naFila && <span className="rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold text-brand-300 backdrop-blur">Na fila</span>}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 min-h-[2.6em] text-[13.5px] leading-snug text-cream" title={oferta.nome}>{oferta.nome}</p>
        <p className="tabular text-[17px] font-bold tracking-tight text-cream">{precoInicial(oferta.preco)}</p>
        <p className="tabular flex items-center gap-2.5 text-xs text-muted">
          {oferta.ratingStar && <span className="flex items-center gap-1 font-semibold text-slate-200"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />{String(oferta.ratingStar).replace('.', ',')}</span>}
          <span>{formatNumber(oferta.sales)} vendidos</span>
        </p>
        <div className="mt-auto grid grid-cols-[40px_1fr] gap-2 pt-2">
          <Button variant="secondary" className="!h-10 !px-0" onClick={() => onCopiar(oferta.link)} aria-label={`Copiar link de ${oferta.nome}`}>
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button className="!h-10" onClick={() => setAberto(true)}>Divulgar</Button>
        </div>
      </div>
      {aberto && (
        <Divulgar
          oferta={oferta} destinos={destinos} estado={{ naFila }} onCopiar={onCopiar}
          onFila={() => setNaFila(true)} onEnviado={() => setEnviado(true)} onClose={() => setAberto(false)}
        />
      )}
    </li>
  );
}

export default function Vitrine() {
  const resumo = useAsync(ep.affiliateSummary, []);
  const cfg = useAsync(ep.getConfig, []);
  const [rascunho, setRascunho] = useState('');
  const [keyword, setKeyword] = useState('');
  const [ordem, setOrdem] = useState('');
  const [pagina, setPagina] = useState(1);
  const [toast, mostrar] = useToast();

  const pronto = !!resumo.data?.marketplaces?.shopee?.ok;
  const semChave = !!resumo.data && !pronto;
  const lista = useAsync(() => ep.searchShowcase(keyword, ordem, pagina), [keyword, ordem, pagina], { enabled: pronto });
  const d = lista.data;
  const ordens = d?.ordens || [];
  const ordemId = ordem || d?.ordem || '';
  const ordemAtual = ordens.find((o) => o.id === ordemId);
  const destinos = cfg.data?.groups || [];

  const buscar = (e) => {
    e.preventDefault();
    setPagina(1);
    setKeyword(rascunho.trim());
  };
  const onCopiar = async (link) => {
    const ok = await copiar(link);
    mostrar(ok ? 'Link de afiliado copiado' : 'Não consegui copiar o link', ok);
  };

  return (
    <>
      <OfertasTabs active="vitrine" />
      <PageHeader title="Vitrine" subtitle="Produtos da Shopee, buscados com as suas chaves, para pôr na fila ou enviar na hora aos grupos que você escolher." />

      {resumo.error && <Notice className="mb-4" msg={{ tone: 'error', text: `Não consegui verificar a sua conta Shopee: ${resumo.error.message}` }} />}
      {semChave && (
        <Notice className="mb-4" msg={{ tone: 'warn', text: `${resumo.data.marketplaces.shopee.motivo}. Abra Configurações → Marketplaces.` }} />
      )}

      <form onSubmit={buscar} role="search" aria-label="Buscar ofertas" className="glass flex h-[52px] items-center gap-2 rounded-2xl pl-4 pr-1.5 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-500/15">
        <Search className="h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
        <label htmlFor="vt-q" className="sr-only">Palavra-chave</label>
        <input
          id="vt-q" type="search" value={rascunho} maxLength={80} onChange={(e) => setRascunho(e.target.value)}
          placeholder="Buscar produto, ex.: air fryer" className="min-w-0 flex-1 bg-transparent text-base text-cream placeholder:text-subtle focus:outline-none sm:text-sm"
        />
        <Button type="submit" busy={lista.loading} disabled={!pronto} className="!h-10">Buscar</Button>
      </form>

      {ordens.length > 0 && (
        <div role="group" aria-label="Ordenar por" className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {ordens.map((o) => (
            <button
              key={o.id} type="button" aria-pressed={o.id === ordemId}
              onClick={() => { setOrdem(o.id); setPagina(1); }}
              className={cx(
                'h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition active:scale-95',
                o.id === ordemId ? 'border-brand-300/50 bg-brand-500/25 text-white' : 'border-line bg-ink-800 text-slate-300 hover:border-line-strong hover:bg-ink-750',
              )}
            >
              {o.label.replace(' (padrão da Shopee)', '')}
            </button>
          ))}
        </div>
      )}
      {ordemAtual?.nota && <p className="mt-2 text-[11px] text-subtle">{ordemAtual.nota}</p>}

      <div className="mt-4">
        {lista.error && <Notice className="mb-4" msg={{ tone: 'error', text: lista.error.message }} />}
        {pronto && lista.loading && !d && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label="Carregando ofertas" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <li key={i}><Skeleton className="aspect-[3/4.4] rounded-2xl" /></li>)}
          </ul>
        )}
        {d && !d.itens.length && (
          <Card><EmptyState>Nenhuma oferta encontrada{d.keyword ? ` para "${d.keyword}"` : ''}. Tente outra palavra.</EmptyState></Card>
        )}
        {d && d.itens.length > 0 && (
          <ul className={cx('grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5', lista.loading && 'opacity-60')} aria-label="Ofertas encontradas" aria-busy={lista.loading}>
            {d.itens.map((o) => <Cartao key={o.productId} oferta={o} destinos={destinos} onCopiar={onCopiar} />)}
          </ul>
        )}
        {d && (pagina > 1 || d.temMais) && (
          <nav aria-label="Páginas" className="mt-5 flex items-center justify-center gap-3">
            <Button variant="secondary" icon={ChevronLeft} disabled={pagina <= 1 || lista.loading} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <span className="tabular text-xs text-muted">Página {pagina}</span>
            <Button variant="secondary" disabled={!d.temMais || lista.loading} onClick={() => setPagina((p) => p + 1)}>Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
          </nav>
        )}
      </div>
      {toast}
    </>
  );
}
