import { cx } from '../../lib/format';

export default function Skeleton({ className }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-lg bg-white/[0.04]', className)} />;
}
