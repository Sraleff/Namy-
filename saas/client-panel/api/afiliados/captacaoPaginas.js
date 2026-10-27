/**
 * HTML das páginas públicas de captação (D5). Sem JavaScript e sem recurso externo além das
 * fotos dos produtos (https). Tudo que vem do cliente ou da oferta passa por esc().
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const LOJA = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' }

const CSS = `
:root{--bg:#f6f7fb;--card:#fff;--txt:#14161f;--sub:#5b6170;--line:#e4e6ee;--brand:#5b4bff;--zap:#1fa855}
@media (prefers-color-scheme:dark){:root{--bg:#0e1017;--card:#171a24;--txt:#eef0f6;--sub:#a2a8b8;--line:#272b38;--brand:#8a7dff;--zap:#25c464}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 40px}
h1{font-size:1.5rem;line-height:1.25;margin:8px 0 6px}p{margin:0 0 12px}.sub{color:var(--sub)}
.btn{display:inline-block;border-radius:12px;padding:14px 22px;font-weight:600;text-decoration:none;color:#fff;background:var(--zap)}
.btn.sec{background:var(--brand)}.centro{text-align:center;padding-top:12vh}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:var(--line);display:block}
.semfoto{width:100%;aspect-ratio:1/1;background:var(--line)}
.card div{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.nome{font-size:.9rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.preco{font-weight:700}.loja{font-size:.75rem;color:var(--sub)}
.card a{margin-top:auto;text-align:center;border-radius:10px;padding:9px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;font-size:.9rem}
footer{margin-top:28px;font-size:.75rem;color:var(--sub);text-align:center}
`

function pagina(titulo, corpo) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(titulo) + '</title><style>' + CSS + '</style></head><body><main>' + corpo + '</main></body></html>'
}

const AVISO = '<footer>Alguns links são de afiliado: quem divulga pode receber comissão pelas compras, sem custo extra para você.</footer>'

function grupos({ titulo, descricao, entrarHref, disponivel }) {
  const t = titulo || 'Grupo de ofertas'
  const corpo = '<div class="centro"><h1>' + esc(t) + '</h1>' +
    (descricao ? '<p class="sub">' + esc(descricao) + '</p>' : '') +
    (disponivel
      ? '<p><a class="btn" href="' + esc(entrarHref) + '" rel="nofollow">Entrar no grupo do WhatsApp</a></p><p class="sub">Você será levado ao grupo com vaga agora.</p>'
      : '<p class="sub">Os grupos estão cheios ou indisponíveis no momento. Tente de novo mais tarde.</p>') +
    '</div>'
  return pagina(t, corpo)
}

function vitrine({ titulo, descricao, itens, irHref, grupoHref }) {
  const t = titulo || 'Ofertas do dia'
  const cards = itens.map((i) => '<article class="card">' +
    (i.imageUrl ? '<img src="' + esc(i.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="semfoto" aria-hidden="true"></span>') +
    '<div><span class="nome">' + esc(i.nome) + '</span>' +
    (i.preco ? '<span class="preco">' + esc(i.preco) + '</span>' : '') +
    '<span class="loja">' + esc(LOJA[i.marketplace] || '') + '</span>' +
    '<a href="' + esc(irHref(i.id)) + '" rel="nofollow sponsored">Ver oferta</a></div></article>').join('')
  const corpo = '<h1>' + esc(t) + '</h1>' +
    (descricao ? '<p class="sub">' + esc(descricao) + '</p>' : '') +
    (grupoHref ? '<p><a class="btn" href="' + esc(grupoHref) + '" rel="nofollow">Receber ofertas no WhatsApp</a></p>' : '') +
    (itens.length ? '<section class="grade">' + cards + '</section>' : '<p class="sub">Nenhuma oferta agora. Volte mais tarde.</p>') +
    AVISO
  return pagina(t, corpo)
}

function naoEncontrada() {
  return pagina('Página não encontrada', '<div class="centro"><h1>Página não encontrada</h1><p class="sub">Este endereço não existe ou foi desativado.</p></div>')
}

function muitasVisitas() {
  return pagina('Muitos acessos', '<div class="centro"><h1>Muitos acessos seguidos</h1><p class="sub">Espere um minuto e tente de novo.</p></div>')
}

module.exports = { esc, grupos, vitrine, naoEncontrada, muitasVisitas }
