import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Footer from './components/layout/Footer';
import { navItems } from './components/layout/navigation';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import Campaigns from './pages/Campaigns';
import AI from './pages/AI';
import Automations from './pages/Automations';
import Offers from './pages/Offers';
import Converter from './pages/Converter';
import Produtos from './pages/Produtos';
import Vitrine from './pages/Vitrine';
import Comissoes from './pages/Comissoes';
import Agendadas from './pages/Agendadas';
import Cupons from './pages/Cupons';
import Images from './pages/Images';
import Contacts from './pages/Contacts';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { useAsync } from './hooks/useAsync';
import { useHashRoute } from './lib/route';
import { getDashboard, logout, USE_MOCK } from './services/dashboard';
import { getToken, onUnauthorized } from './services/api';

const pages = {
  grupos: Groups,
  campanhas: Campaigns,
  ia: AI,
  automacoes: Automations,
  ofertas: Offers,
  conversor: Converter,
  fila: Produtos,
  vitrine: Vitrine,
  comissoes: Comissoes,
  agendadas: Agendadas,
  cupons: Cupons,
  imagens: Images,
  contatos: Contacts,
  logs: Logs,
  configuracoes: Settings,
};

export default function App() {
  const [authed, setAuthed] = useState(() => USE_MOCK || !!getToken());
  const { page, param } = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data, loading, error, reload, setData } = useAsync(getDashboard, [authed], { refreshMs: 30000, enabled: authed });
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const refreshSummary = useCallback(() => reload({ silent: true }), [reload]);

  useEffect(() => onUnauthorized(() => setAuthed(false)), []);

  const handleLogout = useCallback(() => {
    logout();
    setAuthed(false);
  }, []);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  const route = navItems.some((n) => n.id === page) ? page : 'inicio';
  const Page = pages[route];

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2">
        Pular para o conteúdo
      </a>

      <Sidebar user={data?.user} active={route} onSelect={() => {}} open={menuOpen} onClose={closeMenu} onLogout={handleLogout} />

      <div className="flex min-h-screen flex-col lg:pl-[272px]">
        <Topbar connection={data?.connection} notifications={data?.notifications} onOpenMenu={() => setMenuOpen(true)} />

        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {Page ? (
            <Page key={route} param={param} query={param} onDataChanged={refreshSummary} />
          ) : (
            <Dashboard data={data} loading={loading} error={error} onRetry={reload} onChange={setData} />
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}
