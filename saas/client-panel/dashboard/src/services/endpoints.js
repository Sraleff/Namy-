import { api } from './api';

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

// Logs / plano
export const getLogs = () => api('/logs');
export const getPlans = () => api('/billing/plans');
export const checkout = (plan) => post('/billing/checkout', { plan, returnTo: 'app' });
export const syncPayment = (paymentId) => post('/billing/sync', { paymentId });
