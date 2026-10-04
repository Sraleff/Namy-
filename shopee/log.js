function limpar(valor) {
    let texto = String(valor || '')
    const secret = process.env.SHOPEE_SECRET
    if (secret && secret.length >= 4) texto = texto.split(secret).join('***')
    return texto
        .replace(/Secret=[^,\s]*/gi, 'Secret=***')
        .replace(/SHOPEE_SECRET[=:][^\s,]+/gi, 'SHOPEE_SECRET=***')
        .replace(/Signature=[0-9a-fA-F]{8,}/g, 'Signature=***')
}

function log(msg, extra) {
    const texto = limpar(extra !== undefined ? `${msg} ${extra}` : msg)
    console.log(`[SHOPEE] ${texto}`)
}

module.exports = { log, limpar }
