# Central de Divulgação

Aba **Central** do painel (`saas/client-panel`). Usa a mesma sessão de WhatsApp dos anúncios. Não abre um segundo socket e não altera os grupos salvos em Anúncios.

Também disponível no dashboard novo em `/app` → **Contatos** e **Campanhas**.

## Como usar

1. Entre no painel e deixe o WhatsApp conectado (aba WhatsApp).
2. Abra **Central** e toque em **Atualizar grupos**.
3. Toque num grupo para ver participantes. Número só aparece se o WhatsApp mandar. Nome de perfil não vem nessa consulta.
4. **Registrar contatos sem autorizar**. Todo mundo entra com consentimento `nenhum`.
5. Autorize, um por um, só quem pediu para receber mensagem. **Revogar** tira da fila.
6. Crie um rascunho:
   - **Grupo:** busque o link (a conta em geral precisa ser admin) ou cole `https://chat.whatsapp.com/...`.
   - **Oferta:** busca um produto real na API Shopee desta conta. Cupom fica `nenhum`.
   - **Promoção:** só segue se a API trouxer desconto maior que zero. Sem desconto, a central recusa e não inventa cupom.
7. Marque só contatos autorizados e salve os destinatários.
8. **Aprovar envio.** A fila manda no máximo uma mensagem por vez, intervalo mínimo de 20 segundos, teto de 50 por dia. Se o WhatsApp cair, o contato continua na fila.
9. Pausar, retomar ou cancelar não reenvia quem já foi aceito. **Aceito** significa que o socket aceitou. Entrega e leitura não são confirmadas.

## Onde fica

- Tela: `panel/index.html`
- Regras e fila: `api/divulgacao/`
- Dados de cada cliente: `api/data/divulgacao/<id>.json` (fora do Git)

## Limites

- Participar de um grupo não é consentimento.
- Telefone de participante muitas vezes não vem. Sem telefone e sem id `@s.whatsapp.net` ou `@lid`, o envio falha e fica registrado.
- A lista de grupos só muda quando você toca em Atualizar. Não há escuta ao vivo de entrada e saída.
- Link de convite depende de permissão no grupo. A central não rotaciona o link.
- Intervalo curto não é jeito de furar limite do WhatsApp.
- Mensagem privada em escala continua sujeita às regras do WhatsApp e à LGPD. A fila é um limite operacional, não uma garantia de entrega.
