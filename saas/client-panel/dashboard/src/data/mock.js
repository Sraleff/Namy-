// Dados fictícios de demonstração. A forma destes objetos é o "contrato"
// que a API real deve devolver — veja src/services/dashboard.js.

export const user = {
  name: 'Aleff',
  role: 'Administrador',
  plan: 'free',
};

export const connection = {
  status: 'connected', // 'connected' | 'connecting' | 'disconnected'
  label: 'WhatsApp (demonstração)',
  phone: '+55 11 99999-9999',
  version: '2.24.0',
  demo: true,
};

export const stats = [
  { id: 'groups', label: 'Total de Grupos', value: 12, delta: '2 novos hoje', trend: 'up', icon: 'users', tone: 'green' },
  { id: 'contacts', label: 'Total de Contatos', value: 1248, delta: '85 novos hoje', trend: 'up', icon: 'contact', tone: 'blue' },
  { id: 'campaigns', label: 'Campanhas Enviadas', value: 8, delta: '3 hoje', trend: 'up', icon: 'send', tone: 'violet' },
  { id: 'automations', label: 'Automações Ativas', value: 5, delta: '1 modificada', trend: 'up', icon: 'zap', tone: 'amber' },
];

export const messagesLast7Days = [
  { date: '2026-10-11', sent: 480 },
  { date: '2026-10-12', sent: 690 },
  { date: '2026-10-13', sent: 1010 },
  { date: '2026-10-14', sent: 610 },
  { date: '2026-10-15', sent: 1290 },
  { date: '2026-10-16', sent: 1180 },
  { date: '2026-10-17', sent: 1580 },
];

export const campaigns = [
  { id: 'c1', name: 'Boas-vindas', sentAt: '2026-10-15', status: 'done', delivered: 248, total: 248, icon: 'mail', tone: 'blue' },
  { id: 'c2', name: 'Promoção Especial', sentAt: '2026-10-12', status: 'done', delivered: 1024, total: 1024, icon: 'megaphone', tone: 'indigo' },
  { id: 'c3', name: 'Reativação de Clientes', sentAt: '2026-10-10', status: 'done', delivered: 856, total: 856, icon: 'refresh', tone: 'violet' },
  { id: 'c4', name: 'Lembrete de Pagamento', sentAt: '2026-10-08', status: 'done', delivered: 412, total: 412, icon: 'calendar', tone: 'rose' },
];

export const aiFeatures = [
  { id: 'a1', name: 'Respostas Inteligentes', description: 'Responde perguntas automaticamente', active: true, icon: 'bot', toggle: 'ai.enabled' },
  { id: 'a2', name: 'Atendimento 24h', description: 'Sempre online para seus clientes', active: true, icon: 'clock' },
  { id: 'a3', name: 'Análise de Sentimento', description: 'Identifica emoções nas mensagens', active: true, icon: 'heart' },
  { id: 'a4', name: 'Sugestões de Conteúdo', description: 'Cria mensagens com base no contexto', active: true, icon: 'sparkles' },
];

export const activities = [
  { id: 'e1', title: 'Nova mensagem recebida', detail: 'Grupo: Equipe Namy', time: '14:32', icon: 'users', tone: 'indigo' },
  { id: 'e2', title: 'Campanha concluída', detail: 'Promoção Especial', time: '13:45', icon: 'megaphone', tone: 'teal' },
  { id: 'e3', title: 'Novo contato', detail: '+55 11 98888-7777', time: '12:20', icon: 'user', tone: 'green' },
  { id: 'e4', title: 'Automação ativada', detail: 'Boas-vindas', time: '11:05', icon: 'zap', tone: 'rose' },
  { id: 'e5', title: 'Grupo adicionado', detail: 'Clientes VIP', time: '09:12', icon: 'users', tone: 'blue' },
];

export const recentGroups = [
  { id: 'g1', name: 'Equipe Namy', members: 28, lastActivity: '2h', icon: 'users', tone: 'indigo' },
  { id: 'g2', name: 'Clientes VIP', members: 156, lastActivity: '3h', icon: 'crown', tone: 'amber' },
  { id: 'g3', name: 'Suporte', members: 42, lastActivity: '5h', icon: 'headphones', tone: 'blue' },
  { id: 'g4', name: 'Divulgação', members: 98, lastActivity: '6h', icon: 'megaphone', tone: 'teal' },
  { id: 'g5', name: 'Amigos', members: 12, lastActivity: '8h', icon: 'heart', tone: 'rose' },
];

export const notifications = [
  { id: 'n1', title: 'Campanha "Promoção Especial" concluída', time: 'há 1h', unread: true },
  { id: 'n2', title: '85 novos contatos sincronizados', time: 'há 3h', unread: true },
  { id: 'n3', title: 'Automação "Boas-vindas" modificada', time: 'ontem', unread: false },
];
