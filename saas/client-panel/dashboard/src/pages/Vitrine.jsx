import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ListPlus, Search, Send, Star } from 'lucide-react';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Button, Input, Notice, Select } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import { useAction } from '../hooks/useAction';
import * as ep from '../services/endpoints';
import { formatNumber } from '../lib/format';

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
      <p className="mt-3 rounded-lg bg-white/[0.03] p-3 text-xs text-muted">
        Você ainda não tem grupos de destino. <a href="#grupos" className="link-subtle">Escolha em Grupos</a> onde o bot pode publicar.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line bg-ink-850 p-3">
      <p className="text-xs font-medium text-cream">Enviar agora para (nenhum vem marcado):</p>
      <ul className="space-y-1">
        {destinos.map((g) => (
          <li key={g.jid}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-white/[0.03]">
              <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={escolhidos.has(g.jid)} onChange={() => alternar(g.jid)} />
              <span className="min-w-0 flex-1 truncate text-cream">{g.name}</span>
              <Badge>{g.niche || 'geral'}</Badge>
            </label>
          </li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />
        Enviar mesmo se a oferta estiver fora do nicho do grupo
      </label>
      <Notice msg={msg} />
      {saida && (
        <ul className="space-y-1 text-xs" aria-label="Resultado do envio">
          {saida.results.map((r) => (
            <li key={r.jid} className={r.ok ? 'text-emerald-300' : r.pulado ? 'text-amber-300' : 'text-rose-300'}>
              {r.ok ? '✓ Enviado' : r.pulado ? '↷ Pulado' : '✗ Falhou'} — {r.name}{r.motivo ? ` (${r.motivo})` : ''}{r.error ? ` (${r.error})` : ''}
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" icon={Send} busy={busy === 'send'} disabled={!escolhidos.size} onClick={enviar}>
        Enviar para {escolhidos.size} grupo(s)
      </Button>
    </div>
  );
}

function Cartao({ oferta, destinos }) {
  const [naFila, setNaFila] = useState(oferta.naFila);
  const [enviado, setEnviado] = useState(oferta.enviadoRecente);
  const [abrirEnvio, setAbrirEnvio] = useState(false);
  const { busy, msg, run } = useAction();

  const salvar = () => run('save', () => ep.saveShowcase(oferta.productId), (o) => (o.duplicado ? 'Essa oferta já estava na fila.' : 'Salva na fila.'))
    .then((o) => o && setNaFila(true));

  return (
    <li className="flex flex-col rounded-2xl border border-line bg-ink-800 p-4">
      <div className="flex gap-3">
        {oferta.imageUrl ? (
          <img
            src={oferta.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"
            className="h-24 w-24 shrink-0 rounded-xl bg-ink-850 object-cover"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        ) : <div className="h-24 w-24 shrink-0 rounded-xl bg-ink-850" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-cream" title={oferta.nome}>{oferta.nome}</p>
          <p className="tabular mt-1 text-base font-semibold text-cream">{oferta.preco}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {oferta.desconto ? <Badge variant="success">{oferta.desconto}% off</Badge> : null}
            {oferta.ratingStar ? <span className="flex items-center gap-1 text-xs text-muted"><Star className="h-3 w-3 text-amber-400" aria-hidden="true" />{oferta.ratingStar}</span> : null}
          </div>
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] text-subtle">
        {oferta.shopName || 'Loja não informada'} · {formatNumber(oferta.sales)} vendas
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {naFila && <Badge variant="info">Já na fila</Badge>}
        {enviado && <Badge variant="warning">Enviada nos últimos 7 dias</Badge>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={ListPlus} busy={busy === 'save'} disabled={naFila} onClick={salvar}>{naFila ? 'Na fila' : 'Salvar na fila'}</Button>
        <Button size="sm" variant="secondary" icon={Send} onClick={() => setAbrirEnvio((v) => !v)} aria-expanded={abrirEnvio}>Enviar…</Button>
        <a href={oferta.link} target="_blank" rel="noopener noreferrer" className="link-subtle ml-auto inline-flex items-center gap-1" aria-label={`Abrir ${oferta.nome} na Shopee`}>
          Ver <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      <Notice className="mt-2" msg={msg} />
      {abrirEnvio && <EnviarPainel oferta={oferta} destinos={destinos} onEnviado={() => setEnviado(true)} />}
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

  const pronto = !!resumo.data?.marketplaces?.shopee?.ok;
  const semChave = !!resumo.data && !pronto;
  const lista = useAsync(() => ep.searchShowcase(keyword, ordem, pagina), [keyword, ordem, pagina], { enabled: pronto });
  const d = lista.data;
  const ordens = d?.ordens || [];
  const ordemAtual = ordens.find((o) => o.id === (ordem || d?.ordem));
  const destinos = cfg.data?.groups || [];

  const buscar = (e) => {
    e.preventDefault();
    setPagina(1);
    setKeyword(rascunho.trim());
  };

  return (
    <>
      <PageHeader
        title="Vitrine de ofertas"
        subtitle="Busque na Shopee com as suas chaves e leve a oferta para a fila ou envie na hora, só para os grupos que você escolher."
      />

      {resumo.error && <Notice className="mb-4" msg={{ tone: 'error', text: `Não consegui verificar a sua conta Shopee: ${resumo.error.message}` }} />}
      {semChave && (
        <Notice className="mb-4" msg={{ tone: 'warn', text: `${resumo.data.marketplaces.shopee.motivo}. Abra Configurações → Marketplaces.` }} />
      )}

      <Card className="mb-4">
        <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search" aria-label="Buscar ofertas">
          <div className="flex-1">
            <label htmlFor="vt-q" className="mb-1.5 block text-xs font-medium text-muted">Palavra-chave</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <Input id="vt-q" value={rascunho} maxLength={80} onChange={(e) => setRascunho(e.target.value)} placeholder="Ex.: fone bluetooth (vazio = ofertas variadas)" className="pl-10" />
            </div>
          </div>
          <div className="sm:w-60">
            <label htmlFor="vt-ordem" className="mb-1.5 block text-xs font-medium text-muted">Ordenar por</label>
            <Select id="vt-ordem" value={ordem || d?.ordem || ''} onChange={(e) => { setOrdem(e.target.value); setPagina(1); }} disabled={!ordens.length}>
              {ordens.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </div>
          <Button type="submit" icon={Search} busy={lista.loading} disabled={!pronto}>Buscar</Button>
        </form>
        {ordemAtual?.nota && <p className="mt-2 text-[11px] text-subtle">{ordemAtual.nota}</p>}
      </Card>

      {lista.error && <Notice className="mb-4" msg={{ tone: 'error', text: lista.error.message }} />}
      {pronto && lista.loading && !d && <p className="p-6 text-sm text-muted">Buscando ofertas…</p>}
      {d && !d.itens.length && (
        <Card><EmptyState>Nenhuma oferta encontrada{d.keyword ? ` para "${d.keyword}"` : ''}. Tente outra palavra.</EmptyState></Card>
      )}
      {d && d.itens.length > 0 && (
        <ul className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${lista.loading ? 'opacity-60' : ''}`} aria-label="Ofertas encontradas" aria-busy={lista.loading}>
          {d.itens.map((o) => <Cartao key={o.productId} oferta={o} destinos={destinos} />)}
        </ul>
      )}
      {d && (pagina > 1 || d.temMais) && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-center gap-3">
          <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={pagina <= 1 || lista.loading} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <span className="tabular text-xs text-muted">Página {pagina}</span>
          <Button size="sm" variant="secondary" disabled={!d.temMais || lista.loading} onClick={() => setPagina((p) => p + 1)}>Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        </nav>
      )}
    </>
  );
}
