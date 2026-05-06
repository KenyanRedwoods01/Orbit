import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchNotificationChannels, createNotificationChannel, updateNotificationChannel,
  testNotificationChannel, fetchNotificationEvents, fetchAlertRules,
  createAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule,
  type NotificationChannel, type NotificationEvent, type AlertRule as ApiAlertRule,
} from '../../lib/api'
import s from './NotificationsPage.module.css'

// ── Types ──────────────────────────────────────────────────────
type ChannelStatus = 'configured' | 'unconfigured' | 'error' | 'testing'
type Severity = 'critical' | 'warning' | 'info'
type RuleStatus = 'active' | 'muted' | 'disabled'
type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'severity' | 'status' | 'created' | 'fired'
type SortDir = 'asc' | 'desc'

interface Channel {
  id: string
  type: 'email' | 'slack' | 'discord' | 'telegram' | 'pagerduty' | 'webhook'
  label: string
  status: ChannelStatus
  detail: string
  lastTest?: string
  lastTestOk?: boolean
}

interface AlertRule {
  id: string
  name: string
  condition: string
  threshold: string
  severity: Severity
  status: RuleStatus
  channels: string[]
  throttle: string
  created: string
  firedCount: number
  lastFired?: string
}

interface AlertHistoryItem {
  id: string
  rule: string
  severity: Severity
  message: string
  time: string
  channel: string
  status: 'fired' | 'acknowledged' | 'resolved'
  server: string
}

// ── API → UI mapping helpers ────────────────────────────────────
function tsToRelative(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function apiChannelToUi(ch: NotificationChannel): Channel {
  let detail = 'Not configured'
  let status: ChannelStatus = 'unconfigured'
  if (ch.config && ch.config !== '{}') {
    try {
      const cfg = JSON.parse(ch.config)
      const url = cfg.webhook_url || cfg.url || ''
      const chan = cfg.channel || ''
      detail = url ? (chan ? `${chan} — ${url.slice(0, 40)}` : url.slice(0, 50)) : 'Configured'
      status = 'configured'
    } catch {
      status = 'configured'
      detail = 'Configured'
    }
  }
  return {
    id: String(ch.id),
    type: ch.type as Channel['type'],
    label: ch.name,
    status: ch.enabled ? status : 'unconfigured',
    detail,
  }
}

function apiRuleToUi(rule: ApiAlertRule): AlertRule {
  return {
    id: String(rule.id),
    name: rule.name,
    condition: rule.metric.replace(/_/g, ' '),
    threshold: `${rule.operator} ${rule.threshold}`,
    severity: 'warning',
    status: rule.enabled ? 'active' : 'disabled',
    channels: rule.channel ? [rule.channel] : [],
    throttle: '—',
    created: new Date(rule.created_at * 1000).toISOString().split('T')[0],
    firedCount: 0,
  }
}

function apiEventToHistory(ev: NotificationEvent, channels: NotificationChannel[]): AlertHistoryItem {
  const ch = channels.find(c => c.id === ev.channel_id)
  const sev = (ev.severity === 'critical' || ev.severity === 'warning' || ev.severity === 'info')
    ? ev.severity as Severity : 'info'
  return {
    id: String(ev.id),
    rule: ev.title,
    severity: sev,
    message: ev.message || ev.title,
    time: tsToRelative(ev.created_at),
    channel: ch?.name || '—',
    status: ev.sent ? 'resolved' : 'fired',
    server: '—',
  }
}

const SEV_LABELS: Record<Severity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' }
const RULE_STATUS_LABELS: Record<RuleStatus, string> = { active: 'Active', muted: 'Muted', disabled: 'Disabled' }

// ── Icons ──────────────────────────────────────────────────────
const IcoMail      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="16" height="12" rx="1.5"/><polyline points="2,5 10,12 18,5"/></svg>
const IcoSlack     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5.5 11a2 2 0 1 1 0-4h1V5.5a2 2 0 1 1 4 0V7h1a2 2 0 1 1 0 4h-1v1.5a2 2 0 1 1-4 0V11z"/><path d="M11 15.5a2 2 0 1 0 0-4H9.5v-1a2 2 0 0 0-4 0V12H4a2 2 0 0 0 0 4h1.5v1a2 2 0 0 0 4 0z"/></svg>
const IcoDiscord   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16s-2 .5-3-1c0-2 1.5-3 1.5-3A6.5 6.5 0 0 1 3 9.5C3 6 5.5 4 8 4h4c2.5 0 5 2 5 5.5a6.5 6.5 0 0 1-2.5 2.5S16 13 16 15c-1 1.5-3 1-3 1L12 15H8z"/><circle cx="8" cy="10" r="0.8" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="0.8" fill="currentColor" stroke="none"/></svg>
const IcoTelegram  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 3L3 8.5l5 1.5 2 5.5 2-3.5 5 3-2-12z"/><line x1="8" y1="10" x2="12.5" y2="6"/></svg>
const IcoPager     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="16" height="10" rx="2"/><line x1="6" y1="10" x2="6" y2="10" strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="10" x2="14" y2="10"/></svg>
const IcoWebhook   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2"/><path d="M10 12c0 3-2.5 5-5 5"/><path d="M10 12c0 3 2.5 5 5 5"/><path d="M10 8c0-3 2.5-5 5-5"/><path d="M10 8c0-3-2.5-5-5-5"/></svg>
const IcoPlus      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoCheck     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX         = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoEdit      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l1 1-9 9-4 1 1-4z"/></svg>
const IcoTrash     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h10l-1 11H6z"/><path d="M3 6h14M8 3h4"/></svg>
const IcoGrid      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>
const IcoList      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoSearch    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoPlay      = () => <svg viewBox="0 0 20 20" fill="currentColor"><polygon points="5,3 17,10 5,17"/></svg>
const IcoBell      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5h-15L4 11V8a6 6 0 0 1 6-6z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg>
const IcoDrag      = () => <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/></svg>
const IcoMute      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5h-15L4 11V8a6 6 0 0 1 6-6z"/><path d="M8 15.5a2 2 0 0 0 4 0"/><line x1="3" y1="3" x2="17" y2="17"/></svg>
const IcoChevUp    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,12 10,7 15,12"/></svg>
const IcoChevDn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,8 10,13 15,8"/></svg>
const IcoChevNone  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.25}}><polyline points="5,12 10,7 15,12"/></svg>
const IcoRefresh   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10A7 7 0 0 1 10 17 7 7 0 0 1 5 15"/><polyline points="3,11 4,16 9,15"/></svg>
const IcoHistory   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><polyline points="10,6 10,10 13,12"/></svg>
const IcoSettings  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.8"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>

// ── Channel icon map ───────────────────────────────────────────
function ChannelIcon({ type, size = 18 }: { type: Channel['type'], size?: number }) {
  const icons: Record<Channel['type'], React.ReactNode> = {
    email: <IcoMail />, slack: <IcoSlack />, discord: <IcoDiscord />,
    telegram: <IcoTelegram />, pagerduty: <IcoPager />, webhook: <IcoWebhook />,
  }
  return <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icons[type]}</span>
}

// ── Channel color map ──────────────────────────────────────────
const CHANNEL_COLORS: Record<Channel['type'], string> = {
  email: '#4a9eff', slack: '#4a154b', discord: '#5865f2',
  telegram: '#0088cc', pagerduty: '#06ac38', webhook: '#f97316',
}

// ── Severity helpers ───────────────────────────────────────────
function severityClass(sev: Severity) {
  return sev === 'critical' ? s.sevCritical : sev === 'warning' ? s.sevWarning : s.sevInfo
}
function historyStatusClass(st: AlertHistoryItem['status']) {
  return st === 'fired' ? s.histFired : st === 'acknowledged' ? s.histAck : s.histResolved
}

// ── Modal wrapper ──────────────────────────────────────────────
function Modal({ title, onClose, size, children, footer }: {
  title: string; onClose(): void; size?: 'sm'|'lg'|'xl'
  children: React.ReactNode; footer?: React.ReactNode
}) {
  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${s.modal} ${size === 'lg' ? s.modalLg : size === 'xl' ? s.modalXl : ''}`}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>{title}</span>
          <button className={s.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={s.modalBody}>{children}</div>
        {footer && <div className={s.modalFoot}>{footer}</div>}
      </div>
    </div>
  )
}

// ── Custom toggle ──────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <span className={`${s.toggle} ${value ? s.toggleOn : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span className={s.toggleThumb} />
    </span>
  )
}

// ── Custom Checkbox ────────────────────────────────────────────
function Checkbox({ checked, onChange }: { checked: boolean; onChange(v: boolean): void }) {
  return (
    <span
      className={`${s.cbBox} ${checked ? s.cbChecked : ''}`}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      role="checkbox"
      aria-checked={checked}
    >
      {checked && <IcoCheck />}
    </span>
  )
}

// ── Field helpers ──────────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className={s.field}>
      <label className={s.fieldLabel}>{label}</label>
      {children}
      {hint && <span className={s.fieldHint}>{hint}</span>}
    </div>
  )
}

// ── Email Config Modal ─────────────────────────────────────────
function EmailConfigModal({ onClose, onSave }: { onClose(): void; onSave(cfg: Record<string, string>): void }) {
  const [host, setHost] = useState('smtp.gmail.com')
  const [port, setPort] = useState('587')
  const [tls, setTls] = useState(true)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [step, setStep] = useState(0)

  return (
    <Modal title="Configure Email (SMTP)" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        {step === 0
          ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setStep(1)}>Next — Recipients</button>
          : <>
            <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setStep(0)}>Back</button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ host, port, tls: String(tls), username: user, password: pass, from, to })}>Save & Test</button>
          </>
        }
      </div>
    }>
      <div className={s.wizardSteps}>
        {['SMTP Server', 'Recipients'].map((l, i) => (
          <div key={l} className={`${s.wizStep} ${i === step ? s.wizStepActive : i < step ? s.wizStepDone : ''}`}>
            <span className={s.wizNum}>{i < step ? <IcoCheck /> : i + 1}</span>
            {l}
          </div>
        ))}
      </div>
      {step === 0 ? (
        <div className={s.formGrid}>
          <Field label="SMTP Host">
            <input className={s.input} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.example.com" />
          </Field>
          <Field label="Port">
            <input className={s.input} value={port} onChange={e => setPort(e.target.value)} placeholder="587" />
          </Field>
          <div className={s.fieldFull}>
            <Field label="Username">
              <input className={s.input} value={user} onChange={e => setUser(e.target.value)} placeholder="notifications@example.com" />
            </Field>
          </div>
          <div className={s.fieldFull}>
            <Field label="Password / App Password">
              <input className={s.input} type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••••••" />
            </Field>
          </div>
          <div className={s.fieldFull}>
            <Field label="From Address">
              <input className={s.input} value={from} onChange={e => setFrom(e.target.value)} placeholder="Orbit VPS <alerts@example.com>" />
            </Field>
          </div>
          <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <Toggle value={tls} onChange={setTls} />
            <span style={{ fontSize: 13, color: 'var(--color-text)' }}>Use TLS / STARTTLS</span>
          </div>
        </div>
      ) : (
        <Field label="Recipients (comma-separated)" hint="These addresses will receive alert emails from this channel.">
          <textarea className={s.textarea} value={to} onChange={e => setTo(e.target.value)} placeholder="ops@example.com, oncall@example.com" style={{ minHeight: 80 }} />
        </Field>
      )}
    </Modal>
  )
}

// ── Slack Config Modal ─────────────────────────────────────────
function SlackConfigModal({ onClose, onSave }: { onClose(): void; onSave(cfg: Record<string, string>): void }) {
  const [webhook, setWebhook] = useState('')
  const [channel, setChannel] = useState('#alerts')
  const [mention, setMention] = useState('')
  const [mentionOnCritical, setMentionOnCritical] = useState(true)
  return (
    <Modal title="Configure Slack" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ webhook_url: webhook, channel, mention, mention_on_critical: String(mentionOnCritical) })}>Save & Test</button>
      </div>
    }>
      <div className={s.infoBox}>
        Create an Incoming Webhook in your Slack workspace at api.slack.com/apps, then paste the URL below.
      </div>
      <div className={s.formGrid}>
        <div className={s.fieldFull}>
          <Field label="Webhook URL *">
            <input className={s.input} value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/T.../B.../..." />
          </Field>
        </div>
        <Field label="Default Channel">
          <input className={s.input} value={channel} onChange={e => setChannel(e.target.value)} placeholder="#alerts" />
        </Field>
        <Field label="Mention on Critical">
          <input className={s.input} value={mention} onChange={e => setMention(e.target.value)} placeholder="@oncall or @here" />
        </Field>
        <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
          <Toggle value={mentionOnCritical} onChange={setMentionOnCritical} />
          <span style={{ fontSize: 13, color: 'var(--color-text)' }}>Mention only for Critical alerts</span>
        </div>
      </div>
    </Modal>
  )
}

// ── Discord Config Modal ───────────────────────────────────────
function DiscordConfigModal({ onClose, onSave }: { onClose(): void; onSave(cfg: Record<string, string>): void }) {
  const [webhook, setWebhook] = useState('')
  const [username, setUsername] = useState('Orbit VPS')
  return (
    <Modal title="Configure Discord" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ webhook_url: webhook, username })}>Save & Test</button>
      </div>
    }>
      <div className={s.infoBox}>
        In your Discord server, go to a channel Settings → Integrations → Webhooks → New Webhook, then copy the URL below.
      </div>
      <div className={s.formGrid}>
        <div className={s.fieldFull}>
          <Field label="Webhook URL *">
            <input className={s.input} value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
          </Field>
        </div>
        <Field label="Bot Username">
          <input className={s.input} value={username} onChange={e => setUsername(e.target.value)} placeholder="Orbit VPS" />
        </Field>
      </div>
    </Modal>
  )
}

// ── Telegram Config Modal ──────────────────────────────────────
function TelegramConfigModal({ onClose, onSave }: { onClose(): void; onSave(cfg: Record<string, string>): void }) {
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  return (
    <Modal title="Configure Telegram" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ bot_token: token, chat_id: chatId })}>Save & Test</button>
      </div>
    }>
      <div className={s.infoBox}>
        Create a bot via @BotFather on Telegram. Copy the API token, then get your Chat ID from @userinfobot.
      </div>
      <div className={s.formGrid}>
        <div className={s.fieldFull}>
          <Field label="Bot API Token *">
            <input className={s.input} value={token} onChange={e => setToken(e.target.value)} placeholder="123456:ABC-DEF..." />
          </Field>
        </div>
        <div className={s.fieldFull}>
          <Field label="Chat ID *" hint="Can be a user ID, group ID, or @channelusername">
            <input className={s.input} value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890" />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── PagerDuty Config Modal ─────────────────────────────────────
function PagerDutyConfigModal({ onClose, onSave }: { onClose(): void; onSave(cfg: Record<string, string>): void }) {
  const [key, setKey] = useState('')
  const [severity, setSeverity] = useState('critical')
  return (
    <Modal title="Configure PagerDuty" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ routing_key: key, min_severity: severity })}>Save & Test</button>
      </div>
    }>
      <div className={s.infoBox}>
        Create a Service in PagerDuty with integration type "Events API v2". Copy the Integration Key below.
      </div>
      <div className={s.formGrid}>
        <div className={s.fieldFull}>
          <Field label="Integration Key (Routing Key) *">
            <input className={s.input} value={key} onChange={e => setKey(e.target.value)} placeholder="abc123def456..." />
          </Field>
        </div>
        <Field label="Minimum Severity to Page">
          <select className={s.select} value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}

// ── Webhook Config Modal ───────────────────────────────────────
function WebhookConfigModal({ onClose, onSave }: { onClose(): void; onSave(cfg: Record<string, string>): void }) {
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('POST')
  const [secret, setSecret] = useState('')
  const [headers, setHeaders] = useState('')
  const [retries, setRetries] = useState('3')
  return (
    <Modal title="Configure Custom Webhook" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ url, method, secret, headers, retries })}>Save & Test</button>
      </div>
    }>
      <div className={s.formGrid}>
        <div className={s.fieldFull}>
          <Field label="Endpoint URL *">
            <input className={s.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-endpoint.example.com/alerts" />
          </Field>
        </div>
        <Field label="HTTP Method">
          <select className={s.select} value={method} onChange={e => setMethod(e.target.value)}>
            <option>POST</option><option>PUT</option>
          </select>
        </Field>
        <Field label="Retry Attempts">
          <input className={s.input} type="number" value={retries} onChange={e => setRetries(e.target.value)} min="0" max="10" />
        </Field>
        <div className={s.fieldFull}>
          <Field label="Secret / HMAC Key" hint="Optional — used to sign the request payload for verification.">
            <input className={s.input} value={secret} onChange={e => setSecret(e.target.value)} placeholder="webhook-secret-key" />
          </Field>
        </div>
        <div className={s.fieldFull}>
          <Field label="Custom Headers (one per line: Key: Value)" hint='Example: Authorization: Bearer token123'>
            <textarea className={s.textarea} value={headers} onChange={e => setHeaders(e.target.value)} placeholder="X-Custom-Header: value" style={{ minHeight: 80 }} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Test Channel Modal ─────────────────────────────────────────
function TestChannelModal({ channel, onClose }: { channel: Channel; onClose(): void }) {
  const [state, setState] = useState<'idle'|'testing'|'ok'|'fail'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const test = async () => {
    setState('testing')
    setErrMsg('')
    try {
      await testNotificationChannel(Number(channel.id))
      setState('ok')
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Delivery failed')
      setState('fail')
    }
  }
  return (
    <Modal title={`Test ${channel.label}`} onClose={onClose} footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Close</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={test} disabled={state === 'testing'}>
          {state === 'testing' ? 'Sending...' : 'Send Test Alert'}
        </button>
      </div>
    }>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: CHANNEL_COLORS[channel.type] }}>
          <ChannelIcon type={channel.type} size={22} />
        </div>
        {state === 'idle' && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>A test notification will be sent to <strong>{channel.label}</strong>. Click the button to proceed.</p>}
        {state === 'testing' && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sending test notification...</p>}
        {state === 'ok' && (
          <div>
            <div className={s.testOk}><IcoCheck /> Test succeeded</div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>The notification was delivered successfully.</p>
          </div>
        )}
        {state === 'fail' && (
          <div>
            <div className={s.testFail}><IcoX /> Test failed</div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>{errMsg || 'Delivery failed. Check the configuration and retry.'}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Create Rule Modal ──────────────────────────────────────────
const CONDITION_OPTIONS = [
  'CPU usage', 'Memory usage', 'Disk usage', 'Load average',
  'Service status', 'Container status', 'HTTP monitor',
  'Failed logins', 'Backup job', 'Custom metric',
]
function CreateRuleModal({ channels, onClose, onCreate }: {
  channels: Channel[]; onClose(): void; onCreate(r: AlertRule): void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('CPU usage')
  const [operator, setOperator] = useState('>')
  const [threshold, setThreshold] = useState('85')
  const [unit, setUnit] = useState('%')
  const [duration, setDuration] = useState('5')
  const [severity, setSeverity] = useState<Severity>('critical')
  const [selChans, setSelChans] = useState<string[]>(['slack'])
  const [throttle, setThrottle] = useState('15')
  const [throttleUnit, setThrottleUnit] = useState('min')

  const steps = ['Condition', 'Routing', 'Review']

  function toggleChan(id: string) {
    setSelChans(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function finish() {
    const r: AlertRule = {
      id: 'r' + Date.now(), name: name || `${condition} Alert`, condition,
      threshold: `${operator} ${threshold}${unit} for ${duration} min`,
      severity, status: 'active', channels: selChans,
      throttle: `${throttle} ${throttleUnit}`,
      created: new Date().toISOString().slice(0, 10), firedCount: 0,
    }
    onCreate(r)
  }

  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${s.modal} ${s.modalLg}`}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Create Alert Rule</span>
          <button className={s.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={s.wizardSteps}>
          {steps.map((l, i) => (
            <div key={l} className={`${s.wizStep} ${i === step ? s.wizStepActive : i < step ? s.wizStepDone : ''}`}>
              <span className={s.wizNum}>{i < step ? <IcoCheck /> : i + 1}</span>{l}
            </div>
          ))}
        </div>
        <div className={s.modalBody}>
          {step === 0 && (
            <div className={s.formGrid}>
              <div className={s.fieldFull}>
                <Field label="Rule Name">
                  <input className={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High CPU Usage" />
                </Field>
              </div>
              <Field label="Condition">
                <select className={s.select} value={condition} onChange={e => setCondition(e.target.value)}>
                  {CONDITION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Severity">
                <select className={s.select} value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </Field>
              <Field label="Operator">
                <select className={s.select} value={operator} onChange={e => setOperator(e.target.value)}>
                  <option>{'>'}</option><option>{'>='}</option><option>{'<'}</option><option>{'<='}</option><option>{'=='}</option>
                </select>
              </Field>
              <Field label="Threshold">
                <input className={s.input} value={threshold} onChange={e => setThreshold(e.target.value)} />
              </Field>
              <Field label="Unit">
                <select className={s.select} value={unit} onChange={e => setUnit(e.target.value)}>
                  <option>%</option><option>MB</option><option>GB</option><option>(count)</option><option>(avg)</option>
                </select>
              </Field>
              <Field label="For duration (min)">
                <input className={s.input} type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1" />
              </Field>
            </div>
          )}
          {step === 1 && (
            <div>
              <p className={s.hint}>Select which channels receive this alert. Only configured channels are shown.</p>
              <div className={s.channelPickerGrid}>
                {channels.map(ch => {
                  const checked = selChans.includes(ch.id)
                  const disabled = ch.status !== 'configured'
                  return (
                    <div
                      key={ch.id}
                      className={`${s.channelPickerCard} ${checked ? s.channelPickerCardSel : ''} ${disabled ? s.channelPickerCardDisabled : ''}`}
                      onClick={() => !disabled && toggleChan(ch.id)}
                    >
                      <div style={{ color: CHANNEL_COLORS[ch.type], width: 18, height: 18 }}><ChannelIcon type={ch.type} /></div>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{ch.label}</span>
                      {disabled && <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Not configured</span>}
                      {checked && <span style={{ marginLeft: 'auto', color: 'var(--color-accent)' }}><IcoCheck /></span>}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Throttle (min between alerts)" hint="Prevents alert fatigue — waits this long before re-firing the same rule.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className={s.input} type="number" value={throttle} onChange={e => setThrottle(e.target.value)} style={{ width: 80 }} />
                    <select className={s.select} value={throttleUnit} onChange={e => setThrottleUnit(e.target.value)}>
                      <option value="min">min</option>
                      <option value="hr">hr</option>
                    </select>
                  </div>
                </Field>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className={s.reviewGrid}>
              <div className={s.reviewRow}><span className={s.reviewKey}>Name</span><span className={s.reviewVal}>{name || `${condition} Alert`}</span></div>
              <div className={s.reviewRow}><span className={s.reviewKey}>Condition</span><span className={s.reviewVal}>{condition} {operator} {threshold}{unit} for {duration} min</span></div>
              <div className={s.reviewRow}><span className={s.reviewKey}>Severity</span><span className={`${s.sevBadge} ${severityClass(severity)}`}>{SEV_LABELS[severity]}</span></div>
              <div className={s.reviewRow}><span className={s.reviewKey}>Channels</span><span className={s.reviewVal}>{selChans.length === 0 ? 'None' : selChans.join(', ')}</span></div>
              <div className={s.reviewRow}><span className={s.reviewKey}>Throttle</span><span className={s.reviewVal}>{throttle} {throttleUnit}</span></div>
              <div className={s.reviewRow}><span className={s.reviewKey}>Status</span><span style={{ color: 'var(--color-success)', fontSize: 12 }}>Active (will fire immediately when condition is met)</span></div>
            </div>
          )}
        </div>
        <div className={s.modalFoot}>
          {step > 0 && <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setStep(p => p - 1)}>Back</button>}
          <span style={{ flex: 1 }} />
          <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
          {step < 2
            ? <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setStep(p => p + 1)}>Next</button>
            : <button className={`${s.btn} ${s.btnPrimary}`} onClick={finish}>Create Rule</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── Edit Rule Modal ────────────────────────────────────────────
function EditRuleModal({ rule, onClose, onSave }: { rule: AlertRule; onClose(): void; onSave(r: AlertRule): void }) {
  const [name, setName] = useState(rule.name)
  const [severity, setSeverity] = useState<Severity>(rule.severity)
  const [status, setStatus] = useState<RuleStatus>(rule.status)
  const [throttle, setThrottle] = useState(rule.throttle)
  return (
    <Modal title="Edit Alert Rule" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSave({ ...rule, name, severity, status, throttle })}>Save Changes</button>
      </div>
    }>
      <div className={s.formGrid}>
        <div className={s.fieldFull}>
          <Field label="Rule Name"><input className={s.input} value={name} onChange={e => setName(e.target.value)} /></Field>
        </div>
        <Field label="Severity">
          <select className={s.select} value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
            <option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
          </select>
        </Field>
        <Field label="Status">
          <select className={s.select} value={status} onChange={e => setStatus(e.target.value as RuleStatus)}>
            <option value="active">Active</option><option value="muted">Muted</option><option value="disabled">Disabled</option>
          </select>
        </Field>
        <div className={s.fieldFull}>
          <Field label="Throttle"><input className={s.input} value={throttle} onChange={e => setThrottle(e.target.value)} /></Field>
        </div>
        <div className={s.fieldFull}>
          <div className={s.infoBox} style={{ margin: 0 }}>
            Condition: <strong>{rule.condition} {rule.threshold}</strong>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Notification Preferences Modal ────────────────────────────
function PreferencesModal({ onClose }: { onClose(): void }) {
  const [digest, setDigest] = useState(true)
  const [digestFreq, setDigestFreq] = useState('daily')
  const [quietStart, setQuietStart] = useState('23:00')
  const [quietEnd, setQuietEnd] = useState('07:00')
  const [quietEnabled, setQuietEnabled] = useState(false)
  const [criticalBypass, setCriticalBypass] = useState(true)
  return (
    <Modal title="Notification Preferences" onClose={onClose} size="lg" footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onClose}>Save Preferences</button>
      </div>
    }>
      <div className={s.prefSection}>
        <div className={s.prefSectionTitle}>Digest Summary</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Toggle value={digest} onChange={setDigest} />
          <span style={{ fontSize: 13 }}>Send periodic digest summaries</span>
        </div>
        {digest && (
          <Field label="Digest Frequency">
            <select className={s.select} value={digestFreq} onChange={e => setDigestFreq(e.target.value)}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
        )}
      </div>
      <div className={s.prefSection}>
        <div className={s.prefSectionTitle}>Quiet Hours</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Toggle value={quietEnabled} onChange={setQuietEnabled} />
          <span style={{ fontSize: 13 }}>Enable quiet hours (suppress non-critical alerts)</span>
        </div>
        {quietEnabled && (
          <div className={s.formGrid}>
            <Field label="Quiet from">
              <input className={s.input} type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)} />
            </Field>
            <Field label="Quiet until">
              <input className={s.input} type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)} />
            </Field>
            <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Toggle value={criticalBypass} onChange={setCriticalBypass} />
              <span style={{ fontSize: 13 }}>Critical alerts bypass quiet hours</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Alert Detail Modal ─────────────────────────────────────────
function AlertDetailModal({ item, onClose }: { item: AlertHistoryItem; onClose(): void }) {
  return (
    <Modal title="Alert Detail" onClose={onClose} footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Close</button>
        {item.status === 'fired' && <button className={`${s.btn} ${s.btnPrimary}`} onClick={onClose}>Acknowledge</button>}
      </div>
    }>
      <div className={s.reviewGrid}>
        <div className={s.reviewRow}><span className={s.reviewKey}>Rule</span><span className={s.reviewVal}>{item.rule}</span></div>
        <div className={s.reviewRow}><span className={s.reviewKey}>Severity</span><span className={`${s.sevBadge} ${severityClass(item.severity)}`}>{SEV_LABELS[item.severity]}</span></div>
        <div className={s.reviewRow}><span className={s.reviewKey}>Server</span><span className={s.reviewVal}>{item.server}</span></div>
        <div className={s.reviewRow}><span className={s.reviewKey}>Channel</span><span className={s.reviewVal}>{item.channel}</span></div>
        <div className={s.reviewRow}><span className={s.reviewKey}>Status</span><span className={`${s.histBadge} ${historyStatusClass(item.status)}`}>{item.status}</span></div>
        <div className={s.reviewRow}><span className={s.reviewKey}>Time</span><span className={s.reviewVal}>{item.time}</span></div>
        <div className={s.reviewRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span className={s.reviewKey}>Message</span>
          <div className={s.codeBox}>{item.message}</div>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function NotificationsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'channels' | 'rules' | 'history' | 'preferences'>('channels')

  // API data
  const { data: rawChannels = [] } = useQuery({ queryKey: ['notif-channels'], queryFn: fetchNotificationChannels })
  const { data: rawRules = [] } = useQuery({ queryKey: ['alert-rules'], queryFn: fetchAlertRules })
  const { data: rawEvents = [] } = useQuery({ queryKey: ['notif-events'], queryFn: fetchNotificationEvents })

  const channels = useMemo(() => rawChannels.map(apiChannelToUi), [rawChannels])
  const rules = useMemo(() => rawRules.map(apiRuleToUi), [rawRules])
  const history = useMemo(() => rawEvents.map(ev => apiEventToHistory(ev, rawChannels)), [rawEvents, rawChannels])

  // Modals
  type ConfigModal = { type: 'email' | 'slack' | 'discord' | 'telegram' | 'pagerduty' | 'webhook' }
  const [configModal, setConfigModal] = useState<ConfigModal | null>(null)
  const [testModal, setTestModal] = useState<Channel | null>(null)
  const [createRuleModal, setCreateRuleModal] = useState(false)
  const [editRuleModal, setEditRuleModal] = useState<AlertRule | null>(null)
  const [prefModal, setPrefModal] = useState(false)
  const [histDetail, setHistDetail] = useState<AlertHistoryItem | null>(null)

  // Rules UI state
  const [rulesView, setRulesView] = useState<ViewMode>('list')
  const [rulesSearch, setRulesSearch] = useState('')
  const [rulesSortField, setRulesSortField] = useState<SortField>('name')
  const [rulesSortDir, setRulesSortDir] = useState<SortDir>('asc')
  const [rulesDragId, setRulesDragId] = useState<string | null>(null)
  const [rulesDragOver, setRulesDragOver] = useState<string | null>(null)
  const [rulesOrder, setRulesOrder] = useState<string[]>([])
  const [selRules, setSelRules] = useState<Set<string>>(new Set())
  const [filterSev, setFilterSev] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // History UI state
  const [histSearch, setHistSearch] = useState('')
  const [histFilter, setHistFilter] = useState('all')

  // Sync rules order when data loads
  useEffect(() => {
    setRulesOrder(prev => {
      const ids = rules.map(r => r.id)
      const existing = prev.filter(id => ids.includes(id))
      const added = ids.filter(id => !prev.includes(id))
      return [...existing, ...added]
    })
  }, [rules])

  const activeAlerts = history.filter(h => h.status === 'fired').length
  const acknowledgedAlerts = history.filter(h => h.status === 'acknowledged').length
  const resolvedAlerts = history.filter(h => h.status === 'resolved').length
  const configuredChannelCount = channels.filter(c => c.status === 'configured').length

  const handleSaveChannel = async (type: Channel['type'], config: Record<string, string>) => {
    const labels: Record<string, string> = {
      email: 'Email (SMTP)', slack: 'Slack', discord: 'Discord',
      telegram: 'Telegram', pagerduty: 'PagerDuty', webhook: 'Webhook (Custom)',
    }
    const existing = rawChannels.find(c => c.type === type)
    const payload = { name: labels[type] || type, type, config: JSON.stringify(config), enabled: true }
    try {
      if (existing) {
        await updateNotificationChannel(existing.id, payload)
      } else {
        await createNotificationChannel(payload)
      }
      qc.invalidateQueries({ queryKey: ['notif-channels'] })
    } catch (e) { console.error('save channel error', e) }
    setConfigModal(null)
  }

  const handleSortRules = (f: SortField) => {
    if (rulesSortField === f) setRulesSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setRulesSortField(f); setRulesSortDir('asc') }
  }

  const sortIcon = (f: SortField) => rulesSortField === f
    ? (rulesSortDir === 'asc' ? <IcoChevUp /> : <IcoChevDn />)
    : <IcoChevNone />

  const handleDragStart = useCallback((id: string) => setRulesDragId(id), [])
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setRulesDragOver(id) }, [])
  const handleDrop = useCallback((targetId: string) => {
    if (!rulesDragId || rulesDragId === targetId) { setRulesDragId(null); setRulesDragOver(null); return }
    setRulesOrder(prev => {
      const arr = [...prev]
      const from = arr.indexOf(rulesDragId)
      const to = arr.indexOf(targetId)
      arr.splice(from, 1); arr.splice(to, 0, rulesDragId)
      return arr
    })
    setRulesDragId(null); setRulesDragOver(null)
  }, [rulesDragId])

  const orderedRules = rulesOrder.map(id => rules.find(r => r.id === id)).filter(Boolean) as AlertRule[]
  const filteredRules = orderedRules.filter(r => {
    const q = rulesSearch.toLowerCase()
    if (q && !r.name.toLowerCase().includes(q) && !r.condition.toLowerCase().includes(q)) return false
    if (filterSev !== 'all' && r.severity !== filterSev) return false
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    return true
  }).sort((a, b) => {
    let av: string | number = '', bv: string | number = ''
    if (rulesSortField === 'name') { av = a.name; bv = b.name }
    else if (rulesSortField === 'severity') { av = ['critical','warning','info'].indexOf(a.severity); bv = ['critical','warning','info'].indexOf(b.severity) }
    else if (rulesSortField === 'status') { av = a.status; bv = b.status }
    else if (rulesSortField === 'fired') { av = a.firedCount; bv = b.firedCount }
    else if (rulesSortField === 'created') { av = a.created; bv = b.created }
    if (av < bv) return rulesSortDir === 'asc' ? -1 : 1
    if (av > bv) return rulesSortDir === 'asc' ? 1 : -1
    return 0
  })

  const filteredHistory = history.filter(h => {
    const q = histSearch.toLowerCase()
    if (q && !h.rule.toLowerCase().includes(q) && !h.message.toLowerCase().includes(q) && !h.server.toLowerCase().includes(q)) return false
    if (histFilter !== 'all' && h.status !== histFilter) return false
    return true
  })

  const toggleSelRule = (id: string) => setSelRules(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = filteredRules.length > 0 && filteredRules.every(r => selRules.has(r.id))
  const toggleAllRules = () => {
    if (allSelected) setSelRules(new Set())
    else setSelRules(new Set(filteredRules.map(r => r.id)))
  }

  const bulkDelete = async () => {
    await Promise.all([...selRules].map(id => deleteAlertRule(Number(id)).catch(() => {})))
    qc.invalidateQueries({ queryKey: ['alert-rules'] })
    setRulesOrder(prev => prev.filter(id => !selRules.has(id)))
    setSelRules(new Set())
  }

  const deleteRule = async (id: string) => {
    await deleteAlertRule(Number(id)).catch(() => {})
    qc.invalidateQueries({ queryKey: ['alert-rules'] })
    setRulesOrder(prev => prev.filter(x => x !== id))
  }

  const toggleRuleStatus = async (id: string) => {
    await toggleAlertRule(Number(id)).catch(() => {})
    qc.invalidateQueries({ queryKey: ['alert-rules'] })
  }

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}><span className={s.titleIcon}><IcoBell /></span>Notifications &amp; Alerts</h1>
          <p className={s.pageSubtitle}>Configure delivery channels, alert rules, and notification preferences.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => setPrefModal(true)}>
            <IcoSettings /> Preferences
          </button>
          <button className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={() => setCreateRuleModal(true)}>
            <IcoPlus /> New Rule
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className={s.statsRow}>
        <div className={s.statCard} style={{ '--accent': 'var(--color-danger)' } as React.CSSProperties}>
          <div className={s.statLabel}>Active Alerts</div>
          <div className={s.statValue} style={{ color: activeAlerts > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>{activeAlerts}</div>
          <div className={s.statSub}>Currently firing</div>
        </div>
        <div className={s.statCard} style={{ '--accent': 'var(--color-warning)' } as React.CSSProperties}>
          <div className={s.statLabel}>Acknowledged</div>
          <div className={s.statValue}>{acknowledgedAlerts}</div>
          <div className={s.statSub}>Awaiting resolution</div>
        </div>
        <div className={s.statCard} style={{ '--accent': 'var(--color-success)' } as React.CSSProperties}>
          <div className={s.statLabel}>Resolved Today</div>
          <div className={s.statValue}>{resolvedAlerts}</div>
          <div className={s.statSub}>In alert history</div>
        </div>
        <div className={s.statCard} style={{ '--accent': 'var(--color-accent)' } as React.CSSProperties}>
          <div className={s.statLabel}>Channels Active</div>
          <div className={s.statValue}>{configuredChannelCount}</div>
          <div className={s.statSub}>of {channels.length} configured</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs}>
        {([['channels','Channels'],['rules','Alert Rules'],['history','Alert History'],['preferences','Preferences']] as const).map(([key, label]) => (
          <button key={key} className={`${s.tab} ${tab === key ? s.tabActive : ''}`} onClick={() => setTab(key)}>
            {label}
            {key === 'rules' && <span className={s.tabBadge}>{rules.length}</span>}
            {key === 'history' && history.filter(h => h.status === 'fired').length > 0 && (
              <span className={s.tabBadgeDanger}>{history.filter(h => h.status === 'fired').length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Channels Tab ── */}
      {tab === 'channels' && (
        <div>
          <div className={s.sectionHeader}>
            <div className={s.sectionTitle}>Delivery Channels</div>
            <span className={s.sectionSub}>Configure where alerts are sent. At least one channel must be configured and tested before alert rules become active.</span>
          </div>
          <div className={s.channelGrid}>
            {channels.map(ch => (
              <div key={ch.id} className={`${s.channelCard} ${ch.status === 'error' ? s.channelCardError : ch.status === 'configured' ? s.channelCardOk : ''}`}>
                <div className={s.channelCardHeader}>
                  <div className={s.channelIconWrap} style={{ background: `${CHANNEL_COLORS[ch.type]}18`, color: CHANNEL_COLORS[ch.type] }}>
                    <ChannelIcon type={ch.type} size={20} />
                  </div>
                  <div className={s.channelCardMeta}>
                    <div className={s.channelName}>{ch.label}</div>
                    <div className={s.channelDetail}>{ch.detail}</div>
                  </div>
                  <div className={`${s.channelStatus} ${ch.status === 'configured' ? s.statusOk : ch.status === 'error' ? s.statusError : s.statusUnconfigured}`}>
                    {ch.status === 'configured' && <><IcoCheck /> Configured</>}
                    {ch.status === 'error' && <><IcoX /> Error</>}
                    {ch.status === 'unconfigured' && 'Not configured'}
                    {ch.status === 'testing' && 'Testing...'}
                  </div>
                </div>
                {ch.lastTest && (
                  <div className={s.channelLastTest}>
                    Last test: <span style={{ color: ch.lastTestOk ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {ch.lastTestOk ? 'Passed' : 'Failed'}
                    </span> — {ch.lastTest}
                  </div>
                )}
                <div className={s.channelCardActions}>
                  <button className={`${s.btn} ${s.btnSecondary} ${s.btnXs}`} onClick={() => setConfigModal({ type: ch.type })}>
                    {ch.status === 'unconfigured' ? 'Configure' : 'Edit'}
                  </button>
                  {ch.status !== 'unconfigured' && (
                    <button className={`${s.btn} ${s.btnSecondary} ${s.btnXs}`} onClick={() => setTestModal(ch)}>
                      <IcoPlay /> Test
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rules Tab ── */}
      {tab === 'rules' && (
        <div>
          <div className={s.toolbar}>
            <div className={s.searchWrap}>
              <span className={s.searchIcon}><IcoSearch /></span>
              <input className={s.searchInput} placeholder="Search rules..." value={rulesSearch} onChange={e => setRulesSearch(e.target.value)} />
            </div>
            <select className={s.selectSm} value={filterSev} onChange={e => setFilterSev(e.target.value)}>
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select className={s.selectSm} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="muted">Muted</option>
              <option value="disabled">Disabled</option>
            </select>
            <span className={s.toolbarSpacer} />
            {selRules.size > 0 && (
              <button className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={bulkDelete}>
                <IcoTrash /> Delete {selRules.size} selected
              </button>
            )}
            <div className={s.viewToggle}>
              <button className={`${s.viewBtn} ${rulesView === 'list' ? s.viewBtnActive : ''}`} onClick={() => setRulesView('list')}><IcoList /></button>
              <button className={`${s.viewBtn} ${rulesView === 'grid' ? s.viewBtnActive : ''}`} onClick={() => setRulesView('grid')}><IcoGrid /></button>
            </div>
            <button className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={() => setCreateRuleModal(true)}><IcoPlus /> New Rule</button>
          </div>

          {rulesView === 'list' ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thCheck}><Checkbox checked={allSelected} onChange={toggleAllRules} /></th>
                    <th className={s.th} style={{ width: 20 }} />
                    <th className={s.th} onClick={() => handleSortRules('name')}>
                      <span className={s.thInner}>Name {sortIcon('name')}</span>
                    </th>
                    <th className={s.th} onClick={() => handleSortRules('severity')}>
                      <span className={s.thInner}>Severity {sortIcon('severity')}</span>
                    </th>
                    <th className={s.th}>Condition</th>
                    <th className={s.th}>Channels</th>
                    <th className={s.th} onClick={() => handleSortRules('status')}>
                      <span className={s.thInner}>Status {sortIcon('status')}</span>
                    </th>
                    <th className={s.th} onClick={() => handleSortRules('fired')}>
                      <span className={s.thInner}>Fired {sortIcon('fired')}</span>
                    </th>
                    <th className={s.th}>Last Fired</th>
                    <th className={s.th} />
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map(rule => (
                    <tr
                      key={rule.id}
                      className={`${s.tr} ${selRules.has(rule.id) ? s.trSelected : ''} ${rulesDragOver === rule.id ? s.trDragOver : ''}`}
                      draggable
                      onDragStart={() => handleDragStart(rule.id)}
                      onDragOver={e => handleDragOver(e, rule.id)}
                      onDrop={() => handleDrop(rule.id)}
                    >
                      <td className={s.tdCheck}><Checkbox checked={selRules.has(rule.id)} onChange={() => toggleSelRule(rule.id)} /></td>
                      <td className={s.tdDrag}><span className={s.dragHandle}><IcoDrag /></span></td>
                      <td className={s.td}><span className={s.ruleName}>{rule.name}</span></td>
                      <td className={s.td}><span className={`${s.sevBadge} ${severityClass(rule.severity)}`}>{SEV_LABELS[rule.severity]}</span></td>
                      <td className={s.td}><span className={s.condText}>{rule.condition} {rule.threshold}</span></td>
                      <td className={s.td}>
                        <div className={s.chanPills}>
                          {rule.channels.map(ch => (
                            <span key={ch} className={s.chanPill}>{ch}</span>
                          ))}
                        </div>
                      </td>
                      <td className={s.td}>
                        <span className={`${s.statusBadge} ${rule.status === 'active' ? s.statusBadgeActive : rule.status === 'muted' ? s.statusBadgeMuted : s.statusBadgeDisabled}`}>
                          {RULE_STATUS_LABELS[rule.status]}
                        </span>
                      </td>
                      <td className={s.td}>{rule.firedCount}</td>
                      <td className={s.td}>{rule.lastFired ?? '—'}</td>
                      <td className={s.tdActions}>
                        <button className={s.iconBtn} title={rule.status === 'active' ? 'Mute' : 'Activate'} onClick={() => toggleRuleStatus(rule.id)}>
                          {rule.status === 'active' ? <IcoMute /> : <IcoBell />}
                        </button>
                        <button className={s.iconBtn} title="Edit" onClick={() => setEditRuleModal(rule)}><IcoEdit /></button>
                        <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Delete" onClick={() => deleteRule(rule.id)}><IcoTrash /></button>
                      </td>
                    </tr>
                  ))}
                  {filteredRules.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-dim)', fontSize: 13 }}>No rules match the current filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={s.rulesGrid}>
              {filteredRules.map(rule => (
                <div
                  key={rule.id}
                  className={`${s.ruleCard} ${selRules.has(rule.id) ? s.ruleCardSel : ''} ${rulesDragOver === rule.id ? s.ruleCardDragOver : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(rule.id)}
                  onDragOver={e => handleDragOver(e, rule.id)}
                  onDrop={() => handleDrop(rule.id)}
                >
                  <div className={s.ruleCardTop}>
                    <Checkbox checked={selRules.has(rule.id)} onChange={() => toggleSelRule(rule.id)} />
                    <span className={`${s.sevBadge} ${severityClass(rule.severity)}`}>{SEV_LABELS[rule.severity]}</span>
                    <span className={`${s.statusBadge} ${rule.status === 'active' ? s.statusBadgeActive : rule.status === 'muted' ? s.statusBadgeMuted : s.statusBadgeDisabled}`}>
                      {RULE_STATUS_LABELS[rule.status]}
                    </span>
                    <span className={s.dragHandle} style={{ marginLeft: 'auto' }}><IcoDrag /></span>
                  </div>
                  <div className={s.ruleCardName}>{rule.name}</div>
                  <div className={s.ruleCardCond}>{rule.condition} {rule.threshold}</div>
                  <div className={s.ruleCardMeta}>
                    <span>Fired {rule.firedCount}×</span>
                    <span>{rule.lastFired ? `Last: ${rule.lastFired}` : 'Never fired'}</span>
                  </div>
                  <div className={s.chanPills}>
                    {rule.channels.map(ch => <span key={ch} className={s.chanPill}>{ch}</span>)}
                  </div>
                  <div className={s.ruleCardActions}>
                    <button className={s.iconBtn} onClick={() => toggleRuleStatus(rule.id)} title={rule.status === 'active' ? 'Mute' : 'Activate'}>
                      {rule.status === 'active' ? <IcoMute /> : <IcoBell />}
                    </button>
                    <button className={s.iconBtn} onClick={() => setEditRuleModal(rule)}><IcoEdit /></button>
                    <button className={`${s.iconBtn} ${s.iconBtnDanger}`} onClick={() => deleteRule(rule.id)}><IcoTrash /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div>
          <div className={s.toolbar}>
            <div className={s.searchWrap}>
              <span className={s.searchIcon}><IcoSearch /></span>
              <input className={s.searchInput} placeholder="Search history..." value={histSearch} onChange={e => setHistSearch(e.target.value)} />
            </div>
            <select className={s.selectSm} value={histFilter} onChange={e => setHistFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="fired">Firing</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <span className={s.toolbarSpacer} />
            <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}><IcoRefresh /> Refresh</button>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>Severity</th>
                  <th className={s.th}>Rule</th>
                  <th className={s.th}>Message</th>
                  <th className={s.th}>Server</th>
                  <th className={s.th}>Channel</th>
                  <th className={s.th}>Status</th>
                  <th className={s.th}>Time</th>
                  <th className={s.th} />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map(h => (
                  <tr key={h.id} className={s.tr} style={{ cursor: 'pointer' }} onClick={() => setHistDetail(h)}>
                    <td className={s.td}><span className={`${s.sevBadge} ${severityClass(h.severity)}`}>{SEV_LABELS[h.severity]}</span></td>
                    <td className={s.td}><span className={s.ruleName}>{h.rule}</span></td>
                    <td className={s.td}><span className={s.histMsg}>{h.message}</span></td>
                    <td className={s.td}><span className={s.condText}>{h.server}</span></td>
                    <td className={s.td}>{h.channel}</td>
                    <td className={s.td}><span className={`${s.histBadge} ${historyStatusClass(h.status)}`}>{h.status}</span></td>
                    <td className={s.td}>{h.time}</td>
                    <td className={s.tdActions}>
                      <button className={s.iconBtn} onClick={e => { e.stopPropagation(); setHistDetail(h) }}><IcoHistory /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Preferences Tab ── */}
      {tab === 'preferences' && (
        <div className={s.prefPanel}>
          <div className={s.prefSection}>
            <div className={s.prefSectionTitle}>Per-Event Notification Settings</div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>Event Type</th>
                    <th className={s.th}>Email</th>
                    <th className={s.th}>Slack</th>
                    <th className={s.th}>Discord</th>
                    <th className={s.th}>Webhook</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    'CPU &gt; 85%', 'Memory &gt; 90%', 'Service Down', 'Disk &gt; 80%',
                    'Container Crash', 'Backup Failed', 'Login Failure', 'Uptime Monitor Down',
                  ].map(ev => (
                    <tr key={ev} className={s.tr}>
                      <td className={s.td}>{ev}</td>
                      {(['email','slack','discord','webhook'] as const).map(ch => (
                        <td key={ch} className={s.td}>
                          <Toggle value={Math.random() > 0.4} onChange={() => {}} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={s.prefSection}>
            <div className={s.prefSectionTitle}>Global Defaults</div>
            <div className={s.formGrid} style={{ maxWidth: 500 }}>
              <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle value={true} onChange={() => {}} />
                <span style={{ fontSize: 13 }}>Send daily digest email</span>
              </div>
              <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle value={false} onChange={() => {}} />
                <span style={{ fontSize: 13 }}>Enable quiet hours (23:00 — 07:00)</span>
              </div>
              <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle value={true} onChange={() => {}} />
                <span style={{ fontSize: 13 }}>Critical alerts bypass quiet hours</span>
              </div>
              <div className={s.fieldFull} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle value={true} onChange={() => {}} />
                <span style={{ fontSize: 13 }}>Auto-resolve alerts after 24 hours</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {configModal?.type === 'email'     && <EmailConfigModal     onClose={() => setConfigModal(null)} onSave={cfg => handleSaveChannel('email', cfg)} />}
      {configModal?.type === 'slack'     && <SlackConfigModal     onClose={() => setConfigModal(null)} onSave={cfg => handleSaveChannel('slack', cfg)} />}
      {configModal?.type === 'discord'   && <DiscordConfigModal   onClose={() => setConfigModal(null)} onSave={cfg => handleSaveChannel('discord', cfg)} />}
      {configModal?.type === 'telegram'  && <TelegramConfigModal  onClose={() => setConfigModal(null)} onSave={cfg => handleSaveChannel('telegram', cfg)} />}
      {configModal?.type === 'pagerduty' && <PagerDutyConfigModal onClose={() => setConfigModal(null)} onSave={cfg => handleSaveChannel('pagerduty', cfg)} />}
      {configModal?.type === 'webhook'   && <WebhookConfigModal   onClose={() => setConfigModal(null)} onSave={cfg => handleSaveChannel('webhook', cfg)} />}
      {testModal    && <TestChannelModal channel={testModal} onClose={() => setTestModal(null)} />}
      {createRuleModal && (
        <CreateRuleModal
          channels={channels}
          onClose={() => setCreateRuleModal(false)}
          onCreate={async r => {
            await createAlertRule({
              name: r.name,
              metric: r.condition.replace(/ /g, '_'),
              operator: r.threshold.split(' ')[0] || '>',
              threshold: parseFloat(r.threshold.replace(/[^0-9.]/g, '')) || 0,
              channel: r.channels[0] || 'dashboard',
              enabled: true,
            }).catch(() => {})
            qc.invalidateQueries({ queryKey: ['alert-rules'] })
            setCreateRuleModal(false)
          }}
        />
      )}
      {editRuleModal && (
        <EditRuleModal
          rule={editRuleModal}
          onClose={() => setEditRuleModal(null)}
          onSave={async r => {
            await updateAlertRule(Number(r.id), {
              name: r.name,
              metric: r.condition.replace(/ /g, '_'),
              operator: r.threshold.split(' ')[0] || '>',
              threshold: parseFloat(r.threshold.replace(/[^0-9.]/g, '')) || 0,
              channel: r.channels[0] || 'dashboard',
              enabled: r.status === 'active',
            }).catch(() => {})
            qc.invalidateQueries({ queryKey: ['alert-rules'] })
            setEditRuleModal(null)
          }}
        />
      )}
      {prefModal && <PreferencesModal onClose={() => setPrefModal(false)} />}
      {histDetail && <AlertDetailModal item={histDetail} onClose={() => setHistDetail(null)} />}
    </div>
  )
}
