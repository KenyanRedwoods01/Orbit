import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createManagedServer, testServerConnection } from '@/lib/api'
import { Modal, Spinner } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
}

const ROLES = ['web', 'database', 'cache', 'worker', 'loadbalancer', 'backup', 'monitoring']
const ENVS = ['production', 'staging', 'development', 'testing']
const REGIONS = ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1']

export function AddServerWizard({ open, onClose }: Props) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [user, setUser] = useState('deployer')
  const [authMethod, setAuthMethod] = useState<'key' | 'password' | 'agent'>('key')
  const [keyFile, setKeyFile] = useState('~/.ssh/id_rsa')
  const [useJumpHost, setUseJumpHost] = useState(false)
  const [jumpHost, setJumpHost] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testLatency, setTestLatency] = useState<number | null>(null)

  const [role, setRole] = useState('web')
  const [env, setEnv] = useState('production')
  const [region, setRegion] = useState('us-east-1')
  const [tags, setTags] = useState(['environment=production', 'role=web'])
  const [tagInput, setTagInput] = useState('')
  const [desc, setDesc] = useState('')

  const [collectCpu, setCollectCpu] = useState(true)
  const [collectMem, setCollectMem] = useState(true)
  const [collectDisk, setCollectDisk] = useState(true)
  const [collectNet, setCollectNet] = useState(true)
  const [autoBackup, setAutoBackup] = useState(true)
  const [compliance, setCompliance] = useState(true)

  const [err, setErr] = useState<string | null>(null)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createManagedServer({
      name,
      host,
      port: parseInt(port) || 22,
      user,
      auth_method: authMethod,
      key_file: keyFile,
      jump_host: useJumpHost ? jumpHost : '',
      role,
      environment: env,
      region,
      tags,
      description: desc,
      collect_cpu: collectCpu,
      collect_mem: collectMem,
      collect_disk: collectDisk,
      collect_net: collectNet,
      auto_backup: autoBackup,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servers'] })
      handleClose()
    },
    onError: (e: Error) => setErr(e.message),
  })

  const handleClose = () => {
    setStep(1); setName(''); setHost(''); setPort('22'); setUser('deployer');
    setKeyFile('~/.ssh/id_rsa'); setTestStatus('idle'); setTestLatency(null); setErr(null);
    setRole('web'); setEnv('production'); setRegion('us-east-1');
    setTags(['environment=production', 'role=web']); setDesc('');
    onClose()
  }

  const handleTest = async () => {
    if (!host.trim()) return
    setTestStatus('testing')
    setTestLatency(null)
    try {
      const res = await testServerConnection({
        host: host.trim(),
        port: parseInt(port) || 22,
        user,
        key_file: keyFile,
      })
      if (res.online) {
        setTestStatus('ok')
        setTestLatency(res.latency_ms ?? null)
      } else {
        setTestStatus('fail')
      }
    } catch {
      setTestStatus('fail')
    }
  }

  const addTag = () => {
    if (tagInput.trim()) { setTags(t => [...t, tagInput.trim()]); setTagInput('') }
  }

  const step1Valid = name.trim() && host.trim()

  const STEP_LABELS = ['Connection', 'Metadata', 'Monitoring']

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Add Server — Step ${step} of 3: ${STEP_LABELS[step - 1]}`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEP_LABELS.map((l, i) => (
              <div key={l} style={{ width: 8, height: 8, borderRadius: '50%', background: step > i + 1 ? 'var(--color-accent)' : step === i + 1 ? 'var(--color-accent)' : 'var(--color-border)', opacity: step === i + 1 ? 1 : step > i + 1 ? 0.7 : 0.3, transition: 'all .2s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
            {step > 1 && <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>Back</button>}
            {step < 3
              ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={step === 1 && !step1Valid}>Next</button>
              : <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                  {mutation.isPending && <Spinner size="sm" />}Add Server
                </button>
            }
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ background: 'var(--color-danger-dim)', border: '1px solid rgba(244,67,54,.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--color-danger)' }}>{err}</div>}

        {step === 1 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
              <div className="field-group">
                <label className="field-label">Server Name</label>
                <input className="field-input" placeholder="web-04.prod" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">SSH Port</label>
                <input className="field-input" placeholder="22" value={port} onChange={e => setPort(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Hostname / IP Address</label>
              <input className="field-input" placeholder="10.0.1.14 or hostname.example.com" value={host} onChange={e => setHost(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Authentication Method</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['key', 'password', 'agent'] as const).map(m => (
                  <label key={m} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: `1px solid ${authMethod === m ? 'var(--color-accent)' : 'var(--color-border)'}`, background: authMethod === m ? 'var(--color-accent-dim)' : 'var(--color-surface-raised)', cursor: 'pointer', fontSize: 12, color: authMethod === m ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    <input type="radio" name="auth" value={m} checked={authMethod === m} onChange={() => setAuthMethod(m)} style={{ accentColor: 'var(--color-accent)' }} />
                    {m === 'key' ? 'SSH Key' : m === 'password' ? 'Password' : 'SSH Agent'}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field-group">
                <label className="field-label">SSH Username</label>
                <input className="field-input" placeholder="deployer" value={user} onChange={e => setUser(e.target.value)} />
              </div>
              {authMethod === 'key' && (
                <div className="field-group">
                  <label className="field-label">Key File Path</label>
                  <input className="field-input" placeholder="~/.ssh/id_rsa" value={keyFile} onChange={e => setKeyFile(e.target.value)} />
                </div>
              )}
              {authMethod === 'password' && (
                <div className="field-group">
                  <label className="field-label">Password</label>
                  <input className="field-input" type="password" placeholder="••••••••••" />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)' }} />
                Verify connection before adding
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={useJumpHost} onChange={e => setUseJumpHost(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
                Use SSH jump host (bastion)
              </label>
              {useJumpHost && (
                <input className="field-input" placeholder="bastion.prod:22" value={jumpHost} onChange={e => setJumpHost(e.target.value)} style={{ marginLeft: 20 }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={testStatus === 'testing' || !host} style={{ fontSize: 12 }}>
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus === 'ok' && (
                <span style={{ fontSize: 12, color: 'var(--color-success)', alignSelf: 'center' }}>
                  Connected{testLatency !== null ? ` (${testLatency}ms)` : ''}
                </span>
              )}
              {testStatus === 'fail' && <span style={{ fontSize: 12, color: 'var(--color-danger)', alignSelf: 'center' }}>Connection failed</span>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="field-group">
                <label className="field-label">Server Role</label>
                <select className="field-input" value={role} onChange={e => setRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Environment</label>
                <select className="field-input" value={env} onChange={e => setEnv(e.target.value)}>
                  {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Region</label>
                <select className="field-input" value={region} onChange={e => setRegion(e.target.value)}>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Description</label>
              <input className="field-input" placeholder="Primary web server for customer portal" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Tags (key=value)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {tags.map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 5, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    {t}
                    <button onClick={() => setTags(ts => ts.filter(x => x !== t))} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field-input" placeholder="key=value" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag() }} style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} />
                <button className="btn btn-ghost btn-sm" onClick={addTag} style={{ fontSize: 12 }}>Add Tag</button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Collect Metrics</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'CPU usage (every 30s)', state: collectCpu, set: setCollectCpu },
                  { label: 'Memory usage', state: collectMem, set: setCollectMem },
                  { label: 'Disk usage', state: collectDisk, set: setCollectDisk },
                  { label: 'Network traffic', state: collectNet, set: setCollectNet },
                ].map(({ label, state, set }) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}>
                    <input type="checkbox" checked={state} onChange={e => set(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Alert Thresholds (inherited from role: {role})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  'CPU > 80% for 5 minutes   → Send to #web-team',
                  'Memory > 90%               → Critical (PagerDuty)',
                  'Disk > 85%                 → Warning (email)',
                  `Service ${role === 'web' ? 'nginx' : role === 'database' ? 'postgresql' : 'redis'} down → Critical`,
                ].map(r => (
                  <div key={r} style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)', padding: '3px 0' }}>{r}</div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoBackup} onChange={e => setAutoBackup(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
                Enable automatic backup (daily, keep 30 days)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={compliance} onChange={e => setCompliance(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
                Include in compliance scans
              </label>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
