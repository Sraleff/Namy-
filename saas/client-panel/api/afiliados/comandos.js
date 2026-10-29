/**
 * Comandos do afiliado pelo celular (D1). Só o dono da conta, escrevendo no chat
 * "mensagem para você mesmo" do número conectado; a resposta vai para o mesmo chat.
 * Nunca responde em conversa com outra pessoa nem em grupo (lá só existe o !nicho).
 *
 *   !ajuda   !status   !pausar   !retomar   !enviar   !fila   !oferta <texto>   !comissao
 * "!oferta" respondendo (citando) uma mensagem guarda o texto citado no banco de ofertas.
 */
const whatsMsg = require('./whatsMsg')
const cerebro = require('./cerebro')
const pool = require('./pool')
const limites = require('./limites')
const diagnostico = require('./diagnostico')
const { criarLimitador } = require('./linkRoutes')

const RECENTE_MS = 2 * 60 * 1000
const permitir = criarLimitador(10, 60 * 1000)
const executar = criarLimitador(1, 20 * 1000)
const licencaAtiva = (cfg) => !!(cfg && cfg.license && cfg.license.active && new Date(cfg.license.expiresAt) > new Date())
const dmy = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso))
const reais = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')

const AJUDA = [
  '🤖 *Comandos da Namy* (só aqui, no chat com você mesmo)',
  '',
  '!status — como está a automação agora',
  '!pausar — pausa os envios automáticos',
  '!retomar — volta a enviar',
  '!enviar — faz um envio agora',
  '!fila — as próximas ofertas do banco',
  '!oferta <texto com link> — guarda uma oferta no banco',
  '   (ou responda a uma mensagem com !oferta)',
  '!comissao — último resumo de comissões'
].join('\n')

/** É comando do dono? Mensagem própria, recente, no chat consigo mesmo, começando com "!". */
function ehComando(sock, m, texto, agora = Date.now()) {
  if (!m || !m.key || !m.key.fromMe) return false
  if (!whatsMsg.chatProprio(sock, m.key.remoteJid)) return false
  const ts = Number(m.messageTimestamp) * 1000
  if (ts && agora - ts > RECENTE_MS) return false
  return /^!\S/.test(String(texto || '').trim())
}

function citado(m) {
  const msg = whatsMsg.desembrulhar(m.message)
  const ctx = whatsMsg.contextoDe(msg)
  return ctx && ctx.quotedMessage ? String(whatsMsg.textoDe(whatsMsg.desembrulhar(ctx.quotedMessage)) || '') : ''
}

/**
 * deps: { readJson, CONFIGS, DATA, logs, salvarCfg(userId, fn), sessions, executarAgora(userId, opcoes) }
 * (limitador/limitadorEnvio opcionais, para teste).
 * Devolve o texto da resposta (ou '' quando não é comando). Quem chama envia.
 */
async function responder(deps, userId, m, texto) {
  const cfg = deps.readJson(deps.CONFIGS, {})[userId]
  if (!cfg) return ''
  if (!cerebro.carregar(deps.DATA, userId).comandos.ativo) return ''
  const partes = String(texto || '').trim().split(/\s+/)
  const cmd = partes[0].slice(1).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const resto = String(texto || '').trim().slice(partes[0].length).trim()
  if (!(deps.limitador || permitir)(userId)) return '⏳ Muitos comandos seguidos. Espere um minuto.'
  if (cmd === 'ajuda' || cmd === 'menu') return AJUDA
  if (cmd === 'nicho') return 'O !nicho funciona dentro do grupo: mande lá para ver ou trocar o nicho dele.'
  if (!licencaAtiva(cfg) && cmd !== 'status') return '🔒 Sua licença venceu. Renove em Configurações para usar os comandos.'

  if (cmd === 'status') {
    const d = diagnostico.diagnosticar({ userId, cfg, dataDir: deps.DATA, sessions: deps.sessions })
    const ads = cfg.ads || {}
    const ativas = pool.listar(deps.DATA, userId).filter((i) => i.ativo && !i.expirado).length
    const lic = cfg.license || {}
    return [
      '📊 *Namy agora*',
      'Automação: ' + (ads.enabled ? 'ligada' : 'pausada'),
      'Hoje: ' + d.hoje.enviados + ' de ' + d.hoje.limite + ' envios',
      'Banco: ' + ativas + ' oferta(s) ativa(s)',
      'Plano: ' + limites.limitesDe(cfg).rotulo + (lic.expiresAt ? ' até ' + dmy(lic.expiresAt) : ''),
      '',
      d.frase
    ].join('\n')
  }

  if (cmd === 'pausar') {
    deps.salvarCfg(userId, (cur) => { cur.ads = Object.assign({}, cur.ads, { enabled: false }) })
    if (deps.logs) deps.logs.append(deps.DATA, userId, { source: 'comandos', level: 'info', ok: true, message: 'Automação pausada pelo celular (!pausar).' })
    return '⏸️ Automação pausada. Para voltar: !retomar'
  }

  if (cmd === 'retomar' || cmd === 'ligar') {
    deps.salvarCfg(userId, (cur) => { cur.ads = Object.assign({}, cur.ads, { enabled: true }) })
    if (deps.logs) deps.logs.append(deps.DATA, userId, { source: 'comandos', level: 'info', ok: true, message: 'Automação ligada pelo celular (!retomar).' })
    const novo = deps.readJson(deps.CONFIGS, {})[userId] || cfg
    const d = diagnostico.diagnosticar({ userId, cfg: novo, dataDir: deps.DATA, sessions: deps.sessions })
    return '▶️ Automação ligada.\n' + d.frase
  }

  if (cmd === 'enviar') {
    const r = await deps.executarAgora(userId, { liberar: () => (deps.limitadorEnvio || executar)(userId) })
    return (r.ok ? '✅ ' : '⚠️ ') + (r.mensagem || 'Pronto.')
  }

  if (cmd === 'fila') {
    const lista = pool.listar(deps.DATA, userId).filter((i) => i.ativo && !i.expirado)
      .sort((a, b) => (Number(b.prioridade) || 0) - (Number(a.prioridade) || 0)).slice(0, 5)
    if (!lista.length) return '📭 O banco de ofertas está vazio. Mande !oferta com um link para guardar uma.'
    return ['📦 *Próximas ofertas do banco*'].concat(lista.map((i, n) => (n + 1) + '. ' + String(i.nome).slice(0, 60) + (i.envios ? ' (já foi para ' + i.envios + ' grupo(s))' : ''))).join('\n')
  }

  if (cmd === 'oferta') {
    const textoOferta = resto || citado(m)
    if (!textoOferta) return 'Mande !oferta seguido do texto com o link, ou responda a uma mensagem com !oferta.'
    try {
      const out = await pool.adicionar(deps.DATA, userId, cfg, { texto: textoOferta, origem: 'manual' })
      return out.duplicado ? '♻️ Essa oferta já estava no banco.' : '✅ Oferta guardada no banco: ' + String(out.item.nome).slice(0, 80)
    } catch (e) {
      return '⚠️ ' + (e.message || 'Não consegui guardar a oferta.')
    }
  }

  if (cmd === 'comissao' || cmd === 'comissoes') {
    if (!limites.podeRecurso(cfg, 'comissoes')) return 'Comissões fazem parte do plano Pro.'
    const u = require('./comissoes').ultimo(deps.DATA, userId)
    if (!u) return '💰 Ainda não há resumo de comissões. Abra Comissões no painel para buscar o relatório da Shopee.'
    return [
      '💰 *Comissões* (' + u.periodo.de.split('-').reverse().join('/') + ' a ' + u.periodo.ate.split('-').reverse().join('/') + ')',
      'Estimado: ' + reais(u.estimado),
      'Pendente: ' + reais(u.totais.pendente) + ' · Concluído: ' + reais(u.totais.concluido),
      'Vendas: ' + (u.vendas.pendente + u.vendas.concluido + u.vendas.outro),
      'Atualizado em ' + dmy(u.atualizadoEm) + '.'
    ].join('\n')
  }

  return 'Não conheço esse comando. Mande !ajuda para ver a lista.'
}

module.exports = { ehComando, responder, AJUDA }
