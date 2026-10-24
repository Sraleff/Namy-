# Afiliados: nichos, links, Mercado Livre, Amazon e imagens

Upgrades do disparo automático (`api/afiliados/`). Usam a mesma sessão de WhatsApp e o mesmo agendador dos anúncios. Nada aqui abre outro socket.

Dashboard `/app`: **Grupos** (nicho), **Automações** (dias, origem, qualidade), **Ofertas** (banco, prévia, grupos fonte, histórico), **Imagens**, **Configurações → Marketplaces**.

## 1. Nicho do grupo

- Em **Grupos**, marque o grupo, salve a seleção e escolha o nicho no seletor da linha.
- Pelo WhatsApp, no próprio grupo e a partir do número conectado:
  - `!nicho` mostra o nicho atual e as opções.
  - `!nicho casa` troca o nicho.
  - `!nicho palavras churrasco, grill` adiciona palavras extras ao nicho desse grupo.
- Nichos: geral, carros, casa, bebe, beleza, moda, eletronicos, pets, fitness, games, ferramentas. As palavras ficam em `api/afiliados/nichos.js`.
- **Geral** recebe qualquer oferta que passou no filtro de qualidade. Os outros nichos só recebem oferta com palavra do nicho no nome. A comparação é por palavra inteira, então "car" não casa com "carregador".
- Se não houver oferta do nicho, o grupo não recebe nada. O motivo fica em **Ofertas → Histórico de disparos** e o agendador espera até 15 min antes de tentar de novo.

## 2. Origem das ofertas e troca de link

Em **Automações → Origem e qualidade**:

| Origem | O que faz |
|---|---|
| API Shopee | Mesmo fluxo de antes, mas busca com as palavras do nicho do grupo |
| Banco de ofertas | Usa só o que foi colado ou capturado |
| Misto | Banco primeiro, e a API Shopee se faltar oferta |

- **Colar oferta** (aba Ofertas): cole a mensagem inteira. Só os links mudam. Emojis, cupons, negrito e quebras de linha continuam iguais.
- **Grupos fonte**: mensagens com link de Shopee, Mercado Livre ou Amazon postadas nesses grupos entram no banco sozinhas, com a foto. Um grupo fonte nunca recebe disparo.
- Na hora do envio, cada link é trocado pelo link de afiliado do cliente e depois validado:
  - **Shopee**: o link curto é resolvido e o novo vem do `generateShortLink` da API do cliente. Depois o servidor abre o link para conferir.
  - **Amazon**: vira `amazon.com.br/dp/<ASIN>?tag=<sua tag>`. A tag de quem postou sai.
  - **Mercado Livre**: o produto recebe `matt_word=<etiqueta>&matt_tool=<id>`. Os parâmetros de quem postou saem.
- Se **um** link de marketplace não puder ser trocado ou validado, a mensagem inteira é barrada. Nunca vai link de outra pessoa.
- Encurtador genérico (bit.ly e outros) só passa se levar a um marketplace suportado. A linha com convite `chat.whatsapp.com` de terceiros é removida.
- **Ver prévia dos links** mostra o texto final sem enviar nada.

**Rodízio:** cada grupo recebe a oferta mais nova do banco que ainda não recebeu. Pela API, produtos já enviados ao grupo nos últimos 7 dias ficam no fim da fila. Ofertas do banco vencem depois de **Validade (horas)**, que é 48 h por padrão.

**Qualidade:** desconto mínimo, nota mínima e vendas mínimas. Só julga o que a fonte informou: sem nota na API, a oferta não é reprovada pela nota. Cupom citado no texto aparece no banco e no histórico. Nenhum cupom é inventado.

## 3. Agendamento

O agendador continua o mesmo, em `api/scheduler.js`. Ganhou **dias da semana** (Automações → Dias de funcionamento). Intervalo, limite diário e janela de horário seguem como antes. Contas antigas sem dias salvos rodam todos os dias.

## 4. Mercado Livre

O link de afiliado e o OAuth são duas capacidades **separadas**.

1. **Link pela etiqueta** (obrigatório para ofertas do ML): em Configurações → Marketplaces, salve a **etiqueta** e o **ID da ferramenta**. Para achar o ID, gere um link uma vez no portal de afiliados, abra esse link e copie o número de `matt_tool=` na URL final.
   > Faça um clique de teste e confira no portal de afiliados se o clique foi atribuído à sua etiqueta.
2. **OAuth (opcional)**: confere na API se o anúncio existe e está ativo antes de enviar.
   - Crie um app em developers.mercadolivre.com.br com redirect `PUBLIC_URL/mercadolivre/callback`.
   - No `.env` do client-panel: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `PUBLIC_URL` e `SAAS_MASTER_KEY` (32+ caracteres).
   - Em Configurações → **Conectar com Mercado Livre**.
   - Segurança: Authorization Code com PKCE e `state` aleatório de uso único (10 min) amarrado ao usuário do JWT. O token fica cifrado em `api/data/marketplaces/<id>.json`. Sem `SAAS_MASTER_KEY`, nada é gravado.
   - Erros: em 401 o token é renovado uma vez e a chamada repete. Se o refresh for recusado, a conexão é apagada e o painel pede para conectar de novo. 403 é falta de permissão e não repete. Em 429 as chamadas desse cliente pausam pelo `Retry-After` (mínimo 30 s). Se a API falhar, o link já validado no formato é enviado e o aviso fica no histórico.

## 5. Amazon

Configurações → Marketplaces → **tag de Associado** (ex.: `seunome-20`). O servidor não abre a página da Amazon para validar, porque ela bloqueia robôs. A validação confere domínio, ASIN e tag.

## 6. Imagens por cenário (opcional)

- No `.env`: `GEMINI_API_KEY`. Opcionais: `NAMY_IMAGE_MODEL` (padrão `gemini-2.5-flash-image`) e `NAMY_IMAGE_DAILY` (padrão 20 por cliente/dia).
- Aba **Imagens**: escolha o produto (enviados pela API ou do banco com foto), escolha o cenário (Bancada da cozinha, No sofá, Na cama, Escritório, Banheiro, Penteadeira, Quarto de bebê, Dentro do carro, Ao ar livre, Estúdio) e toque em **Gerar imagem**.
- ⭐ marca a imagem **preferida** do produto. Ela só vai na divulgação com **Usar imagem gerada** ligado em Automações. Desligado, ou sem preferida, vai a foto original.
- Os arquivos ficam em `api/data/imagens-arquivos/<id>/`. O painel abre as imagens por URL assinada que vale 1 h.

## Onde fica

| Responsabilidade | Arquivo |
|---|---|
| Nicho | `api/afiliados/nichos.js` |
| Achar, resolver e validar link (com proteção SSRF) | `api/afiliados/links.js` |
| Conectores | `api/afiliados/conectores/{shopee,mercadolivre,amazon}.js` |
| Troca de links no texto | `api/afiliados/conversor.js` |
| OAuth Mercado Livre | `api/afiliados/mercadolivreOAuth.js` + `cofre.js` |
| Banco de ofertas e rodízio | `api/afiliados/pool.js` |
| Qualidade e cupom | `api/afiliados/qualidade.js` |
| Publicador por nicho | `api/afiliados/publicador.js` |
| Histórico e auditoria | `api/afiliados/auditoria.js` → `data/disparos/<id>.json` |
| Imagens | `api/afiliados/imagens/` |
| Rotas, `!nicho` e captura | `api/afiliados/routes.js` |

Testes: `node --test api/afiliados/afiliados.test.js` (Node 22).
