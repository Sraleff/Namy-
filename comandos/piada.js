const piadas = [
    'Por que o livro de matemática está triste?\nPorque ele tem muitos problemas! 📚😂',
    'O que o zero disse para o oito?\nQue cinto maneiro! 😎',
    'Por que a galinha atravessou a rua?\nPara chegar ao outro lado! 🐔',
    'Qual é o contrário de volátil?\nVem cá, sobrinho! 😆',
    'Por que o computador foi ao médico?\nPorque pegou um vírus! 💻🤒',
    'O que é um pontinho amarelo no meio do mar?\nÉ um submarino amarelo! 🟡',
    'Por que o esqueleto não briga?\nPorque não tem estômago para isso! 💀',
    'O que a impressora falou para a outra?\nEssa folha é sua ou é impressão minha? 🖨️',
    'Por que o peixe não gosta de rede social?\nPorque tem medo de ser fisgado! 🐟',
    'Qual é o animal que não vale mais nada?\nO javali! (já-vale) 🐗',
    'Por que a planta não responde mensagens?\nPorque ela é muda! 🌱',
    'O que o tomate foi fazer no banco?\nSacar o ketchup! 🍅',
    'Por que o elevador não funciona?\nPorque está de mal com a escada! 🛗',
    'Como o batman faz para ligar o batmóvel?\nCom a bat-chave! 🦇',
    'Por que a bruxa usa chapéu preto?\nPorque não tem coragem de usar rosa! 🧙‍♀️'
]

module.exports = async function piada(ctx) {
    const escolha = piadas[Math.floor(Math.random() * piadas.length)]
    await ctx.escrever(`😂 *Piada da Namy:*\n\n${escolha}`)
}
