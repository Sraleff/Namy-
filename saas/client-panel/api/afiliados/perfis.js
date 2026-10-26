/**
 * Perfis de envio e medidor de risco (C1). O WhatsApp NAO publica limites oficiais de banimento:
 * os perfis e o medidor sao precaucoes conservadoras, nao garantia. Nada aqui grava configuracao:
 * escolher um perfil so preenche o formulario; vale quando o cliente salva.
 */
const PERFIS = {
  seguro: {
    id: 'seguro', rotulo: 'Seguro', recomendado: true,
    descricao: 'Poucos envios, bem espacados, com pausa entre grupos. O melhor para numero novo ou que voce nao quer arriscar.',
    ads: { intervalMode: 'aleatorio', intervalMin: 90, intervalMax: 180, perRunMin: 1, perRunMax: 1, dailyLimit: 4, window: { from: '09:00', to: '21:00' }, groupPauseMin: 6, groupPauseMax: 12 }
  },
  equilibrado: {
    id: 'equilibrado', rotulo: 'Equilibrado',
    descricao: 'Mais ofertas por dia, ainda com intervalo aleatorio e pausa entre grupos.',
    ads: { intervalMode: 'aleatorio', intervalMin: 45, intervalMax: 120, perRunMin: 1, perRunMax: 2, dailyLimit: 8, window: { from: '08:00', to: '22:00' }, groupPauseMin: 4, groupPauseMax: 8 }
  },
  intenso: {
    id: 'intenso', rotulo: 'Intenso',
    descricao: 'Muitos envios. Aumenta o risco de o WhatsApp limitar o numero: use so se aceitar esse risco.',
    ads: { intervalMode: 'aleatorio', intervalMin: 20, intervalMax: 60, perRunMin: 1, perRunMax: 3, dailyLimit: 20, window: { from: '08:00', to: '23:00' }, groupPauseMin: 3, groupPauseMax: 6 }
  }
}

const INTERVALOS_MIN = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '3h': 180, '6h': 360 }
const num = (v, padrao) => { const n = Number(v); return Number.isFinite(n) ? n : padrao }
const minutos = (hhmm, padrao) => { const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : padrao }

/** Normaliza o rascunho do formulario (lixo vira o padrao do disparo; nunca lanca). */
function normalizar(ads) {
  const a = ads && typeof ads === 'object' ? ads : {}
  const aleatorio = a.intervalMode === 'aleatorio'
  const iMin = aleatorio ? Math.min(720, Math.max(1, num(a.intervalMin, 30))) : (INTERVALOS_MIN[a.interval] || 120)
  const iMax = aleatorio ? Math.min(720, Math.max(iMin, num(a.intervalMax, 90))) : iMin
  const pMin = Math.min(10, Math.max(1, Math.round(num(a.perRunMin, 1))))
  const pMax = Math.min(10, Math.max(pMin, Math.round(num(a.perRunMax, 1))))
  const gMin = Math.min(60, Math.max(0, num(a.groupPauseMin, 0)))
  const gMax = Math.min(60, Math.max(gMin, num(a.groupPauseMax, 0)))
  const de = minutos(a.window && a.window.from, 0)
  const ate = minutos(a.window && a.window.to, 24 * 60 - 1)
  const janela = !(a.window && a.window.from && a.window.to) ? 24 * 60 : (de <= ate ? ate - de : 24 * 60 - de + ate)
  return { intervaloMed: (iMin + iMax) / 2, perRunMed: (pMin + pMax) / 2, perRunMax: pMax, pausaMax: gMax, pausaMin: gMin, janelaMin: Math.max(1, janela), limite: Math.min(200, Math.max(1, Math.round(num(a.dailyLimit, 5)))) }
}

/** { nivel: 'baixo'|'medio'|'alto', pontos, porGrupoPorDia, avisos[] } para o rascunho `ads` e `nGrupos` destinos. */
function risco(ads, nGrupos = 1) {
  const n = normalizar(ads)
  const cabem = Math.floor(n.janelaMin / n.intervaloMed) * n.perRunMed
  const porDia = Math.max(1, Math.round(Math.min(n.limite, Math.max(cabem, n.perRunMed))))
  const avisos = []
  let pontos = 0
  if (porDia > 20) { pontos += 3; avisos.push('Ate ' + porDia + ' ofertas por dia em cada grupo: muito.') }
  else if (porDia > 10) { pontos += 2; avisos.push('Ate ' + porDia + ' ofertas por dia em cada grupo.') }
  else if (porDia > 5) pontos += 1
  if (n.intervaloMed < 20) { pontos += 3; avisos.push('Intervalo medio de ' + Math.round(n.intervaloMed) + ' min entre envios: muito curto.') }
  else if (n.intervaloMed < 45) { pontos += 2; avisos.push('Intervalo medio de ' + Math.round(n.intervaloMed) + ' min entre envios.') }
  else if (n.intervaloMed < 90) pontos += 1
  if (n.perRunMax > 3) { pontos += 2; avisos.push('Ate ' + n.perRunMax + ' produtos seguidos por execucao.') }
  else if (n.perRunMax > 1) pontos += 1
  if (nGrupos > 1) {
    if (n.pausaMax === 0) { pontos += 2; avisos.push('Sem pausa entre grupos: a oferta vai para os ' + nGrupos + ' grupos de uma vez, em rajada.') }
    else if (n.pausaMin < 4) pontos += 1
  }
  if (n.janelaMin > 16 * 60) { pontos += 1; avisos.push('Janela de ' + Math.round(n.janelaMin / 60) + ' h por dia: o numero fica ativo quase o dia todo.') }
  const nivel = pontos <= 2 ? 'baixo' : pontos <= 4 ? 'medio' : 'alto'
  return { nivel, pontos, porGrupoPorDia: porDia, nGrupos, avisos }
}

const IGUAIS = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Qual perfil o formulario/conta esta usando agora: o id, ou 'personalizado'. */
function perfilAtual(ads) {
  const a = ads || {}
  const forma = (x) => ({ m: x.intervalMode, a: x.intervalMin, b: x.intervalMax, p: x.perRunMin, q: x.perRunMax, l: x.dailyLimit, f: x.window && x.window.from, t: x.window && x.window.to, g: x.groupPauseMin, h: x.groupPauseMax })
  for (const p of Object.values(PERFIS)) if (IGUAIS(forma(a), forma(p.ads))) return p.id
  return 'personalizado'
}

const lista = () => Object.values(PERFIS).map((p) => ({ id: p.id, rotulo: p.rotulo, descricao: p.descricao, recomendado: !!p.recomendado, ads: p.ads }))

module.exports = { PERFIS, lista, risco, perfilAtual, normalizar }
