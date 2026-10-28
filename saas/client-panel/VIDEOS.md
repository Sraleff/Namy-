# Módulo de vídeos da Namy

Guia para quem vai manter ou ampliar o módulo. Tudo roda dentro do client-panel
(`saas/client-panel`, Express na porta 3847, dashboard React servido em `/app`).

## O que existe

| Parte | Arquivo | O que faz |
|---|---|---|
| Biblioteca | `api/afiliados/videosBiblioteca.js` | Guarda os vídeos de cada conta, confere o tipo pelos bytes (caixa `ftyp` do MP4/MOV), aplica limites e grava primeiro como `.parcial` |
| Importar por link | `api/afiliados/videos.js` | Shopee e Pinterest pela página pública (sem login, sem cookie, sem programa externo) |
| YouTube | `api/afiliados/ytdlp.js` | Um vídeo público do YouTube via `yt-dlp`, se o programa estiver no PATH. Sem cookie, sem login, sem DRM |
| Rotas | `api/afiliados/videosRoutes.js` | Todas com JWT, licença ativa e limite de uso. Registradas em `api/afiliados/routes.js` |
| Oferta com vídeo | `api/afiliados/pool.js` (`definirVideo`, `soltarVideo`) | O item do Banco de ofertas ganha `video: { id }` |
| Envio | `api/afiliados/publicador.js` → `api/sessions.js` (`sendOffer`) | A oferta com vídeo sai com o vídeo no lugar da foto. Se o vídeo falhar, sai com a foto |
| Tela | `dashboard/src/pages/BaixarVideo.jsx` (rota `#videos`) | Abas "Meus vídeos" e "Importar por link" |
| Cliente HTTP | `dashboard/src/services/endpoints.js` | `videoEnviar` (XHR com progresso), `videoBiblioteca`, `videoRemover`, `ofertaVideo`, `videoInfo`, `videoSalvar`, `videoBaixar` |
| Testes | `api/afiliados/videos.test.js`, `api/afiliados/videosBiblioteca.test.js`, `api/afiliados/ytdlp.test.js` | `cd saas/client-panel/api && node --test` |

Arquivos em disco (nunca commitar, fica em `api/data/`):

```
api/data/videos/<userId>.json                 índice da biblioteca
api/data/videos-arquivos/<userId>/<uuid>.mp4  arquivos
```

Limites (em `videosBiblioteca.js`, `LIMITES`): 64 MB por arquivo, 500 MB e 30 vídeos por conta,
1 envio por vez por conta e 4 no servidor.

## Rotas

```
POST /videos/info                 { url }            Shopee/Pinterest pela página pública, ou YouTube via yt-dlp. Devolve um id de uso único
POST /videos/baixar               { id }             MP4 para o aparelho
POST /videos/salvar               { id }             guarda na biblioteca
GET  /videos/biblioteca                              itens, uso e URL assinada de prévia
POST /videos/biblioteca           corpo = o arquivo  upload (header X-Nome-Arquivo, Content-Type video/mp4)
POST /videos/biblioteca/remover   { id }             apaga e solta das ofertas
GET  /videos/biblioteca/arquivo/:id?u&e&s            prévia com Range, URL assinada por 1 h
POST /ofertas/banco/video         { itemId, videoId|null }
```

## Como acrescentar uma nova fonte de importação

A biblioteca não sabe de onde o vídeo vem: qualquer fonte entrega um **stream** para
`biblioteca.salvar(DATA, userId, stream, { nome, origem, tamanhoDeclarado })`. Ela confere o tipo,
os limites e o isolamento por conta. Uma fonte nova segue o mesmo desenho do `videos.js`:

1. **Arquivo próprio** em `api/afiliados/` (ex.: `importarX.js`), exportando `info(userId, url)` e
   `abrir(userId, id)` como o `videos.js`. Mantenha o id de uso único amarrado ao `userId`, para o
   navegador nunca mandar o endereço do arquivo.
2. **Validação de URL:** só `https`, host numa lista fechada da fonte, e use `links.buscarSeguro`
   (bloqueia localhost, redes privadas e metadados de nuvem, e confere cada redirecionamento).
3. **Origem:** acrescente o nome em `ORIGENS` no `videosBiblioteca.js` e o rótulo em `ORIGEM` no
   `BaixarVideo.jsx`.
4. **Rotas:** acrescente em `videosRoutes.js`, com `auth`, `conta()` (licença) e um `criarLimitador`.
5. **Tela:** acrescente a fonte em `PLATAFORMAS` no `BaixarVideo.jsx`.
6. **Testes:** copie o padrão de `videos.test.js` (troca `_dep.buscar` por respostas prontas).

Se a fonte depender de um **programa externo**:

- Rode com `child_process.execFile` / `spawn` passando argumentos em **lista**, nunca montando uma
  string de comando com a URL (`shell: false`).
- Mande a saída para uma pasta temporária da própria conta e passe o arquivo pronto para
  `biblioteca.salvar` (o limite de 64 MB e a conferência do tipo continuam valendo).
- Aplique tempo máximo (mate o processo ao estourar), limite de envios ao mesmo tempo e apague a
  pasta temporária no fim, com sucesso ou erro.
- Não grave cookies, tokens nem a URL completa nos logs.
- Deixe a dependência opcional: sem o programa instalado, a rota responde com uma mensagem clara.

A responsabilidade pelo uso de cada fonte é de quem opera a Namy. Use só fontes e conteúdos cujo
download seja permitido pelos termos da plataforma e pelo dono do conteúdo, sem contornar DRM,
login obrigatório ou outras proteções.

## YouTube (yt-dlp)

Implementado em `ytdlp.js`, no mesmo desenho (`info` / `abrir`, id amarrado ao `userId`).

- Hosts fechados: `youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtube-nocookie.com`,
  `youtu.be`. Só `https`, só um vídeo (watch, Short, embed, live já encerrada ou youtu.be).
  Canal e playlist são recusados. O parâmetro `list` é tirado antes de chamar o programa.
- O programa roda com `spawn` e `shell: false`. A URL entra como último argumento, depois de `--`.
  Não há `--cookies`, login nem config do usuário do sistema (`--ignore-config` e `HOME` na pasta
  temporária). Sem o binário `yt-dlp` no `PATH`, a rota responde 503 com mensagem clara.
- DNS do host tem de ser público (a mesma regra de IP privado de `links.js`). A miniatura só volta
  se o host for `ytimg.com`, `ggpht.com` ou `googleusercontent.com`. A URL do arquivo e a página
  não vão para o navegador nem para a mensagem de erro.
- Saída em pasta temporária da conta (`os.tmpdir()/namy-ytdlp/<conta>/`), apagada ao terminar, no
  erro ou depois de ler o stream. Confere a caixa `ftyp`, recusa acima de 64 MB, ao vivo e vídeo
  com mais de 20 minutos. No máximo 1 processo por conta e 2 no servidor, e 12 infos de YouTube
  por hora (além do limite geral de downloads).
- Formato: MP4 progressivo (`-f b[ext=mp4]...`), para não depender do ffmpeg. Origem `youtube`.

## Implantar

1. `git pull` no servidor.
2. `cd saas/client-panel/dashboard && npm run build` (o `ligar-tudo.sh` faz isso se o código mudou).
3. Reinicie o client-panel (`npm start` em `saas/client-panel`, ou o seu gerenciador de processo).
4. Nenhuma dependência npm nova nem variável nova no `.env`. Para o YouTube, instale o programa
   `yt-dlp` no servidor e deixe no `PATH` (sem cookies e sem conta). Sem ele, Shopee e Pinterest
   seguem iguais e o link do YouTube responde que o programa não está instalado.
5. Confira: `cd saas/client-panel/api && node --test` (esperado: 0 falhas).
6. Primeiro envio de vídeo: faça num grupo de teste. O envio real de vídeo no WhatsApp ainda não
   foi testado; o fluxo foi testado com o envio simulado.
