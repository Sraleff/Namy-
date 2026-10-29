import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/format';

// Campo: poço escuro dentro do vidro; 44px no celular (toque), 40px a partir do sm
const control =
  'h-11 rounded-xl border border-line bg-ink-850 px-3.5 text-base text-cream placeholder:text-subtle transition hover:border-line-strong focus:border-brand-400/60 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:opacity-50 sm:h-10 sm:text-sm';

export function Field({ label, hint, htmlFor, children, className }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">{label}</label>}
      {children}
      {hint && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}

// Largura total por padrão, a menos que o className defina uma (w-40, sm:w-48…)
const width = (className) => (/(^|\s)w-/.test(className || '') ? '' : 'w-full');

export const Input = ({ className, ...p }) => <input className={cx(control, width(className), className)} {...p} />;
export const Select = ({ className, children, ...p }) => (
  <select className={cx(control, width(className), 'pr-8', className)} {...p}>{children}</select>
);
export const Textarea = ({ className, ...p }) => (
  <textarea className={cx(control, 'h-auto min-h-[96px] w-full py-2.5 leading-relaxed sm:h-auto', className)} {...p} />
);

const variants = {
  primary: 'bg-brand-gradient text-white shadow-glow hover:brightness-110 hover:shadow-[0_14px_30px_-10px_rgba(99,102,241,1),inset_0_1px_0_rgba(255,255,255,0.3)]',
  secondary: 'border border-line-strong bg-ink-800 text-cream backdrop-blur-md hover:bg-ink-750',
  ghost: 'text-muted hover:bg-white/[0.05] hover:text-cream',
  danger: 'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
  success: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20',
};

// Alvos de toque de 44px no celular; um pouco menores a partir do sm (mouse)
const sizes = {
  sm: 'h-9 px-3 text-xs sm:h-8',
  md: 'h-11 px-4 text-sm sm:h-10',
  lg: 'h-[52px] px-5 text-base',
};

export function Button({ variant = 'primary', size = 'md', busy, icon: Icon, className, children, ...p }) {
  return (
    <button
      type="button"
      disabled={busy || p.disabled}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        sizes[size] || sizes.md,
        variants[variant],
        className,
      )}
      {...p}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Switch({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 sm:h-6 sm:w-11', on ? 'bg-emerald-500' : 'bg-ink-700 hover:bg-white/25')}
    >
      <span className={cx('absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform sm:h-5 sm:w-5', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

const tones = {
  info: 'border-brand-400/25 bg-brand-500/10 text-brand-300',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

// Mensagem de retorno de ação: { tone, text } ou null
export function Notice({ msg, className }) {
  if (!msg?.text) return null;
  return (
    <p role={msg.tone === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border px-3 py-2.5 text-xs leading-relaxed sm:py-2', tones[msg.tone || 'info'], className)}>
      {msg.text}
    </p>
  );
}
