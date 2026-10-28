import { api, ApiError, getToken } from './api';

const post = (path, body) => api(path, { method: 'POST', body: body || {} });

// Conta / config
export const getConfig = () => api('/config');
export const saveConfig = (patch) => api('/config', { method: 'PUT', body: patch });
export const register = (email, password) => post('/auth/register', { email, password });

// WhatsApp
export const waStatus = () => api('/whatsapp/status');
export const waConnect = (phone) => post('/whatsapp/connect', { phone });
export const waDisconnect = (logout = false) => post('/whatsapp/disconnect', { logout });
export const waReconnect = () => post('/whatsapp/reconnect');
export const waGroups = () => api('/whatsapp/groups');
export const saveAdGroups = (groups) => post('/whatsapp/groups', { groups });

// Anúncios / Shopee
export const adTestToGroup = (jid) => post('/ads/test', { jid });
export const adTestAll = () => post('/bot/test');
export const runNow = () => post('/automacoes/executar');
export const shopeeTest = () => post('/shopee/test');

// Central de divulgação
export const listContacts = () => api('/divulgacao/contatos');
export const addContact = (body) => post('/divulgacao/contatos', body);
export const setConsent = (id, consent) => post('/divulgacao/contatos/consentimento', { id, consent });
export const importGroupContacts = (jid) => post('/divulgacao/registrar', { jid });

export const listCampaigns = () => api('/divulgacao/campanhas');
export const createCampaign = (body) => post('/divulgacao/campanhas', body);
export const fetchInvite = (jid, campaignId) => post('/divulgacao/convite', { jid, campaignId });
export const pasteInvite = (id, url) => post('/divulgacao/campanhas/convite-colado', { id, url });
export const attachOffer = (id) => post('/divulgacao/campanhas/oferta', { id });
export const setRecipients = (id, contactIds) => post('/divulgacao/campanhas/destinatarios', { id, contactIds });
export const campaignAction = (action, id) => post(`/divulgacao/campanhas/${action}`, { id });

// Afiliados: nichos, banco de ofertas, auditoria
export const affiliateSummary = () => api('/afiliados/resumo');
export const setGroupNiche = (jid, niche, keywords) => post('/whatsapp/groups/nicho', { jid, niche, keywords });
export const saveSourceGroups = (groups) => post('/afiliados/fontes', { groups });
export const listPool = () => api('/ofertas/banco');
export const addPool = (texto, imageUrl) => post('/ofertas/banco', { texto, imageUrl });
export const removePool = (id) => post('/ofertas/banco/remover', { id });
export const togglePool = (id, ativo) => post('/ofertas/banco/ativo', { id, ativo });
export const previewOffer = (body) => post('/ofertas/previa', body);
export const convertLink = (texto) => post('/conversor/link', { texto });

// Mensagem das ofertas: modelo, IA e chave do cliente (cifrada no servidor)
export const getCopy = () => api('/copy/config');
export const saveCopy = (body) => api('/copy/config', { method: 'PUT', body });
export const saveCopyKey = (provedor, chave) => post('/copy/chave', { provedor, chave });
export const removeCopyKey = (provedor) => post('/copy/chave/remover', { provedor });
export const previewCopy = (body) => post('/copy/previa', body);

// Fila de produtos (banco de ofertas com status, prioridade e edição)
export const listProducts = (status = '', limite = 25) => api(`/produtos?limite=${limite}${status ? `&status=${encodeURIComponent(status)}` : ''}`);
export const editProduct = (body) => post('/produtos/editar', body);
export const requeueProduct = (id) => post('/produtos/reenfileirar', { id });

// Vitrine de ofertas (busca na API Shopee com as chaves do cliente)
export const searchShowcase = (keyword = '', ordem = '', pagina = 1) => api(`/vitrine?pagina=${pagina}${ordem ? `&ordem=${encodeURIComponent(ordem)}` : ''}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`);
export const saveShowcase = (itemId) => post('/vitrine/salvar', { itemId });
export const sendShowcase = (body) => post('/vitrine/enviar', body);
export const listDispatches = (tipo = '') => api(`/afiliados/disparos?limite=150${tipo ? `&tipo=${tipo}` : ''}`);

// Comissões (conversionReport da Shopee) e atribuição por grupo
export const getCommissions = (de = '', ate = '') => api(`/comissoes?${de ? `de=${de}&` : ''}${ate ? `ate=${ate}` : ''}`);
export const refreshCommissions = (de = '', ate = '') => post('/comissoes/atualizar', { de: de || undefined, ate: ate || undefined });
export const getCommissionsConfig = () => api('/comissoes/config');
export const saveCommissionsConfig = (porGrupo) => api('/comissoes/config', { method: 'PUT', body: { porGrupo } });

// Primeiros passos (checklist)
export const getOnboarding = () => api('/onboarding');

// Perfis de envio e medidor de risco (não gravam nada)
export const getProfiles = () => api('/automacoes/perfis');
export const checkRisk = (ads) => post('/automacoes/risco', { ads });

// Diagnóstico: por que não enviou?
export const getDiagnostic = () => api('/diagnostico');

// Monitor de membros (so contagens por grupo e por dia)
export const getMembers = (dias = 30) => api(`/membros?dias=${dias}`);
export const refreshMembers = () => post('/membros/atualizar');
export const saveMembersConfig = (body) => post('/membros/config', body);

// Captação: link de grupos (rotação de convites) e vitrine pública
export const getCaptacao = () => api('/captacao');
export const saveCaptacaoGrupos = (body) => post('/captacao/grupos', body);
export const saveCaptacaoVitrine = (body) => post('/captacao/vitrine', body);
export const testCaptacao = () => post('/captacao/testar');
export const newCaptacaoAddress = () => post('/captacao/endereco', { confirmo: true });
export const removeCaptacaoItem = (id) => post('/captacao/vitrine/remover', { id });

// Telegram: bot do cliente, canais/grupos e espelho das ofertas
export const telegramStatus = () => api('/telegram');
export const telegramConnect = (token) => post('/telegram/conectar', { token });
export const telegramDisconnect = () => post('/telegram/desconectar');
export const telegramAddDestination = (body) => post('/telegram/destinos', body);
export const telegramRemoveDestination = (id) => post('/telegram/destinos/remover', { id });
export const telegramDestinationNiche = (id, nicho) => post('/telegram/destinos/nicho', { id, nicho });
export const telegramToggle = (ativo) => post('/telegram/ativo', { ativo });
export const telegramTest = (id) => post('/telegram/testar', { id });

// Amazon Creators API (opcional: estoque e preço antes do envio)
export const amazonCreatorsStatus = () => api('/amazon/creators');
export const amazonCreatorsSave = (body) => post('/amazon/creators', body);
export const amazonCreatorsRemove = () => post('/amazon/creators/remover');
export const amazonCreatorsTest = (url) => post('/amazon/creators/testar', { url });

// Assistente (cérebro da Namy): comandos pelo celular, moderação e IA nos grupos
export const getBrain = () => api('/cerebro');
export const brainCommands = (ativo) => post('/cerebro/comandos', { ativo });
export const brainModeration = (body) => post('/cerebro/moderacao', body);
export const brainAssistant = (body) => post('/cerebro/ia', body);

// Cupons cadastrados pelo cliente
export const listCoupons = () => api('/cupons');
export const createCoupon = (body) => post('/cupons/criar', body);
export const editCoupon = (body) => post('/cupons/editar', body);
export const toggleCoupon = (id, ativo) => post('/cupons/ativar', { id, ativo });
export const removeCoupon = (id) => post('/cupons/remover', { id });

// Mensagens agendadas
export const listSchedules = () => api('/agendadas');
export const createSchedule = (body) => post('/agendadas/criar', body);
export const editSchedule = (body) => post('/agendadas/editar', body);
export const toggleSchedule = (id, ativo) => post('/agendadas/ativar', { id, ativo, confirmo: ativo ? true : undefined });
export const removeSchedule = (id) => post('/agendadas/remover', { id });
export const sendScheduleNow = (id) => post('/agendadas/enviar-agora', { id, confirmo: true });
export const previewSchedule = (recorrencia) => post('/agendadas/previa', { recorrencia });
export const saveScheduleLimits = (body) => post('/agendadas/config', body);

// Mercado Livre (OAuth)
export const mlStatus = () => api('/mercadolivre/status');
export const mlConnect = () => post('/mercadolivre/conectar');
export const mlDisconnect = () => post('/mercadolivre/desconectar');

// Imagens por cenário
export const imageProducts = () => api('/imagens/produtos');
export const listImages = (produtoKey) => api(`/imagens?produtoKey=${encodeURIComponent(produtoKey || '')}`);
export const generateImage = (body) => post('/imagens/gerar', body);
export const preferImage = (id) => post('/imagens/preferida', { id });
export const removeImage = (id) => post('/imagens/remover', { id });

// Logs / plano
export const getLogs = () => api('/logs');
export const getPlans = () => api('/billing/plans');
export const getUso = () => api('/plano/uso');
export const checkout = (plan) => post('/billing/checkout', { plan, returnTo: 'app' });
export const syncPayment = (paymentId) => post('/billing/sync', { paymentId });

// Baixar vídeo (Shopee/Pinterest): info devolve um id de uso único; baixar devolve o arquivo
export const videoInfo = (url) => post('/videos/info', { url });
export async function videoBaixar(id) {
  const res = await fetch('/videos/baixar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new ApiError(d.error || `Erro ${res.status}`, res.status);
  }
  return res.blob();
}
export const videoSalvar = (id, nome) => post('/videos/salvar', { id, nome });

// Biblioteca de vídeos (anexar às ofertas do banco)
export const videoBiblioteca = () => api('/videos/biblioteca');
export const videoRemover = (id) => post('/videos/biblioteca/remover', { id });
export const ofertaVideo = (itemId, videoId) => post('/ofertas/banco/video', { itemId, videoId });
// Envia o arquivo como corpo da requisição. XHR (e não fetch) para mostrar o progresso.
export function videoEnviar(arquivo, { onProgresso, sinal } = {}) {
  return new Promise((ok, falhou) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/videos/biblioteca');
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
    xhr.setRequestHeader('Content-Type', arquivo.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Nome-Arquivo', encodeURIComponent(arquivo.name || 'video.mp4'));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgresso?.(e.loaded / e.total);
    xhr.onload = () => {
      let d = {};
      try { d = JSON.parse(xhr.responseText); } catch { /* sem corpo */ }
      if (xhr.status >= 200 && xhr.status < 300) ok(d);
      else falhou(new ApiError(d.error || `Erro ${xhr.status}`, xhr.status));
    };
    xhr.onerror = () => falhou(new ApiError('A conexão caiu durante o envio. Tente de novo.', 0));
    xhr.onabort = () => falhou(new ApiError('Envio cancelado.', 0));
    sinal?.addEventListener('abort', () => xhr.abort());
    xhr.send(arquivo);
  });
}
