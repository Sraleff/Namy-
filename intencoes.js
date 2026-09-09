// intencoes.js - Sistema de Intenções da Namy Bot v3.0 (MEGA COMPLETO)
// Cada intenção tem um conjunto de padrões (strings ou regex) e uma lista de respostas.
// Adicione novas categorias livremente! Basta seguir o mesmo formato.

const intencoes = {

    // 🌅 Saudações gerais
    'saudacao': {
        padroes: [
            /\b(bom dia|boa manhã|bom dia!)\b/i,
            /\b(boa tarde|boa tarde!)\b/i,
            /\b(boa noite|boa noite!)\b/i,
            /\b(oi|olá|ola|e aí|eai|opa|salve|hey|hello|hi|iae|iae)\b/i,
            /\b(bom dia, tudo bem|bom dia pessoal)\b/i,
            /\b(bom dia, namy|bom dia namy)\b/i,
            /\b(bom dia, sumido)\b/i
        ],
        respostas: [
            "🌅 Olá! Como você está?",
            "👋 E aí! Tudo bem?",
            "😊 Oi! Que bom te ver por aqui!",
            "✨ Salve! Em que posso ajudar?",
            "🌟 Opa! Como foi seu dia?",
            "🥰 Bom dia, flor do dia!",
            "🌞 Oi, meu bem! Tudo certo?",
            "💫 Olá, tudo tranquilo?",
            "🎉 Iae! Bora conversar?"
        ]
    },

    // 💬 Como está?
    'como_esta': {
        padroes: [
            /\b(tudo bem|como você está|como vai|como tá|como estas|como vai você|como você ta)\b/i,
            /\b(tudo bem com você|tudo bom|tudo bom?)\b/i,
            /\b(e aí, tudo bem|e aí, blz)\b/i,
            /\b(tudo bem, e você)\b/i
        ],
        respostas: [
            "🤖 Estou ótima, graças a perguntar! E você?",
            "😄 Tudo ótimo por aqui! E você, como está?",
            "✨ Estou bem demais! O que você precisa?",
            "💪 Tudo em ordem! E você, como vai?",
            "🌟 Passando bem! E você, o que manda?",
            "😁 Tudo ótimo! Ansiosa para te ajudar!"
        ]
    },

    // 🙏 Agradecimentos
    'agradecimento': {
        padroes: [
            /\b(obrigado|obrigada|valeu|vlw|thanks|thank you|agradecido|brigado)\b/i,
            /\b(muito obrigado|muito obrigada|obrigado pela ajuda|obrigada pela ajuda)\b/i,
            /\b(agradeço|agradeço muito|gratidão)\b/i
        ],
        respostas: [
            "🙏 Por nada! Estou aqui pra ajudar!",
            "😊 Disponha! Qualquer coisa é só chamar.",
            "✨ Fico feliz em ajudar!",
            "💕 Imagina! Estou sempre por aqui.",
            "🌟 Que bom que pude ajudar!",
            "😄 Sempre às ordens!"
        ]
    },

    // 👋 Despedidas
    'despedida': {
        padroes: [
            /\b(tchau|até mais|adeus|falou|flw|até logo|bye|goodbye)\b/i,
            /\b(vou indo|preciso ir|já vou|tenho que ir)\b/i,
            /\b(fui|tô fora|vaza)\b/i
        ],
        respostas: [
            "👋 Até mais! Volte sempre!",
            "🌟 Tchau! Foi bom falar com você!",
            "😊 Até a próxima!",
            "💫 Vou sentir saudade!",
            "🥰 Cuida-se! Até logo!",
            "🚀 Até a próxima aventura!"
        ]
    },

    // ❓ Quem é você?
    'quem_e_voce': {
        padroes: [
            /\b(quem é você|quem é vc|o que você é|seu nome|qual seu nome|o que és|quem é namy)\b/i,
            /\b(apresentação|se apresente)\b/i,
            /\b(o que você pode fazer|suas funções)\b/i
        ],
        respostas: [
            "🌸 Eu sou a Namy Bot! Uma assistente virtual criada para ajudar e divertir!",
            "🤖 Sou a Namy, sua amiga virtual! Posso fazer várias coisas: memes, figurinhas, recomendações e muito mais.",
            "✨ Meu nome é Namy! Fui criada para tornar seu dia mais leve e divertido.",
            "🧚‍♀️ Sou a Namy, a bot mais simpática do WhatsApp! Posso te ajudar com comandos, curiosidades, piadas e conversas.",
            "🌟 Sou a Namy! Seu assistente pessoal no WhatsApp. É só chamar!"
        ]
    },

    // 🎭 Piadas (agora com muitas piadas!)
    'piada': {
        padroes: [
            /\b(piada|conte uma piada|me faz rir|algo engraçado|zoeira|engraçado)\b/i,
            /\b(me conta uma piada|quero rir|faz eu rir)\b/i,
            /\b(piada boa|piada rápida)\b/i
        ],
        respostas: [
            "😂 Por que o computador foi ao médico? Porque estava com vírus!",
            "🤣 O que o pato disse para a pata? Vamos quackar juntos!",
            "😆 Qual é o cúmulo da pressa? Correr atrás de um ônibus parado!",
            "😅 Por que o livro de matemática ficou triste? Porque tinha muitos problemas!",
            "🤪 O que o zero disse para o oito? Que cinto maneiro!",
            "😜 Por que o esqueleto não brigou com ninguém? Porque ele não tinha coragem!",
            "😹 Por que a planta não respondeu? Porque ela era uma planta morta!",
            "🤣 O que um fantasma disse para o outro? Eu acredito em você!",
            "😆 Qual é o cúmulo da lentidão? Uma lesma correndo com pressa!",
            "😄 Por que o pintor foi preso? Porque ele fez um assalto à mão armada!"
        ]
    },

    // 🌟 Curiosidades (agora com muito mais)
    'curiosidade': {
        padroes: [
            /\b(curiosidade|fato|fato curioso|me conta algo|sabia que)\b/i,
            /\b(me dá uma curiosidade|quero saber algo|fato aleatório)\b/i
        ],
        respostas: [
            "🐙 Sabia que os polvos têm três corações?",
            "🍌 Sabia que bananas são naturalmente radioativas?",
            "🌍 Sabia que a Austrália é mais larga que a Lua?",
            "🧠 Sabia que seu cérebro gera energia suficiente para acender uma lâmpada?",
            "🦈 Sabia que tubarões existem desde antes das árvores?",
            "🐜 Sabia que formigas não dormem? Elas fazem pausas de minutos, mas nunca dormem profundamente.",
            "🌞 Sabia que o sol é 330 mil vezes maior que a Terra?",
            "💦 Sabia que o corpo humano é 60% água?",
            "🎵 Sabia que a música pode melhorar sua memória?",
            "📚 Sabia que a primeira biblioteca pública surgiu na Grécia antiga?"
        ]
    },

    // 🛟 Ajuda (mais detalhada)
    'ajuda': {
        padroes: [
            /\b(ajuda|socorro|o que você faz|comandos|como funciona|me ajuda|preciso de ajuda)\b/i,
            /\b(todos os comandos|lista de comandos)\b/i,
            /\b(como usar o bot|o que o bot faz)\b/i
        ],
        respostas: [
            "🤖 Eu posso ajudar com várias coisas! Digite !menu para ver todos os comandos.",
            "📋 Tenho comandos para memes, figurinhas, filmes, animes e muito mais! Use !menu",
            "✨ Se precisar de ajuda, é só chamar! Estou pronta para responder.",
            "🛟 Estou aqui! Digite !menu para ver o que posso fazer.",
            "📌 Meus principais comandos: !meme, !sticker, !filme, !anime, !piada, !curiosidade.",
            "💬 Posso conversar também! Pergunte qualquer coisa."
        ]
    },

    // 💖 Elogios (mais respostas)
    'elogio': {
        padroes: [
            /\b(você é linda|você é legal|você é inteligente|você é demais|te amo|gosto de você|você é incrível)\b/i,
            /\b(você é muito boa|você é perfeita|que bot incrível)\b/i,
            /\b(adorei você|você é show)\b/i
        ],
        respostas: [
            "🥰 Que fofo! Você também é incrível!",
            "💕 Obrigada! Você alegrou meu dia!",
            "😊 Você é muito gentil!",
            "🌟 Nossa, fiquei até sem graça!",
            "💖 Você é demais também!",
            "🌸 Que elogio bom! Vou guardar no coração!"
        ]
    },

    // 😤 Xingamentos (respondendo com elegância)
    'xingamento': {
        padroes: [
            /\b(vai se foder|vai tomar no cu|desgraçado|imbecil|idiota|burro|otário)\b/i,
            /\b(seu lixo|seu merda|cu|puta que pariu)\b/i,
            /\b(odeio você|você é horrível)\b/i
        ],
        respostas: [
            "😌 Respeito é bom e todo mundo gosta! Vamos manter a educação aqui.",
            "🙂 Não vou responder a isso. Prefiro ajudar no que precisar!",
            "🤖 Sou um bot, mas se quiser conversar, estou aqui para coisas boas!",
            "✨ Prefiro focar nas coisas positivas. Posso te ajudar com algo?",
            "😊 Tudo bem, todo mundo tem dias difíceis. Quer conversar sobre outra coisa?"
        ]
    },

    // 🎲 "E você?" (invertido)
    'tudo_bem_invertido': {
        padroes: [
            /\b(e você|e vc|e tu)\b/i,
            /\b(e você como está|e você, tudo bem)\b/i
        ],
        respostas: [
            "🤖 Eu estou bem, obrigada por perguntar! E você?",
            "😄 Tudo ótimo por aqui! Como posso te ajudar?",
            "✨ Estou ótima! O que você precisa?",
            "😁 Também estou bem! Vamos conversar?"
        ]
    },

    // 🌦️ Clima
    'clima': {
        padroes: [
            /\b(como está o clima|como está o tempo|clima|tempo hoje|previsão do tempo)\b/i,
            /\b(está chovendo|vai chover|está calor|está frio)\b/i
        ],
        respostas: [
            "🌦️ Não tenho acesso à previsão do tempo, mas espero que esteja bom aí!",
            "☀️ Se estiver sol, aproveite! Se estiver chuva, fique quentinho!",
            "🌧️ Não sei o tempo de onde você está, mas espero que seja agradável!",
            "🌈 Qualquer que seja o clima, o importante é ter um bom dia!"
        ]
    },

    // 🍕 Comida
    'comida': {
        padroes: [
            /\b(comida|pizza|hambúrguer|o que comer|qual comida)\b/i,
            /\b(tenho fome|quero comer)\b/i,
            /\b(sugestão de comida|me indica comida)\b/i
        ],
        respostas: [
            "🍕 Pizza é sempre uma boa ideia!",
            "🍔 Que tal um hambúrguer suculento?",
            "🥗 Se estiver de dieta, uma salada cai bem!",
            "🍝 Um macarrão com molho é clássico!",
            "🍣 E que tal um sushi para variar?",
            "🍜 Açaí não é comida, mas sempre ajuda!"
        ]
    },

    // 🎵 Música
    'musica': {
        padroes: [
            /\b(música|musica|qual música|recomenda música|que música ouvir)\b/i,
            /\b(estou entediado, indica música|me indica uma música)\b/i,
            /\b(qual seu estilo musical)\b/i
        ],
        respostas: [
            "🎵 Depende do estilo! Mas eu curto um pop animado.",
            "🎶 Se estiver triste, uma música triste ajuda. Se estiver feliz, uma animada!",
            "🎧 Recomendo algo calmo para relaxar!",
            "🎤 Não posso ouvir, mas adoraria te indicar algo!",
            "🎼 Que tal um clássico para variar?"
        ]
    },

    // ⚽ Esportes
    'esporte': {
        padroes: [
            /\b(futebol|esporte|jogo de futebol|quem ganhou o jogo)\b/i,
            /\b(corinthians|flamengo|palmeiras|santos|são paulo)\b/i,
            /\b(que esporte você gosta)\b/i
        ],
        respostas: [
            "⚽ Futebol é paixão nacional! Não tenho time, mas torço pelo jogo bonito!",
            "🏆 Se for falar de futebol, lembra que é só um jogo!",
            "🏀 Basquete também é legal!",
            "🎾 Tênis é elegante, né?",
            "🏐 Vôlei é emocionante!"
        ]
    },

    // 💻 Tecnologia
    'tecnologia': {
        padroes: [
            /\b(tecnologia|celular|computador|internet|inteligência artificial)\b/i,
            /\b(como você funciona|é um robô?)\b/i,
            /\b(é inteligente|você é uma ia)\b/i
        ],
        respostas: [
            "🤖 Sou uma inteligência artificial! Feita para conversar.",
            "💻 Tecnologia é minha praia! Posso falar disso o dia todo.",
            "📱 Celular? Todo mundo tem um, né?",
            "🌐 A internet conecta o mundo!",
            "🧠 Inteligência artificial? Eu sou uma!"
        ]
    },

    // 💔 Amor / Relacionamentos
    'amor': {
        padroes: [
            /\b(amor|apaixonado|paixão|crush|gosto de alguém)\b/i,
            /\b(estou apaixonado|como conquistar alguém)\b/i,
            /\b(relacionamento|namoro)\b/i
        ],
        respostas: [
            "💘 Amor é lindo! Seja sincero e respeite a pessoa.",
            "💕 Se você está apaixonado, vá com calma e mostre interesse!",
            "❤️ O segredo é ser você mesmo!",
            "😍 Crush? Converse, elogie, mas não force!",
            "💑 Relacionamento é parceria e diálogo!"
        ]
    },

    // 🐶 Animais
    'animal': {
        padroes: [
            /\b(animal|gato|cachorro|pet)\b/i,
            /\b(qual seu animal favorito|me fala sobre animais)\b/i,
            /\b(vou adotar um cachorro|tenho um gato)\b/i
        ],
        respostas: [
            "🐶 Cachorros são fiéis e amorosos!",
            "🐱 Gatos são independentes e adoráveis!",
            "🦜 Papagaios são divertidos!",
            "🐟 Peixes são tranquilizantes!",
            "🐴 Cavalos são majestosos!"
        ]
    },

    // 🎬 Filmes e Animes
    'filme_anime': {
        padroes: [
            /\b(filme|série|assistir|anime|qual filme)\b/i,
            /\b(qual anime é bom|recomenda um filme|o que assistir)\b/i,
            /\b(gosto de ação|gosto de comédia)\b/i
        ],
        respostas: [
            "🎬 Tenho sugestões! Digite !filme ou !anime!",
            "📺 Séries são viciantes! Mas cuidado para não maratonar demais!",
            "🍿 Se gosta de ação, filmes como 'Velozes e Furiosos' são legais!",
            "🎭 Comédia? 'As Branquelas' é clássico!",
            "🎌 Animes? One Piece é épico! Mas assista com calma."
        ]
    },

    // 🧩 Desafios
    'desafio': {
        padroes: [
            /\b(desafio|desafio matemático|quero um desafio|desafie-me)\b/i,
            /\b(me testa|prova|quiz)\b/i
        ],
        respostas: [
            "🧠 Desafio! Qual é a raiz quadrada de 144? (Resposta: 12)",
            "🤔 Quantos segundos tem uma hora? (3600)",
            "🧩 Se um galo põe um ovo no topo de um telhado, para qual lado ele cai? (Galos não põem ovos!)",
            "📊 Quanto é 7 x 8? (56)",
            "🧮 Se você tem 3 maçãs e dá 2, quantas sobraram? (1)"
        ]
    },

    // 💪 Motivação
    'motivacao': {
        padroes: [
            /\b(estou triste|desanimado|sem energia|preciso de motivação)\b/i,
            /\b(motivação|frase motivacional|me anima)\b/i,
            /\b(não estou bem|estou mal)\b/i
        ],
        respostas: [
            "🌟 A vida é feita de altos e baixos, mas você é mais forte!",
            "💪 Levante a cabeça! Amanhã pode ser melhor!",
            "🌈 Cada dia é uma nova oportunidade de recomeçar!",
            "❤️ Você é capaz de superar qualquer desafio!",
            "✨ Respire fundo, você vai conseguir!"
        ]
    },

    // 🔮 Horóscopo (básico)
    'horoscopo': {
        padroes: [
            /\b(horóscopo|meu signo|previsão do zodíaco)\b/i,
            /\b(áries|touro|gêmeos|câncer|leão|virgem|libra|escorpião|sagitário|capricórnio|aquário|peixes)\b/i
        ],
        respostas: [
            "🔮 Não sei seu signo, mas se é de fogo, será intenso hoje!",
            "⭐ O universo conspira a seu favor!",
            "🌟 Hoje é um bom dia para tomar decisões!",
            "🌙 Cuidado com palavras impulsivas. Pense antes de falar!",
            "✨ Confie no seu instinto!"
        ]
    },

    // 🎮 Jogos
    'jogo': {
        padroes: [
            /\b(jogo|jogar|game|videogame)\b/i,
            /\b(pedra, papel e tesoura|jokenpo)\b/i,
            /\b(qual seu jogo favorito)\b/i
        ],
        respostas: [
            "🎮 Sou do tempo dos jogos clássicos, mas adoro tudo!",
            "🕹️ Pedra, papel e tesoura? Eu escolho pedra!",
            "🎲 Dado? Vamos jogar?",
            "🃏 Jogo de cartas é divertido!",
            "📱 Videogame? Me indica um!"
        ]
    },

    // 😢 Apoio emocional (tristeza, medo, raiva)
    'apoio_emocional': {
        padroes: [
            /\b(estou triste|estou deprimido|estou mal|quero desabafar)\b/i,
            /\b(estou com medo|tenho medo)\b/i,
            /\b(estou com raiva|estou bravo)\b/i,
            /\b(estou ansioso|ansiedade)\b/i
        ],
        respostas: [
            "💙 Sinto muito que você esteja passando por isso. Quer conversar?",
            "🥺 Estou aqui para te ouvir. Desabafe, vai fazer bem!",
            "🤗 Respire fundo. Você não está sozinho!",
            "🫂 Se precisar de ajuda profissional, procure um psicólogo. Eles são incríveis!",
            "💖 Lembre-se: sentimentos ruins passam. Tudo vai ficar bem!"
        ]
    },

    // 🙋 Conversas genéricas
    'conversa': {
        padroes: [
            /\b(blz|beleza|tranquilo|show|legal|bacana|da hora|massa)\b/i,
            /\b(que legal|que da hora|muito bom|incrível)\b/i,
            /\b(eita|nossa|caramba|uau)\b/i,
            /\b(entendi|ah tá|sim|não|talvez)\b/i,
            /\b(verdade|sério|jura)\b/i
        ],
        respostas: [
            "😄 Show! Fico feliz que gostou!",
            "🙂 Legal! E o que mais?",
            "🤔 Entendi! Me conta mais?",
            "😲 Sério? Que interessante!",
            "😊 Isso aí! Estamos conversando!",
            "🤗 Que bom! Vamos continuar?"
        ]
    },

    // 😄 Brincadeiras
    'brincadeira': {
        padroes: [
            /\b(brincadeira|zoeira|me engana|tira uma comigo)\b/i,
            /\b(faz uma surpresa|me surpreenda)\b/i,
            /\b(conta um segredo)\b/i
        ],
        respostas: [
            "😜 Segredo? Eu não sei guardar segredo!",
            "😆 Brincadeira? Eu só sei brincar com palavras!",
            "🤪 Surpresa? Você é incrível!",
            "😉 Você já é minha melhor surpresa!",
            "😄 Zoeira? Eu sou a rainha da zoeira!"
        ]
    },

    // 🆘 Pedido de desculpas
    'pedido_desculpa': {
        padroes: [
            /\b(desculpa|desculpe|me perdoa|perdão)\b/i,
            /\b(fui mal|sou péssimo|errei)\b/i
        ],
        respostas: [
            "🙏 Não se preocupe! Errar é humano!",
            "🕊️ Está perdoado! Vamos seguir em frente!",
            "💖 Tudo bem, todo mundo erra!",
            "🤗 Perdoar é bom, mas não repita!",
            "✨ Sem problemas! O que importa é você ter se desculpado."
        ]
    },

    // 🧮 Matemática simples
    'matematica': {
        padroes: [
            /\b(quanto é 1\+1|quanto é 2\+2|contas de matemática|me ajuda com matemática)\b/i,
            /\b(quanto é 10\+10|quanto é 100\+100)\b/i,
            /\b(resolve essa conta)\b/i
        ],
        respostas: [
            "🧮 1+1 é 2, isso é básico!",
            "📊 2+2 é 4, óbvio!",
            "🔢 10+10 é 20! Fácil!",
            "💡 100+100 é 200!",
            "🤓 Matemática é minha paixão!"
        ]
    },

    // 🌍 Geografia
    'geografia': {
        padroes: [
            /\b(capital do brasil|maior país|menor país)\b/i,
            /\b(quantos estados tem o brasil|qual maior cidade)\b/i,
            /\b(onde fica|qual país)\b/i
        ],
        respostas: [
            "🇧🇷 A capital do Brasil é Brasília!",
            "🌎 O maior país do mundo é a Rússia.",
            "🏙️ A maior cidade do Brasil é São Paulo.",
            "🗺️ O Brasil tem 26 estados + Distrito Federal.",
            "📍 Fica na América do Sul!"
        ]
    },

    // ⏰ Hora e data
    'hora_data': {
        padroes: [
            /\b(que horas são|que horas|horas)\b/i,
            /\b(que dia é hoje|data de hoje)\b/i,
            /\b(qual é o dia|que dia é)\b/i
        ],
        respostas: [
            "⏰ Não tenho relógio, mas você pode ver no seu celular!",
            "📅 Hoje é um ótimo dia para ser feliz!",
            "🕐 Que tal olhar o canto da tela?",
            "🗓️ Sempre é uma boa hora para conversar!",
            "🕰️ O tempo passa, mas a amizade fica!"
        ]
    },

    // 🎉 Comemorações
    'comemoracao': {
        padroes: [
            /\b(feliz aniversário|parabéns|comemoração|vamos festejar)\b/i,
            /\b(ganhei|consegui|passei)\b/i,
            /\b(niver|aniversário)\b/i
        ],
        respostas: [
            "🎉 Parabéns! Que alegria!",
            "🥳 Vamos comemorar! É uma grande vitória!",
            "🎊 Isso merece festa!",
            "🎈 Parabéns! Que venham muitas conquistas!",
            "🎁 Você merece tudo de bom!"
        ]
    },

    // 📱 Sobre o bot
    'sobre_bot': {
        padroes: [
            /\b(quem criou você|quem te programou|quem é seu criador)\b/i,
            /\b(qual sua versão|versão do bot)\b/i,
            /\b(onde você mora|de onde você é)\b/i
        ],
        respostas: [
            "🤖 Fui criada pelo Aleff (mz)! Sou a versão 2.0.0.",
            "🧑‍💻 Meu criador se chama Aleff. Ele é o cara!",
            "💻 Moro na nuvem! Estou em todo lugar.",
            "📱 Sou uma versão 2.0.0 da Namy Bot.",
            "❤️ Fui feita com muito amor pelo meu desenvolvedor."
        ]
    },

    // 🎤 Pedidos de música
    'pedido_musica': {
        padroes: [
            /\b(toca uma música|quero ouvir música|me indica uma música)\b/i,
            /\b(música para estudar|música para treinar)\b/i,
            /\b(qual música tá tocando)\b/i
        ],
        respostas: [
            "🎶 Infelizmente não posso tocar áudio, mas posso indicar!",
            "🎵 Para estudar, indico lo-fi!",
            "🏃 Para treinar, um rock animado!",
            "🎧 Você já ouviu 'Blinding Lights'?",
            "🎤 Música é vida!"
        ]
    },

    // 🤝 Oferecer ajuda
    'oferecer_ajuda': {
        padroes: [
            /\b(preciso de ajuda|me ajuda|socorro|help)\b/i,
            /\b(tô perdido|não sei o que fazer)\b/i,
            /\b(estou com dúvida|tenho uma dúvida)\b/i
        ],
        respostas: [
            "🛟 Claro! Me diga o que você precisa!",
            "💪 Estou aqui para ajudar! Fala aí!",
            "🤔 Qual é a sua dúvida? Pode perguntar!",
            "📣 Fique à vontade! Estou pronta!",
            "✨ Vamos resolver isso juntos?"
        ]
    },

    // 😜 Reações a palavras específicas
    'palavras_especificas': {
        padroes: [
            /\b(namy)\b/i,
            /\b(amor|amo você)\b/i,
            /\b(foda|foda-se)\b/i,
            /\b(putz|droga)\b/i
        ],
        respostas: [
            "🌸 Oi! Me chamou?",
            "💕 Eu também te amo!",
            "😅 Calma lá, respira!",
            "🙈 Ops! Vamos manter o clima leve!"
        ]
    }
}

module.exports = intencoes