import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { MetricPoint } from './useMetricsStream'

interface CPUChartProps { data: MetricPoint[] }

function Tip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  return (
    <div style={{
      background: 'var(--color-surface-overlay)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: 6, padding: '7px 11px', fontSize: 12, lineHeight: 1.7,
    }}>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
        {new Date(payload[0]?.payload?.time ?? 0).toLocaleTimeString()}
      </div>
      <div style={{ color: '#4a9eff', fontFamily: 'monospace', fontWeight: 600 }}>
        CPU  {typeof v === 'number' ? v.toFixed(1) : v}%
      </div>
    </div>
  )
}

export function CPUChart({ data }: CPUChartProps) {
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={data} margin={{ top: 6, right: 2, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4a9eff" stopOpacity={0.35}/>
            <stop offset="95%" stopColor="#4a9eff" stopOpacity={0}/>
          </linearGradient>
          <filter id="cpuGlow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
        <XAxis dataKey="time" hide/>
        <YAxis domain={[0,100]} tick={{ fontSize: 9, fill: 'var(--color-text-dim)' }} tickLine={false} axisLine={false} tickCount={5}/>
        <ReferenceLine y={80} stroke="rgba(255,152,0,0.2)" strokeDasharray="4 4"/>
        <Tooltip content={<Tip/>} cursor={{ stroke: 'rgba(74,158,255,0.2)', strokeWidth: 1 }}/>
        <Area type="monotoneX" dataKey="cpu"
          stroke="#4a9eff" strokeWidth={2} fill="url(#cpuGrad)"
          dot={false} activeDot={{ r: 3, fill: '#4a9eff', strokeWidth: 0 }}
          filter="url(#cpuGlow)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
