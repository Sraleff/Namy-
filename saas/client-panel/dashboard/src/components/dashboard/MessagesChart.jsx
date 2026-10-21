import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { formatDate, formatDayMonth, formatNumber } from '../../lib/format';

const SERIES = '#818cf8';
const GRID = 'rgba(148,163,184,0.08)';
const AXIS = '#64748b';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-ink-750 px-3 py-2 shadow-card">
      <p className="text-[11px] text-muted">{formatDate(p.date)}</p>
      <p className="tabular text-sm font-semibold text-cream">{formatNumber(p.sent)} mensagens</p>
    </div>
  );
}

export default function MessagesChart({ data = [], demo = true }) {
  const [view, setView] = useState('chart');
  const total = data.reduce((s, d) => s + d.sent, 0);

  return (
    <Card aria-labelledby="chart-title" className="flex flex-col">
      <CardHeader
        id="chart-title"
        title="Mensagens Enviadas"
        subtitle={`Últimos 7 dias${demo ? ' (demonstração)' : ''} · ${formatNumber(total)} no total`}
        action={
          <div className="flex items-center gap-2">
            {demo && (
              <Badge variant="info" className="hidden sm:inline-flex">
                Dados fictícios <Info className="h-3 w-3" aria-hidden="true" />
              </Badge>
            )}
            <button
              type="button"
              onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-inset ring-white/10 transition-colors hover:text-cream"
              aria-pressed={view === 'table'}
            >
              {view === 'chart' ? 'Tabela' : 'Gráfico'}
            </button>
          </div>
        }
      />

      {view === 'chart' ? (
        <div className="relative h-[200px] w-full" role="img" aria-label={`Gráfico de área: mensagens enviadas por dia, total ${formatNumber(total)}`}>
          {total === 0 && (
            <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted">
              Nenhum envio nos últimos 7 dias
            </p>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="msgFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayMonth}
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tickFormatter={formatNumber}
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={[0, (max) => Math.max(4, Math.ceil(max * 1.15))]}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: 'rgba(148,163,184,0.35)', strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="sent"
                stroke={SERIES}
                strokeWidth={2}
                fill="url(#msgFill)"
                dot={{ r: 4, fill: SERIES, stroke: '#131a2b', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: SERIES, stroke: '#131a2b', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[200px] overflow-auto scrollbar-thin">
          <table className="w-full text-sm">
            <caption className="sr-only">Mensagens enviadas por dia</caption>
            <thead>
              <tr className="text-left text-xs text-subtle">
                <th scope="col" className="pb-2 font-medium">Data</th>
                <th scope="col" className="pb-2 text-right font-medium">Mensagens</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1.5 text-muted">{formatDate(d.date)}</td>
                  <td className="tabular py-1.5 text-right text-cream">{formatNumber(d.sent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
