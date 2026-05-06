import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Modal } from '@/components/ui'
import { bulkExecCommand, fetchServerCommands, type ExecResult } from '@/lib/api'
import type { ServerRecord } from './serversData'

interface Props {
  open: boolean
  onClose: () => void
  servers: ServerRecord[]
}

interface ResultRow {
  server: string
  status: 'ok' | 'error' | 'running'
  output: string
  exitCode?: number
}

export function RunCommandModal({ open, onClose, servers }: Props) {
  const [tab, setTab] = useState<'runner' | 'library'>('runner')
  const [target, setTarget] = useState<'all' | 'group' | 'role'>('all')
  const [command, setCommand] = useState('')
  const [runAs, setRunAs] = useState('deployer')
  const [sudo, setSudo] = useState(false)
  const [timeoutSec, setTimeoutSec] = useState(60)
  const [parallelism, setParallelism] = useState(10)
  const [stopOnFail, setStopOnFail] = useState(true)
  const [results, setResults] = useState<ResultRow[] | null>(null)

  const { data: commands = [] } = useQuery({
    queryKey: ['server-commands'],
    queryFn: fetchServerCommands,
    enabled: open,
    retry: false,
  })

  const execMutation = useMutation({
    mutationFn: (cmd: string) => bulkExecCommand({
      server_ids: servers.map(s => s.id),
      command: cmd,
      sudo,
      timeout_sec: timeoutSec,
      parallelism,
      stop_on_fail: stopOnFail,
    }),
    onSuccess: (data: ExecResult[]) => {
      setResults(data.map(r => ({
        server: r.server_name,
        status: r.status === 'ok' ? 'ok' : 'error',
        output: r.output,
        exitCode: r.exit_code,
      })))
    },
    onError: () => {
      setResults(servers.map(s => ({
        server: s.name,
        status: 'error',
        output: 'Failed to contact server',
        exitCode: -1,
      })))
    },
  })

  const handleRun = () => {
    if (!command.trim()) return
    setResults(null)
    execMutation.mutate(command.trim())
  }

  const handleLoadCommand = (cmd: string) => {
    setCommand(cmd)
    setTab('runner')
  }

  const running = execMutation.isPending

  return (
    <Modal open={open} onClose={onClose} title="Run Command" subtitle="Execute commands across multiple servers in parallel" size="lg">
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 16, gap: 2 }}>
        {(['runner', 'library'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--color-accent)' : 'transparent'}`, color: tab === t ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer', textTransform: 'capitalize', marginBottom: -1 }}>
            {t === 'runner' ? 'Command Runner' : 'Command Library'}
          </button>
        ))}
      </div>

      {tab === 'runner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { value: 'all', label: `All servers (${servers.length})` },
              { value: 'group', label: 'By group' },
              { value: 'role', label: 'By role' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: `1px solid ${target === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`, background: target === opt.value ? 'var(--color-accent-dim)' : 'var(--color-surface-raised)', cursor: 'pointer', fontSize: 12, color: target === opt.value ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                <input type="radio" name="target" value={opt.value} checked={target === opt.value} onChange={() => setTarget(opt.value as typeof target)} style={{ accentColor: 'var(--color-accent)' }} />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="field-group">
            <label className="field-label">Command</label>
            <input className="field-input" style={{ fontFamily: 'monospace', fontSize: 13 }} placeholder="systemctl status nginx | grep 'Active:'" value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !running) handleRun() }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="field-group">
              <label className="field-label">Run as user</label>
              <input className="field-input" value={runAs} onChange={e => setRunAs(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Timeout (sec)</label>
              <input className="field-input" type="number" value={timeoutSec} onChange={e => setTimeoutSec(Number(e.target.value))} />
            </div>
            <div className="field-group">
              <label className="field-label">Parallelism</label>
              <input className="field-input" type="number" min={1} max={50} value={parallelism} onChange={e => setParallelism(Number(e.target.value))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={sudo} onChange={e => setSudo(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              Run with sudo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={stopOnFail} onChange={e => setStopOnFail(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
              Stop on first failure
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => {}} style={{ fontSize: 12 }}>Dry Run</button>
            <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running || !command.trim()} style={{ fontSize: 12 }}>
              {running ? 'Running...' : 'Execute'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => {}} style={{ fontSize: 12 }}>Schedule</button>
          </div>

          {running && (
            <div style={{ padding: '12px 14px', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Executing on {servers.filter(s => s.status === 'connected').length} servers...
            </div>
          )}

          {results && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 16 }}>
                <span>Completed: {results.filter(r => r.status === 'ok').length}/{results.length}</span>
                <span style={{ color: 'var(--color-danger)' }}>Failed: {results.filter(r => r.status === 'error').length}</span>
              </div>
              {results.map(r => (
                <div key={r.server} style={{ display: 'grid', gridTemplateColumns: '140px 50px 1fr', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text)', fontSize: 11 }}>{r.server}</span>
                  <span style={{ color: r.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700, fontSize: 11 }}>
                    {r.status === 'ok' ? 'OK 0' : `ERR ${r.exitCode}`}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.output}</span>
                </div>
              ))}
              <div style={{ padding: '8px 14px', background: 'var(--color-surface-raised)', display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => { const failed = results.filter(r => r.status === 'error').map(r => r.server); if (failed.length) handleRun() }}>Retry Failed</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Export CSV</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 80px', padding: '8px 14px', background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span>Name</span><span>Command</span><span>Target</span><span></span>
          </div>
          {commands.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center' }}>
              No saved commands yet. Run a command to save it to the library.
            </div>
          )}
          {commands.map(cmd => (
            <div key={cmd.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 80px', padding: '9px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{cmd.name}</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.command}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{cmd.role}</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => handleLoadCommand(cmd.command)}>Use</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
