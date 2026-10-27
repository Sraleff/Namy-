import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Database, ListOrdered, Search, Send, ShieldCheck, Shuffle, Store, Tag, Users, X, Zap } from 'lucide-react';
import IconTile from '../components/ui/IconTile';
import Skeleton from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import { Button, Notice, Switch } from '../components/ui/Form';
import { useAsync } from '../hooks/useAsync';
import * as ep from '../services/endpoints';
import { go } from '../lib/route';
import { cx, formatNumber } from '../lib/format';

// Passo a passo da automação (C4). Junta o que já existe em Grupos, Ofertas e Automações:
// cada passo grava ao tocar em Continuar e só se algo mudou. Sair no meio mantém o que já foi salvo.
const PASSOS = ['Onde publicar', 'O assunto de cada grupo', 'De onde vêm as ofertas', 'Ritmo de envio'];
const hora = (h) => String(h || '').replace(':00', 'h');
const ICONE_PERFIL = { seguro: ShieldCheck, equilibrado: Send, intenso: Zap };
const inicial = (nome) => ((String(nome).match(/[\p{L}\p{N}]/u) || ['?'])[0]).toUpperCase();

function Opcao({ on, onClick, icon: Icone, titulo, extra, children, detalhes }) {
  return (
    <button
      type="button" role="radio" aria-checked={on} onClick={onClick}
      className={cx('glass glass-hover flex w-full gap-3 rounded-2xl p-4 text-left', on && '!border-brand-300/50 !bg-brand-500/15')}
    >
      <span aria-hidden="true" className={cx('mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2', on ? 'border-brand-300' : 'border-slate-500')}>
        {on && <span className="h-2.5 w-2.5 rounded-full bg-brand-300" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-cream">
          {Icone && <Icone className="h-4 w-4" aria-hidden="true" />}{titulo}{extra}
        </span>
        <span className="mt-1 block text-[13px] text-muted">{children}</span>
        {detalhes && <span className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-slate-300">{detalhes}</span>}
      </span>
    </button>
  );
}

function Risco({ risco, titulo }) {
  if (!risco) return null;
  const alto = risco.nivel === 'alto';
  const medio = risco.nivel === 'medio';
  return (
    <div role="status" className={cx('flex gap-2.5 rounded-2xl border p-3.5 text-[13px]', alto ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : medio ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100')}>
      {alto || medio ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
      <div>
        <b>{titulo}: risco {alto ? 'alto' : medio ? 'médio' : 'baixo'}.</b>{' '}
        {risco.avisos?.length ? risco.avisos.join(' ') : `Até ${risco.porGrupoPorDia} oferta(s) por dia em cada um dos ${risco.nGrupos} grupo(s).`}
      </div>
    </div>
  );
}

export default function Configurar({ resumo, onDataChanged }) {
  const grupos = useAsync(ep.waGroups, []);
  const info = useAsync(ep.affiliateSummary, []);
  const cfg = useAsync(ep.getConfig, []);
  const perf = useAsync(ep.getProfiles, []);
  const uso = useAsync(ep.getUso, []);

  const [passo, setPasso] = useState(1);
  const [escolha, setEscolha] = useState(null); // Set de jids (null = ainda o que está salvo)
  const [nichoEditado, setNichoEditado] = useState({}); // jid -> nicho escolhido aqui
  const [fonte, setFonte] = useState(null);
  const [perfil, setPerfil] = useState(null); // id do perfil ou 'manter'
  const [ligar, setLigar] = useState(true);
  const [risco, setRisco] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const lista = grupos.data?.groups || [];
  const salvos = grupos.data?.selected || [];
  const fontes = useMemo(() => new Set((grupos.data?.sources || []).map((g) => g.jid)), [grupos.data]);
  const salvosSet = useMemo(() => new Set(salvos.map((g) => g.jid)), [salvos]);
  const sel = escolha ?? salvosSet;
  const nichos = info.data?.nichos || [];
  const nichoSalvo = Object.fromEntries(salvos.map((g) => [g.jid, g.niche || 'geral']));
  const nichoDe = (jid) => nichoEditado[jid] ?? nichoSalvo[jid] ?? 'geral';
  const fonteSalva = cfg.data?.ads?.source || 'api';
  const fonteAtual = fonte ?? fonteSalva;
  const perfis = perf.data?.perfis || [];
  const perfilAtual = perfil ?? (perf.data && perf.data.atual !== 'personalizado' ? perf.data.atual : 'seguro');
  const maxDestinos = uso.data?.destinos?.max;
  const shopeeOk = !!info.data?.marketplaces?.shopee?.ok;

  // Risco do perfil escolhido, calculado pelo servidor com os grupos da conta
  useEffect(() => {
    if (!perf.data || !cfg.data || passo !== 4) return undefined;
    if (perfilAtual === 'manter') { setRisco(perf.data.risco); return undefined; }
    const p = perfis.find((x) => x.id === perfilAtual);
    if (!p) return undefined;
    let vivo = true;
    ep.checkRisk({ ...cfg.data.ads, ...p.ads, window: { ...p.ads.window } }).then((r) => vivo && setRisco(r.risco)).catch(() => vivo && setRisco(null));
    return () => { vivo = false; };
  }, [perfilAtual, passo, perf.data, cfg.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(
    () => [...lista]
      .filter((g) => g.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (salvosSet.has(b.jid) - salvosSet.has(a.jid)) || (fontes.has(a.jid) - fontes.has(b.jid)) || b.participants - a.participants),
    [lista, q, salvosSet, fontes],
  );

  const alternar = (jid) => {
    const n = new Set(sel);
    n.has(jid) ? n.delete(jid) : n.add(jid);
    setEscolha(n);
  };

  const sair = () => (window.history.length > 1 ? window.history.back() : go('inicio'));

  async function continuar() {
    setErro(null);
    setBusy(true);
    try {
      if (passo === 1) {
        if (!sel.size) throw new Error('Escolha pelo menos um grupo para a Namy publicar.');
        if (maxDestinos && sel.size > maxDestinos) throw new Error(`O seu plano permite até ${maxDestinos} grupos de divulgação.`);
        const mudou = sel.size !== salvosSet.size || [...sel].some((j) => !salvosSet.has(j));
        if (mudou) {
          await ep.saveAdGroups(lista.filter((g) => sel.has(g.jid)).map(({ jid, name }) => ({ jid, name })));
          await grupos.reload({ silent: true });
          setEscolha(null);
          perf.reload({ silent: true }); // o risco de hoje depende de quantos grupos recebem
          uso.reload({ silent: true });
        }
      } else if (passo === 2) {
        const mudaram = [...sel].filter((j) => nichoEditado[j] && nichoEditado[j] !== (nichoSalvo[j] || 'geral'));
        for (const j of mudaram) await ep.setGroupNiche(j, nichoEditado[j]);
        if (mudaram.length) { await grupos.reload({ silent: true }); setNichoEditado({}); }
      } else if (passo === 3) {
        if (fonteAtual !== fonteSalva) {
          await ep.saveConfig({ ads: { source: fonteAtual } });
          await cfg.reload({ silent: true });
        }
      } else if (passo === 4) {
        const p = perfis.find((x) => x.id === perfilAtual);
        const ads = perfilAtual === 'manter' || !p ? { enabled: ligar } : { ...p.ads, window: { ...p.ads.window }, enabled: ligar };
        await ep.saveConfig({ ads });
        await cfg.reload({ silent: true });
        onDataChanged?.();
      }
      setPasso((n) => n + 1);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErro({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const carregando = !grupos.data && !grupos.error;
  const pronto = passo > 4;
  const destinosSalvos = salvos.filter((g) => !fontes.has(g.jid));
  const perfilFinal = perfis.find((x) => x.id === perfilAtual);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Cabeçalho do passo a passo: sair, título e progresso */}
      <div className="pt-safe sticky top-0 z-20 -mx-4 -mt-5 mb-5 border-b border-line bg-ink-950/75 px-4 backdrop-blur-xl sm:-mx-6 sm:-mt-6 sm:px-6 lg:top-[76px] lg:mx-0 lg:mt-0 lg:rounded-2xl lg:border lg:px-5">
        <div className="flex h-14 items-center gap-3">
          <button type="button" onClick={sair} className="icon-btn h-10 w-10" aria-label="Sair do passo a passo"><X className="h-5 w-5" /></button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-cream">Configurar a automação</h1>
          <span className="text-[13px] text-muted">{pronto ? 'Pronto' : `Passo ${passo} de 4`}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 pb-3" role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.min(passo, 4)}>
          {PASSOS.map((t, i) => <span key={t} className={cx('h-1 rounded-full', i < passo ? 'bg-brand-gradient' : 'bg-ink-700')} />)}
        </div>
      </div>

      {!pronto && (
        <>
          <h2 className="text-2xl font-bold tracking-tight text-cream">{PASSOS[passo - 1]}</h2>
          <p className="mt-1 text-sm text-muted">
            {passo === 1 && 'Marque os grupos onde a Namy pode mandar ofertas. Você é quem escolhe: nenhum grupo entra sozinho.'}
            {passo === 2 && 'Grupo com assunto só recebe oferta daquele tema, e a busca da Shopee usa o assunto de cada grupo. “Geral” recebe de tudo.'}
            {passo === 3 && 'Escolha de onde a Namy tira as ofertas que manda nos seus grupos.'}
            {passo === 4 && 'Quanto mais devagar, menor o risco de o WhatsApp limitar o seu número.'}
          </p>
        </>
      )}

      <div className="mt-4 space-y-2.5">
        {carregando && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        {grupos.error && (
          <Notice msg={{ tone: 'error', text: `${grupos.error.message}. Conecte o WhatsApp em Configurações para escolher os grupos.` }} />
        )}

        {/* 1. Grupos */}
        {passo === 1 && grupos.data && (
          <>
            <label className="glass flex h-12 items-center gap-3 rounded-2xl px-4 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-500/15">
              <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
              <span className="sr-only">Filtrar grupos</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Filtrar grupos por nome" className="min-w-0 flex-1 bg-transparent text-base text-cream placeholder:text-subtle focus:outline-none sm:text-sm" />
            </label>
            {maxDestinos != null && (
              <p className={cx('tabular px-1 text-[12.5px]', sel.size > maxDestinos ? 'text-amber-300' : 'text-muted')}>{sel.size} de {maxDestinos} grupos do seu plano</p>
            )}
            <ul className="space-y-2">
              {filtrados.map((g) => {
                const on = sel.has(g.jid);
                const fonte = fontes.has(g.jid);
                return (
                  <li key={g.jid}>
                    <label className={cx('glass flex min-h-[60px] cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 transition hover:border-line-strong', on && '!border-brand-300/50 !bg-brand-500/15', fonte && !on && 'cursor-not-allowed opacity-55')}>
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-indigo-500" checked={on} disabled={fonte && !on} onChange={() => alternar(g.jid)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-cream">{g.name}</span>
                        <span className="tabular block text-xs text-muted">{formatNumber(g.participants)} pessoas{fonte ? ', é grupo de captura' : ''}</span>
                      </span>
                      {fonte && on && <Badge variant="warning">Também é captura</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* 2. Assunto de cada grupo */}
        {passo === 2 && grupos.data && (
          destinosSalvos.length ? destinosSalvos.map((g, i) => (
            <section key={g.jid} className="card p-4" aria-labelledby={`n-${i}`}>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 font-bold text-indigo-200">{inicial(g.name)}</span>
                <p id={`n-${i}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold text-cream">{g.name}</p>
              </div>
              <div role="radiogroup" aria-labelledby={`n-${i}`} className="mt-3 flex flex-wrap gap-1.5">
                {nichos.map((n) => {
                  const on = nichoDe(g.jid) === n.id;
                  return (
                    <button
                      key={n.id} type="button" role="radio" aria-checked={on}
                      onClick={() => setNichoEditado((m) => ({ ...m, [g.jid]: n.id }))}
                      className={cx('h-9 rounded-full border px-3 text-[13px] font-semibold transition active:scale-95', on ? 'border-brand-300/50 bg-brand-500/30 text-white' : 'border-line bg-ink-800 text-slate-300 hover:border-line-strong hover:bg-ink-750')}
                    >
                      {n.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )) : <Notice msg={{ tone: 'warn', text: 'Nenhum grupo de divulgação salvo. Volte e escolha pelo menos um.' }} />
        )}

        {/* 3. Fonte das ofertas */}
        {passo === 3 && cfg.data && (
          <div role="radiogroup" aria-label="De onde vêm as ofertas" className="space-y-2.5">
            <Opcao on={fonteAtual === 'api'} onClick={() => setFonte('api')} icon={Store} titulo="Shopee automática"
              detalhes={shopeeOk ? <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />Chaves da Shopee salvas</span> : <span className="text-amber-300">Falta salvar as chaves da Shopee</span>}>
              A Namy busca produtos na Shopee pelo assunto de cada grupo, com o seu link de afiliado.
            </Opcao>
            <Opcao on={fonteAtual === 'pool'} onClick={() => setFonte('pool')} icon={Database} titulo="Só o banco de ofertas"
              detalhes={<>{resumo?.ofertasNoBanco != null && <span>{formatNumber(resumo.ofertasNoBanco)} ofertas prontas</span>}<span>{fontes.size} grupo(s) de captura</span></>}>
              Só o que você colou, salvou da Vitrine ou a Namy capturou dos grupos de captura.
            </Opcao>
            <Opcao on={fonteAtual === 'misto'} onClick={() => setFonte('misto')} icon={Shuffle} titulo="Os dois">
              Primeiro o banco de ofertas; quando faltar oferta para um grupo, a Shopee completa.
            </Opcao>
            {fonteAtual !== 'pool' && !shopeeOk && info.data && (
              <Notice msg={{ tone: 'warn', text: 'Sem as chaves da Shopee, a busca automática não funciona. Salve App ID e Secret em Configurações → Marketplaces.' }} />
            )}
            <p className="px-1 pt-1 text-xs text-muted">Os grupos de captura são escolhidos em <a href="#ofertas" className="link-subtle">Banco de ofertas</a>. Você pode trocar tudo isso depois.</p>
          </div>
        )}

        {/* 4. Ritmo e ligar */}
        {passo === 4 && perf.data && (
          <div className="space-y-2.5">
            {perf.data.atual === 'personalizado' && <Risco risco={perf.data.risco} titulo="Hoje (configuração própria)" />}
            <div role="radiogroup" aria-label="Ritmo de envio" className="space-y-2.5">
              {perfis.map((p) => (
                <Opcao
                  key={p.id} on={perfilAtual === p.id} onClick={() => setPerfil(p.id)} icon={ICONE_PERFIL[p.id]} titulo={p.rotulo}
                  extra={p.recomendado && <Badge variant="success">Recomendado</Badge>}
                  detalhes={<><span>até {p.ads.dailyLimit} por dia</span><span>a cada {p.ads.intervalMin} a {p.ads.intervalMax} min</span><span>das {hora(p.ads.window.from)} às {hora(p.ads.window.to)}</span></>}
                >
                  {p.descricao}
                </Opcao>
              ))}
              {perf.data.atual === 'personalizado' && (
                <Opcao on={perfilAtual === 'manter'} onClick={() => setPerfil('manter')} titulo="Manter a minha configuração">
                  Não mexe no intervalo, no horário nem no limite que você ajustou em Automações.
                </Opcao>
              )}
            </div>
            {risco && <Risco risco={risco} titulo={perfilAtual === 'manter' ? 'Mantendo a sua' : `Com o ${perfilFinal?.rotulo || 'perfil'}`} />}
            <div className="card flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-cream">Ligar a automação ao concluir</p>
                <p className="text-[12.5px] text-muted">{ligar ? 'A Namy começa a enviar sozinha no próximo horário permitido.' : 'Fica tudo salvo, mas nada sai até você ligar.'}</p>
              </div>
              <Switch on={ligar} onChange={setLigar} label="Ligar a automação ao concluir" />
            </div>
          </div>
        )}

        {/* Pronto */}
        {pronto && (
          <div className="pt-4 text-center">
            <span className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-[26px] bg-emerald-500/15 text-emerald-300 shadow-[0_0_0_8px_rgba(34,197,94,0.07)]">
              <Check className="h-9 w-9" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-cream">Tudo pronto</h2>
            <p className="mt-1 text-sm text-muted">{ligar ? 'A automação está ligada.' : 'Está tudo salvo e a automação continua desligada.'} Você pode mudar qualquer coisa depois.</p>
            <ul className="card mt-5 p-1.5 text-left">
              {[
                [Users, 'green', `${destinosSalvos.length} grupo(s) recebem ofertas`, destinosSalvos.map((g) => g.name).join(', ')],
                [Tag, 'violet', 'Assunto de cada grupo', destinosSalvos.map((g) => nichos.find((n) => n.id === (g.niche || 'geral'))?.label || 'Geral').join(', ')],
                [fonteAtual === 'pool' ? Database : fonteAtual === 'misto' ? Shuffle : Store, 'indigo', fonteAtual === 'pool' ? 'Só o banco de ofertas' : fonteAtual === 'misto' ? 'Banco e Shopee' : 'Shopee automática', fonteAtual === 'api' ? 'busca pelo assunto de cada grupo' : 'o banco vem primeiro'],
                [ShieldCheck, 'blue', perfilAtual === 'manter' || !perfilFinal ? 'Configuração própria' : `Perfil ${perfilFinal.rotulo}`, perfilFinal && perfilAtual !== 'manter' ? `até ${perfilFinal.ads.dailyLimit} por dia, das ${hora(perfilFinal.ads.window.from)} às ${hora(perfilFinal.ads.window.to)}` : 'como está em Automações'],
              ].map(([I, t, a, b]) => (
                <li key={a} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
                  <IconTile icon={I} tone={t} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-cream">{a}</span>
                    <span className="block truncate text-xs text-muted">{b}</span>
                  </span>
                </li>
              ))}
            </ul>
            <a href="#inicio" className="mt-5 flex h-[52px] items-center justify-center rounded-2xl bg-brand-gradient text-base font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]">Ir para o Início</a>
            <a href="#fila" className="mt-2.5 flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-line-strong bg-ink-800 text-base font-semibold text-cream transition hover:bg-ink-750 active:scale-[0.98]">
              <ListOrdered className="h-4 w-4" aria-hidden="true" /> Ver a fila de envio
            </a>
          </div>
        )}
      </div>

      {!pronto && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-950/80 px-4 pt-3 backdrop-blur-xl lg:left-[272px]">
          <div className="mx-auto max-w-2xl pb-3">
            <Notice className="mb-2.5" msg={erro} />
            <div className="grid grid-cols-[1fr_1.7fr] gap-2.5">
              <Button size="lg" variant="secondary" icon={ArrowLeft} disabled={busy} onClick={() => (passo === 1 ? sair() : (setErro(null), setPasso((n) => n - 1)))}>
                {passo === 1 ? 'Sair' : 'Voltar'}
              </Button>
              <Button size="lg" busy={busy} disabled={carregando || !!grupos.error} onClick={continuar}>
                {passo < 4 ? 'Continuar' : ligar ? 'Salvar e ligar' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
