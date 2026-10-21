import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/format';

const control =
  'h-10 rounded-xl border border-line bg-ink-850 px-3.5 text-sm text-cream placeholder:text-subtle transition-colors focus:border-brand-500/60 focus:outline-none disabled:opacity-50';

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
  <textarea className={cx(control, 'h-auto min-h-[96px] w-full py-2.5 leading-relaxed', className)} {...p} />
);

const variants = {
  primary: 'bg-brand-gradient text-white shadow-glow hover:brightness-110',
  secondary: 'border border-line bg-ink-750 text-cream hover:bg-ink-700',
  ghost: 'text-muted hover:bg-white/[0.04] hover:text-cream',
  danger: 'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
};

export function Button({ variant = 'primary', size = 'md', busy, icon: Icon, className, children, ...p }) {
  return (
    <button
      type="button"
      disabled={busy || p.disabled}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
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
      className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-brand-500' : 'bg-ink-700')}
    >
      <span className={cx('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

const tones = {
  info: 'bg-brand-500/10 text-brand-300',
  ok: 'bg-emerald-500/10 text-emerald-300',
  warn: 'bg-amber-400/10 text-amber-300',
  error: 'bg-rose-500/10 text-rose-300',
};

// Mensagem de retorno de ação: { tone, text } ou null
export function Notice({ msg, className }) {
  if (!msg?.text) return null;
  return (
    <p role={msg.tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg px-3 py-2 text-xs leading-relaxed', tones[msg.tone || 'info'], className)}>
      {msg.text}
    </p>
  );
}
