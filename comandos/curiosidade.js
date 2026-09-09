const curiosidades = [
    '🐙 O polvo tem três corações e sangue azul!',
    '🌍 A Terra não é uma esfera perfeita — ela é um geoide achatado nos polos.',
    '🐝 As abelhas podem reconhecer rostos humanos.',
    '🧠 Seu cérebro usa cerca de 20% de toda a energia do corpo.',
    '🌙 A Lua se afasta da Terra cerca de 3,8 cm por ano.',
    '🦒 A língua da girafa pode ter até 50 cm de comprimento.',
    '⚡ Um raio é cinco vezes mais quente que a superfície do Sol.',
    '🦈 Tubarões existem há mais tempo que as árvores.',
    '💧 Só cerca de 1% da água da Terra é doce e acessível.',
    '🦇 Os morcegos são os únicos mamíferos capazes de voar de verdade.',
    '🔥 O diamante e o grafite são feitos do mesmo elemento: carbono.',
    '🧬 Todos os humanos compartilham cerca de 99,9% do DNA.',
    '🌌 Há mais estrelas no universo observável do que grãos de areia na Terra.',
    '🐧 Os pinguins propõem casamento com uma pedrinha.',
    '⏱️ Um dia em Vênus é mais longo que um ano em Vênus.'
]

module.exports = async function curiosidade(ctx) {
    const escolha = curiosidades[Math.floor(Math.random() * curiosidades.length)]
    await ctx.escrever(`🧠 *Curiosidade da Namy:*\n\n${escolha}`)
}
