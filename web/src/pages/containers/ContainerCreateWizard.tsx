import { useState } from 'react'
import styles from './ContainerCreateWizard.module.css'

// ── Icons ──────────────────────────────────────────────────────────
const IcoX   = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
const IcoAdd = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="1.5" x2="6" y2="10.5"/><line x1="1.5" y1="6" x2="10.5" y2="6"/></svg>
const IcoDel = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>

interface Props { onClose: () => void }

type NetworkMode = 'bridge' | 'host' | 'none' | 'custom'
type RestartPolicy = 'no' | 'on-failure' | 'always' | 'unless-stopped'

interface PortMapping { hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }
interface VolumeMount { host: string; container: string; mode: 'rw' | 'ro' }
interface EnvVar { key: string; value: string; secret: boolean }

const STEPS = ['Basics', 'Ports & Network', 'Volumes', 'Environment', 'Advanced']

export function ContainerCreateWizard({ onClose }: Props) {
  const [step, setStep] = useState(0)

  // Step 1 state
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [command, setCommand] = useState('')
  const [entrypoint, setEntrypoint] = useState('')
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>('unless-stopped')
  const [pullAlways, setPullAlways] = useState(false)

  // Step 2 state
  const [networkMode, setNetworkMode] = useState<NetworkMode>('bridge')
  const [customNetwork, setCustomNetwork] = useState('')
  const [ports, setPorts] = useState<PortMapping[]>([{ hostPort: '', containerPort: '', protocol: 'tcp' }])
  const [publishAll, setPublishAll] = useState(false)
  const [dns, setDns] = useState('')

  // Step 3 state
  const [volumes, setVolumes] = useState<VolumeMount[]>([])
  const [workdir, setWorkdir] = useState('')
  const [readonlyRoot, setReadonlyRoot] = useState(false)

  // Step 4 state
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: '', value: '', secret: false }])
  const [hostname, setHostname] = useState('')

  // Step 5 state
  const [cpuLimit, setCpuLimit] = useState('')
  const [memLimit, setMemLimit] = useState('')
  const [pidsLimit, setPidsLimit] = useState('')
  const [privileged, setPrivileged] = useState(false)
  const [healthCmd, setHealthCmd] = useState('')
  const [healthInterval, setHealthInterval] = useState('30')
  const [healthTimeout, setHealthTimeout] = useState('10')
  const [healthRetries, setHealthRetries] = useState('3')
  const [logDriver, setLogDriver] = useState('json-file')

  const addPort = () => setPorts(p => [...p, { hostPort: '', containerPort: '', protocol: 'tcp' }])
  const rmPort = (i: number) => setPorts(p => p.filter((_, j) => j !== i))
  const setPort = (i: number, k: keyof PortMapping, v: string) => setPorts(p => p.map((r, j) => j === i ? { ...r, [k]: v } : r))

  const addVolume = () => setVolumes(v => [...v, { host: '', container: '', mode: 'rw' }])
  const rmVolume = (i: number) => setVolumes(v => v.filter((_, j) => j !== i))
  const setVolume = (i: number, k: keyof VolumeMount, v: string) => setVolumes(vols => vols.map((r, j) => j === i ? { ...r, [k]: v } : r))

  const addEnv = () => setEnvVars(e => [...e, { key: '', value: '', secret: false }])
  const rmEnv = (i: number) => setEnvVars(e => e.filter((_, j) => j !== i))
  const setEnv = (i: number, k: keyof EnvVar, v: string | boolean) => setEnvVars(e => e.map((r, j) => j === i ? { ...r, [k]: v } : r))

  const canNext = () => {
    if (step === 0) return name.trim() !== '' && image.trim() !== ''
    return true
  }

  const handleCreate = () => {
    // In a real app, this would call the API
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'var(--color-text)', outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 5, display: 'block',
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.headerTitle}>Create Container</div>
            <div className={styles.headerSub}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><IcoX /></button>
        </div>

        {/* Stepper */}
        <div className={styles.stepper}>
          {STEPS.map((s, i) => (
            <div key={s} className={styles.stepperItem}>
              <div className={`${styles.stepperDot} ${i < step ? styles.stepperDone : i === step ? styles.stepperActive : ''}`}>
                {i < step ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2"/></svg> : i + 1}
              </div>
              <div className={`${styles.stepperLabel} ${i === step ? styles.stepperLabelActive : ''}`}>{s}</div>
              {i < STEPS.length - 1 && <div className={`${styles.stepperLine} ${i < step ? styles.stepperLineDone : ''}`} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* Step 1: Basics */}
          {step === 0 && (
            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label style={labelStyle}>Container Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input style={inputStyle} placeholder="web-app-01" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className={styles.fieldFull}>
                <label style={labelStyle}>Image <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input style={inputStyle} placeholder="nginx:alpine" value={image} onChange={e => setImage(e.target.value)} />
                {image && <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>Will pull from Docker Hub if not cached locally</div>}
              </div>
              <div>
                <label style={labelStyle}>Command Override</label>
                <input style={inputStyle} placeholder="e.g. node dist/server.js" value={command} onChange={e => setCommand(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Entrypoint Override</label>
                <input style={inputStyle} placeholder="optional" value={entrypoint} onChange={e => setEntrypoint(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Restart Policy</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={restartPolicy} onChange={e => setRestartPolicy(e.target.value as RestartPolicy)}>
                  <option value="no">No (never restart)</option>
                  <option value="on-failure">On Failure</option>
                  <option value="always">Always</option>
                  <option value="unless-stopped">Unless Stopped</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" id="pullAlways" checked={pullAlways} onChange={e => setPullAlways(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }} />
                <label htmlFor="pullAlways" style={{ fontSize: 12, color: 'var(--color-text)', cursor: 'pointer' }}>Always pull image (ignore cache)</label>
              </div>
            </div>
          )}

          {/* Step 2: Ports & Network */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Network Mode</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(['bridge', 'host', 'none', 'custom'] as NetworkMode[]).map(m => (
                    <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--color-text)' }}>
                      <input type="radio" name="netmode" value={m} checked={networkMode === m} onChange={() => setNetworkMode(m)} style={{ accentColor: 'var(--color-accent)' }} />
                      <span style={{ fontWeight: 500 }}>{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                      <span style={{ color: 'var(--color-text-dim)' }}>
                        {m === 'bridge' ? '— isolated Docker network (default)' : m === 'host' ? '— share host network stack' : m === 'none' ? '— no networking' : '— named Docker network'}
                      </span>
                    </label>
                  ))}
                </div>
                {networkMode === 'custom' && (
                  <input style={{ ...inputStyle, marginTop: 8, maxWidth: 280 }} placeholder="e.g. my_network" value={customNetwork} onChange={e => setCustomNetwork(e.target.value)} />
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Port Mappings (host:container)</label>
                  <button className="btn btn-ghost btn-sm" onClick={addPort} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcoAdd /> Add Port</button>
                </div>
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 32px', gap: 0, background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', padding: '6px 10px', fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <span>Host Port</span><span>Container Port</span><span>Protocol</span><span></span>
                  </div>
                  {ports.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 32px', gap: 8, padding: '6px 10px', borderBottom: i < ports.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center' }}>
                      <input style={{ ...inputStyle, padding: '5px 8px' }} placeholder="8080" value={p.hostPort} onChange={e => setPort(i, 'hostPort', e.target.value)} />
                      <input style={{ ...inputStyle, padding: '5px 8px' }} placeholder="80" value={p.containerPort} onChange={e => setPort(i, 'containerPort', e.target.value)} />
                      <select style={{ ...inputStyle, padding: '5px 8px', cursor: 'pointer' }} value={p.protocol} onChange={e => setPort(i, 'protocol', e.target.value)}>
                        <option value="tcp">TCP</option><option value="udp">UDP</option>
                      </select>
                      <button className={styles.rmBtn} onClick={() => rmPort(i)} disabled={ports.length === 1}><IcoDel /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input type="checkbox" id="publishAll" checked={publishAll} onChange={e => setPublishAll(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }} />
                <label htmlFor="publishAll" style={{ fontSize: 12, color: 'var(--color-text)', cursor: 'pointer' }}>Publish all exposed ports</label>
              </div>

              <div>
                <label style={labelStyle}>Custom DNS servers (comma-separated)</label>
                <input style={{ ...inputStyle, maxWidth: 280 }} placeholder="8.8.8.8, 1.1.1.1" value={dns} onChange={e => setDns(e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 3: Volumes */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Volume Mounts (host:container)</label>
                  <button className="btn btn-ghost btn-sm" onClick={addVolume} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcoAdd /> Add Volume</button>
                </div>
                {volumes.length === 0
                  ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 7 }}>No volumes configured — click Add Volume</div>
                  : (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 32px', gap: 0, background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', padding: '6px 10px', fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <span>Host Path / Volume</span><span>Container Path</span><span>Mode</span><span></span>
                      </div>
                      {volumes.map((v, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 32px', gap: 8, padding: '6px 10px', borderBottom: i < volumes.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center' }}>
                          <input style={{ ...inputStyle, padding: '5px 8px' }} placeholder="/data or volume-name" value={v.host} onChange={e => setVolume(i, 'host', e.target.value)} />
                          <input style={{ ...inputStyle, padding: '5px 8px' }} placeholder="/app/data" value={v.container} onChange={e => setVolume(i, 'container', e.target.value)} />
                          <select style={{ ...inputStyle, padding: '5px 8px', cursor: 'pointer' }} value={v.mode} onChange={e => setVolume(i, 'mode', e.target.value)}>
                            <option value="rw">rw</option><option value="ro">ro</option>
                          </select>
                          <button className={styles.rmBtn} onClick={() => rmVolume(i)}><IcoDel /></button>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>

              <div className={styles.formGrid}>
                <div>
                  <label style={labelStyle}>Working Directory</label>
                  <input style={inputStyle} placeholder="/app" value={workdir} onChange={e => setWorkdir(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                  <input type="checkbox" id="readonlyRoot" checked={readonlyRoot} onChange={e => setReadonlyRoot(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }} />
                  <label htmlFor="readonlyRoot" style={{ fontSize: 12, color: 'var(--color-text)', cursor: 'pointer' }}>Read-only root filesystem (security hardening)</label>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Environment */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Environment Variables</label>
                  <button className="btn btn-ghost btn-sm" onClick={addEnv} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcoAdd /> Add Variable</button>
                </div>
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 32px', gap: 0, background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)', padding: '6px 10px', fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <span>Name</span><span>Value</span><span>Secret</span><span></span>
                  </div>
                  {envVars.map((e, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 32px', gap: 8, padding: '6px 10px', borderBottom: i < envVars.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center' }}>
                      <input style={{ ...inputStyle, padding: '5px 8px' }} placeholder="APP_ENV" value={e.key} onChange={ev => setEnv(i, 'key', ev.target.value)} />
                      <input style={{ ...inputStyle, padding: '5px 8px' }} type={e.secret ? 'password' : 'text'} placeholder="production" value={e.value} onChange={ev => setEnv(i, 'value', ev.target.value)} />
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input type="checkbox" checked={e.secret} onChange={ev => setEnv(i, 'secret', ev.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }} />
                      </div>
                      <button className={styles.rmBtn} onClick={() => rmEnv(i)} disabled={envVars.length === 1}><IcoDel /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.formGrid}>
                <div>
                  <label style={labelStyle}>Hostname Override</label>
                  <input style={inputStyle} placeholder="web-app-01.internal" value={hostname} onChange={e => setHostname(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Advanced */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Resource Limits</div>
                <div className={styles.formGrid}>
                  <div>
                    <label style={labelStyle}>CPU Limit (cores)</label>
                    <input style={inputStyle} placeholder="2.0" value={cpuLimit} onChange={e => setCpuLimit(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Memory Limit</label>
                    <input style={inputStyle} placeholder="512m or 2g" value={memLimit} onChange={e => setMemLimit(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Max PIDs</label>
                    <input style={inputStyle} placeholder="100" value={pidsLimit} onChange={e => setPidsLimit(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                    <input type="checkbox" id="priv" checked={privileged} onChange={e => setPrivileged(e.target.checked)} style={{ accentColor: 'var(--color-danger)', width: 14, height: 14 }} />
                    <label htmlFor="priv" style={{ fontSize: 12, color: 'var(--color-danger)', cursor: 'pointer', fontWeight: 500 }}>Privileged mode (dangerous)</label>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Health Check</div>
                <div className={styles.formGrid}>
                  <div className={styles.fieldFull}>
                    <label style={labelStyle}>Health Check Command</label>
                    <input style={inputStyle} placeholder="curl -f http://localhost/health || exit 1" value={healthCmd} onChange={e => setHealthCmd(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Interval (seconds)</label>
                    <input style={inputStyle} value={healthInterval} onChange={e => setHealthInterval(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Timeout (seconds)</label>
                    <input style={inputStyle} value={healthTimeout} onChange={e => setHealthTimeout(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Retries</label>
                    <input style={inputStyle} value={healthRetries} onChange={e => setHealthRetries(e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Logging Driver</label>
                <select style={{ ...inputStyle, maxWidth: 220, cursor: 'pointer' }} value={logDriver} onChange={e => setLogDriver(e.target.value)}>
                  {['json-file', 'syslog', 'journald', 'gelf', 'fluentd', 'none'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          {step < STEPS.length - 1
            ? <button className="btn btn-primary btn-sm" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next: {STEPS[step + 1]}</button>
            : <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!name || !image}>Create Container</button>
          }
        </div>
      </div>
    </div>
  )
}
