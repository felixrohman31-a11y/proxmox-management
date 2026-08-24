'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  scale?: number;
}

interface TrendChartProps {
  data: Array<{ [k: string]: number | null }>;
  series: SeriesDef[];
  xTickFmt?: (ms: number) => string;
  yFmt?: (v: number) => string;
  tipFmt?: (v: number, name: string) => string;
  height?: number;
}

export function TrendChart({ data, series, xTickFmt, yFmt, tipFmt, height = 200 }: TrendChartProps) {
  const prepared = data.map((row) => {
    const out: { [k: string]: number | null } = {};
    for (const k of Object.keys(row)) out[k] = row[k];
    for (const s of series) {
      const raw = row[s.key];
      if (s.scale !== undefined) out[s.key] = raw == null ? null : raw * s.scale;
    }
    return out;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={prepared} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="t"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => (xTickFmt ? xTickFmt(v) : '')}
            stroke="#52525b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#3f3f46' }}
            minTickGap={48}
          />
          <YAxis
            stroke="#52525b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={(v: number) => (yFmt ? yFmt(v) : String(Math.round(v)))}
          />
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              fontSize: 12,
              color: '#e4e4e7'
            }}
            labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
            labelFormatter={(v) =>
              typeof v === 'number'
                ? new Date(v).toLocaleString('id-ID', { hour12: false })
                : String(v)
            }
            formatter={(value: number | string, name: string) => [
              tipFmt ? tipFmt(Number(value), name) : String(value),
              name
            ]}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={`url(#grad-${s.key})`}
              strokeWidth={1.6}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
