import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { MetricPoint } from './useMetricsStream'
import { formatBps } from '@/lib/utils'

interface NetworkChartProps { data: MetricPoint[] }

function Tip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--color-surface-overlay)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: 6, padding: '7px 11px', fontSize: 12, lineHeight: 1.7,
    }}>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
        {new Date(payload[0]?.payload?.time ?? 0).toLocaleTimeString()}
      </div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontFamily: 'monospace' }}>
          {p.name === 'netSent' ? '↑ Sent' : '↓ Recv'}  {formatBps(typeof p.value === 'number' ? p.value : 0)}
        </div>
      ))}
    </div>
  )
}

export function NetworkChart({ data }: NetworkChartProps) {
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={data} margin={{ top: 6, right: 2, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id="netSentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4a9eff" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#4a9eff" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="netRecvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
        <XAxis dataKey="time" hide/>
        <YAxis
          tick={{ fontSize: 9, fill: 'var(--color-text-dim)' }}
          tickLine={false} axisLine={false}
          tickFormatter={v => formatBps(typeof v === 'number' ? v : 0)}
          width={52}
        />
        <Tooltip content={<Tip/>} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}/>
        <Area type="monotoneX" dataKey="netSent"
          stroke="#4a9eff" strokeWidth={1.8} fill="url(#netSentGrad)"
          dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
        />
        <Area type="monotoneX" dataKey="netRecv"
          stroke="#a78bfa" strokeWidth={1.8} fill="url(#netRecvGrad)"
          dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
