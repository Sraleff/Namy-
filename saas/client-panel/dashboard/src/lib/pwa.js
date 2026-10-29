// Instalação como app (PWA). O Chrome/Edge do Android avisam com "beforeinstallprompt" quando dá
// para instalar; guardamos o evento para o botão do Perfil. iPhone não tem esse evento: lá é pelo
// menu Compartilhar do Safari. Não há modo offline nem notificações.
let evento = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evento = e;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    avisar();
  });
}

export const instalado = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) || window.navigator?.standalone === true;
export const podeInstalar = () => !!evento;
export const ehIOS = () => /iphone|ipad|ipod/i.test(window.navigator?.userAgent || '');

export async function instalar() {
  if (!evento) return 'indisponivel';
  const e = evento;
  e.prompt();
  const { outcome } = await e.userChoice;
  evento = null;
  avisar();
  return outcome; // 'accepted' | 'dismissed'
}

export function aoMudar(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
