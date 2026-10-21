import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Logo from '../components/ui/Logo';
import { login } from '../services/dashboard';
import { register } from '../services/endpoints';
import { setToken } from '../services/api';

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('login');
  const isNew = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        const out = await register(email, password);
        setToken(out.token);
        window.location.hash = 'configuracoes';
      } else {
        await login(email, password);
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.18),transparent_55%)]" />
      <form onSubmit={submit} className="card relative w-full max-w-sm p-8" aria-labelledby="login-title">
        <Logo />
        <h1 id="login-title" className="mt-8 text-xl font-semibold text-cream">{isNew ? 'Criar conta' : 'Entrar no painel'}</h1>
        <p className="mt-1 text-sm text-muted">{isNew ? '30 dias de teste grátis, sem cartão.' : 'Bem-vindo de volta.'}</p>

        <label htmlFor="email" className="mt-6 block text-xs font-medium text-muted">E-mail</label>
        <input
          id="email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-ink-850 px-3.5 text-sm text-cream placeholder:text-subtle focus:border-brand-500/60 focus:outline-none"
          placeholder="voce@email.com"
        />

        <label htmlFor="password" className="mt-4 block text-xs font-medium text-muted">Senha</label>
        <input
          id="password" type="password" autoComplete={isNew ? 'new-password' : 'current-password'} required minLength={4} maxLength={72} value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-ink-850 px-3.5 text-sm text-cream focus:border-brand-500/60 focus:outline-none"
        />

        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

        <button
          type="submit" disabled={busy}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isNew ? 'Criar conta' : 'Entrar'}
        </button>

        <p className="mt-5 text-center text-xs text-subtle">
          {isNew ? 'Já tem conta? ' : 'Não tem conta? '}
          <button type="button" className="link-subtle" onClick={() => { setMode(isNew ? 'login' : 'register'); setError(''); }}>
            {isNew ? 'Entrar' : 'Criar agora'}
          </button>
        </p>
      </form>
    </main>
  );
}
