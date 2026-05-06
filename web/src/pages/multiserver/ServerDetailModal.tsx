import { useState } from 'react'
import { Modal } from '@/components/ui'
import type { ServerRecord } from './serversData'

interface Props {
  server: ServerRecord | null
  onClose: () => void
}

function MetricBar({ value, warn = 70, crit = 85 }: { value: number; warn?: number; crit?: number }) {
  const color = value >= crit ? 'var(--color-danger)' : value >= warn ? 'var(--color-warning)' : 'var(--color-success)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color, minWidth: 36, textAlign: 'right' }}>{value}%</span>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  connected: 'var(--color-success)',
  disconnected: 'var(--color-danger)',
  error: 'var(--color-danger)',
  maintenance: 'var(--color-warning)',
}

const ROLE_COLOR: Record<string, string> = {
  web: '#4a9eff',
  database: '#ff9800',
  cache: '#9c27b0',
  worker: '#4caf50',
  loadbalancer: '#00bcd4',
  backup: '#6b7080',
  monitoring: '#e91e63',
}

export function ServerDetailModal({ server, onClose }: Props) {
  const [tab, setTab] = useState<'overview' | 'metrics' | 'services' | 'config'>('overview')

  if (!server) return null

  const m = server.metrics

  return (
    <Modal open={!!server} onClose={onClose} title={server.name} subtitle={`${server.user}@${server.host}:${server.port}`} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 14px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: STATUS_COLOR[server.status], background: `${STATUS_COLOR[server.status]}18`, border: `1px solid ${STATUS_COLOR[server.status]}40`, borderRadius: 5, padding: '2px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[server.status], display: 'inline-block' }} />
            {server.status}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: ROLE_COLOR[server.role] ?? 'var(--color-text-muted)', background: `${ROLE_COLOR[server.role] ?? '#888'}18`, border: `1px solid ${ROLE_COLOR[server.role] ?? '#888'}40`, borderRadius: 5, padding: '2px 8px' }}>
            {server.role}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '2px 8px' }}>
            {server.environment}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '2px 8px' }}>
            {server.region}
          </span>
          {server.latency_ms !== undefined && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: server.latency_ms > 100 ? 'var(--color-warning)' : 'var(--color-success)', marginLeft: 'auto' }}>
              {server.latency_ms} ms
            </span>
          )}
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 16, gap: 2 }}>
          {(['overview', 'metrics', 'services', 'config'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--color-accent)' : 'transparent'}`, color: tab === t ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer', textTransform: 'capitalize', transition: 'all .15s', marginBottom: -1 }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>System Info</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                {[
                  ['OS', server.os],
                  ['Kernel', server.kernel],
                  ['Uptime', server.uptime],
                  ['Last Seen', server.last_seen ?? '—'],
                  ['SSH User', server.user],
                  ['Key File', server.key_file],
                  ['Port', String(server.port)],
                  ['IP / Host', server.host],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {server.description && (
              <div style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(74,158,255,.2)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                {server.description}
              </div>
            )}

            {server.alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Active Alerts</div>
                {server.alerts.map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 7, background: a.severity === 'critical' ? 'var(--color-danger-dim)' : a.severity === 'warning' ? 'var(--color-warning-dim)' : 'var(--color-success-dim)', border: `1px solid ${a.severity === 'critical' ? 'rgba(244,67,54,.25)' : a.severity === 'warning' ? 'rgba(255,152,0,.25)' : 'rgba(76,175,80,.25)'}`, fontSize: 12 }}>
                    <span style={{ color: a.severity === 'critical' ? 'var(--color-danger)' : a.severity === 'warning' ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', marginTop: 1 }}>{a.severity}</span>
                    <span style={{ color: 'var(--color-text)', flex: 1 }}>{a.message}</span>
                    <span style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>{a.time}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Last Backup</div>
                <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{server.last_backup ?? '—'}</div>
                {server.backup_size && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{server.backup_size}</div>}
              </div>
              <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {server.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4, background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'metrics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!m ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>No metrics available — server offline</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'CPU', value: `${m.cpu_pct}%`, color: m.cpu_pct >= 85 ? 'var(--color-danger)' : m.cpu_pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)' },
                    { label: 'Memory', value: `${m.mem_pct}%`, color: m.mem_pct >= 85 ? 'var(--color-danger)' : m.mem_pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)' },
                    { label: 'Disk', value: `${m.disk_pct}%`, color: m.disk_pct >= 85 ? 'var(--color-danger)' : m.disk_pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)' },
                    { label: 'Load', value: m.load_avg.toFixed(1), color: m.load_avg > 2 ? 'var(--color-danger)' : m.load_avg > 1 ? 'var(--color-warning)' : 'var(--color-success)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'CPU Usage', value: m.cpu_pct },
                    { label: 'Memory Usage', value: m.mem_pct, sub: `${m.mem_used_gb} GB / ${m.mem_total_gb} GB` },
                    { label: 'Disk Usage', value: m.disk_pct, sub: `${m.disk_used_gb} GB / ${m.disk_total_gb} GB` },
                  ].map(({ label, value, sub }) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</span>
                        {sub && <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{sub}</span>}
                      </div>
                      <MetricBar value={value} />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 4, borderTop: '1px solid var(--color-border)' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 3 }}>Network In</div>
                      <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text)' }}>{m.net_in_mbps} MB/s</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 3 }}>Network Out</div>
                      <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text)' }}>{m.net_out_mbps} MB/s</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'services' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {server.services.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>No service data available</div>
            ) : server.services.map(svc => (
              <div key={svc.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: svc.status === 'active' ? 'var(--color-success)' : svc.status === 'failed' ? 'var(--color-danger)' : 'var(--color-text-dim)', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text)' }}>{svc.name}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: svc.status === 'active' ? 'var(--color-success)' : svc.status === 'failed' ? 'var(--color-danger)' : 'var(--color-text-dim)' }}>{svc.status}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'config' && (
          <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              {[
                ['SSH Host', server.host],
                ['SSH Port', String(server.port)],
                ['SSH User', server.user],
                ['Key File', server.key_file],
                ['Role', server.role],
                ['Environment', server.environment],
                ['Region', server.region],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text)', background: 'var(--color-surface-overlay)', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--color-border)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)', marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'SSH Direct', color: 'var(--color-accent)' },
            { label: 'Live Logs', color: '' },
            { label: 'Restart', color: '' },
            { label: 'Backup Now', color: '' },
            { label: 'Security Audit', color: '' },
          ].map(({ label, color }) => (
            <button key={label} className={color ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ fontSize: 12 }} onClick={() => {}}>
              {label}
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--color-danger)', fontSize: 12 }} onClick={() => {}}>
            Remove from Fleet
          </button>
        </div>
      </div>
    </Modal>
  )
}
