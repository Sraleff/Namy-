import { cx } from '../../lib/format';

const variants = {
  success: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  info: 'bg-brand-500/10 text-brand-300 ring-brand-500/25',
  warning: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
  danger: 'bg-rose-500/10 text-rose-400 ring-rose-500/20',
  neutral: 'bg-white/5 text-muted ring-white/10',
};

export default function Badge({ variant = 'neutral', dot = false, className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        variants[variant],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
