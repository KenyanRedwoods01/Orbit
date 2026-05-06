import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  type FWRule, type RuleAction, type Direction, type Protocol, type LogLevel, type BannedIP,
  type AppProfile, type NATForward, type Fail2banJail,
} from './firewallData'
import {
  fetchFirewallStatus, fetchFirewallRules, addFirewallRule, updateFirewallRule,
  deleteFirewallRule, reorderFirewallRules, fetchFirewallProfiles, toggleFirewallProfile,
  fetchFirewallNAT, toggleFirewallNAT, deleteFirewallNAT, addFirewallNAT, fetchFirewallJails,
  fetchFirewallBanned, unbanFirewallIP, fetchFirewallLogs, enableFirewall, disableFirewall,
  type FWStatusApi, type FWLogEntryApi,
} from '../../lib/api'
import { useWebSocket } from '../../hooks/useWebSocket'
import styles from './FirewallPage.module.css'

// ─────────────────────────────────────────────────────────
// SVG Icons
// ─────────────────────────────────────────────────────────
const IcoShield   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L4 5v5c0 4 3 7 6 8 3-1 6-4 6-8V5z"/></svg>
const IcoRules    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoApps     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>
const IcoNat      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h14M13 6l4 4-4 4"/></svg>
const IcoF2b      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="7" x2="10" y2="10.5"/><circle cx="10" cy="13.5" r="0.7" fill="currentColor" stroke="none"/></svg>
const IcoLogs     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="7" y1="13" x2="10" y2="13"/></svg>
const IcoPlus     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoSearch   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoList     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>
const IcoGrid     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>
const IcoChevDn   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,8 10,13 15,8"/></svg>
const IcoEdit     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l1 1-9 9-4 1 1-4z"/><line x1="13" y1="6" x2="14" y2="7"/></svg>
const IcoTrash    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h10l-1 11H6z"/><path d="M3 6h14M8 3h4"/></svg>
const IcoX        = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoCheck    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoDrag     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="6" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="6" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="10" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="10" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="14" r="0.8" fill="currentColor" stroke="none"/><circle cx="13" cy="14" r="0.8" fill="currentColor" stroke="none"/></svg>
const IcoArrowUp  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="15" x2="10" y2="5"/><polyline points="6,9 10,5 14,9"/></svg>
const IcoArrowDn  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="5" x2="10" y2="15"/><polyline points="6,11 10,15 14,11"/></svg>
const IcoSort     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="12" y2="10"/><line x1="4" y1="14" x2="8" y2="14"/></svg>
const IcoCopy     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/></svg>
const IcoRefresh  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 10a7 7 0 0 1-7 7 7 7 0 0 1-5-2"/><polyline points="2,10 3,15 8,14"/></svg>
const IcoWarn     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoUnban    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="4" y1="4" x2="16" y2="16" strokeDasharray="3 2"/></svg>
const IcoArrowRight=()=> <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="10" x2="16" y2="10"/><polyline points="11,5 16,10 11,15"/></svg>
const IcoEye      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>

// ─────────────────────────────────────────────────────────
// Small reusable badges
// ─────────────────────────────────────────────────────────
function DirBadge({ dir }: { dir: Direction }) {
  const cfg = { in: [styles.dirIn, '↓ IN'], out: [styles.dirOut, '↑ OUT'], fwd: [styles.dirFwd, '→ FWD'] }[dir]
  return <span className={`${styles.dirBadge} ${cfg[0]}`}>{cfg[1]}</span>
}

function ActionBadge({ action }: { action: RuleAction }) {
  const cfg: Record<RuleAction, [string, string]> = {
    allow:  [styles.actionAllow,  'Allow'],
    deny:   [styles.actionDeny,   'Deny'],
    reject: [styles.actionReject, 'Reject'],
    limit:  [styles.actionLimit,  'Limit'],
  }
  return <span className={`${styles.actionBadge} ${cfg[action][0]}`}>{cfg[action][1]}</span>
}

function ProtoBadge({ proto }: { proto: string }) {
  return <span className={styles.protoBadge}>{proto}</span>
}

function LogBadge({ type }: { type: 'BLOCK'|'ALLOW'|'LIMIT' }) {
  const cls = type === 'BLOCK' ? styles.logBlock : type === 'ALLOW' ? styles.logAllow : styles.logLimit
  return <span className={`${styles.logBadge} ${cls}`}>{type}</span>
}

function formatHits(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}K`
  return String(n)
}

function buildUFWCmd(r: Partial<FWRule & { action: RuleAction; direction: Direction; protocol: Protocol; port: string; sourceIp: string; comment: string }>) {
  const dir   = r.direction === 'out' ? 'out' : 'in'
  const src   = r.sourceIp && r.sourceIp !== 'anywhere' && r.sourceIp !== 'any' ? ` from ${r.sourceIp}` : ''
  const port  = r.port ? ` to any port ${r.port}` : ''
  const proto = r.protocol && r.protocol !== 'both' ? ` proto ${r.protocol}` : ''
  const comment = r.comment ? ` comment '${r.comment}'` : ''
  return `ufw ${r.action} ${dir}${src}${port}${proto}${comment}`
}

// ─────────────────────────────────────────────────────────
// Add / Edit Rule Modal
// ─────────────────────────────────────────────────────────
type RuleFormData = {
  direction: Direction; action: RuleAction; protocol: Protocol
  port: string; sourceIp: string; destIp: string
  iface: string; logging: LogLevel; comment: string
}

const defaultRule = (): RuleFormData => ({
  direction: 'in', action: 'allow', protocol: 'tcp',
  port: '', sourceIp: '', destIp: '', iface: 'any', logging: 'off', comment: '',
})

function RuleModal({ rule, onClose, onSave }: { rule: Partial<FWRule> | null; onClose: () => void; onSave: (f: RuleFormData) => void }) {
  const [form, setForm] = useState<RuleFormData>(() => rule ? {
    direction: rule.direction ?? 'in', action: rule.action ?? 'allow',
    protocol: rule.protocol ?? 'tcp', port: rule.port ?? '',
    sourceIp: rule.sourceIp ?? '', destIp: rule.destIp ?? '',
    iface: rule.iface ?? 'any', logging: rule.logging ?? 'off', comment: rule.comment ?? '',
  } : defaultRule())

  const set = <K extends keyof RuleFormData>(k: K, v: RuleFormData[K]) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>{rule?.id ? 'Edit Rule' : 'Add Firewall Rule'}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Direction</label>
              <select className={styles.fieldSelect} value={form.direction} onChange={e => set('direction', e.target.value as Direction)}>
                <option value="in">Inbound (in)</option>
                <option value="out">Outbound (out)</option>
                <option value="fwd">Forward (fwd)</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Action</label>
              <select className={styles.fieldSelect} value={form.action} onChange={e => set('action', e.target.value as RuleAction)}>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="reject">Reject (with ICMP error)</option>
                <option value="limit">Limit (6 conn/30s)</option>
              </select>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Protocol</label>
              <select className={styles.fieldSelect} value={form.protocol} onChange={e => set('protocol', e.target.value as Protocol)}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">Both (TCP + UDP)</option>
                <option value="icmp">ICMP</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Port / Range</label>
              <input className={styles.fieldInput} placeholder="e.g. 22, 80, 8000:9000, 80,443" value={form.port} onChange={e => set('port', e.target.value)} />
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Source IP / Subnet</label>
              <input className={styles.fieldInput} placeholder="e.g. 192.168.1.0/24 (blank = anywhere)" value={form.sourceIp} onChange={e => set('sourceIp', e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Destination IP (optional)</label>
              <input className={styles.fieldInput} placeholder="blank = any" value={form.destIp} onChange={e => set('destIp', e.target.value)} />
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Interface</label>
              <select className={styles.fieldSelect} value={form.iface} onChange={e => set('iface', e.target.value)}>
                <option value="any">Any</option>
                <option value="eth0">eth0</option>
                <option value="eth1">eth1</option>
                <option value="lo">lo (loopback)</option>
                <option value="docker0">docker0</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Logging</label>
              <select className={styles.fieldSelect} value={form.logging} onChange={e => set('logging', e.target.value as LogLevel)}>
                <option value="off">Off</option>
                <option value="on">On (LOG)</option>
                <option value="all">On — all packets (LOG ALL)</option>
              </select>
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Comment</label>
            <input className={styles.fieldInput} placeholder="Describe the purpose of this rule…" value={form.comment} onChange={e => set('comment', e.target.value)} />
          </div>
          <div>
            <div className={styles.cmdLabel}>Generated command preview</div>
            <div className={styles.cmdPreview}>{buildUFWCmd(form)}</div>
          </div>
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Cancel</button>
          <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => onSave(form)}>
            <IcoCheck />{rule?.id ? 'Save Changes' : 'Add Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Rule Detail Modal
// ─────────────────────────────────────────────────────────
function RuleDetailModal({ rule, allRules, onClose, onEdit, onDelete }: { rule: FWRule; allRules: FWRule[]; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  const cmd = buildUFWCmd(rule)
  const maxHits = allRules.length > 0 ? Math.max(...allRules.map(r => r.hits)) : rule.hits || 1

  function copy() { navigator.clipboard.writeText(cmd).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800) }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <ActionBadge action={rule.action} />
          <span className={styles.modalTitle} style={{ fontFamily: 'monospace' }}>{rule.portLabel || rule.port}/{rule.protocol.toUpperCase()}</span>
          <DirBadge dir={rule.direction} />
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[
              ['Rule #',        String(rule.order)],
              ['Direction',     rule.direction.toUpperCase()],
              ['Action',        rule.action.toUpperCase()],
              ['Protocol',      rule.protocol.toUpperCase()],
              ['Port',          rule.port],
              ['Port label',    rule.portLabel],
              ['Source IP',     rule.sourceIp],
              ['Dest IP',       rule.destIp || 'any'],
              ['Interface',     rule.iface],
              ['Logging',       rule.logging],
              ['Comment',       rule.comment],
              ['Created',       rule.created],
            ].map(([k, v]) => (
              <><span key={k+'-k'} className={styles.detailKey}>{k}</span><span key={k+'-v'} className={styles.detailVal}>{v}</span></>
            ))}
            <span className={styles.detailKey}>Packet hits</span>
            <span className={styles.detailVal}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {formatHits(rule.hits)}
                <div className={styles.hitsBar} style={{ flex: 1 }}>
                  <div className={styles.hitsBarFill} style={{ width: `${(rule.hits / maxHits) * 100}%` }} />
                </div>
              </div>
            </span>
          </div>
          <div>
            <div className={styles.cmdLabel}>UFW command</div>
            <div className={styles.cmdPreview}>{cmd}</div>
          </div>
        </div>
        <div className={styles.modalFoot}>
          <button className={`${styles.formBtn} ${styles.formBtnDanger}`} onClick={onDelete}><IcoTrash />Delete rule</button>
          <button className={styles.formBtn} onClick={copy}><IcoCopy />{copied ? 'Copied!' : 'Copy command'}</button>
          <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={onEdit}><IcoEdit />Edit rule</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Banned IP Detail Modal
// ─────────────────────────────────────────────────────────
function BannedIPModal({ ip, onClose, onUnban }: { ip: BannedIP; onClose: () => void; onUnban: () => void }) {
  const attackLines = [
    `May 03 ${ip.since.slice(11)} sshd[3821]: Failed password for root from ${ip.ip} port 54312 ssh2`,
    `May 03 ${ip.since.slice(11)} sshd[3821]: Failed password for root from ${ip.ip} port 54313 ssh2`,
    `May 03 ${ip.since.slice(11)} sshd[3822]: Invalid user admin from ${ip.ip} port 54320`,
    `May 03 ${ip.since.slice(11)} sshd[3823]: Failed password for invalid user deploy from ${ip.ip} port 54321 ssh2`,
    `May 03 ${ip.since.slice(11)} fail2ban.actions: Ban ${ip.ip}`,
  ]

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle} style={{ fontFamily: 'monospace', color: '#f6ad55' }}>{ip.ip}</span>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa', fontWeight: 600 }}>{ip.jail}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            {[
              ['IP Address',   ip.ip],
              ['Country',      ip.country],
              ['Jail',         ip.jail],
              ['Banned since', ip.since],
              ['Attempts',     String(ip.attempts)],
              ['Ban expires',  'Permanent (manual unban required)'],
            ].map(([k, v]) => (
              <><span key={k+'-k'} className={styles.detailKey}>{k}</span><span key={k+'-v'} className={styles.detailVal}>{v}</span></>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <div className={styles.cmdLabel}>Recent log entries for this IP</div>
            <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '10px 12px', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--color-text-muted)', lineHeight: 1.7, overflowX: 'auto' }}>
              {attackLines.map((line, i) => (
                <div key={i} style={{ color: line.includes('Ban ') ? '#f6ad55' : line.includes('Invalid') ? '#fc8181' : 'var(--color-text-dim)' }}>{line}</div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className={styles.confirmBanner} style={{ background: 'rgba(246,173,85,0.07)', borderColor: 'rgba(246,173,85,0.2)', color: '#f6ad55' }}>
              <IcoWarn />
              <span>This IP made <strong>{ip.attempts}</strong> failed attempts and was automatically banned by Fail2ban.</span>
            </div>
          </div>
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Close</button>
          <button className={`${styles.formBtn} ${styles.formBtnDanger}`} onClick={onUnban}>
            <IcoUnban />Unban IP
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// NAT Add Modal
// ─────────────────────────────────────────────────────────
type NATFormData = { publicPort: string; proto: string; destIp: string; destPort: string; comment: string }
const defaultNAT = (): NATFormData => ({ publicPort: '', proto: 'tcp', destIp: '', destPort: '', comment: '' })

function NATAddModal({ onClose, onSave }: { onClose: () => void; onSave: (f: NATFormData) => void }) {
  const [form, setForm] = useState<NATFormData>(defaultNAT)
  const set = <K extends keyof NATFormData>(k: K, v: NATFormData[K]) => setForm(f => ({ ...f, [k]: v }))

  const preview = form.publicPort && form.destIp && form.destPort
    ? `iptables -t nat -A PREROUTING -p ${form.proto} --dport ${form.publicPort} -j DNAT --to-destination ${form.destIp}:${form.destPort}`
    : '(fill in all required fields to see preview)'

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Add NAT / Port Forward</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Public Port *</label>
              <input className={styles.fieldInput} type="number" min="1" max="65535" placeholder="e.g. 8080" value={form.publicPort} onChange={e => set('publicPort', e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Protocol</label>
              <select className={styles.fieldSelect} value={form.proto} onChange={e => set('proto', e.target.value)}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">Both (TCP + UDP)</option>
              </select>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Destination IP *</label>
              <input className={styles.fieldInput} placeholder="e.g. 192.168.1.10" value={form.destIp} onChange={e => set('destIp', e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Destination Port *</label>
              <input className={styles.fieldInput} type="number" min="1" max="65535" placeholder="e.g. 80" value={form.destPort} onChange={e => set('destPort', e.target.value)} />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Comment (optional)</label>
            <input className={styles.fieldInput} placeholder="Describe the purpose of this forward…" value={form.comment} onChange={e => set('comment', e.target.value)} />
          </div>
          <div>
            <div className={styles.cmdLabel}>Generated iptables command preview</div>
            <div className={styles.cmdPreview}>{preview}</div>
          </div>
          <div className={styles.confirmBanner} style={{ background: 'rgba(99,179,237,0.07)', borderColor: 'rgba(99,179,237,0.2)', color: '#63b3ed' }}>
            <IcoWarn />
            <span>Requires IP forwarding: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>sysctl -w net.ipv4.ip_forward=1</code></span>
          </div>
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.formBtn} onClick={onClose}><IcoX />Cancel</button>
          <button
            className={`${styles.formBtn} ${styles.formBtnPrimary}`}
            onClick={() => onSave(form)}
            disabled={!form.publicPort || !form.destIp || !form.destPort}
          >
            <IcoCheck />Add Forward
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────
type SectionTab = 'rules' | 'profiles' | 'nat' | 'f2b' | 'logs'
type ViewMode   = 'list' | 'grid'

const DEFAULT_STATUS: FWStatusApi = {
  backend: 'UFW (loading…)', status: 'inactive', ipv6: false,
  defaultIn: 'deny', defaultOut: 'allow', defaultFwd: 'deny',
  activeRules: 0, packetsAllowed: 0, packetsBlocked: 0, lastLog: '',
}

export default function FirewallPage() {
  const [tab,           setTab]          = useState<SectionTab>('rules')
  const [view,          setView]         = useState<ViewMode>('list')
  const [search,        setSearch]       = useState('')
  const [actionFilter,  setActionFilter] = useState<Set<RuleAction>>(new Set())
  const [dirFilter,     setDirFilter]    = useState<Set<Direction>>(new Set())
  const [sortKey,       setSortKey]      = useState('order')
  const [sortDir,       setSortDir]      = useState<'asc'|'desc'>('asc')

  // ── Backend state (all loaded from API) ──
  const [fwStatus,      setFwStatus]     = useState<FWStatusApi>(DEFAULT_STATUS)
  const [fwActive,      setFwActive]     = useState(false)
  const [rules,         setRules]        = useState<FWRule[]>([])
  const [profiles,      setProfiles]     = useState<AppProfile[]>([])
  const [natForwards,   setNatForwards]  = useState<NATForward[]>([])
  const [jails,         setJails]        = useState<Fail2banJail[]>([])
  const [bannedIPs,     setBannedIPs]    = useState<BannedIP[]>([])
  const [logs,          setLogs]         = useState<FWLogEntryApi[]>([])
  const [loading,       setLoading]      = useState(true)

  // ── Modal/UI state ──
  const [addOpen,       setAddOpen]      = useState(false)
  const [editRule,      setEditRule]     = useState<FWRule | null>(null)
  const [detailRule,    setDetailRule]   = useState<FWRule | null>(null)
  const [deleteId,      setDeleteId]     = useState<string | null>(null)
  const [logFilter,     setLogFilter]    = useState<'all'|'BLOCK'|'ALLOW'|'LIMIT'>('all')
  const [logSearch,     setLogSearch]    = useState('')
  const [selectedBan,   setSelectedBan]  = useState<BannedIP | null>(null)
  const [natAddOpen,    setNatAddOpen]   = useState(false)

  // ── Load all data on mount ──
  const loadAll = useCallback(async () => {
    try {
      const [status, ruleData, profileData, natData, jailData, bannedData, logData] = await Promise.allSettled([
        fetchFirewallStatus(),
        fetchFirewallRules(),
        fetchFirewallProfiles(),
        fetchFirewallNAT(),
        fetchFirewallJails(),
        fetchFirewallBanned(),
        fetchFirewallLogs({ limit: 200 }),
      ])

      if (status.status === 'fulfilled') {
        setFwStatus(status.value)
        setFwActive(status.value.status === 'active')
      }
      if (ruleData.status === 'fulfilled') {
        setRules(ruleData.value as unknown as FWRule[])
      }
      if (profileData.status === 'fulfilled') {
        setProfiles(profileData.value as unknown as AppProfile[])
      }
      if (natData.status === 'fulfilled') {
        setNatForwards(natData.value as unknown as NATForward[])
      }
      if (jailData.status === 'fulfilled') {
        setJails(jailData.value as unknown as Fail2banJail[])
      }
      if (bannedData.status === 'fulfilled') {
        setBannedIPs(bannedData.value as unknown as BannedIP[])
      }
      if (logData.status === 'fulfilled') {
        setLogs(logData.value)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Periodic status refresh (every 10s) ──
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const s = await fetchFirewallStatus()
        setFwStatus(s)
        setFwActive(s.status === 'active')
      } catch { /* ignore */ }
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  // ── WebSocket: live firewall log stream ──
  useWebSocket('/ws/firewall/logs', (data) => {
    const entry = data as FWLogEntryApi
    if (entry && entry.id && entry.ts) {
      setLogs(prev => [entry, ...prev].slice(0, 500))
      setFwStatus(prev => ({ ...prev, lastLog: entry.ts }))
    }
  })

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ k }: { k: string }) {
    if (sortKey !== k) return <span className={styles.thSortIcon}><IcoSort /></span>
    return <span className={styles.thSortIcon}>{sortDir === 'asc' ? <IcoArrowUp /> : <IcoArrowDn />}</span>
  }

  function toggleAction(a: RuleAction) { setActionFilter(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n }) }
  function toggleDir(d: Direction)     { setDirFilter(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n }) }

  const filteredRules = useMemo(() => {
    let r = [...rules]
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(x => x.port.toLowerCase().includes(q) || x.portLabel.toLowerCase().includes(q) || x.comment.toLowerCase().includes(q) || x.sourceIp.toLowerCase().includes(q))
    }
    if (actionFilter.size > 0) r = r.filter(x => actionFilter.has(x.action))
    if (dirFilter.size > 0)    r = r.filter(x => dirFilter.has(x.direction))
    const ACT: Record<string,number> = { allow: 0, limit: 1, reject: 2, deny: 3 }
    const DIR: Record<string,number> = { in: 0, out: 1, fwd: 2 }
    r.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'order')    cmp = a.order - b.order
      else if (sortKey === 'action') cmp = (ACT[a.action]??9) - (ACT[b.action]??9)
      else if (sortKey === 'port')   cmp = a.port.localeCompare(b.port)
      else if (sortKey === 'dir')    cmp = (DIR[a.direction]??9) - (DIR[b.direction]??9)
      else if (sortKey === 'hits')   cmp = b.hits - a.hits
      return sortDir === 'asc' ? cmp : -cmp
    })
    return r
  }, [rules, search, actionFilter, dirFilter, sortKey, sortDir])

  const filteredLogs = useMemo(() => {
    let r = [...logs]
    if (logFilter !== 'all') r = r.filter(l => l.type === logFilter)
    if (logSearch) { const q = logSearch.toLowerCase(); r = r.filter(l => l.srcIp.includes(q) || l.dstIp.includes(q) || String(l.dstPort).includes(q)) }
    return r
  }, [logs, logFilter, logSearch])

  // ── Rule save (add or edit) ──
  async function handleSaveRule(form: RuleFormData) {
    const payload = {
      direction: form.direction,
      protocol: form.protocol,
      port: form.port,
      portLabel: form.port,
      sourceIp: form.sourceIp || 'anywhere',
      destIp: form.destIp || 'any',
      iface: form.iface,
      action: form.action,
      logging: form.logging,
      comment: form.comment,
    }
    try {
      if (editRule) {
        const updated = await updateFirewallRule(editRule.id, payload)
        setRules(prev => prev.map(r => r.id === editRule.id ? updated as unknown as FWRule : r))
        setEditRule(null)
      } else {
        const created = await addFirewallRule(payload)
        setRules(prev => [...prev, created as unknown as FWRule])
        setAddOpen(false)
      }
    } catch (err) {
      console.error('Failed to save rule:', err)
    }
  }

  // ── Rule delete ──
  async function handleDelete(id: string) {
    try {
      await deleteFirewallRule(id)
      setRules(prev => prev.filter(r => r.id !== id).map((r, i) => ({ ...r, order: i + 1 })))
    } catch (err) {
      console.error('Failed to delete rule:', err)
    }
    setDeleteId(null); setDetailRule(null)
  }

  // ── Rule reorder ──
  async function handleMoveRule(id: string, dir: -1|1) {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      const reordered = next.map((r, i) => ({ ...r, order: i + 1 }))
      // Persist reorder to backend
      reorderFirewallRules(reordered.map(r => r.id)).catch(console.error)
      return reordered
    })
  }

  // ── Enable/disable firewall ──
  async function handleToggleFirewall() {
    try {
      if (fwActive) {
        await disableFirewall()
        setFwActive(false)
        setFwStatus(prev => ({ ...prev, status: 'inactive' }))
      } else {
        await enableFirewall()
        setFwActive(true)
        setFwStatus(prev => ({ ...prev, status: 'active' }))
      }
    } catch (err) {
      console.error('Failed to toggle firewall:', err)
    }
  }

  // ── Profile toggle ──
  async function handleToggleProfile(id: string) {
    try {
      const result = await toggleFirewallProfile(id)
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, enabled: result.enabled } : p))
    } catch (err) {
      console.error('Failed to toggle profile:', err)
    }
  }

  // ── NAT toggle ──
  async function handleToggleNAT(id: string) {
    try {
      const result = await toggleFirewallNAT(id)
      setNatForwards(prev => prev.map(n => n.id === id ? { ...n, enabled: result.enabled } : n))
    } catch (err) {
      console.error('Failed to toggle NAT rule:', err)
    }
  }

  // ── NAT delete ──
  async function handleDeleteNAT(id: string) {
    try {
      await deleteFirewallNAT(id)
      setNatForwards(prev => prev.filter(n => n.id !== id))
    } catch (err) {
      console.error('Failed to delete NAT rule:', err)
    }
  }

  // ── NAT add ──
  async function handleAddNAT(form: NATFormData) {
    try {
      const created = await addFirewallNAT({
        publicPort: Number(form.publicPort),
        proto: form.proto,
        destIp: form.destIp,
        destPort: Number(form.destPort),
        comment: form.comment,
      })
      setNatForwards(prev => [...prev, created as unknown as NATForward])
      setNatAddOpen(false)
    } catch (err) {
      console.error('Failed to add NAT rule:', err)
    }
  }

  // ── Unban IP ──
  async function handleUnban(ip: string, jail?: string) {
    try {
      await unbanFirewallIP(ip, jail)
      setBannedIPs(prev => prev.filter(b => b.ip !== ip))
      setSelectedBan(null)
    } catch (err) {
      console.error('Failed to unban IP:', err)
    }
  }

  // ── Reload all ──
  async function handleReload() {
    setLoading(true)
    await loadAll()
  }

  const allowCount = rules.filter(r => r.action === 'allow').length
  const denyCount  = rules.filter(r => r.action === 'deny' || r.action === 'reject').length
  const limitCount = rules.filter(r => r.action === 'limit').length
  const bannedCount = bannedIPs.length

  function switchTab(t: SectionTab) { setTab(t); setSearch(''); setActionFilter(new Set()); setDirFilter(new Set()) }

  if (loading) {
    return (
      <div className={styles.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <span style={{ color: 'var(--color-text-dim)', fontSize: 14 }}>Loading firewall data…</span>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* ── Status bar ── */}
      <div className={styles.statusBar}>
        <div className={styles.backendChip}>
          <IcoShield />{fwStatus.backend}
        </div>
        <div className={styles.statusDot + ' ' + (fwActive ? styles.statusActive : styles.statusInactive)} />
        <span className={styles.statusLabel} style={{ color: fwActive ? '#22c55e' : '#6b7280' }}>
          {fwActive ? 'Active' : 'Inactive'}
        </span>
        <div className={styles.policyRow}>
          <span style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Default:</span>
          <span className={`${styles.policyChip} ${fwStatus.defaultIn === 'deny' ? styles.policyDeny : styles.policyAllow}`}>In: {fwStatus.defaultIn.toUpperCase()}</span>
          <span className={`${styles.policyChip} ${fwStatus.defaultOut === 'allow' ? styles.policyAllow : styles.policyDeny}`}>Out: {fwStatus.defaultOut.toUpperCase()}</span>
          <span className={`${styles.policyChip} ${fwStatus.defaultFwd === 'deny' ? styles.policyDeny : styles.policyAllow}`}>Fwd: {fwStatus.defaultFwd.toUpperCase()}</span>
          <button
            className={`${styles.toggleBtn} ${fwActive ? styles.toggleBtnActive : styles.toggleBtnInactive}`}
            onClick={handleToggleFirewall}
          >
            {fwActive ? <><IcoX />Disable</> : <><IcoCheck />Enable</>}
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {[
          { label: 'Total Rules',   val: rules.length,   color: '#63b3ed', bg: 'rgba(99,179,237,0.1)',  icon: <IcoRules /> },
          { label: 'Allow Rules',   val: allowCount,     color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   icon: <IcoCheck /> },
          { label: 'Deny / Reject', val: denyCount,      color: '#ff4d4d', bg: 'rgba(255,77,77,0.1)',   icon: <IcoX /> },
          { label: 'Rate Limited',  val: limitCount,     color: '#f6ad55', bg: 'rgba(246,173,85,0.1)',  icon: <IcoWarn /> },
          { label: 'F2B Banned',    val: bannedCount,    color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', icon: <IcoF2b /> },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.bg }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className={styles.statVal} style={{ color: s.color }}>{s.val}</div>
              <div className={styles.statLbl}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabBar}>
        {([
          { id: 'rules',    label: 'Rules',         icon: <IcoRules />,  badge: rules.length,  warn: false },
          { id: 'profiles', label: 'App Profiles',  icon: <IcoApps />,   badge: profiles.filter(p=>p.enabled).length, warn: false },
          { id: 'nat',      label: 'NAT / Forward', icon: <IcoNat />,    badge: natForwards.filter(n=>n.enabled).length, warn: false },
          { id: 'f2b',      label: 'Fail2ban',      icon: <IcoF2b />,    badge: bannedCount,   warn: bannedCount > 0 },
          { id: 'logs',     label: 'Live Logs',     icon: <IcoLogs />,   badge: null, warn: false },
        ] as { id: SectionTab; label: string; icon: React.ReactNode; badge: number|null; warn: boolean }[]).map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => switchTab(t.id)}>
            {t.icon}{t.label}
            {t.badge !== null && <span className={`${styles.tabBadge} ${t.warn ? styles.tabBadgeWarn : ''}`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════ RULES TAB ═══════════ */}
      {tab === 'rules' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search port, IP, comment…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className={styles.pillRow}>
                {(['allow','deny','limit','reject'] as RuleAction[]).map(a => {
                  const active = actionFilter.has(a)
                  const colors: Record<RuleAction, string> = { allow: '#22c55e', deny: '#ff4d4d', limit: '#f6ad55', reject: '#ff8c00' }
                  return (
                    <button key={a} className={styles.pill}
                      style={active ? { background: colors[a]+'1a', borderColor: colors[a], color: colors[a] } : {}}
                      onClick={() => toggleAction(a)}>{a.charAt(0).toUpperCase()+a.slice(1)}</button>
                  )
                })}
              </div>
              <div className={styles.pillRow}>
                {(['in','out'] as Direction[]).map(d => {
                  const active = dirFilter.has(d)
                  return (
                    <button key={d} className={styles.pill}
                      style={active ? { background: 'rgba(74,158,255,0.1)', borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
                      onClick={() => toggleDir(d)}>{d.toUpperCase()}</button>
                  )
                })}
              </div>
              <div className={styles.selectWrap}>
                <select className={styles.tbSelect} value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDir('asc') }}>
                  <option value="order">Sort: Order</option>
                  <option value="action">Sort: Action</option>
                  <option value="port">Sort: Port</option>
                  <option value="dir">Sort: Direction</option>
                  <option value="hits">Sort: Hits</option>
                </select>
                <IcoChevDn />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')}><IcoList /></button>
                <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')}><IcoGrid /></button>
              </div>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => setAddOpen(true)}>
                <IcoPlus />Add Rule
              </button>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Firewall Rules</span>
                <span className={styles.resultCount}><strong>{filteredRules.length}</strong> of {rules.length}</span>
              </div>
              <div className={styles.sectionHeadRight}>
                <a href="/api/firewall/rules/export" className={styles.iconBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcoCopy />Export</a>
                <button className={styles.iconBtn} onClick={handleReload}><IcoRefresh />Reload</button>
              </div>
            </div>

            {view === 'list' ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey==='order'?styles.thSortActive:''}`} onClick={() => toggleSort('order')}>#<SortIcon k="order" /></th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey==='dir'?styles.thSortActive:''}`} onClick={() => toggleSort('dir')}>Dir<SortIcon k="dir" /></th>
                      <th className={styles.th}>Proto</th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey==='port'?styles.thSortActive:''}`} onClick={() => toggleSort('port')}>Port<SortIcon k="port" /></th>
                      <th className={styles.th}>Source IP</th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey==='action'?styles.thSortActive:''}`} onClick={() => toggleSort('action')}>Action<SortIcon k="action" /></th>
                      <th className={styles.th}>Log</th>
                      <th className={`${styles.th} ${styles.thSort} ${sortKey==='hits'?styles.thSortActive:''}`} onClick={() => toggleSort('hits')}>Hits<SortIcon k="hits" /></th>
                      <th className={styles.th}>Comment</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule, idx) => (
                      <tr key={rule.id} className={styles.tr} onClick={() => setDetailRule(rule)}>
                        <td className={styles.td}>
                          <div className={styles.orderCell}>
                            <span className={styles.dragHandle}><IcoDrag /></span>
                            <span className={styles.orderNum}>{rule.order}</span>
                          </div>
                        </td>
                        <td className={styles.td}><DirBadge dir={rule.direction} /></td>
                        <td className={styles.td}><ProtoBadge proto={rule.protocol.toUpperCase()} /></td>
                        <td className={`${styles.td} ${styles.tdCode}`}>
                          <span style={{ color: rule.serviceColor ?? 'var(--color-text)', fontWeight: 600 }}>{rule.port}</span>
                          <span style={{ color: 'var(--color-text-dim)', fontSize: 10, marginLeft: 5 }}>{rule.portLabel}</span>
                        </td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ color: rule.sourceIp === 'anywhere' ? 'var(--color-text-dim)' : 'var(--color-text-muted)' }}>{rule.sourceIp}</td>
                        <td className={styles.td}><ActionBadge action={rule.action} /></td>
                        <td className={styles.td}>
                          <span style={{ fontSize: 10, color: rule.logging !== 'off' ? '#f6ad55' : 'var(--color-text-dim)' }}>{rule.logging}</span>
                        </td>
                        <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)' }}>{formatHits(rule.hits)}</td>
                        <td className={styles.td} style={{ maxWidth: 200 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{rule.comment}</span>
                        </td>
                        <td className={styles.td} onClick={e => e.stopPropagation()}>
                          <div className={styles.rowBtns}>
                            <button className={styles.rowBtn} title="Move up" onClick={() => handleMoveRule(rule.id, -1)} disabled={idx === 0}><IcoArrowUp /></button>
                            <button className={styles.rowBtn} title="Move down" onClick={() => handleMoveRule(rule.id, 1)} disabled={idx === filteredRules.length - 1}><IcoArrowDn /></button>
                            <button className={styles.rowBtn} title="Edit" onClick={() => { setEditRule(rule); setDetailRule(null) }}><IcoEdit /></button>
                            <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} title="Delete" onClick={() => setDeleteId(rule.id)}><IcoTrash /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.gridWrap}>
                {filteredRules.map(rule => {
                  const accentColor = rule.action === 'allow' ? '#22c55e' : rule.action === 'deny' ? '#ff4d4d' : rule.action === 'limit' ? '#f6ad55' : '#ff8c00'
                  return (
                    <div key={rule.id} className={styles.gridCard} onClick={() => setDetailRule(rule)}>
                      <div className={styles.gridCardAccent} style={{ background: accentColor }} />
                      <div className={styles.gridCardBody}>
                        <div className={styles.gridCardTop}>
                          <div className={styles.gridCardLeft}>
                            <div className={styles.gridCardPort} style={{ color: rule.serviceColor ?? 'var(--color-text)' }}>{rule.port}</div>
                            <div className={styles.gridCardLabel}>{rule.portLabel}</div>
                          </div>
                          <div className={styles.gridCardBadges}>
                            <DirBadge dir={rule.direction} />
                            <ActionBadge action={rule.action} />
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 2 }}>
                          <ProtoBadge proto={rule.protocol.toUpperCase()} />
                          <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 10.5 }}>{rule.sourceIp}</span>
                        </div>
                        <div className={styles.gridCardFoot}>
                          <span className={styles.gridCardComment}>{rule.comment || '—'}</span>
                          <span className={styles.gridCardHits}>{formatHits(rule.hits)} hits</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════ APP PROFILES TAB ═══════════ */}
      {tab === 'profiles' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}>
              <span className={styles.sectionTitle}>Application Profiles</span>
              <span className={styles.resultCount}><strong>{profiles.filter(p=>p.enabled).length}</strong> active of {profiles.length}</span>
            </div>
          </div>
          <div className={styles.profileGrid}>
            {profiles.map(p => (
              <div key={p.id} className={styles.profileCard}>
                <div className={styles.profileCardAccent} style={{ background: p.color }} />
                <div className={styles.profileCardBody}>
                  <div className={styles.profileName} style={{ color: p.color }}>{p.name}</div>
                  <div className={styles.profileService}>{p.service}</div>
                  <div className={styles.profilePorts}>{p.ports} / {p.proto}</div>
                  <div className={styles.profileCardFoot}>
                    <span className={`${styles.profileEnabledBadge} ${p.enabled ? styles.profileEnabled : styles.profileDisabled}`}>
                      {p.enabled ? <><IcoCheck />Enabled</> : 'Disabled'}
                    </span>
                    <button className={styles.profileToggle} onClick={() => handleToggleProfile(p.id)}>
                      {p.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ NAT / FORWARD TAB ═══════════ */}
      {tab === 'nat' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}>
              <span className={styles.sectionTitle}>NAT / Port Forwarding</span>
              <span className={styles.resultCount}><strong>{natForwards.filter(n=>n.enabled).length}</strong> active forwards</span>
            </div>
            <div className={styles.sectionHeadRight}>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => setNatAddOpen(true)}><IcoPlus />Add Forward</button>
            </div>
          </div>
          <div>
            {natForwards.map(fwd => (
              <div key={fwd.id} className={styles.natRow}>
                <div className={fwd.enabled ? styles.natEnabled : styles.natDisabled} />
                <span className={styles.natPort}>:{fwd.publicPort}</span>
                <ProtoBadge proto={fwd.proto.toUpperCase()} />
                <span className={styles.natArrow}><IcoArrowRight /></span>
                <span className={styles.natDest}>{fwd.destIp}:{fwd.destPort}</span>
                <span className={styles.natComment}>{fwd.comment}</span>
                <div className={styles.rowBtns} onClick={e => e.stopPropagation()}>
                  <button className={styles.rowBtn} onClick={() => handleToggleNAT(fwd.id)}><IcoEdit /></button>
                  <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => handleDeleteNAT(fwd.id)}><IcoTrash /></button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 14, borderTop: '1px solid var(--color-border)' }}>
            <div className={styles.confirmBanner} style={{ background: 'rgba(99,179,237,0.07)', borderColor: 'rgba(99,179,237,0.2)', color: '#63b3ed' }}>
              <IcoWarn />
              <span>Port forwarding requires IP forwarding to be enabled: <code style={{ fontFamily:'monospace', fontSize:11 }}>sysctl -w net.ipv4.ip_forward=1</code></span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ FAIL2BAN TAB ═══════════ */}
      {tab === 'f2b' && (
        <>
          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Fail2ban Jails</span>
              </div>
            </div>
            <div className={styles.f2bGrid}>
              {jails.map(j => (
                <div key={j.name} className={styles.jailCard}>
                  <div className={styles.jailName}>
                    {j.status === 'active' ? <span className={styles.jailActiveDot} /> : <span className={styles.jailInactiveDot} />}
                    {j.name}
                  </div>
                  <div className={styles.jailStats}>
                    <span className={styles.jailStat}>Banned: <strong>{j.banned}</strong></span>
                    <span className={styles.jailStat}>Failed: <strong>{j.failed}</strong></span>
                    <span className={styles.jailStat}>Total: <strong>{j.totalFailed}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>Currently Banned IPs</span>
                <span className={styles.resultCount}><strong>{bannedIPs.length}</strong> addresses</span>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>IP Address</th>
                    <th className={styles.th}>Country</th>
                    <th className={styles.th}>Jail</th>
                    <th className={styles.th}>Banned Since</th>
                    <th className={styles.th}>Attempts</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedIPs.map(b => (
                    <tr key={b.ip} className={styles.tr}>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ color: '#f6ad55' }}>{b.ip}</td>
                      <td className={styles.td}>
                        <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 4, fontFamily: 'monospace' }}>{b.country}</span>
                      </td>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-muted)' }}>{b.jail}</td>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>{b.since}</td>
                      <td className={`${styles.td} ${styles.tdMono}`} style={{ color: '#ff4d4d', fontWeight: 600 }}>{b.attempts}</td>
                      <td className={styles.td} onClick={e => e.stopPropagation()}>
                        <div className={styles.rowBtns}>
                          <button className={styles.rowBtn} title="Unban IP" onClick={() => handleUnban(b.ip, b.jail)}><IcoUnban /></button>
                          <button className={styles.rowBtn} title="View detail" onClick={() => setSelectedBan(b)}><IcoEye /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ LOGS TAB ═══════════ */}
      {tab === 'logs' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Filter by IP, port…" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
              </div>
              <div className={styles.pillRow}>
                {(['all','BLOCK','ALLOW','LIMIT'] as const).map(f => (
                  <button key={f} className={styles.pill}
                    style={logFilter === f ? {
                      background: f==='BLOCK' ? 'rgba(255,77,77,0.1)' : f==='ALLOW' ? 'rgba(34,197,94,0.1)' : f==='LIMIT' ? 'rgba(246,173,85,0.1)' : 'rgba(74,158,255,0.1)',
                      borderColor: f==='BLOCK' ? '#ff4d4d' : f==='ALLOW' ? '#22c55e' : f==='LIMIT' ? '#f6ad55' : 'var(--color-accent)',
                      color: f==='BLOCK' ? '#ff4d4d' : f==='ALLOW' ? '#22c55e' : f==='LIMIT' ? '#f6ad55' : 'var(--color-accent)',
                    } : {}}
                    onClick={() => setLogFilter(f)}
                  >{f === 'all' ? 'All' : f}</button>
                ))}
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.iconBtn}><IcoCopy />Export</button>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadLeft}>
                <span className={styles.sectionTitle}>UFW Firewall Log</span>
                <span className={styles.resultCount}><strong>{filteredLogs.length}</strong> entries</span>
              </div>
              <div className={styles.sectionHeadRight}>
                <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Last: {fwStatus.lastLog || '—'}</span>
              </div>
            </div>
            <div className={styles.logsWrap}>
              {filteredLogs.map(l => (
                <div key={l.id} className={styles.logRow}>
                  <span className={styles.logTs}>{l.ts.slice(11)}</span>
                  <LogBadge type={l.type} />
                  <span className={styles.logSrc}>{l.srcIp}</span>
                  <span className={styles.logArrow}>→</span>
                  <span className={styles.logDst}>{l.dstIp}</span>
                  <span style={{ color: 'var(--color-text-dim)' }}>:</span>
                  <span className={styles.logPort}>{l.dstPort}</span>
                  <ProtoBadge proto={l.proto} />
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{l.iface}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {selectedBan && (
        <BannedIPModal
          ip={selectedBan}
          onClose={() => setSelectedBan(null)}
          onUnban={() => handleUnban(selectedBan.ip, selectedBan.jail)}
        />
      )}
      {natAddOpen && (
        <NATAddModal onClose={() => setNatAddOpen(false)} onSave={handleAddNAT} />
      )}
      {addOpen && (
        <RuleModal rule={null} onClose={() => setAddOpen(false)} onSave={handleSaveRule} />
      )}
      {editRule && (
        <RuleModal rule={editRule} onClose={() => setEditRule(null)} onSave={handleSaveRule} />
      )}
      {detailRule && !editRule && (
        <RuleDetailModal
          rule={detailRule}
          allRules={rules}
          onClose={() => setDetailRule(null)}
          onEdit={() => { setEditRule(detailRule); setDetailRule(null) }}
          onDelete={() => handleDelete(detailRule.id)}
        />
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className={styles.overlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={styles.modalTitle}>Delete Firewall Rule</span>
              <button className={styles.modalClose} onClick={() => setDeleteId(null)}><IcoX /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.confirmBanner}>
                <IcoWarn />
                <span>This rule will be removed immediately. This action cannot be undone.</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace', background: 'var(--color-surface-raised)', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--color-border)' }}>
                {buildUFWCmd(rules.find(r => r.id === deleteId) ?? {})}
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button className={styles.formBtn} onClick={() => setDeleteId(null)}><IcoX />Cancel</button>
              <button className={`${styles.formBtn} ${styles.formBtnDanger}`} onClick={() => handleDelete(deleteId)}>
                <IcoTrash />Delete Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
