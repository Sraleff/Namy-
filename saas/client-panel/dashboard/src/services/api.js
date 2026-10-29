// Cliente HTTP da API do client-panel (mesma origem em produção; proxy do Vite em dev).
// O token é o mesmo do painel clássico, então o login vale para os dois.
const TOKEN_KEY = 'namy_client_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* sem storage */ }
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const listeners = new Set();
export const onUnauthorized = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Servidor offline. Rode "bash ligar-tudo.sh".', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setToken('');
    try { if (data.error) sessionStorage.setItem('namy_auth_msg', data.error); } catch { /* sem storage */ }
    listeners.forEach((fn) => fn());
  }
  if (!res.ok) throw new ApiError(data.error || `Erro ${res.status}`, res.status);
  return data;
}
