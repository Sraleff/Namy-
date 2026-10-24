import {
  Home, Users, Megaphone, Sparkles, Workflow, Contact, ScrollText, Settings, Tag, Image, Link2, ListOrdered,
} from 'lucide-react';

export const navItems = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'grupos', label: 'Grupos', icon: Users },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { id: 'ia', label: 'Inteligência Artificial', icon: Sparkles },
  { id: 'automacoes', label: 'Automações', icon: Workflow },
  { id: 'ofertas', label: 'Ofertas', icon: Tag },
  { id: 'conversor', label: 'Conversor', icon: Link2 },
  { id: 'fila', label: 'Fila', icon: ListOrdered },
  { id: 'imagens', label: 'Imagens', icon: Image },
  { id: 'contatos', label: 'Contatos', icon: Contact },
  { id: 'logs', label: 'Logs & Atividades', icon: ScrollText },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];
