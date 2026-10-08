/*
╭──────────────────────────────────────────────╮
│                 NAMY BOT                     │
│              Versão 3.1.0                    │
│                                              │
│ Base original: Rony / Spectrum              │
│ Pairing/conexão preservados                 │
╰──────────────────────────────────────────────╯
*/

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys')

const pino = require('pino')
const readline = require('readline')
const config = require('./config')
const { criarContexto } = require('./funcoes/mensagens')
const comandos = require('./comandos')
const intencoes = require('./intencoes')
const iaEstado = require('./funcoes/ia')
const router = require('./funcoes/ia/router')
const grupo = require('./funcoes/grupo')
const stats = require('./funcoes/stats')
const lembretes = require('./funcoes/lembretes')
const ratelimit = require('./funcoes/ratelimit')
const contexto = require('./saas/contexto')
const credenciais = require('./saas/credenciais')
let shopee = { iniciar: async () => ({ ok: false, motivo: 'ausente' }), parar: () => {} }
try {
    shopee = require('./shopee')
} catch (e) {
    console.error('[SHOPEE] modulo indisponivel (bot segue):', e?.message || e)
}
try {
    if (!comandos.cliente) comandos.cliente = require('./saas/commands')
    if (!comandos.minhaconta) comandos.minhaconta = require('./saas/conta')
} catch (e) {
    console.error('[SAAS] modulo indisponivel (bot segue):', e?.message || e)
}
const { migrarSePreciso } = require('./funcoes/migrar')
const { imprimir: imprimirDeps } = require('./funcoes/deps')
const { ehDono } = require('./funcoes/jid')

let jaPareou = false
let isConnecting = false
let reconnectTimer = null
let backoffMs = 3000

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

const question = (text) => new Promise((resolve) => rl.question(text, resolve))

process.on('unhandledRejection', (e) => {
    console.error('⚠️  Promise não tratada (bot segue):', e?.message || e)
})

function dentroDoLimite(ctx) {
    if (ehDono(ctx, config)) return true
    return ratelimit.permitir(
        ctx.senderJid || ctx.from,
        config.rateLimitMax,
        config.rateLimitJanelaSeg * 1000
    )
}

function credsDoChat(from) {
    try {
        return credenciais.paraChat(from)
    } catch (e) {
        // sem saber de quem é o grupo, não usa chave nenhuma
        console.error('[SAAS] contexto indisponível:', e.message)
        return { tenant: 'desconhecido', shopee: null, ia: {} }
    }
}

async function responderIA(client, ctx, info, from, texto) {
    await client.sendPresenceUpdate('composing', from).catch(() => {})
    const resposta = await router.conversar({ client, ctx, texto })
    if (!resposta) return false

    const modo = iaEstado.obterModo(from)
    const textoCurto = resposta.length <= 220

    if (textoCurto) {
        try {
            const { textoParaAudio } = require('./funcoes/tts')
            const audio = await textoParaAudio(resposta, modo === 'xai' ? 'grok' : modo)
            if (audio) {
                await client.sendMessage(
                    from,
                    { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true },
                    { quoted: info }
                )
                return true
            }
        } catch (e) {
            console.error('Erro TTS:', e.message)
        }
    }

    await client.sendMessage(from, { text: resposta }, { quoted: info })
    return true
}

async function processarMensagem(client, info) {
    const from = info.key.remoteJid

    try {
        await client.readMessages([{
            remoteJid: from,
            id: info.key.id,
            participant: info.key.participant
        }])
    } catch (_) {}

    const ctx = criarContexto({
        client,
        info,
        prefix: config.prefix,
        esperar: config.esperar
    })

    stats.registrarMensagem(from, ctx.isGroup)

    if (ctx.isGroup) {
        const cfg = grupo.obter(from)
        const admin = await grupo.ehAdmin(client, from, ctx.senderJid)
        const dono = ehDono(ctx, config)

        if (!admin && !dono) {
            if (cfg.antilink && grupo.temLink(ctx.body)) {
                try { await client.sendMessage(from, { delete: info.key }) } catch (_) {}
                await client.sendMessage(from, { text: '🛡️ Link bloqueado neste grupo.' })
                return
            }
            if (cfg.antiinvite && grupo.temConvite(ctx.body)) {
                try { await client.sendMessage(from, { delete: info.key }) } catch (_) {}
                return
            }
            if (cfg.antispam && grupo.registrarSpam(ctx.senderJid) >= 6) {
                await client.sendMessage(from, { text: '🛡️ Calma, spam detectado.' })
                return
            }
        }
    }

    // 1) Comandos
    if (ctx.body && ctx.isCmd) {
        const comando = comandos[ctx.comando]
        if (comando) {
            if (!dentroDoLimite(ctx)) return
            stats.registrarComando(ctx.comando)
            await comando(ctx)
            return
        }
    }

    if (!ctx.body || ctx.isCmd) return

    // 2) IA automática com decisão
    if (iaEstado.estaAtiva(from)) {
        const ferramenta = router.detectarFerramenta(ctx.body)
        const avaliacao = router.avaliarAutomatica(ctx, client)

        if (ferramenta && (avaliacao.sim || !ctx.isGroup)) {
            const handler = comandos[ferramenta]
            if (handler) {
                if (!dentroDoLimite(ctx)) return
                ctx.args = ctx.body.split(/\s+/).slice(1)
                ctx.texto = ctx.args.join(' ')
                await handler(ctx)
                return
            }
        }

        if (avaliacao.sim && dentroDoLimite(ctx)) {
            let respondeuIA = false
            try {
                respondeuIA = await responderIA(client, ctx, info, from, ctx.body)
            } catch (erro) {
                console.error('❌ Erro na IA automática:', erro.response?.status || erro.message)
            }
            if (respondeuIA) return
        }
    }

    // 3) Intenções rápidas (só se a IA automática não estiver no controle)
    if (!iaEstado.estaAtiva(from)) {
        const texto = ctx.body.toLowerCase()
        for (const [, intencao] of Object.entries(intencoes)) {
            const encontrou = intencao.padroes.some((padrao) => padrao.test(texto))
            if (encontrou) {
                const resposta = intencao.respostas[
                    Math.floor(Math.random() * intencao.respostas.length)
                ]
                await client.sendMessage(from, { text: resposta }, { quoted: info })
                break
            }
        }
    }
}

async function ligarbot() {
    if (isConnecting) return
    isConnecting = true

    try {
        migrarSePreciso()

        const { state, saveCreds } = await useMultiFileAuthState('./sessao')
        const { version } = await fetchLatestBaileysVersion()

        const client = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true
        })

        client.ev.on('creds.update', saveCreds)

        client.ev.on('group-participants.update', async (update) => {
            try {
                const cfg = grupo.obter(update.id)
                const botId = client.user?.id
                for (const jid of update.participants || []) {
                    if (botId && String(jid).includes(String(botId).split(':')[0])) continue
                    if (update.action === 'add' && cfg.welcome) {
                        const text = (cfg.mensagemWelcome || 'Bem-vindo(a)!').replace('@user', '@' + jid.split('@')[0])
                        await client.sendMessage(update.id, { text, mentions: [jid] })
                    }
                    if (update.action === 'remove' && cfg.goodbye) {
                        const text = (cfg.mensagemGoodbye || 'Até mais.').replace('@user', '@' + jid.split('@')[0])
                        await client.sendMessage(update.id, { text, mentions: [jid] })
                    }
                }
            } catch (e) {
                console.error('Grupo update:', e.message)
            }
        })

        client.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return

            for (const info of messages) {
                try {
                    if (!info?.message) continue
                    if (info.key?.fromMe) continue
                    if (info.key?.remoteJid === 'status@broadcast') continue
                    if (config.ignorarJids.includes(info.key?.remoteJid)) continue

                    // Grupo de cliente → IA usa as chaves dele; grupo da casa → chaves do .env
                    const creds = credsDoChat(info.key.remoteJid)
                    await contexto.executar(creds, () => processarMensagem(client, info))
                } catch (erro) {
                    console.error('❌ Erro ao processar mensagem:', erro?.message || erro)
                }
            }
        })

        client.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr && !client.authState.creds.registered && !jaPareou) {
                jaPareou = true
                const Pergunta = await question(
                    '🌸 Por favor, me diga seu número (com DDI, ex: 5511999999999):\n'
                )
                const Numero = Pergunta.replace(/[^0-9]/g, '')

                if (!Numero || Numero.length < 10) {
                    console.log('❌ Número inválido. Reinicie o bot e tente novamente.')
                    jaPareou = false
                    isConnecting = false
                    return
                }

                try {
                    let codigo = await client.requestPairingCode(Numero)
                    codigo = codigo?.match(/.{1,4}/g)?.join('-') || codigo
                    console.log(`\n🔐 Código de Pareamento: ${codigo}\n`)
                    console.log('Abra o WhatsApp > Aparelhos conectados > Conectar com número\n')
                } catch (err) {
                    console.error('❌ Erro ao solicitar código de pareamento:', err?.message || err)
                    jaPareou = false
                }
            }

            if (connection === 'open') {
                isConnecting = false
                backoffMs = 3000
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer)
                    reconnectTimer = null
                }
                lembretes.iniciar(client)
                shopee.iniciar(client).catch((e) => {
                    console.error('[SHOPEE] falha ao iniciar (bot segue):', e?.message || e)
                })
                console.log('╭────────────────────────────╮')
                console.log('│  NAMY CONECTADA  3.1        │')
                console.log(`│  Versão: ${config.version.padEnd(17)}│`)
                console.log('│  Cérebro modular pronto.    │')
                console.log('╰────────────────────────────╯')
                await imprimirDeps()
                if (!config.owners.length) {
                    console.log('⚠️  OWNERS vazio no .env — !ia on e admin ficam bloqueados.')
                }
                if (!require('./saas/cripto').disponivel()) {
                    console.log('⚠️  SAAS_MASTER_KEY ausente — clientes não conseguem salvar as próprias chaves.')
                }
            }

            if (connection === 'close') {
                isConnecting = false
                try { shopee.parar() } catch (_) {}
                const statusCode = lastDisconnect?.error?.output?.statusCode
                console.log('❌ Conexão fechada. Código:', statusCode)

                if (statusCode !== DisconnectReason.loggedOut) {
                    if (reconnectTimer) return
                    let espera = backoffMs
                    if (statusCode === 408 || statusCode === DisconnectReason.timedOut || statusCode === DisconnectReason.connectionLost) {
                        espera = Math.max(espera, 5000)
                    }
                    console.log(`🔄 Reconectando em ${Math.round(espera / 1000)} segundos...`)
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null
                        jaPareou = false
                        ligarbot()
                    }, espera)
                    backoffMs = Math.min(Math.max(espera, backoffMs) * 2, 60000)
                } else {
                    console.log('🚪 Sessão encerrada. Apague a pasta "sessao" e pareie novamente.')
                }
            }
        })
    } catch (erro) {
        isConnecting = false
        console.error('💥 Erro ao iniciar a Namy:', erro)
        setTimeout(() => ligarbot(), 5000)
    }
}

ligarbot().catch((erro) => {
    console.error('💥 Erro fatal ao iniciar a Namy:', erro)
})
