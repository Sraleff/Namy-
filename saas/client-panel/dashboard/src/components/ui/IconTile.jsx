import { icons } from './icons';
import { cx } from '../../lib/format';

// Paleta de "tons" compartilhada por todos os ícones de lista/métricas.
const tones = {
  solid: {
    green: 'bg-emerald-500 text-white',
    blue: 'bg-blue-500 text-white',
    indigo: 'bg-indigo-500 text-white',
    violet: 'bg-violet-500 text-white',
    amber: 'bg-amber-400 text-amber-950',
    rose: 'bg-rose-500 text-white',
    teal: 'bg-teal-500 text-white',
  },
  soft: {
    green: 'bg-emerald-500/15 text-emerald-400',
    blue: 'bg-blue-500/15 text-blue-400',
    indigo: 'bg-indigo-500/15 text-indigo-300',
    violet: 'bg-violet-500/15 text-violet-300',
    amber: 'bg-amber-400/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-400',
    teal: 'bg-teal-500/15 text-teal-300',
  },
};

const sizes = {
  sm: 'h-9 w-9 [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-10 w-10 [&>svg]:h-[18px] [&>svg]:w-[18px]',
  lg: 'h-11 w-11 [&>svg]:h-5 [&>svg]:w-5',
};

export default function IconTile({ icon, tone = 'indigo', variant = 'soft', size = 'md', shape = 'rounded-xl' }) {
  const Icon = typeof icon === 'string' ? icons[icon] : icon;
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 items-center justify-center', shape, sizes[size], tones[variant][tone])}
    >
      {Icon && <Icon strokeWidth={2} />}
    </span>
  );
}
