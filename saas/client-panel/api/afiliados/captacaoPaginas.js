/**
 * HTML das páginas públicas de captação (D5). Sem JavaScript e sem recurso externo além das
 * fotos dos produtos (https). Tudo que vem do cliente ou da oferta passa por esc().
 * Visual: vidro fosco sobre manchas de cor, claro e escuro conforme o celular de quem abre.
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const LOJA = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' }

// Ícones no formato do lucide (traço), embutidos: a CSP não deixa carregar nada de fora
const ICONE = {
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  bolsa: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  cheio: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'
}
const icone = (n, cls = 'ic') => '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONE[n] + '</svg>'

const CSS = `
:root{--bg:#eef0fb;--m1:rgba(99,102,241,.30);--m2:rgba(139,92,246,.22);--m3:rgba(34,197,94,.16);--vidro:rgba(255,255,255,.58);--vidro2:rgba(255,255,255,.78);--borda:rgba(255,255,255,.75);--borda2:rgba(99,102,241,.35);--brilho:inset 0 1px 0 rgba(255,255,255,.9);--txt:#12141c;--sub:#555c6e;--linha:rgba(18,20,28,.08);--brand:#5b4bff;--brand2:#8b5cf6;--zap:#1da851;--zap2:#128c45;--sombra:0 10px 30px -14px rgba(40,44,90,.35);--sombra2:0 18px 40px -16px rgba(40,44,90,.45);--aviso:rgba(251,191,36,.16);--avisoB:rgba(217,119,6,.35);--avisoTxt:#7a4b00}
@media (prefers-color-scheme:dark){:root{--bg:#080c17;--m1:rgba(79,70,229,.45);--m2:rgba(124,58,237,.32);--m3:rgba(14,116,144,.28);--vidro:rgba(148,163,184,.08);--vidro2:rgba(148,163,184,.14);--borda:rgba(255,255,255,.10);--borda2:rgba(165,180,252,.40);--brilho:inset 0 1px 0 rgba(255,255,255,.07);--txt:#f1f3f9;--sub:#a3a9ba;--linha:rgba(255,255,255,.07);--brand:#7c6dff;--brand2:#a78bfa;--zap:#22c063;--zap2:#1a9e50;--sombra:0 10px 30px -14px rgba(0,0,0,.75);--sombra2:0 18px 40px -16px rgba(0,0,0,.85);--aviso:rgba(251,191,36,.10);--avisoB:rgba(251,191,36,.30);--avisoTxt:#f3c868}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:var(--txt);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;background-color:var(--bg);background-image:radial-gradient(520px 420px at -10% -8%,var(--m1),transparent 70%),radial-gradient(460px 380px at 110% 35%,var(--m2),transparent 70%),radial-gradient(420px 360px at 10% 105%,var(--m3),transparent 70%);background-attachment:fixed}
a{color:inherit}
.ic{width:20px;height:20px;flex:none}
.sub{color:var(--sub)}
.vidro{background:var(--vidro);border:1px solid var(--borda);box-shadow:var(--brilho),var(--sombra);-webkit-backdrop-filter:blur(20px) saturate(160%);backdrop-filter:blur(20px) saturate(160%)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.vidro{background:var(--vidro2)}}
.avatar{width:76px;height:76px;border-radius:26px;margin:0 auto;display:grid;place-items:center;font-size:2rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 12px 30px -8px rgba(91,75,255,.55),inset 0 1px 0 rgba(255,255,255,.35)}
.avatar.p{width:56px;height:56px;font-size:1.5rem;border-radius:19px;margin:0;flex:none}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;border-radius:17px;padding:0 22px;font-weight:700;font-size:1.05rem;text-decoration:none;color:#fff;background:linear-gradient(180deg,var(--zap),var(--zap2));box-shadow:0 10px 24px -8px rgba(29,168,81,.55),inset 0 1px 0 rgba(255,255,255,.3);transition:transform .15s,filter .18s,box-shadow .18s}
.btn .ic{width:22px;height:22px}
.btn:active{transform:scale(.98)}
a:focus-visible{outline:2px solid var(--brand);outline-offset:3px}
@media (hover:hover){.btn:hover{filter:brightness(1.08);box-shadow:0 14px 30px -8px rgba(29,168,81,.7),inset 0 1px 0 rgba(255,255,255,.35)}}

/* link de grupos */
.landing{max-width:440px;margin:0 auto;padding:56px 16px 32px}
.painel{border-radius:28px;padding:32px 24px 24px;text-align:center}
.painel h1{font-size:1.6rem;line-height:1.2;margin:18px 0 8px;letter-spacing:-.02em}
.painel>p{margin:0 0 22px}
.selos{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;font-size:.85rem;color:var(--sub)}
.selos li{display:flex;align-items:center;gap:5px}.selos .ic{width:16px;height:16px;color:var(--zap)}
.passos{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:10px;counter-reset:p}
.passos li{counter-increment:p;display:flex;align-items:center;gap:12px;border-radius:18px;padding:12px 14px;font-size:.92rem}
.passos li::before{content:counter(p);flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:.85rem;color:var(--brand);background:color-mix(in srgb,var(--brand) 16%,transparent)}
.cheio{display:flex;gap:12px;text-align:left;align-items:flex-start;background:var(--aviso);border:1px solid var(--avisoB);color:var(--avisoTxt);border-radius:18px;padding:14px 16px;font-size:.92rem}
.cheio strong{display:block;margin-bottom:2px}
.seguro{display:flex;align-items:center;justify-content:center;gap:6px;margin:18px 0 0;font-size:.78rem;color:var(--sub)}.seguro .ic{width:14px;height:14px}

/* vitrine */
.vit{max-width:980px;margin:0 auto;padding:28px 16px 40px}
.topo{display:flex;align-items:center;gap:14px}
.topo h1{font-size:1.45rem;line-height:1.2;margin:0;letter-spacing:-.02em}.topo p{margin:2px 0 0;font-size:.95rem}
.faixa{margin:20px 0 8px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border-radius:22px;padding:16px 18px}
.faixa strong{display:block}.faixa span{font-size:.88rem}
.faixa .btn{min-height:48px;font-size:.98rem;border-radius:15px}
.meta{display:flex;align-items:center;gap:6px;margin:22px 2px 12px;font-size:.85rem;color:var(--sub)}.meta .ic{width:16px;height:16px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
.card{position:relative;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;transition:transform .18s,box-shadow .18s,border-color .18s,background-color .18s}
@media (hover:hover){.card:hover{transform:translateY(-3px);border-color:var(--borda2);background:var(--vidro2);box-shadow:var(--brilho),var(--sombra2)}}
.foto{position:relative;aspect-ratio:1/1;background:#fff;display:grid;place-items:center}
.foto img{width:100%;height:100%;object-fit:contain;display:block}
.semfoto{color:#c3c7d4}.semfoto .ic{width:44px;height:44px}
.loja{position:absolute;top:8px;left:8px;font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:999px;color:#fff;background:#6b7280;box-shadow:0 0 0 1.5px rgba(255,255,255,.85)}
.loja.shopee{background:#ee4d2d}.loja.mercadolivre{background:#ffe600;color:#2d3277}.loja.amazon{background:#232f3e;color:#ff9900}
.info{padding:12px 12px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.nome{font-size:.88rem;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}
.preco{font-size:1.2rem;font-weight:800;letter-spacing:-.01em}
.quando{display:flex;align-items:center;gap:6px;font-size:.75rem;color:var(--sub)}
.novo{font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--zap);color:#fff}
.ver{margin-top:auto;display:flex;align-items:center;justify-content:center;border-radius:13px;padding:10px;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;text-decoration:none;font-weight:700;font-size:.88rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.25);transition:filter .18s,transform .15s}
.ver:active{transform:scale(.97)}
@media (hover:hover){.ver:hover{filter:brightness(1.1)}}
.vazio{text-align:center;padding:48px 16px;border-radius:22px}.vazio .ic{width:40px;height:40px;color:var(--sub)}
footer{margin-top:32px;font-size:.75rem;color:var(--sub);text-align:center;line-height:1.5}
.centro{max-width:440px;margin:0 auto;padding:18vh 16px 32px;text-align:center}.centro h1{font-size:1.4rem;margin:16px 0 6px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`

function pagina(titulo, corpo) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>' + esc(titulo) + '</title><style>' + CSS + '</style></head><body>' + corpo + '</body></html>'
}

const AVISO = '<footer>Alguns links são de afiliado: quem divulga pode receber comissão pelas compras, sem custo extra para você.</footer>'
const inicial = (t) => esc((String(t).trim().match(/[\p{L}\p{N}]/u) || ['★'])[0].toUpperCase())

function haQuanto(iso, agora) {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000))
  if (!Number.isFinite(min)) return ''
  if (min < 60) return min <= 1 ? 'agora mesmo' : 'há ' + min + ' min'
  const h = Math.round(min / 60)
  return h < 24 ? 'há ' + h + ' h' : h < 48 ? 'ontem' : 'há ' + Math.round(h / 24) + ' dias'
}

function grupos({ titulo, descricao, entrarHref, disponivel }) {
  const t = titulo || 'Grupo de ofertas'
  const corpo = '<main class="landing"><section class="painel vidro">' +
    '<div class="avatar" aria-hidden="true">' + inicial(t) + '</div>' +
    '<h1>' + esc(t) + '</h1>' +
    '<p class="sub">' + esc(descricao || 'Promoções e cupons selecionados, direto no seu WhatsApp.') + '</p>' +
    (disponivel
      ? '<a class="btn" href="' + esc(entrarHref) + '" rel="nofollow">' + icone('chat') + 'Entrar no grupo</a>' +
        '<ul class="selos"><li>' + icone('check') + 'Grátis</li><li>' + icone('check') + 'Só ofertas</li><li>' + icone('check') + 'Saia quando quiser</li></ul>'
      : '<div class="cheio" role="status">' + icone('cheio') + '<div><strong>Sem vaga agora</strong>Os grupos estão cheios ou indisponíveis no momento. Tente de novo em alguns minutos.</div></div>') +
    '</section>' +
    (disponivel ? '<ol class="passos"><li class="vidro">Toque no botão verde</li><li class="vidro">O WhatsApp abre o grupo com vaga</li><li class="vidro">Toque em “Entrar” e pronto: as ofertas chegam lá</li></ol>' : '') +
    '<p class="seguro">' + icone('escudo') + 'Esta página não pede nem guarda nenhum dado seu.</p>' +
    '</main>'
  return pagina(t, corpo)
}

function vitrine({ titulo, descricao, itens, irHref, grupoHref, agora = Date.now() }) {
  const t = titulo || 'Ofertas do dia'
  const cards = itens.map((i) => {
    const loja = LOJA[i.marketplace] || ''
    const recente = agora - new Date(i.at).getTime() < 3 * 3600000
    return '<article class="card vidro"><div class="foto">' +
      (i.imageUrl ? '<img src="' + esc(i.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="semfoto">' + icone('bolsa') + '</span>') +
      (loja ? '<span class="loja ' + esc(i.marketplace) + '">' + esc(loja) + '</span>' : '') +
      '</div><div class="info"><span class="nome">' + esc(i.nome) + '</span>' +
      (i.preco ? '<span class="preco">' + esc(i.preco) + '</span>' : '') +
      '<span class="quando">' + (recente ? '<span class="novo">Novo</span>' : '') + esc(haQuanto(i.at, agora)) + '</span>' +
      '<a class="ver" href="' + esc(irHref(i.id)) + '" rel="nofollow sponsored">Ver oferta</a></div></article>'
  }).join('')
  const corpo = '<main class="vit"><header class="topo"><div class="avatar p" aria-hidden="true">' + inicial(t) + '</div><div><h1>' + esc(t) + '</h1>' +
    (descricao ? '<p class="sub">' + esc(descricao) + '</p>' : '') + '</div></header>' +
    (grupoHref ? '<div class="faixa vidro"><div><strong>Receba as ofertas antes de todo mundo</strong><span class="sub">Entre no grupo do WhatsApp. É grátis.</span></div><a class="btn" href="' + esc(grupoHref) + '" rel="nofollow">' + icone('chat') + 'Entrar no grupo</a></div>' : '') +
    (itens.length
      ? '<p class="meta">' + icone('relogio') + itens.length + (itens.length === 1 ? ' oferta, atualizado ' : ' ofertas, atualizado ') + esc(haQuanto(itens[0].at, agora)) + '</p><section class="grade">' + cards + '</section>'
      : '<div class="vazio vidro">' + icone('bolsa') + '<p class="sub">Nenhuma oferta agora. Volte mais tarde.</p></div>') +
    AVISO + '</main>'
  return pagina(t, corpo)
}

function naoEncontrada() {
  return pagina('Página não encontrada', '<main class="centro"><div class="avatar" aria-hidden="true">?</div><h1>Página não encontrada</h1><p class="sub">Este endereço não existe ou foi desativado.</p></main>')
}

function muitasVisitas() {
  return pagina('Muitos acessos', '<main class="centro"><div class="avatar" aria-hidden="true">…</div><h1>Muitos acessos seguidos</h1><p class="sub">Espere um minuto e tente de novo.</p></main>')
}

module.exports = { esc, grupos, vitrine, naoEncontrada, muitasVisitas }
