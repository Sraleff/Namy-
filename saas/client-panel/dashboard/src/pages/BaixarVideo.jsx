import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, CircleCheck, Download, Film, Link2, Search, Trash2, Upload, X } from 'lucide-react';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Sheet from '../components/ui/Sheet';
import { Button, Notice } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import * as ep from '../services/endpoints';
import { cx } from '../lib/format';

const mb = (b) => `${(Number(b || 0) / 1048576).toFixed(1).replace('.', ',')} MB`;
const ORIGEM = { upload: 'Enviado por você', shopee: 'Da Shopee', pinterest: 'Do Pinterest', youtube: 'Do YouTube' };

// Só para acender a plataforma enquanto a pessoa cola; quem decide é o servidor
const PLATAFORMAS = [
  { id: 'shopee', nome: 'Shopee', re: /(^|[./])(sv\.shopee\.com\.br|shp\.ee|shopee\.com\.br)\b/i, cor: 'border-orange-500/60 bg-orange-500/20' },
  { id: 'pinterest', nome: 'Pinterest', re: /(^|[./])(pinterest\.com(\.br)?|pin\.it)\b/i, cor: 'border-rose-500/60 bg-rose-500/20' },
  { id: 'youtube', nome: 'YouTube', re: /https:\/\/(?:(?:www|m|music)\.)?youtube\.com\/(?:watch\?|shorts\/|embed\/|live\/|v\/)|https:\/\/(?:www\.)?youtu\.be\/|https:\/\/(?:(?:www|m)\.)?youtube-nocookie\.com\/embed\//i, cor: 'border-red-500/60 bg-red-500/20' },
];

const PERGUNTAS = [
  ['Que vídeo posso usar?', 'Vídeos seus, do produto que você divulga ou que você tem permissão para usar. Repostar o vídeo de outra pessoa sem autorização pode gerar reclamação de direitos autorais, e a responsabilidade é de quem publica.'],
  ['Quais formatos e tamanhos?', 'MP4 de até 64 MB por arquivo, até 30 vídeos e 500 MB no total. Vídeos .mov do iPhone são aceitos, mas podem não tocar em todos os celulares: se der problema, envie em MP4.'],
  ['Como o vídeo vai para os grupos?', 'Escolha “Usar numa oferta” e marque uma oferta do Banco. Quando a automação enviar essa oferta, o vídeo vai no lugar da foto, com o mesmo texto e o seu link de afiliado. Se o envio do vídeo falhar, a oferta sai com a foto.'],
  ['De quais sites dá para importar pelo link?', 'Shopee (Shopee Vídeo), Pinterest e YouTube, só vídeos públicos. O YouTube depende do programa yt-dlp no servidor: se ele não estiver instalado, a Namy avisa e os outros dois sites continuam funcionando. Vídeo ao vivo, com login ou acima de 64 MB não entra. Para qualquer outro lugar, envie o arquivo.'],
  ['O vídeo vem com marca d’água?', 'Vem do jeito que a plataforma publicou. A Namy não tira nem coloca marca.'],
];

function Abas({ aba, setAba }) {
  return (
    <nav aria-label="Vídeos" className="glass grid grid-cols-2 gap-1 rounded-2xl p-1 sm:inline-grid sm:min-w-[380px]">
      {[['meus', 'Meus vídeos'], ['link', 'Importar por link']].map(([id, rotulo]) => (
        <button
          key={id} type="button" aria-pressed={aba === id} onClick={() => setAba(id)}
          className={cx('h-10 rounded-xl px-4 text-[13.5px] font-semibold transition', aba === id ? 'bg-white/10 text-cream shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-muted hover:bg-white/[0.04] hover:text-cream')}
        >
          {rotulo}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- enviar arquivo

function Enviar({ uso, onEnviado }) {
  const [progresso, setProgresso] = useState(null);
  const [msg, setMsg] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const cancelar = useRef(null);
  const input = useRef(null);
  const lim = uso?.limites;

  const enviar = async (arquivo) => {
    setMsg(null);
    if (!arquivo) return;
    if (lim && arquivo.size > lim.arquivo) { setMsg({ tone: 'error', text: `“${arquivo.name}” tem ${mb(arquivo.size)}. O limite é ${mb(lim.arquivo)} por vídeo.` }); return; }
    if (!/\.(mp4|mov|m4v)$/i.test(arquivo.name) && !/^video\//.test(arquivo.type)) { setMsg({ tone: 'error', text: 'Escolha um vídeo MP4 (ou .mov do iPhone).' }); return; }
    const ctrl = new AbortController();
    cancelar.current = ctrl;
    setProgresso(0);
    try {
      const out = await ep.videoEnviar(arquivo, { onProgresso: setProgresso, sinal: ctrl.signal });
      setMsg({ tone: 'ok', text: `“${out.item.nome}” está na sua biblioteca.${out.item.aviso ? ` ${out.item.aviso}` : ''}` });
      onEnviado(out);
    } catch (e) {
      setMsg({ tone: e.message === 'Envio cancelado.' ? 'warn' : 'error', text: e.message });
    } finally {
      setProgresso(null);
      cancelar.current = null;
      if (input.current) input.current.value = '';
    }
  };

  const enviando = progresso != null;
  return (
    <section aria-labelledby="env-tit" className="card relative overflow-hidden p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-500/25 blur-3xl" />
      <h2 id="env-tit" className="relative text-lg font-bold text-cream">Enviar vídeo</h2>
      <p className="relative mt-0.5 text-[13px] text-muted">Do seu celular ou computador. Ele fica guardado só na sua conta.</p>
      <label
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!enviando) enviar(e.dataTransfer.files?.[0]); }}
        className={cx('relative mt-4 flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition',
          arrastando ? 'border-brand-300 bg-brand-500/15' : 'border-line-strong bg-ink-850 hover:border-brand-300/60', enviando && 'pointer-events-none opacity-70')}
      >
        <Upload className="h-7 w-7 text-brand-300" aria-hidden="true" />
        <span className="text-[15px] font-semibold text-cream">Toque para escolher um vídeo</span>
        <span className="text-xs text-muted">ou arraste o arquivo aqui. MP4 até {lim ? mb(lim.arquivo) : '64 MB'}.</span>
        <input ref={input} type="file" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" className="sr-only" disabled={enviando} onChange={(e) => enviar(e.target.files?.[0])} />
      </label>
      {enviando && (
        <div className="relative mt-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-[13px] text-slate-200">
            <span>{progresso < 1 ? 'Enviando…' : 'Conferindo o arquivo…'}</span>
            <span className="tabular">{Math.round(progresso * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progresso * 100)}>
            <span className="block h-full rounded-full bg-brand-gradient transition-[width]" style={{ width: `${Math.max(3, progresso * 100)}%` }} />
          </div>
          <Button size="sm" variant="ghost" className="mt-2" icon={X} onClick={() => cancelar.current?.abort()}>Cancelar envio</Button>
        </div>
      )}
      {uso && (
        <p className="tabular relative mt-3 text-xs text-muted">{uso.quantidade} de {uso.limites.quantidade} vídeos, {mb(uso.total)} de {mb(uso.limites.total)} usados</p>
      )}
      <Notice className="relative mt-3" msg={msg} />
    </section>
  );
}

// ---------------------------------------------------------------- usar numa oferta

function UsarEmOferta({ video, onClose, onMudou }) {
  const banco = useAsync(ep.listPool, []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const lista = useMemo(() => (banco.data?.itens || [])
    .filter((i) => i.ativo && !i.expirado)
    .filter((i) => i.nome.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40), [banco.data, q]);

  const definir = async (item, videoId) => {
    setBusy(item.id);
    setMsg(null);
    try {
      const out = await ep.ofertaVideo(item.id, videoId);
      setMsg({ tone: 'ok', text: videoId ? `O vídeo vai junto com “${item.nome}”.` : `“${item.nome}” volta a sair com a foto.` });
      banco.reload({ silent: true });
      onMudou(out);
    } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(''); }
  };

  return (
    <Sheet open onClose={onClose} title={`Usar ${video.nome} numa oferta`}>
      <h2 className="pr-0 text-base font-semibold text-cream sm:pr-10">Usar “{video.nome}” numa oferta</h2>
      <p className="mt-1 text-[13px] text-muted">Quando a automação enviar a oferta escolhida, o vídeo vai no lugar da foto, com o mesmo texto e o seu link.</p>
      <label className="mt-4 flex h-11 items-center gap-3 rounded-2xl border border-line bg-ink-850 px-4 focus-within:border-brand-400/60">
        <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
        <span className="sr-only">Buscar oferta</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Buscar oferta pelo nome" className="min-w-0 flex-1 bg-transparent text-base text-cream placeholder:text-subtle focus:outline-none sm:text-sm" />
      </label>
      <Notice className="mt-3" msg={msg} />
      {banco.loading && !banco.data && <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>}
      {banco.error && <Notice className="mt-3" msg={{ tone: 'error', text: banco.error.message }} />}
      {banco.data && !lista.length && <p className="mt-4 text-center text-sm text-muted">{q ? 'Nenhuma oferta com esse nome.' : 'Nenhuma oferta ativa no Banco. Cole uma oferta em Banco de ofertas primeiro.'}</p>}
      <ul className="mt-3 space-y-2">
        {lista.map((i) => {
          const comEste = i.video?.id === video.id;
          const comOutro = i.video && !comEste;
          return (
            <li key={i.id} className={cx('flex items-center gap-3 rounded-2xl border p-2.5', comEste ? 'border-brand-300/50 bg-brand-500/15' : 'border-line bg-ink-800')}>
              {i.imagemUrl ? <img src={i.imagemUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" loading="lazy" /> : <span className="h-11 w-11 shrink-0 rounded-xl bg-ink-850" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream">{i.nome}</span>
                <span className="block text-xs text-muted">{comEste ? 'Sai com este vídeo' : comOutro ? 'Já tem outro vídeo' : 'Sai com a foto'}</span>
              </span>
              {comEste
                ? <Button size="sm" variant="secondary" busy={busy === i.id} onClick={() => definir(i, null)}>Tirar</Button>
                : <Button size="sm" busy={busy === i.id} onClick={() => definir(i, video.id)}>{comOutro ? 'Trocar' : 'Usar'}</Button>}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ---------------------------------------------------------------- biblioteca

function Biblioteca({ dados, onMudou }) {
  const [usando, setUsando] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  const apagar = async (v) => {
    const aviso = v.ofertas.length ? ` ${v.ofertas.length} oferta(s) voltam a sair com a foto.` : '';
    if (!window.confirm(`Apagar “${v.nome}”?${aviso}`)) return;
    setBusy(v.id);
    setMsg(null);
    try { onMudou(await ep.videoRemover(v.id)); setMsg({ tone: 'ok', text: `“${v.nome}” foi apagado.` }); } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(''); }
  };

  if (!dados.itens.length) {
    return <div className="mt-4"><EmptyState>Nenhum vídeo ainda. Envie um arquivo acima ou importe pelo link da Shopee, do Pinterest ou do YouTube.</EmptyState></div>;
  }
  return (
    <>
      <Notice className="mt-4" msg={msg} />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Meus vídeos">
        {dados.itens.map((v) => (
          <li key={v.id} className="card flex flex-col overflow-hidden">
            <video src={v.url} controls preload="metadata" playsInline className="aspect-[9/12] w-full bg-black object-contain" aria-label={`Prévia de ${v.nome}`} />
            <div className="flex flex-1 flex-col gap-1.5 p-3.5">
              <p className="truncate text-[15px] font-semibold text-cream" title={v.nome}>{v.nome}</p>
              <p className="tabular text-xs text-muted">{mb(v.tamanho)}, {ORIGEM[v.origem] || 'Vídeo'}</p>
              {v.aviso && <p className="flex gap-1.5 text-xs text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{v.aviso}</p>}
              <div className="flex flex-wrap gap-1.5">
                {v.ofertas.length
                  ? v.ofertas.map((o) => <Badge key={o.id} variant="success" className="max-w-full truncate">Na oferta: {o.nome}</Badge>)
                  : <Badge>Ainda não está em nenhuma oferta</Badge>}
              </div>
              <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-2">
                <Button onClick={() => setUsando(v)}>Usar numa oferta</Button>
                <Button variant="danger" busy={busy === v.id} onClick={() => apagar(v)} aria-label={`Apagar ${v.nome}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {usando && <UsarEmOferta video={usando} onClose={() => setUsando(null)} onMudou={onMudou} />}
    </>
  );
}

// ---------------------------------------------------------------- importar por link

function ImportarLink({ onSalvo }) {
  const [link, setLink] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const achou = PLATAFORMAS.find((p) => p.re.test(link));

  const ler = async (e) => {
    e.preventDefault();
    setInfo(null);
    setMsg(null);
    setBusy('ler');
    try { setInfo(await ep.videoInfo(link.trim())); } catch (err) { setMsg({ tone: 'error', text: err.message }); } finally { setBusy(''); }
  };

  // O id é de uso único: depois de salvar ou baixar, é preciso buscar o link de novo
  const salvar = async () => {
    setBusy('salvar');
    setMsg(null);
    try {
      const out = await ep.videoSalvar(info.id, info.titulo || '');
      setMsg({ tone: 'ok', text: `Guardado em Meus vídeos (${mb(out.item.tamanho)}). Agora é só usar numa oferta.` });
      setInfo(null);
      onSalvo(out);
    } catch (err) { setMsg({ tone: 'error', text: err.message }); } finally { setBusy(''); }
  };

  const baixar = async () => {
    setBusy('baixar');
    setMsg(null);
    try {
      const blob = await ep.videoBaixar(info.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = info.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMsg({ tone: 'ok', text: `Baixado no aparelho: ${info.nome} (${mb(blob.size)}).` });
      setInfo(null);
    } catch (err) { setMsg({ tone: 'error', text: err.message }); } finally { setBusy(''); }
  };

  return (
    <form onSubmit={ler} className="card relative mt-4 overflow-hidden p-5 sm:max-w-xl" aria-labelledby="imp-tit">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
      <h2 id="imp-tit" className="relative text-lg font-bold text-cream">Importar pelo link</h2>
      <p className="relative mt-0.5 text-[13px] text-muted">Vídeo público da Shopee, do Pinterest ou do YouTube. Use o “Compartilhar → Copiar link” do app.</p>
      <ul className="relative mt-3 flex flex-wrap gap-2" aria-label="Sites aceitos">
        {PLATAFORMAS.map((p) => (
          <li key={p.id} className={cx('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition', achou?.id === p.id ? `${p.cor} text-white` : 'border-line text-muted')}>
            {achou?.id === p.id && <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />}{p.nome}
          </li>
        ))}
      </ul>
      <label htmlFor="bv-link" className="sr-only">Link do vídeo</label>
      <input
        id="bv-link" type="url" inputMode="url" required value={link}
        onChange={(e) => { setLink(e.target.value); setInfo(null); setMsg(null); }}
        placeholder="https://sv.shopee.com.br/share-video/…"
        className="relative mt-3 h-12 w-full rounded-2xl border border-line bg-ink-850 px-4 text-base text-cream placeholder:text-subtle transition hover:border-line-strong focus:border-brand-400/60 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-sm"
      />
      <Button type="submit" size="lg" className="relative mt-3 w-full" icon={Link2} busy={busy === 'ler'} disabled={!link.trim() || !!busy}>
        {busy === 'ler' ? 'Procurando o vídeo' : 'Buscar vídeo'}
      </Button>
      {info && (
        <div className="relative mt-4 rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.07] p-3" aria-live="polite">
          <div className="flex gap-3">
            {info.capa
              ? <img src={info.capa} alt="" referrerPolicy="no-referrer" className="h-20 w-16 shrink-0 rounded-xl bg-ink-850 object-cover" />
              : <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-xl bg-ink-850"><Film className="h-6 w-6 text-subtle" aria-hidden="true" /></span>}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><CircleCheck className="h-4 w-4" aria-hidden="true" />Vídeo encontrado</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-cream">{info.titulo || `Vídeo da ${info.rotulo}`}</p>
              <p className="mt-0.5 text-xs text-muted">{info.rotulo}, MP4</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button size="lg" busy={busy === 'salvar'} disabled={!!busy} icon={Film} onClick={salvar}>Salvar na Namy</Button>
            <Button size="lg" variant="secondary" busy={busy === 'baixar'} disabled={!!busy} icon={Download} onClick={baixar}>Baixar no aparelho</Button>
          </div>
        </div>
      )}
      <Notice className="relative mt-3" msg={msg} />
    </form>
  );
}

// ---------------------------------------------------------------- página

export default function BaixarVideo() {
  const [aba, setAba] = useState('meus');
  const bib = useAsync(ep.videoBiblioteca, []);
  const atualizar = (out) => (out?.itens ? bib.setData({ itens: out.itens, uso: out.uso }) : bib.reload({ silent: true }));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-cream sm:text-3xl">Vídeos</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Guarde os vídeos dos produtos e escolha em qual oferta cada um vai junto. A Namy envia o vídeo no lugar da foto, com o seu texto e o seu link de afiliado.</p>
      </header>
      <Abas aba={aba} setAba={setAba} />

      {aba === 'meus' && (
        <div className="mt-4">
          {bib.error && <Notice msg={{ tone: 'error', text: bib.error.message }} />}
          <Enviar uso={bib.data?.uso} onEnviado={atualizar} />
          {bib.loading && !bib.data && <div className="mt-4 grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>}
          {bib.data && <Biblioteca dados={bib.data} onMudou={atualizar} />}
        </div>
      )}
      {aba === 'link' && <ImportarLink onSalvo={(out) => { atualizar(out); }} />}

      <section aria-labelledby="bv-faq" className="mx-auto mt-10 max-w-3xl">
        <h2 id="bv-faq" className="text-center text-xl font-bold text-cream">Perguntas frequentes</h2>
        <div className="mt-4 space-y-2.5">
          {PERGUNTAS.map(([p, r], i) => (
            <details key={p} open={i < 2} className="card group p-4 transition hover:border-line-strong">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-cream [&::-webkit-details-marker]:hidden">
                {p}<ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{r}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] text-subtle">A Namy não é ligada à Shopee, ao Pinterest nem ao YouTube. Use só conteúdo que você pode publicar. A Namy não entra em conta, não usa cookie e não tira proteção do vídeo.</p>
      </section>
    </div>
  );
}
