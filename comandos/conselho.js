const conselhos = [
    '🌱 Comece pelo pequeno. Grandes mudanças nascem de passos simples.',
    '💧 Beba água. Seu corpo e sua mente agradecem.',
    '📵 Tire um tempo longe das telas hoje. Você merece.',
    '🗣️ Seja gentil — inclusive consigo mesmo.',
    '📚 Aprenda uma coisa nova por dia, mesmo que pequena.',
    '😴 Durma bem. Descanso também é produtividade.',
    '🎯 Foque no que você controla. O resto é ruído.',
    '🤝 Peça ajuda quando precisar. Não é fraqueza.',
    '☀️ Saia um pouco ao sol. Vitamina D é amiga do humor.',
    '📝 Anote suas ideias. Elas fogem se você não as prender.',
    '💪 Movimente o corpo, mesmo que por 10 minutos.',
    '🎵 Ouça uma música que te faz bem agora.',
    '🧩 Erros são dados, não fracassos. Use-os.',
    '❤️ Valorize quem está ao seu lado hoje.',
    '🌈 Amanhã é uma nova chance. Hoje ainda é hoje.'
]

module.exports = async function conselho(ctx) {
    const escolha = conselhos[Math.floor(Math.random() * conselhos.length)]
    await ctx.escrever(`💡 *Conselho da Namy:*\n\n${escolha}`)
}
