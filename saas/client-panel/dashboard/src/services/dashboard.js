import { api, setToken } from './api';
import * as mock from '../data/mock';

// VITE_USE_MOCK=1 roda o painel sem backend (dados de src/data/mock.js).
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';

export async function getDashboard() {
  if (USE_MOCK) {
    return {
      user: mock.user,
      connection: mock.connection,
      stats: mock.stats,
      messages: mock.messagesLast7Days,
      campaigns: mock.campaigns,
      aiFeatures: mock.aiFeatures,
      activities: mock.activities,
      recentGroups: mock.recentGroups,
      notifications: mock.notifications,
    };
  }
  return api('/dashboard');
}

export async function login(email, password) {
  const out = await api('/auth/login', { method: 'POST', body: { email, password } });
  setToken(out.token);
  return out;
}

export const logout = () => setToken('');

// Liga/desliga um campo booleano da config, ex.: 'ads.enabled'
export function toggleConfig(path, value) {
  const [section, key] = path.split('.');
  return api('/config', { method: 'PUT', body: { [section]: { [key]: value } } });
}

export const reconnectWhatsApp = () => api('/whatsapp/reconnect', { method: 'POST' });
