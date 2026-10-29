# NAMY CONTROL — dashboard

React + Vite + Tailwind. Servido pelo client-panel em **http://127.0.0.1:3847/app/**.
Login e token (`namy_client_token`) são os mesmos do painel clássico em `/`.

```bash
bash ligar-tudo.sh            # na raiz: compila o dashboard (se mudou) e sobe tudo
npm run dev                   # aqui: Vite em :5173 com proxy para a API em :3847
VITE_USE_MOCK=1 npm run dev   # sem backend, dados de src/data/mock.js
npm run build                 # gera dist/ (o Express serve em /app)
npm run assets                # regenera favicon, ícones e OG image
```

## Páginas (tudo dentro de /app — não precisa mais do painel antigo)
| Menu | API |
|------|-----|
| Início | `GET /dashboard` (a cada 30s), switch `PUT /config` |
| Grupos | `GET/POST /whatsapp/groups`, `POST /ads/test`, `POST /divulgacao/registrar` |
| Campanhas | `/divulgacao/campanhas*` (criar, convite, oferta, destinatários, aprovar, pausar, retomar, cancelar) |
| Inteligência Artificial | `PUT /config` (shopee), `POST /shopee/test` |
| Automações | `PUT /config` (ads, affiliate), `POST /bot/test` |
| Contatos | `/divulgacao/contatos*` |
| Logs & Atividades | `GET /logs` |
| Configurações | `/whatsapp/status|connect|disconnect|reconnect`, `PUT /config`, `/billing/*` |

Login e cadastro: `POST /auth/login`, `POST /auth/register`. O pagamento do Mercado Pago volta para `/app/`.
