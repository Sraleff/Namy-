import {
  Home, Users, Megaphone, Sparkles, Workflow, Contact, ScrollText, Settings, Tag, Image, Link2, ListOrdered, Store, Wallet, CalendarClock, Ticket, UsersRound, Share2, Send, Bot, CircleUser, Wand2, Film,
} from 'lucide-react';

// Barra lateral (desktop): todas as páginas, como sempre
export const navItems = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'grupos', label: 'Grupos', icon: Users },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { id: 'ia', label: 'Inteligência Artificial', icon: Sparkles },
  { id: 'assistente', label: 'Assistente', icon: Bot },
  { id: 'automacoes', label: 'Automações', icon: Workflow },
  { id: 'ofertas', label: 'Ofertas', icon: Tag },
  { id: 'vitrine', label: 'Vitrine', icon: Store },
  { id: 'conversor', label: 'Conversor', icon: Link2 },
  { id: 'videos', label: 'Vídeos', icon: Film },
  { id: 'fila', label: 'Fila', icon: ListOrdered },
  { id: 'agendadas', label: 'Agendadas', icon: CalendarClock },
  { id: 'cupons', label: 'Cupons', icon: Ticket },
  { id: 'membros', label: 'Membros', icon: UsersRound },
  { id: 'captacao', label: 'Captação', icon: Share2 },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'comissoes', label: 'Comissões', icon: Wallet },
  { id: 'imagens', label: 'Imagens', icon: Image },
  { id: 'contatos', label: 'Contatos', icon: Contact },
  { id: 'logs', label: 'Logs & Atividades', icon: ScrollText },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];

// Páginas que existem só como rota (não aparecem na barra lateral)
export const extraRoutes = [
  { id: 'perfil', label: 'Perfil', icon: CircleUser },
  { id: 'configurar', label: 'Configurar a automação', icon: Wand2 },
];

// Telas de foco (passo a passo): sem barra do topo nem barra inferior no celular
export const focusRoutes = new Set(['configurar']);

// Banco, Fila e Vitrine: uma área só, com abas no topo das três páginas
export const ofertasTabs = [
  { id: 'ofertas', label: 'Banco' },
  { id: 'fila', label: 'Fila' },
  { id: 'vitrine', label: 'Vitrine' },
];

// Barra inferior (celular e tablet). O Converter fica no meio, em destaque.
export const bottomNav = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'vitrine', label: 'Vitrine', icon: Store },
  { id: 'conversor', label: 'Converter', icon: Link2, destaque: true },
  { id: 'grupos', label: 'Grupos', icon: Users },
  { id: 'perfil', label: 'Perfil', icon: CircleUser },
];

// Cada página fora da barra inferior abre por aqui, no Perfil: nada some no celular
export const menuGroups = [
  { title: 'Divulgação', tone: 'indigo', ids: ['configurar', 'ofertas', 'fila', 'videos', 'agendadas', 'campanhas', 'automacoes', 'cupons'] },
  { title: 'Crescimento', tone: 'green', ids: ['captacao', 'membros', 'telegram'] },
  { title: 'Inteligência', tone: 'violet', ids: ['ia', 'assistente', 'imagens'] },
  { title: 'Resultados', tone: 'amber', ids: ['comissoes', 'contatos', 'logs'] },
  { title: 'Conta', tone: 'blue', ids: ['configuracoes'] },
];

// Rótulos mais curtos no menu do Perfil
export const menuLabels = { fila: 'Fila de envio', logs: 'Logs e atividades', ofertas: 'Banco de ofertas' };
