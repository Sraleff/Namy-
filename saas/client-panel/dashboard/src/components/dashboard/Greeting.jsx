import { formatLongDate, greetingFor } from '../../lib/format';

export default function Greeting({ name, now = new Date() }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-cream sm:text-[32px]">
          Olá, {name}! <span role="img" aria-label="aceno">👋</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Aqui está um resumo do seu painel Namy Control.</p>
      </div>
      <div className="sm:text-right">
        <time dateTime={now.toISOString().slice(0, 10)} className="block text-sm font-medium text-cream">
          {formatLongDate(now)}
        </time>
        <p className="mt-0.5 text-xs text-muted">{greetingFor(now)} Continue evoluindo.</p>
      </div>
    </div>
  );
}
