/*
╭──────────────────────────────────────────────╮
│                 🌸 NAMY BOT                  │
│              Versão 2.2.0                    │
│                                              │
│ Base original: Rony / Spectrum              │
│ https://youtube.com/@Spectrum_bots           │
│                                              │
│ ⚠️ Pairing/conexão preservados              │
╰──────────────────────────────────────────────╯
*/

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys')

const iaEstado = require('./funcoes/ia')
const { perguntarIA } = require('./comandos/ia')
const pino = require('pino')
const readline = require('readline')

const config = require('./config')
const { criarContexto } = require('./funcoes/mensagens')
const comandos = require('./comandos')
const intencoes = require('./intencoes')

let jaPareou = false
let isConnecting = false

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

const question = (text) =>
    new Promise((resolve) => rl.question(text, resolve))

async function ligarbot() {
    if (isConnecting) return
    isConnecting = true

    try {
        const { state, saveCreds } =
            await useMultiFileAuthState('./sessao')

        const { version } =
            await fetchLatestBaileysVersion()

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

        client.ev.on('chats.set', () => {
            console.log('📚 Setando conversas...')
        })

        client.ev.on('contacts.set', () => {
            console.log('👤 Setando contatos...')
        })

        /*
         * ═══════════════════════════════════════════════
         * 📩 MENSAGENS
         * ═══════════════════════════════════════════════
         */
        client.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return

            for (const info of messages) {
                try {
                    if (!info?.message) continue
                    if (info.key?.fromMe) continue
                    if (info.key?.remoteJid === 'status@broadcast') continue

                    // Grupo de suporte original da base (ignorar)
                    if (
                        info.key?.remoteJid ===
                        '120363142999607164@g.us'
                    ) continue

                    const from = info.key.remoteJid

                    // Marca como lida
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

                    // ═══════════════════════════════════════════════
                    // 🤖 IA AUTOMÁTICA (com memória)
                    // ═══════════════════════════════════════════════
                    if (
                        ctx.body &&
                        !ctx.isCmd &&
                        iaEstado.estaAtiva(from)
                    ) {
                        try {
                            await client.sendPresenceUpdate('composing', from).catch(() => {})

                            const historico = iaEstado.obterHistorico(from)
                            const resposta = await perguntarIA(ctx.body, historico)

                            if (resposta) {
                                const max = config.maxHistorico || 12
                                iaEstado.adicionarMensagem(from, 'user', ctx.body, max)
                                iaEstado.adicionarMensagem(from, 'assistant', resposta, max)

                                await client.sendMessage(
                                    from,
                                    { text: resposta },
                                    { quoted: info }
                                )
                            }
                        } catch (erro) {
                            console.error(
                                '❌ Erro na IA automática:',
                                erro.response?.data || erro.message
                            )
                        }

                        continue
                    }

                    // ═══════════════════════════════════════════════
                    // 💬 RESPOSTAS AUTOMÁTICAS POR INTENÇÃO
                    // ═══════════════════════════════════════════════
                    if (ctx.body && !ctx.isCmd) {
                        let encontrouIntencao = false

                        const texto = ctx.body.toLowerCase()

                        for (
                            const [, intencao]
                            of Object.entries(intencoes)
                        ) {
                            const encontrou =
                                intencao.padroes.some(
                                    (padrao) => padrao.test(texto)
                                )

                            if (encontrou) {
                                const resposta =
                                    intencao.respostas[
                                        Math.floor(
                                            Math.random() *
                                            intencao.respostas.length
                                        )
                                    ]

                                await client.sendMessage(
                                    from,
                                    { text: resposta },
                                    { quoted: info }
                                )

                                encontrouIntencao = true
                                break
                            }
                        }

                        if (encontrouIntencao) {
                            continue
                        }
                    }

                    // ═══════════════════════════════════════════════
                    // 🧩 COMANDOS
                    // ═══════════════════════════════════════════════
                    if (!ctx.body || !ctx.isCmd) continue

                    const comando =
                        comandos[ctx.comando]

                    if (!comando) continue

                    await comando(ctx)

                } catch (erro) {
                    console.error(
                        '❌ Erro ao processar mensagem:',
                        erro?.message || erro
                    )
                }
            }
        })

        /*
         * ═══════════════════════════════════════════════
         * 🌐 CONEXÃO
         * ═══════════════════════════════════════════════
         */
        client.ev.on('connection.update', async (update) => {
            const {
                connection,
                lastDisconnect,
                qr
            } = update

            if (
                qr &&
                !client.authState.creds.registered &&
                !jaPareou
            ) {
                jaPareou = true

                const Pergunta = await question(
                    '🌸 Por favor, me diga seu número (com DDI, ex: 5511999999999):\n'
                )

                const Numero =
                    Pergunta.replace(/[^0-9]/g, '')

                if (!Numero || Numero.length < 10) {
                    console.log(
                        '❌ Número inválido. Reinicie o bot e tente novamente.'
                    )

                    jaPareou = false
                    isConnecting = false
                    return
                }

                try {
                    let codigo =
                        await client.requestPairingCode(Numero)

                    codigo =
                        codigo?.match(/.{1,4}/g)?.join('-') ||
                        codigo

                    console.log(
                        `\n🔐 Código de Pareamento: ${codigo}\n`
                    )

                    console.log(
                        'Abra o WhatsApp > Aparelhos conectados > Conectar com número\n'
                    )

                } catch (err) {
                    console.error(
                        '❌ Erro ao solicitar código de pareamento:',
                        err?.message || err
                    )

                    jaPareou = false
                }
            }

            if (connection === 'open') {
                isConnecting = false

                console.log(
                    '╭────────────────────────────╮'
                )
                console.log(
                    '│ 🌸 NAMY CONECTADA!          │'
                )
                console.log(
                    `│ 📦 Versão: ${config.version.padEnd(16)}│`
                )
                console.log(
                    '│ 🤖 Bot pronto para uso.     │'
                )
                console.log(
                    '╰────────────────────────────╯'
                )
            }

            if (connection === 'close') {
                isConnecting = false

                const statusCode =
                    lastDisconnect?.error?.output?.statusCode

                console.log(
                    '❌ Conexão fechada. Código:',
                    statusCode
                )

                if (
                    statusCode !==
                    DisconnectReason.loggedOut
                ) {
                    console.log(
                        '🔄 Reconectando em 3 segundos...'
                    )

                    setTimeout(() => {
                        jaPareou = false
                        ligarbot()
                    }, 3000)

                } else {
                    console.log(
                        '🚪 Sessão encerrada. Apague a pasta "sessao" e pareie novamente.'
                    )
                }
            }
        })

    } catch (erro) {
        isConnecting = false

        console.error(
            '💥 Erro ao iniciar a Namy:',
            erro
        )

        setTimeout(() => ligarbot(), 5000)
    }
}

ligarbot().catch((erro) => {
    console.error(
        '💥 Erro fatal ao iniciar a Namy:',
        erro
    )
})