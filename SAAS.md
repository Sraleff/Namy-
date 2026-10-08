# Namy 3.1 — base multi-tenant (Painel Master via WhatsApp)

Primeira etapa da plataforma SaaS de afiliados. Ainda **não** existe painel web; o controle Master é feito pelos donos (`OWNERS`) com `!cliente`.

## Regra

Tudo que pertence à plataforma (clientes, planos, limites, vencimento) fica no Master. Grupo sem cliente vinculado continua sendo da plataforma — o comportamento antigo da Shopee não muda.

## Dados

`dados/saas.json` (escrita atômica, `.bak`, permissão 600). Separado de `namy.json` e `shopee.json`. Não compartilhe.

```
tenants: { <id>: { nome, plano, ativo, venceEm, criadoEm } }
grupos:  { <jid do grupo>: <id do cliente> }
uso:     { <id>: { 'AAAA-MM-DD': publicações } }  (últimos 30 dias)
```

## O que é aplicado

- Cliente inativo ou vencido → o scheduler da Shopee pula os grupos dele.
- Limite diário de anúncios do plano somado entre todos os grupos do cliente.
- Limite de grupos do plano ao vincular.
- Um grupo pertence a no máximo um cliente.

## Fluxo

```
!cliente criar joao pro João Silva
(no grupo) !cliente vincular joao
(no grupo) !shopee cadastrar
(no grupo) !shopee on
```

## Próximas etapas

1. Credenciais Shopee por cliente (criptografadas com chave do `.env`).
2. Camada `AffiliateProvider` (Shopee, Mercado Livre, Amazon...).
3. Painel web do cliente com login próprio, vendo só os dados dele.
4. Banco real (SQLite/Postgres) com `tenant_id` em toda tabela quando passar de um processo.
5. Cobrança/assinatura automática.
