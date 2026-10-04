function aberto(client) {
    if (!client || !client.user) return false
    const ws = client.ws
    if (!ws) return false
    if (typeof ws.isOpen === 'boolean') return ws.isOpen
    if (typeof ws.readyState === 'number') return ws.readyState === 1
    return true
}

function queda(erro) {
    if (!erro) return false
    if (erro.code === 'WA' || erro.code === 'ECONNRESET' || erro.code === 'ETIMEDOUT') return true
    const status = erro.output?.statusCode || erro.status || erro.statusCode
    if (status === 408 || status === 428 || status === 440 || status === 503 || status === 515) return true
    const msg = String(erro.message || erro || '').toLowerCase()
    return /connection closed|connection lost|timed out|websocket is not|not connected|stream errored|connection closed|status code:?\s*408/.test(msg)
}

module.exports = { aberto, queda }
