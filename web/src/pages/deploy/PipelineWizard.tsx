import { useState } from 'react'
import { Modal, Spinner } from '@/components/ui'
import { ServiceIcons } from './ServiceIcons'
import styles from './DeployPage.module.css'

interface PipelineWizardProps {
  open: boolean
  onClose: () => void
  onCreate: (data: { name: string; project: string; script_path: string; strategy: string }) => void
}

const STEPS = ['Basics', 'Repository', 'Trigger', 'Build', 'Env Vars', 'Review']

const PROVIDERS = ['github', 'gitlab', 'bitbucket', 'gitea'] as const

const APP_TYPES = [
  { value: 'web', label: 'Web Application', desc: 'PHP, Node.js, Python, Ruby, Go' },
  { value: 'static', label: 'Static Site', desc: 'HTML / CSS / JS' },
  { value: 'docker', label: 'Docker Container', desc: 'Containerized workload' },
  { value: 'db', label: 'Database Migration', desc: 'Schema migrations' },
  { value: 'custom', label: 'Custom Script', desc: 'Arbitrary shell commands' },
]

const STRATEGIES = [
  { value: 'exec', label: 'Direct exec', desc: 'Run deploy script directly — simple and fast' },
  { value: 'blue-green', label: 'Blue/Green', desc: 'Zero-downtime swap between two environments' },
]

const DEFAULT_STEPS = [
  { id: 1, type: 'shell', cmd: 'git pull origin main', onFail: 'stop' },
  { id: 2, type: 'shell', cmd: 'npm ci', onFail: 'stop' },
  { id: 3, type: 'shell', cmd: 'npm run build', onFail: 'stop' },
  { id: 4, type: 'reload', cmd: 'systemctl reload nginx', onFail: 'continue' },
]

interface EnvVar { key: string; value: string; secret: boolean }

export function PipelineWizard({ open, onClose, onCreate }: PipelineWizardProps) {
  const [step, setStep] = useState(0)

  // Step 1 — Basics
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [appType, setAppType] = useState('web')
  const [strategy, setStrategy] = useState('exec')

  // Step 2 — Repository
  const [provider, setProvider] = useState<typeof PROVIDERS[number]>('github')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [scriptPath, setScriptPath] = useState('/opt/deploy/deploy.sh')
  const [project, setProject] = useState('')

  // Step 3 — Trigger
  const [triggerWebhook, setTriggerWebhook] = useState(true)
  const [triggerSchedule, setTriggerSchedule] = useState(false)
  const [triggerManual, setTriggerManual] = useState(true)
  const [cron, setCron] = useState('0 */6 * * *')

  // Step 4 — Build steps
  const [buildSteps, setBuildSteps] = useState(DEFAULT_STEPS)

  // Step 5 — Env vars
  const [envVars, setEnvVars] = useState<EnvVar[]>([
    { key: 'NODE_ENV', value: 'production', secret: false },
    { key: 'API_KEY', value: '', secret: true },
  ])

  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const canNext = () => {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return project.trim().length > 0 && scriptPath.trim().length > 0
    return true
  }

  const next = () => {
    setErr('')
    if (!canNext()) { setErr('Please fill in the required fields.'); return }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  const back = () => { setErr(''); setStep(s => Math.max(s - 1, 0)) }

  const submit = () => {
    setSubmitting(true)
    onCreate({ name: name.trim(), project: project.trim() || name.trim(), script_path: scriptPath.trim(), strategy })
    setTimeout(() => {
      setSubmitting(false)
      resetAndClose()
    }, 600)
  }

  const resetAndClose = () => {
    setStep(0); setName(''); setDescription(''); setProject(''); setScriptPath('/opt/deploy/deploy.sh')
    setRepoUrl(''); setBranch('main'); setErr(''); setSubmitting(false)
    onClose()
  }

  const addEnvVar = () => setEnvVars(v => [...v, { key: '', value: '', secret: false }])
  const removeEnvVar = (i: number) => setEnvVars(v => v.filter((_, idx) => idx !== i))
  const updateEnvVar = (i: number, field: keyof EnvVar, val: string | boolean) =>
    setEnvVars(v => v.map((e, idx) => idx === i ? { ...e, [field]: val } : e))

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title="Create Deployment Pipeline"
      subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      size="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <button className="btn btn-ghost" onClick={step === 0 ? resetAndClose : back}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {err && <span style={{ fontSize: 12, color: 'var(--color-danger)', flex: 1, textAlign: 'center', padding: '0 12px' }}>{err}</span>}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={next}>Next</button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting && <Spinner size="sm" />}
              Create Pipeline
            </button>
          )}
        </div>
      }
    >
      {/* Stepper */}
      <div className={styles.stepper}>
        {STEPS.map((label, i) => (
          <div key={i} className={styles.stepItem}>
            <div
              className={`${styles.stepCircle} ${i === step ? styles.stepCircleActive : i < step ? styles.stepCircleDone : ''}`}
              style={{ cursor: i < step ? 'pointer' : 'default' }}
              onClick={() => { if (i < step) setStep(i) }}
            >
              {i < step ? '✓' : i + 1}
              <span className={`${styles.stepLabel} ${i === step ? styles.stepLabelActive : ''}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ''}`} />
            )}
          </div>
        ))}
      </div>

      <div className={styles.wizardBody}>

        {/* Step 0 — Basics */}
        {step === 0 && (
          <div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pipeline Name *</label>
              <input
                className={styles.formInput}
                placeholder="e.g. example.com-production"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <input
                className={styles.formInput}
                placeholder="Short description of this pipeline"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Application Type</label>
              <div className={styles.radioGroup}>
                {APP_TYPES.map(t => (
                  <div
                    key={t.value}
                    className={`${styles.radioItem} ${appType === t.value ? styles.radioItemActive : ''}`}
                    onClick={() => setAppType(t.value)}
                  >
                    <div className={styles.radioCircle} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>{t.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>{t.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Deploy Strategy</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {STRATEGIES.map(s => (
                  <div
                    key={s.value}
                    className={`${styles.radioItem} ${strategy === s.value ? styles.radioItemActive : ''}`}
                    onClick={() => setStrategy(s.value)}
                  >
                    <div className={styles.radioCircle} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>{s.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 1 — Repository */}
        {step === 1 && (
          <div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Git Provider</label>
              <div className={styles.providerGrid}>
                {PROVIDERS.map(p => {
                  const Ic = ServiceIcons[p]
                  return (
                    <button
                      key={p}
                      className={`${styles.providerBtn} ${provider === p ? styles.providerBtnActive : ''}`}
                      onClick={() => setProvider(p)}
                    >
                      <Ic />
                      <span style={{ textTransform: 'capitalize' }}>{p}</span>
                    </button>
                  )
                })}
                <button
                  className={`${styles.providerBtn} ${!PROVIDERS.includes(provider) ? styles.providerBtnActive : ''}`}
                  onClick={() => {}}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span>Custom</span>
                </button>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Repository URL</label>
              <input
                className={styles.formInput}
                placeholder="https://github.com/username/repo.git"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Project / App Name *</label>
                <input
                  className={styles.formInput}
                  placeholder="e.g. my-api"
                  value={project}
                  onChange={e => setProject(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Branch</label>
                <input
                  className={styles.formInput}
                  placeholder="main"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Deploy Script Path *</label>
              <input
                className={styles.formInput}
                placeholder="/opt/deploy/my-api.sh"
                value={scriptPath}
                onChange={e => setScriptPath(e.target.value)}
              />
              <span className={styles.formHint}>Absolute path to the script that will be executed on each deploy.</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Clone Directory</label>
              <input
                className={styles.formInput}
                placeholder="/var/www/apps/example.com"
              />
            </div>
          </div>
        )}

        {/* Step 2 — Triggers */}
        {step === 2 && (
          <div>
            <div
              className={`${styles.radioItem} ${triggerWebhook ? styles.radioItemActive : ''}`}
              style={{ marginBottom: 8 }}
              onClick={() => setTriggerWebhook(t => !t)}
            >
              <div className={styles.radioCircle} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Webhook (Git push)</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Trigger on push from GitHub, GitLab, Bitbucket or any Git provider</div>
              </div>
            </div>
            {triggerWebhook && (
              <div style={{ marginLeft: 22, marginBottom: 12, padding: '10px 12px', background: 'var(--color-surface-raised)', borderRadius: 7, border: '1px solid var(--color-border)', fontSize: 12 }}>
                <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Webhook URL (generated after creation)</div>
                <div style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: 11 }}>
                  {window.location.origin}/api/deploy/hooks/&lt;id&gt;/trigger
                </div>
              </div>
            )}
            <div
              className={`${styles.radioItem} ${triggerSchedule ? styles.radioItemActive : ''}`}
              style={{ marginBottom: 8 }}
              onClick={() => setTriggerSchedule(t => !t)}
            >
              <div className={styles.radioCircle} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Scheduled (cron)</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Run on a fixed schedule</div>
              </div>
            </div>
            {triggerSchedule && (
              <div style={{ marginLeft: 22, marginBottom: 12 }}>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.formLabel}>Cron expression</label>
                  <input
                    className={styles.formInput}
                    placeholder="0 */6 * * *"
                    value={cron}
                    onChange={e => setCron(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div
              className={`${styles.radioItem} ${triggerManual ? styles.radioItemActive : ''}`}
              onClick={() => setTriggerManual(t => !t)}
            >
              <div className={styles.radioCircle} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Manual trigger</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Allow triggering from the dashboard</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Build Steps */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Steps execute in order. A failure stops the pipeline unless set to continue.
            </div>
            <div className={styles.stepsList}>
              {buildSteps.map((s, i) => (
                <div key={s.id} className={styles.buildStep}>
                  <div className={styles.buildStepNum}>{i + 1}</div>
                  <input
                    className={styles.formInput}
                    style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                    value={s.cmd}
                    onChange={e => setBuildSteps(steps => steps.map((st, idx) => idx === i ? { ...st, cmd: e.target.value } : st))}
                  />
                  <select
                    className={styles.formSelect}
                    style={{ width: 80, padding: '4px 6px', fontSize: 11 }}
                    value={s.type}
                    onChange={e => setBuildSteps(steps => steps.map((st, idx) => idx === i ? { ...st, type: e.target.value } : st))}
                  >
                    <option value="shell">shell</option>
                    <option value="test">test</option>
                    <option value="notify">notify</option>
                    <option value="reload">reload</option>
                  </select>
                  <select
                    className={styles.formSelect}
                    style={{ width: 90, padding: '4px 6px', fontSize: 11 }}
                    value={s.onFail}
                    onChange={e => setBuildSteps(steps => steps.map((st, idx) => idx === i ? { ...st, onFail: e.target.value } : st))}
                  >
                    <option value="stop">stop</option>
                    <option value="continue">continue</option>
                  </select>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() => setBuildSteps(steps => steps.filter((_, idx) => idx !== i))}
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button
              className={styles.addStepBtn}
              onClick={() => setBuildSteps(s => [...s, { id: Date.now(), type: 'shell', cmd: '', onFail: 'stop' }])}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add Step
            </button>
          </div>
        )}

        {/* Step 4 — Env Vars */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Environment variables are injected at deploy time. Mark secrets to mask them in logs.
            </div>
            <div className={styles.envSection}>
              <div className={styles.envSectionHeader}>
                <span>Environment Variables</span>
                <button className={styles.sectionAction} onClick={addEnvVar}>+ Add variable</button>
              </div>
              <div className={styles.envSectionBody}>
                {envVars.map((v, i) => (
                  <div key={i} className={styles.envRow}>
                    <input
                      className={styles.formInput}
                      placeholder="KEY"
                      value={v.key}
                      onChange={e => updateEnvVar(i, 'key', e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <input
                      className={styles.formInput}
                      placeholder={v.secret ? '••••••••' : 'value'}
                      value={v.value}
                      type={v.secret ? 'password' : 'text'}
                      onChange={e => updateEnvVar(i, 'value', e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <button
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => removeEnvVar(i)}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
                {envVars.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-dim)', padding: '8px 0' }}>
                    No environment variables configured.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 5 — Review */}
        {step === 5 && (
          <div>
            <div style={{ background: 'var(--color-success-dim)', border: '1px solid rgba(76,175,80,.2)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--color-success)', marginBottom: 16 }}>
              Everything looks good — review your configuration and click Create Pipeline.
            </div>
            <div className={styles.detailGrid} style={{ marginBottom: 16 }}>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Pipeline Name</div>
                <div className={styles.detailValueMono}>{name || '—'}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Project</div>
                <div className={styles.detailValueMono}>{project || name || '—'}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Provider</div>
                <div className={styles.detailValue} style={{ textTransform: 'capitalize' }}>{provider}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Branch</div>
                <div className={styles.detailValueMono}>{branch}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Strategy</div>
                <div className={styles.detailValue}>{strategy === 'blue-green' ? 'Blue/Green' : 'Direct exec'}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>App Type</div>
                <div className={styles.detailValue}>{APP_TYPES.find(t => t.value === appType)?.label}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Script Path</div>
                <div className={styles.detailValueMono}>{scriptPath}</div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Build Steps</div>
                <div className={styles.detailValue}>{buildSteps.length} step{buildSteps.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <div className={styles.detailField} style={{ marginBottom: 12 }}>
              <div className={styles.detailLabel}>Triggers</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {triggerWebhook && <span className={`${styles.metaTag} ${styles.metaTagAccent}`}>webhook</span>}
                {triggerSchedule && <span className={`${styles.metaTag} ${styles.metaTagWarning}`}>cron: {cron}</span>}
                {triggerManual && <span className={`${styles.metaTag} ${styles.metaTagSuccess}`}>manual</span>}
              </div>
            </div>
            {envVars.length > 0 && (
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Environment Variables</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {envVars.filter(v => v.key).map((v, i) => (
                    <span key={i} className={styles.metaTag} style={{ fontFamily: 'monospace' }}>
                      {v.key}{v.secret ? '=••••' : v.value ? `=${v.value}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </Modal>
  )
}
