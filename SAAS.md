# Namy 3.1 — aluguel do bot (cada cliente com a própria API)

## Configurar (uma vez)

No `.env`:

```env
SAAS_MASTER_KEY=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

Guarde essa chave fora do celular também. Perdeu/trocou = clientes recadastram as chaves.

## Fluxo

Dono (Painel Master):
```
!cliente criar joao pro João Silva
!cliente admin joao 5511999999999
```

Cliente, no PRIVADO com o bot:
```
!minhaconta shopee <AppId> <Secret>   (validado na Shopee antes de salvar)
!minhaconta ia groq <chave>
!minhaconta status
```

Cliente, dentro do grupo dele (precisa ser admin do grupo):
```
!minhaconta vincular
!minhaconta ligar
!minhaconta intervalo 2h | limite 10 | horario 09:00-22:00 | keyword fone
```

## Regras

- Grupo de cliente usa SOMENTE as chaves do cliente. Chaves da casa só com `!minhaconta casa on` e plano que permite (Pro/Premium).
- Sem chave Shopee → grupo pausado, nunca cai na sua conta.
- Sem chave de IA → ofertas saem com template local; IA não responde no grupo.
- Chave recusada pela Shopee → só aquele grupo pausa 6h; outros clientes seguem.
- Cliente inativo/vencido → sem publicações e sem IA nos grupos dele.
- Chaves cifradas AES-256-GCM em `dados/saas.json`; nunca aparecem inteiras (só `gsk_…a1b2`).
- Chave mandada em grupo é apagada (se o bot for admin) e recusada.

## Próximo

- Ligar o painel Namy Cloud a este mesmo cofre (API HTTP autenticada).
- Banco real com `tenant_id` quando houver mais de um processo.
- Cobrança automática.
