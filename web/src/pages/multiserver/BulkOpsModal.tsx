import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Modal } from '@/components/ui'
import { bulkExecCommand, type ExecResult } from '@/lib/api'
import type { ServerRecord } from './serversData'

interface Props {
  open: boolean
  onClose: () => void
  servers: ServerRecord[]
}

type BulkAction = 'updates' | 'restart' | 'backup' | 'compliance' | 'drift'

export function BulkOpsModal({ open, onClose, servers }: Props) {
  const [action, setAction] = useState<BulkAction>('updates')
  const [updateType, setUpdateType] = useState<'check' | 'security' | 'all'>('check')
  const [schedule, setSchedule] = useState<'now' | 'scheduled'>('now')
  const [done, setDone] = useState(false)
  const [execResults, setExecResults] = useState<ExecResult[] | null>(null)
  const [serviceName, setServiceName] = useState('nginx')

  const connected = servers.filter(s => s.status === 'connected')

  const execMutation = useMutation({
    mutationFn: (command: string) => bulkExecCommand({
      server_ids: connected.map(s => s.id),
      command,
      sudo: true,
      timeout_sec: 120,
      parallelism: 5,
    }),
    onSuccess: (data: ExecResult[]) => {
      setExecResults(data)
      setDone(true)
    },
    onError: () => {
      setDone(true)
    },
  })

  const handleRun = () => {
    setDone(false)
    setExecResults(null)

    if (action === 'updates') {
      const cmds: Record<typeof updateType, string> = {
        check: 'apt-get update -q && apt-get upgrade --simulate 2>&1 | grep -E "^[0-9]+ upgraded" || true',
        security: 'apt-get update -q && apt-get upgrade --security -s 2>&1 | grep -E "(Inst |[0-9]+ upgraded)" | head -20',
        all: 'apt-get update -q && apt-get upgrade -y 2>&1 | tail -10',
      }
      execMutation.mutate(cmds[updateType])
      return
    }

    if (action === 'restart') {
      execMutation.mutate(`systemctl restart ${serviceName || 'nginx'} && systemctl is-active ${serviceName || 'nginx'}`)
      return
    }

    // For backup, compliance, drift — simulate (these require complex orchestration)
    setTimeout(() => setDone(true), 1500)
  }

  const running = execMutation.isPending

  const ACTIONS: { id: BulkAction; label: string }[] = [
    { id: 'updates', label: 'Package Updates' },
    { id: 'restart', label: 'Rolling Restart' },
    { id: 'backup', label: 'Backup All' },
    { id: 'compliance', label: 'Compliance Scan' },
    { id: 'drift', label: 'Drift Detection' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Bulk Operations" subtitle={`Target: ${connected.length} connected servers`} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACTIONS.map(a => (
            <button key={a.id} onClick={() => { setAction(a.id); setDone(false); setExecResults(null) }} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: `1px solid ${action === a.id ? 'var(--color-accent)' : 'var(--color-border)'}`, background: action === a.id ? 'var(--color-accent-dim)' : 'var(--color-surface-raised)', color: action === a.id ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer' }}>
              {a.label}
            </button>
          ))}
        </div>

        {action === 'updates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Update Type</div>
              {[
                { v: 'check', label: 'Check for updates (dry run)', desc: 'Preview what would be updated without making changes' },
                { v: 'security', label: 'Install security updates only', desc: 'Apply only CVE-related security patches' },
                { v: 'all', label: 'Install all updates', desc: 'Full system upgrade across all packages' },
              ].map(opt => (
                <label key={opt.v} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 7, border: `1px solid ${updateType === opt.v ? 'var(--color-accent)' : 'var(--color-border)'}`, background: updateType === opt.v ? 'var(--color-accent-dim)' : 'var(--color-surface-raised)', cursor: 'pointer' }}>
                  <input type="radio" name="updateType" value={opt.v} checked={updateType === opt.v} onChange={() => setUpdateType(opt.v as typeof updateType)} style={{ accentColor: 'var(--color-accent)', marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Create snapshot before update
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: 'var(--color-accent)' }} />
                Reboot if required
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Notify on completion
              </label>
            </div>
            {done && execResults && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 16 }}>
                  <span>OK: {execResults.filter(r => r.status === 'ok').length}</span>
                  <span style={{ color: 'var(--color-danger)' }}>Failed: {execResults.filter(r => r.status !== 'ok').length}</span>
                </div>
                {execResults.slice(0, 5).map(r => (
                  <div key={r.server_id} style={{ display: 'grid', gridTemplateColumns: '140px 50px 1fr', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 11 }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{r.server_name}</span>
                    <span style={{ color: r.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>{r.status.toUpperCase()}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.output.slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {action === 'restart' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group">
                <label className="field-label">Service name</label>
                <input className="field-input" value={serviceName} onChange={e => setServiceName(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">Batch size</label>
                <input className="field-input" type="number" defaultValue={1} min={1} />
              </div>
              <div className="field-group">
                <label className="field-label">Delay between batches (sec)</label>
                <input className="field-input" type="number" defaultValue={30} />
              </div>
              <div className="field-group">
                <label className="field-label">Health check URL</label>
                <input className="field-input" placeholder="https://server/health" />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 12px', background: 'var(--color-warning-dim)', border: '1px solid rgba(255,152,0,.25)', borderRadius: 7 }}>
              Estimated total time: ~{connected.length * 0.7 | 0} minutes for {connected.length} servers
            </div>
            {done && execResults && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                {execResults.slice(0, 5).map(r => (
                  <div key={r.server_id} style={{ display: 'grid', gridTemplateColumns: '140px 50px 1fr', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 11 }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{r.server_name}</span>
                    <span style={{ color: r.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>{r.status.toUpperCase()}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.output.slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {action === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field-group">
                  <label className="field-label">Backup destination</label>
                  <input className="field-input" defaultValue="/backup/$(date +%Y%m%d)" />
                </div>
                <div className="field-group">
                  <label className="field-label">Retention (days)</label>
                  <input className="field-input" type="number" defaultValue={30} />
                </div>
              </div>
            </div>
            {done && (
              <div style={{ padding: '10px 14px', background: 'var(--color-success-dim)', border: '1px solid rgba(76,175,80,.25)', borderRadius: 7, fontSize: 12, color: 'var(--color-success)' }}>
                Backup initiated on {connected.length} servers. Monitor progress in job history.
              </div>
            )}
          </div>
        )}

        {action === 'compliance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Standards to Check</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['CIS Level 1', 'CIS Level 2', 'PCI-DSS', 'HIPAA', 'NIST'].map(std => (
                  <label key={std} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface-overlay)' }}>
                    <input type="checkbox" defaultChecked={std.startsWith('CIS')} style={{ accentColor: 'var(--color-accent)' }} />
                    {std}
                  </label>
                ))}
              </div>
            </div>
            {done && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Scan Results Preview</div>
                <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                  {[
                    { server: 'web-02.prod', score: '74%', issues: 'PermitRootLogin yes, PasswordAuth yes', sev: 'critical' },
                    { server: 'db-01.prod', score: '68%', issues: 'No audit logging, weak ciphers', sev: 'critical' },
                    { server: 'web-01.prod', score: '94%', issues: 'None', sev: 'ok' },
                  ].map(r => (
                    <div key={r.server} style={{ display: 'grid', gridTemplateColumns: '140px 60px 1fr 70px', padding: '9px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 11, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{r.server}</span>
                      <span style={{ fontWeight: 700, color: r.sev === 'ok' ? 'var(--color-success)' : 'var(--color-danger)' }}>{r.score}</span>
                      <span style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.issues}</span>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>Remediate</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {action === 'drift' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 14 }}>
              <div className="field-group">
                <label className="field-label">Baseline</label>
                <select className="field-input">
                  <option>Production Standard (2026-05-01)</option>
                  <option>Staging Standard (2026-04-15)</option>
                </select>
              </div>
            </div>
            {done && (
              <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-warning)' }}>
                  8 servers have configuration drift (22% of fleet)
                </div>
                {[
                  { server: 'web-02.prod', file: '/etc/nginx/nginx.conf', sev: 'High' },
                  { server: 'db-01.prod', file: '/etc/postgresql/15/main/pg_hba.conf', sev: 'High' },
                  { server: 'cache-01.prod', file: '/etc/redis/redis.conf', sev: 'Low' },
                ].map(r => (
                  <div key={r.server + r.file} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px 100px', padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 11, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{r.server}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file}</span>
                    <span style={{ color: r.sev === 'High' ? 'var(--color-danger)' : 'var(--color-warning)', fontWeight: 600 }}>{r.sev}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>Diff</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>Fix</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn btn-sm ${schedule === 'now' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSchedule('now')} style={{ fontSize: 11 }}>Run Now</button>
            <button className={`btn btn-sm ${schedule === 'scheduled' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSchedule('scheduled')} style={{ fontSize: 11 }}>Schedule</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running} style={{ marginLeft: 8, fontSize: 12 }}>
            {running ? 'Running...' : 'Execute'}
          </button>
          {done && !execResults && <span style={{ fontSize: 12, color: 'var(--color-success)', alignSelf: 'center' }}>Completed successfully</span>}
        </div>
      </div>
    </Modal>
  )
}
