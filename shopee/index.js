const cfg = require('./config')
const { log } = require('./log')
const store = require('./store')
const scheduler = require('./scheduler')
const grupos = require('./grupos')

let jaLigou = false

async function iniciar(client) {
    try {
        store.carregar()
        if (!cfg.credenciaisOk()) {
            log('Credenciais não configuradas. Módulo desativado.')
            return { ok: false, motivo: 'sem_credenciais' }
        }
        if (!cfg.habilitado()) {
            log('SHOPEE_ENABLED=false. Módulo desativado.')
            return { ok: false, motivo: 'desligado' }
        }
        const n = Object.keys(grupos.listar()).length
        if (!jaLigou) {
            log('API conectada')
            log(`${n} grupo(s) na lista`)
            jaLigou = true
        } else {
            log(`scheduler retomado (${n} grupo(s))`)
        }
        scheduler.iniciar(client)
        return { ok: true }
    } catch (erro) {
        log('falha ao iniciar (bot segue):', erro.message)
        return { ok: false, motivo: 'erro' }
    }
}

function parar() {
    try {
        scheduler.parar()
    } catch (_) {}
}

module.exports = {
    iniciar,
    parar
}
