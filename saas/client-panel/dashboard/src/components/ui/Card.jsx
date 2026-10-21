import { cx } from '../../lib/format';

export function Card({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag className={cx('card p-5', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, id }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight text-cream">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function CardLink({ href = '#', children = 'Ver todos', label }) {
  return (
    <a href={href} className="link-subtle shrink-0" aria-label={label}>
      {children}
    </a>
  );
}
