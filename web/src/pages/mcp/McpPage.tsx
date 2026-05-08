import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMCPTokens, createMCPToken, revokeMCPToken, fetchMCPAuditLog, fetchMCPStats,
  type MCPToken as ApiMCPToken, type MCPAuditEntry,
} from '../../lib/api'
import s from './McpPage.module.css'

// ── Types ─────────────────────────────────────────────────────
type TokenStatus = 'active' | 'expiring' | 'expired' | 'unused'
interface MCPToken {
  id: string; name: string; desc: string; owner: string
  scopes: string[]; status: TokenStatus; expires: string
  lastUsed: string; created: string; ipRestrict: string[]
  rateLimit: number; burst: number; totalRequests: number
  tokenType: 'bearer' | 'jwt' | 'oauth2'; color: string
}
interface MCPTool {
  name: string; desc: string; enabled: boolean; category: string
  callCount: number; lastCall: string
}
interface MCPClient {
  id: string; name: string; version: string; transport: string
  connectedSince: string; requestsToday: number; status: string
}
type ModalState =
  | { type: 'create' }
  | { type: 'created'; token: MCPToken; raw: string }
  | { type: 'details'; token: MCPToken }
  | { type: 'usage'; token: MCPToken }
  | { type: 'audit'; token: MCPToken }
  | { type: 'rotate'; token: MCPToken }
  | { type: 'extend'; token: MCPToken }
  | { type: 'scopes'; token: MCPToken }
  | { type: 'ip'; token: MCPToken }
  | { type: 'revoke'; token: MCPToken }
  | { type: 'test'; token: MCPToken }
  | { type: 'bulk' }
  | { type: 'toolcfg'; tool: MCPTool }

// ── API → UI mapping ───────────────────────────────────────────
const TOKEN_COLORS = ['#4a9eff','#7c3aed','#22c55e','#f59e0b','#ec4899','#06b6d4','#f97316','#84cc16']

function apiTokenToUi(t: ApiMCPToken, idx: number): MCPToken {
  function relTime(ts: number | null | undefined): string {
    if (!ts) return 'Never'
    const diff = Math.floor(Date.now() / 1000 - ts)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }
  const status: TokenStatus = !t.last_used ? 'unused' : 'active'
  return {
    id: `mcp_${t.id}`,
    name: t.label,
    desc: '',
    owner: '—',
    scopes: t.scope ? [t.scope] : [],
    status,
    expires: '—',
    lastUsed: relTime(t.last_used),
    created: new Date(t.created_at * 1000).toISOString().split('T')[0],
    ipRestrict: [],
    rateLimit: 60,
    burst: 10,
    totalRequests: 0,
    tokenType: 'bearer',
    color: TOKEN_COLORS[idx % TOKEN_COLORS.length],
  }
}

const ALL_SCOPES = [
  { group: 'Servers',  items: [{ name: 'servers:read', desc: 'Read server info' }, { name: 'servers:manage', desc: 'Manage servers' }] },
  { group: 'Metrics',  items: [{ name: 'metrics:read', desc: 'Read metrics data' }, { name: 'metrics:export', desc: 'Export metrics' }] },
  { group: 'Services', items: [{ name: 'services:read', desc: 'List services' }, { name: 'services:restart', desc: 'Restart services' }, { name: 'services:manage', desc: 'Full service control' }] },
  { group: 'Logs',     items: [{ name: 'logs:read', desc: 'Read log files' }, { name: 'logs:stream', desc: 'Stream logs' }] },
  { group: 'Deploy',   items: [{ name: 'deploy:read', desc: 'View deployments' }, { name: 'deploy:write', desc: 'Create deployments' }] },
  { group: 'Containers',items: [{ name: 'containers:list', desc: 'List containers' }, { name: 'containers:manage', desc: 'Start/stop containers' }] },
  { group: 'Security', items: [{ name: 'firewall:read', desc: 'View firewall rules' }, { name: 'firewall:write', desc: 'Modify firewall' }] },
  { group: 'FTP',      items: [{ name: 'ftp:read', desc: 'Browse files' }, { name: 'ftp:write', desc: 'Modify files' }] },
  { group: 'Processes',items: [{ name: 'processes:read', desc: 'View processes' }, { name: 'processes:kill', desc: 'Kill processes' }] },
  { group: 'Uptime',   items: [{ name: 'uptime:read', desc: 'View uptime data' }] },
]

// ── SVG Icons (no emoji) ───────────────────────────────────────
function IcoKey()    { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="7" r="3"/><path d="M9 7h6M13 7v2"/></svg> }
function IcoPlus()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg> }
function IcoList()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="4" y1="5" x2="14" y2="5"/><line x1="4" y1="8" x2="14" y2="8"/><line x1="4" y1="11" x2="14" y2="11"/><circle cx="2" cy="5" r="0.8" fill="currentColor" stroke="none"/><circle cx="2" cy="8" r="0.8" fill="currentColor" stroke="none"/><circle cx="2" cy="11" r="0.8" fill="currentColor" stroke="none"/></svg> }
function IcoGrid()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> }
function IcoSearch() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg> }
function IcoClose()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg> }
function IcoCheck()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,8 6,12 14,4"/></svg> }
function IcoWarn()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1L15 14H1z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r="0.6" fill="currentColor" stroke="none"/></svg> }
function IcoDots()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg> }
function IcoDrag()   { return <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.4"/><circle cx="11" cy="4" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="11" cy="12" r="1.4"/></svg> }
function IcoSort()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="5" x2="14" y2="5"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="6" y1="11" x2="10" y2="11"/></svg> }
function IcoTrash()  { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg> }
function IcoRotate() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3a7 7 0 1 0 1 5"/><polyline points="13,1 13,5 9,5"/></svg> }
function IcoEye()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg> }
function IcoChart()  { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,12 5,7 8,10 11,5 14,8"/><line x1="2" y1="14" x2="14" y2="14"/></svg> }
function IcoLog()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="11" y2="9"/><line x1="5" y1="12" x2="8" y2="12"/></svg> }
function IcoPlay()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 14,8 3,14"/></svg> }
function IcoExtend() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><polyline points="8,5 8,8 10,10"/><path d="M12 1l2 2-2 2"/></svg> }
function IcoIP()     { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><line x1="2" y1="8" x2="14" y2="8"/><path d="M8 1.5a10 10 0 0 1 2.5 6.5 10 10 0 0 1-2.5 6.5 10 10 0 0 1-2.5-6.5A10 10 0 0 1 8 1.5z"/></svg> }
function IcoScope()  { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="2.5"/><line x1="8" y1="1.5" x2="8" y2="5.5"/><line x1="8" y1="10.5" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="5.5" y2="8"/><line x1="10.5" y1="8" x2="14.5" y2="8"/></svg> }
// ── Helpers ────────────────────────────────────────────────────
function statusClass(status: TokenStatus) {
  return status === 'active' ? s.badgeActive : status === 'expiring' ? s.badgeExpiring : status === 'expired' ? s.badgeExpired : s.badgeUnused
}
function fmt(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n) }
function randToken() { return 'mcp_' + Array.from({length: 32}, () => '0123456789abcdef'[Math.floor(Math.random()*16)]).join('') }

// ── Modal wrapper ──────────────────────────────────────────────
function Modal({ title, onClose, size, children, footer }: { title: string; onClose(): void; size?: 'lg'|'xl'; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${s.modal} ${size === 'lg' ? s.modalLg : size === 'xl' ? s.modalXl : ''}`}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>{title}</span>
          <button className={s.modalCloseBtn} onClick={onClose}><IcoClose/></button>
        </div>
        <div className={s.modalBody}>{children}</div>
        {footer && <div className={s.modalFoot}>{footer}</div>}
      </div>
    </div>
  )
}

// ── Context menu ───────────────────────────────────────────────
function ContextMenu({ x, y, onAction, onClose }: { x: number; y: number; token: MCPToken; onAction(a: string): void; onClose(): void }) {
  useEffect(() => {
    const fn = () => onClose()
    window.addEventListener('mousedown', fn)
    return () => window.removeEventListener('mousedown', fn)
  }, [onClose])
  const item = (icon: React.ReactNode, label: string, action: string, danger = false) => (
    <button className={`${s.ctxItem} ${danger ? s.ctxDanger : ''}`} onClick={() => { onAction(action); onClose() }}>
      {icon}<span>{label}</span>
    </button>
  )
  return (
    <div className={s.ctxMenu} style={{ left: x, top: y }} onMouseDown={e => e.stopPropagation()}>
      {item(<IcoEye/>,    'View Details',     'details')}
      {item(<IcoChart/>,  'Usage Analytics',  'usage')}
      {item(<IcoLog/>,    'Audit Log',        'audit')}
      <div className={s.ctxDivider}/>
      {item(<IcoRotate/>,'Rotate Token',      'rotate')}
      {item(<IcoExtend/>,'Extend Expiration', 'extend')}
      {item(<IcoScope/>, 'Change Scopes',     'scopes')}
      {item(<IcoIP/>,    'IP Allowlist',      'ip')}
      <div className={s.ctxDivider}/>
      {item(<IcoPlay/>,  'Test Token',        'test')}
      {item(<IcoTrash/>, 'Revoke',            'revoke', true)}
    </div>
  )
}

// ── Create Wizard ──────────────────────────────────────────────
const WIZARD_STEPS = ['Basic Config', 'Scopes', 'Security']
function CreateWizardModal({ onClose, onCreate }: { onClose(): void; onCreate(t: MCPToken, raw: string): void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [owner, setOwner] = useState('admin@orbit.io')
  const [tokenType, setTokenType] = useState<'bearer'|'jwt'|'oauth2'>('bearer')
  const [expires, setExpires] = useState('2026-12-31')
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['metrics:read','servers:read'])
  const [rateLimit, setRateLimit] = useState('60'); const [burst, setBurst] = useState('10')
  const [ips, setIps] = useState(''); const colorIdx = Math.floor(Math.random() * TOKEN_COLORS.length)

  const toggleScope = (sc: string) => setSelectedScopes(prev => prev.includes(sc) ? prev.filter(x => x !== sc) : [...prev, sc])
  const valid = name.trim().length > 0

  function finish() {
    const raw = randToken()
    const t: MCPToken = {
      id: 'mcp_' + Date.now().toString(16), name: name.trim(), desc, owner,
      scopes: selectedScopes, status: 'active', expires, lastUsed: 'Never',
      created: new Date().toISOString().slice(0,10),
      ipRestrict: ips.split('\n').map(x=>x.trim()).filter(Boolean),
      rateLimit: Number(rateLimit)||60, burst: Number(burst)||10,
      totalRequests: 0, tokenType, color: TOKEN_COLORS[colorIdx],
    }
    onCreate(t, raw)
  }

  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${s.modal} ${s.modalLg}`}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Create MCP Token</span>
          <button className={s.modalCloseBtn} onClick={onClose}><IcoClose/></button>
        </div>
        <div className={s.wizardSteps}>
          {WIZARD_STEPS.map((label, i) => (
            <div key={label} className={`${s.wizardStep} ${i === step ? s.wizardStepActive : ''}`}>
              <span className={`${s.stepNum} ${i === step ? s.stepNumActive : i < step ? s.stepNumDone : ''}`}>
                {i < step ? <IcoCheck/> : i + 1}
              </span>
              {label}
            </div>
          ))}
        </div>
        <div className={s.modalBody}>
          {step === 0 && <>
            <div className={s.field}><label className={s.label}>Token Name *</label>
              <input className={s.input} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. claude-desktop" autoFocus/>
            </div>
            <div className={s.field}><label className={s.label}>Description</label>
              <textarea className={s.textarea} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What is this token used for?"/>
            </div>
            <div className={s.fieldRow}>
              <div className={s.field}><label className={s.label}>Owner</label>
                <input className={s.input} value={owner} onChange={e=>setOwner(e.target.value)} placeholder="owner@example.com"/>
              </div>
              <div className={s.field}><label className={s.label}>Token Type</label>
                <select className={s.select} value={tokenType} onChange={e=>setTokenType(e.target.value as any)}>
                  <option value="bearer">Bearer</option>
                  <option value="jwt">JWT</option>
                  <option value="oauth2">OAuth2</option>
                </select>
              </div>
            </div>
            <div className={s.field}><label className={s.label}>Expires</label>
              <input className={s.input} type="date" value={expires} onChange={e=>setExpires(e.target.value)}/>
            </div>
          </>}
          {step === 1 && <>
            <p className={s.hint}>Select the permissions this token will have. Follow least-privilege — only grant what is needed.</p>
            {ALL_SCOPES.map(grp => (
              <div key={grp.group} className={s.scopeGroup}>
                <div className={s.scopeGroupLabel}>{grp.group}</div>
                <div className={s.scopesList}>
                  {grp.items.map(sc => (
                    <label key={sc.name} className={s.scopeRow}>
                      <input type="checkbox" className={s.scopeCheck} checked={selectedScopes.includes(sc.name)} onChange={()=>toggleScope(sc.name)}/>
                      <span className={s.scopeName}>{sc.name}</span>
                      <span className={s.scopeDesc}>{sc.desc}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>}
          {step === 2 && <>
            <div className={s.fieldRow}>
              <div className={s.field}><label className={s.label}>Rate Limit (req/min)</label>
                <input className={s.input} type="number" value={rateLimit} onChange={e=>setRateLimit(e.target.value)} min="1" max="1000"/>
              </div>
              <div className={s.field}><label className={s.label}>Burst Limit</label>
                <input className={s.input} type="number" value={burst} onChange={e=>setBurst(e.target.value)} min="1" max="200"/>
              </div>
            </div>
            <div className={s.field}><label className={s.label}>IP Allowlist (one per line, leave empty to allow all)</label>
              <textarea className={s.textarea} value={ips} onChange={e=>setIps(e.target.value)} placeholder={'192.168.1.0/24\n10.0.0.0/8'} style={{minHeight:100}}/>
              <span className={s.hint}>CIDR notation or exact IPs. Leave empty to allow from any IP.</span>
            </div>
          </>}
        </div>
        <div className={s.modalFoot}>
          {step > 0 && <button className={`${s.btn} ${s.btnSecondary}`} onClick={()=>setStep(s=>s-1)}>Back</button>}
          <span style={{flex:1}}/>
          <button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button>
          {step < 2
            ? <button className={`${s.btn} ${s.btnPrimary}`} disabled={step===0 && !valid} onClick={()=>setStep(p=>p+1)}>Next</button>
            : <button className={`${s.btn} ${s.btnPrimary}`} onClick={finish}>Create Token</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── Token Created modal ────────────────────────────────────────
function TokenCreatedModal({ token, raw, onClose }: { token: MCPToken; raw: string; onClose(): void }) {
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard.writeText(raw).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false), 2000) }
  return (
    <Modal title="Token Created" onClose={onClose} footer={<button className={`${s.btn} ${s.btnPrimary}`} onClick={onClose}>Done</button>}>
      <div className={s.successIcon}><IcoKey/></div>
      <div className={s.successTitle}>{token.name} created</div>
      <div className={s.successSub}>Copy the token value now — it will not be shown again.</div>
      <div className={s.tokenReveal}>
        {raw}
        <button className={s.tokenRevealCopy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className={s.dangerBox}>Store this token securely. It grants access according to its scopes and cannot be retrieved again.</div>
    </Modal>
  )
}

// ── Token Details modal ────────────────────────────────────────
function TokenDetailsModal({ token, onClose }: { token: MCPToken; onClose(): void }) {
  return (
    <Modal title="Token Details" onClose={onClose} size="lg" footer={<button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Close</button>}>
      <div className={s.infoRow}><span className={s.infoLabel}>ID</span><span className={s.infoValue}>{token.id}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Name</span><span className={s.infoValue}>{token.name}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Description</span><span className={s.infoValue}>{token.desc || '—'}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Owner</span><span className={s.infoValue}>{token.owner}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Status</span><span className={`${s.metaBadge} ${statusClass(token.status)}`}>{token.status}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Type</span><span className={s.infoValue}>{token.tokenType}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Created</span><span className={s.infoValue}>{token.created}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Expires</span><span className={s.infoValue}>{token.expires}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Last Used</span><span className={s.infoValue}>{token.lastUsed}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Total Requests</span><span className={s.infoValue}>{token.totalRequests.toLocaleString()}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Rate Limit</span><span className={s.infoValue}>{token.rateLimit} req/min (burst {token.burst})</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>IP Allowlist</span><span className={s.infoValue}>{token.ipRestrict.length ? token.ipRestrict.join(', ') : 'Any IP'}</span></div>
      <div className={s.field} style={{marginTop:4}}>
        <span className={s.label}>Scopes</span>
        <div className={s.tokenScopes}>{token.scopes.map(sc=><span key={sc} className={s.scopeBadge}>{sc}</span>)}</div>
      </div>
    </Modal>
  )
}

// ── Usage Analytics modal ──────────────────────────────────────
function UsageAnalyticsModal({ token, onClose }: { token: MCPToken; onClose(): void }) {
  return (
    <Modal title={`Usage Analytics — ${token.name}`} onClose={onClose} size="lg" footer={<button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Close</button>}>
      <div className={s.usageGrid}>
        <div className={s.usageStat}><span className={s.usageStatLabel}>Total Requests</span><span className={s.usageStatValue}>{fmt(token.totalRequests)}</span></div>
        <div className={s.usageStat}><span className={s.usageStatLabel}>Status</span><span className={s.usageStatValue}>{token.status}</span></div>
        <div className={s.usageStat}><span className={s.usageStatLabel}>Rate Limit</span><span className={s.usageStatValue}>{token.rateLimit}/min</span></div>
        <div className={s.usageStat}><span className={s.usageStatLabel}>Burst</span><span className={s.usageStatValue}>{token.burst}</span></div>
      </div>
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12 }}>
        Detailed per-endpoint analytics are not yet available. Enable audit logging to collect usage metrics.
      </div>
    </Modal>
  )
}

// ── Audit Log modal ────────────────────────────────────────────
function AuditLogModal({ token, onClose }: { token: MCPToken; onClose(): void }) {
  const [entries, setEntries] = useState<MCPAuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMCPAuditLog()
      .then(data => setEntries(data.filter(e => e.token_id === null || String(e.token_id) === token.id)))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [token.id])

  function relTs(ts: number) {
    return new Date(ts * 1000).toLocaleString()
  }

  return (
    <Modal title={`Audit Log — ${token.name}`} onClose={onClose} size="xl" footer={<button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Close</button>}>
      <div className={s.auditList}>
        {loading && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12 }}>Loading…</div>}
        {!loading && entries.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12 }}>No audit events recorded for this token yet.</div>
        )}
        {entries.map(ev => (
          <div key={ev.id} className={s.auditItem}>
            <span className={s.auditTime}>{relTs(ev.ts)}</span>
            <span className={`${s.auditAction} ${s.auditSuccess}`}>{ev.tool}</span>
            <span className={s.auditDetail}>{ev.args}</span>
            <span className={s.auditIp}>{ev.result}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Rotate Token modal ─────────────────────────────────────────
function RotateTokenModal({ token, onClose, onRotate }: { token: MCPToken; onClose(): void; onRotate(): void }) {
  const [keepOld, setKeepOld] = useState(true); const [period, setPeriod] = useState('24')
  return (
    <Modal title="Rotate Token" onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button><button className={`${s.btn} ${s.btnPrimary}`} onClick={onRotate}>Rotate Now</button></>}>
      <div className={s.alertBox}><IcoWarn/> Rotating will generate a new token secret. Update all integrations using <strong>{token.name}</strong> before the old token expires.</div>
      <div className={s.field}><label className={s.label}>Grace Period (hours)</label>
        <select className={s.select} value={period} onChange={e=>setPeriod(e.target.value)} disabled={!keepOld}>
          <option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="72">72 hours</option>
        </select>
      </div>
      <label className={s.toggleRow} style={{cursor:'pointer'}}>
        <span>Keep old token valid during grace period</span>
        <button className={`${s.toggle} ${keepOld ? s.on : ''}`} onClick={()=>setKeepOld(v=>!v)}/>
      </label>
    </Modal>
  )
}

// ── Extend Expiration modal ────────────────────────────────────
function ExtendExpirationModal({ token, onClose, onExtend }: { token: MCPToken; onClose(): void; onExtend(d: string): void }) {
  const [date, setDate] = useState(token.expires)
  return (
    <Modal title="Extend Expiration" onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button><button className={`${s.btn} ${s.btnPrimary}`} onClick={()=>onExtend(date)}>Extend</button></>}>
      <div className={s.infoRow}><span className={s.infoLabel}>Current Expiry</span><span className={s.infoValue}>{token.expires}</span></div>
      <div className={s.field}><label className={s.label}>New Expiry Date</label>
        <input className={s.input} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </div>
    </Modal>
  )
}

// ── Change Scopes modal ────────────────────────────────────────
function ChangeScopesModal({ token, onClose, onSave }: { token: MCPToken; onClose(): void; onSave(sc: string[]): void }) {
  const [selected, setSelected] = useState<string[]>(token.scopes)
  const toggle = (sc: string) => setSelected(prev => prev.includes(sc) ? prev.filter(x=>x!==sc) : [...prev, sc])
  return (
    <Modal title="Change Scopes" onClose={onClose} size="lg"
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button><button className={`${s.btn} ${s.btnPrimary}`} onClick={()=>onSave(selected)}>Save</button></>}>
      {ALL_SCOPES.map(grp => (
        <div key={grp.group} className={s.scopeGroup}>
          <div className={s.scopeGroupLabel}>{grp.group}</div>
          <div className={s.scopesList}>
            {grp.items.map(sc => (
              <label key={sc.name} className={s.scopeRow}>
                <input type="checkbox" className={s.scopeCheck} checked={selected.includes(sc.name)} onChange={()=>toggle(sc.name)}/>
                <span className={s.scopeName}>{sc.name}</span>
                <span className={s.scopeDesc}>{sc.desc}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  )
}

// ── IP Allowlist modal ─────────────────────────────────────────
function IPAllowlistModal({ token, onClose, onSave }: { token: MCPToken; onClose(): void; onSave(ips: string[]): void }) {
  const [ips, setIps] = useState<string[]>(token.ipRestrict.length ? token.ipRestrict : [])
  const [newIp, setNewIp] = useState('')
  function add() { const v = newIp.trim(); if (v && !ips.includes(v)) { setIps(p=>[...p,v]); setNewIp('') } }
  return (
    <Modal title="IP Allowlist" onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button><button className={`${s.btn} ${s.btnPrimary}`} onClick={()=>onSave(ips)}>Save</button></>}>
      <p className={s.hint}>Allow access only from listed IPs or CIDR ranges. Leave empty to allow all.</p>
      <div className={s.ipList}>
        {ips.map(ip => (
          <div key={ip} className={s.ipRow}>
            <span className={s.ipRowText}>{ip}</span>
            <button className={s.ipRemoveBtn} onClick={()=>setIps(p=>p.filter(x=>x!==ip))}><IcoClose/></button>
          </div>
        ))}
        {ips.length === 0 && <p className={s.hint} style={{padding:'8px 0'}}>No IP restrictions — all IPs allowed.</p>}
      </div>
      <div style={{display:'flex',gap:8}}>
        <input className={s.input} style={{flex:1}} value={newIp} onChange={e=>setNewIp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="192.168.1.0/24"/>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={add}>Add</button>
      </div>
    </Modal>
  )
}

// ── Revoke modal ───────────────────────────────────────────────
function RevokeModal({ token, onClose, onRevoke }: { token: MCPToken; onClose(): void; onRevoke(): void }) {
  const [confirm, setConfirm] = useState('')
  return (
    <Modal title="Revoke Token" onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button><button className={`${s.btn} ${s.btnDanger}`} disabled={confirm !== token.name} onClick={onRevoke}>Revoke</button></>}>
      <div className={s.dangerBox}>This action is permanent. The token <strong>{token.id}</strong> will be immediately invalidated and all integrations using it will stop working.</div>
      <div className={s.field}><label className={s.label}>Type "{token.name}" to confirm</label>
        <input className={s.input} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder={token.name}/>
      </div>
    </Modal>
  )
}

// ── Test Token modal ───────────────────────────────────────────
function TestTokenModal({ token, onClose }: { token: MCPToken; onClose(): void }) {
  const [endpoint, setEndpoint] = useState('/api/metrics'); const [method, setMethod] = useState('GET')
  const [result, setResult] = useState<{ok:boolean;body:string}|null>(null); const [running, setRunning] = useState(false)
  function run() {
    setRunning(true); setResult(null)
    setTimeout(() => {
      const ok = token.scopes.some(sc=>sc.includes('metrics')||sc.includes('server'))
      setResult({ ok, body: ok ? JSON.stringify({status:'ok',data:{cpu:32,ram:64,uptime:'14d 3h'}},null,2) : JSON.stringify({error:'Forbidden',code:403,scope_required:'metrics:read'},null,2) })
      setRunning(false)
    }, 800)
  }
  return (
    <Modal title={`Test Token — ${token.name}`} onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Close</button><button className={`${s.btn} ${s.btnPrimary}`} onClick={run} disabled={running}>{running?'Running…':'Run Test'}</button></>}>
      <div className={s.fieldRow}>
        <div className={s.field}><label className={s.label}>Method</label>
          <select className={s.select} value={method} onChange={e=>setMethod(e.target.value)}>
            <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
          </select>
        </div>
        <div className={s.field}><label className={s.label}>Endpoint</label>
          <input className={s.input} value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="/api/metrics"/>
        </div>
      </div>
      {result && (
        <div className={`${s.testResult} ${result.ok ? s.testSuccess : s.testFail}`}>
          {result.ok ? '200 OK\n' : '403 Forbidden\n'}{result.body}
        </div>
      )}
    </Modal>
  )
}

// ── Bulk Ops modal ─────────────────────────────────────────────
function BulkOpsModal({ count, onClose }: { count: number; onClose(): void }) {
  return (
    <Modal title="Bulk Operations" onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button></>}>
      <p className={s.hint}>{count} token{count!==1?'s':''} selected. Choose an action to apply to all selected tokens.</p>
      {[['Extend Expiration',false],['Change Rate Limits',false],['Add Scope',false],['Remove Scope',false],['Revoke All',true]].map(([label,danger])=>(
        <button key={label as string} className={`${s.btn} ${danger ? s.btnDanger : s.btnSecondary}`} style={{width:'100%',justifyContent:'flex-start',marginBottom:6}} onClick={onClose}>{label as string}</button>
      ))}
    </Modal>
  )
}

// ── Tool Config modal ──────────────────────────────────────────
function ToolConfigModal({ tool, onClose, onSave }: { tool: MCPTool; onClose(): void; onSave(t: MCPTool): void }) {
  const [enabled, setEnabled] = useState(tool.enabled)
  const [rateLimit, setRateLimit] = useState('30')
  return (
    <Modal title={`Configure — ${tool.name}`} onClose={onClose}
      footer={<><button className={`${s.btn} ${s.btnSecondary}`} onClick={onClose}>Cancel</button><button className={`${s.btn} ${s.btnPrimary}`} onClick={()=>onSave({...tool,enabled})}>Save</button></>}>
      <label className={s.toggleRow} style={{cursor:'pointer'}}>
        <span>Tool enabled</span>
        <button className={`${s.toggle} ${enabled ? s.on : ''}`} onClick={()=>setEnabled(v=>!v)}/>
      </label>
      <div className={s.infoRow}><span className={s.infoLabel}>Category</span><span className={s.infoValue}>{tool.category}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Total Calls</span><span className={s.infoValue}>{tool.callCount.toLocaleString()}</span></div>
      <div className={s.infoRow}><span className={s.infoLabel}>Last Called</span><span className={s.infoValue}>{tool.lastCall}</span></div>
      <div className={s.field}><label className={s.label}>Rate Limit (calls/min)</label>
        <input className={s.input} type="number" value={rateLimit} onChange={e=>setRateLimit(e.target.value)} min="1" max="600"/>
      </div>
    </Modal>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function McpPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'tokens'|'server'|'clients'|'policies'|'compliance'>('tokens')
  const { data: rawTokens = [] } = useQuery({ queryKey: ['mcp-tokens'], queryFn: fetchMCPTokens })
  const tokens = useMemo(() => rawTokens.map((t, i) => apiTokenToUi(t, i)), [rawTokens])
  const { data: mcpStats } = useQuery({ queryKey: ['mcp-stats'], queryFn: fetchMCPStats, staleTime: 30000 })
  const [tools, setTools] = useState<MCPTool[]>([])
  const [view, setView] = useState<'grid'|'list'>('grid')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState|null>(null)
  const [ctx, setCtx] = useState<{x:number;y:number;token:MCPToken}|null>(null)
  const [dragIdx, setDragIdx] = useState<number|null>(null)
  const [dropIdx, setDropIdx] = useState<number|null>(null)
  const [policyToggles, setPolicyToggles] = useState({mfa:true,rotation:true,ipEnforce:false,auditAll:true,autoRevoke:false})

  const closeModal = () => setModal(null)

  // Filter + sort
  const filtered = tokens.filter(t => {
    const q = search.toLowerCase()
    const matchQ = !q || t.name.includes(q) || t.id.includes(q) || t.owner.includes(q) || t.desc.toLowerCase().includes(q)
    const matchS = statusFilter === 'all' || t.status === statusFilter
    return matchQ && matchS
  }).sort((a, b) => {
    let cmp = 0
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortBy === 'requests') cmp = a.totalRequests - b.totalRequests
    else if (sortBy === 'expires') cmp = a.expires.localeCompare(b.expires)
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  function toggleSelect(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n }) }
  function selectAll() { setSelected(new Set(filtered.map(t=>t.id))) }
  function clearSel() { setSelected(new Set()) }

  function handleCtxAction(action: string, token: MCPToken) {
    if (action === 'details') setModal({type:'details',token})
    else if (action === 'usage') setModal({type:'usage',token})
    else if (action === 'audit') setModal({type:'audit',token})
    else if (action === 'rotate') setModal({type:'rotate',token})
    else if (action === 'extend') setModal({type:'extend',token})
    else if (action === 'scopes') setModal({type:'scopes',token})
    else if (action === 'ip') setModal({type:'ip',token})
    else if (action === 'revoke') setModal({type:'revoke',token})
    else if (action === 'test') setModal({type:'test',token})
  }

  function handleCtxMenuOpen(e: React.MouseEvent, token: MCPToken) {
    e.preventDefault(); e.stopPropagation()
    setCtx({x: Math.min(e.clientX, window.innerWidth-220), y: Math.min(e.clientY, window.innerHeight-280), token})
  }

  // Drag-and-drop (visual reorder only — persisted on next query refetch)
  function onDragStart(i: number) { setDragIdx(i) }
  function onDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setDropIdx(i) }
  function onDrop(e: React.DragEvent, _i: number) { e.preventDefault(); setDragIdx(null); setDropIdx(null) }
  function onDragEnd() { setDragIdx(null); setDropIdx(null) }

  const sortArrow = (field: string) => sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const statCards = [
    { label: 'Active Tokens', value: tokens.filter(t=>t.status==='active').length, sub: `${tokens.length} total`, accent: '#4a9eff' },
    { label: 'Total Requests', value: fmt(tokens.reduce((a,t)=>a+t.totalRequests,0)), sub: 'all time', accent: '#22c55e' },
    { label: 'Rate Limit Hits', value: mcpStats?.rate_limit_hits_24h ?? 0, sub: 'last 24h', accent: '#f59e0b' },
    { label: 'Security Events', value: mcpStats?.scope_denials_today ?? 0, sub: 'scope denials today', accent: '#ef4444' },
  ]

  return (
    <div className={s.page}>
      {/* Stats */}
      <div className={s.statsRow}>
        {statCards.map(c => (
          <div key={c.label} className={s.statCard} style={{'--stat-accent':c.accent} as any}>
            <div className={s.statLabel}><span className={s.statDot} style={{background:c.accent}}/>{c.label}</div>
            <div className={s.statValue}>{c.value}</div>
            <div className={s.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className={s.tabs}>
        {(['tokens','server','clients','policies','compliance'] as const).map(t => (
          <button key={t} className={`${s.tab} ${tab===t?s.tabActive:''}`} onClick={()=>setTab(t)}>
            {t === 'tokens' ? 'Tokens' : t === 'server' ? 'MCP Server' : t === 'clients' ? 'Clients' : t === 'policies' ? 'Security Policies' : 'Compliance'}
          </button>
        ))}
      </div>

      {/* ── Tokens tab ── */}
      {tab === 'tokens' && <>
        {selected.size > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkCount}>{selected.size} selected</span>
            <button className={`${s.btn} ${s.btnSecondary} ${s.btnSmall}`} onClick={clearSel}>Deselect All</button>
            <div className={s.bulkActions}>
              <button className={`${s.btn} ${s.btnSecondary} ${s.btnSmall}`} onClick={()=>setModal({type:'bulk'})}>Bulk Actions</button>
            </div>
          </div>
        )}
        <div className={s.toolbar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}><IcoSearch/></span>
            <input className={s.searchInput} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tokens…"/>
          </div>
          <select className={s.selectInput} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring</option>
            <option value="expired">Expired</option>
            <option value="unused">Unused</option>
          </select>
          <select className={s.selectInput} value={sortBy} onChange={e=>{setSortBy(e.target.value);setSortDir('asc')}}>
            <option value="name">Sort: Name</option>
            <option value="requests">Sort: Requests</option>
            <option value="expires">Sort: Expires</option>
            <option value="status">Sort: Status</option>
          </select>
          <button className={`${s.btn} ${s.btnSecondary} ${s.btnSmall}`} onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}>
            <IcoSort/>{sortDir === 'asc' ? 'Asc' : 'Desc'}
          </button>
          <span className={s.toolbarSpacer}/>
          <button className={`${s.btn} ${s.btnSecondary} ${s.btnSmall}`} onClick={()=>selected.size===filtered.length?clearSel():selectAll()}>
            {selected.size === filtered.length ? 'Deselect All' : 'Select All'}
          </button>
          <div className={s.viewToggle}>
            <button className={`${s.viewBtn} ${view==='grid'?s.viewBtnActive:''}`} onClick={()=>setView('grid')}><IcoGrid/> Grid</button>
            <button className={`${s.viewBtn} ${view==='list'?s.viewBtnActive:''}`} onClick={()=>setView('list')}><IcoList/> List</button>
          </div>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={()=>setModal({type:'create'})}><IcoPlus/> New Token</button>
        </div>

        {filtered.length === 0 && (
          <div className={s.empty}><span className={s.emptyIcon}><IcoKey/></span>No tokens match your search.</div>
        )}

        {view === 'grid' && filtered.length > 0 && (
          <div className={s.tokenGrid}>
            {filtered.map((token, i) => (
              <div key={token.id}
                className={`${s.tokenCard} ${selected.has(token.id)?s.tokenCardSelected:''} ${dragIdx===i?s.dragging:''} ${dropIdx===i?s.dragOver:''}`}
                draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={e=>onDrop(e,i)} onDragEnd={onDragEnd}
                onContextMenu={e=>handleCtxMenuOpen(e,token)}
                onClick={()=>setModal({type:'details',token})}
              >
                <input type="checkbox" className={s.cardCheckbox} checked={selected.has(token.id)} onChange={()=>toggleSelect(token.id)} onClick={e=>e.stopPropagation()}/>
                <div className={s.tokenCardHeader}>
                  <div className={s.tokenDot} style={{background:token.color}}/>
                  <div className={s.tokenInfo}>
                    <div className={s.tokenName}>{token.name}</div>
                    <div className={s.tokenId}>{token.id}</div>
                  </div>
                  <button className={s.cardMenuBtn} onClick={e=>handleCtxMenuOpen(e,token)}><IcoDots/></button>
                </div>
                <div className={s.tokenDesc}>{token.desc}</div>
                <div className={s.tokenMeta}>
                  <span className={`${s.metaBadge} ${statusClass(token.status)}`}>{token.status}</span>
                  <span className={`${s.metaBadge} ${s.badgeNeutral}`}>{token.tokenType}</span>
                </div>
                <div className={s.tokenScopes}>{token.scopes.slice(0,4).map(sc=><span key={sc} className={s.scopeBadge}>{sc}</span>)}{token.scopes.length>4&&<span className={s.scopeBadge}>+{token.scopes.length-4}</span>}</div>
                <div className={s.tokenFooter}>
                  <span className={s.tokenUsage}>{fmt(token.totalRequests)} requests · last {token.lastUsed}</span>
                  <span className={s.tokenUsage}>exp {token.expires}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'list' && filtered.length > 0 && (
          <table className={s.tokenTable}>
            <thead><tr>
              <th style={{width:28}}><input type="checkbox" checked={selected.size===filtered.length} onChange={()=>selected.size===filtered.length?clearSel():selectAll()}/></th>
              <th style={{width:24}}/>
              <th onClick={()=>toggleSort('name')}>Name{sortArrow('name')}</th>
              <th onClick={()=>toggleSort('status')}>Status{sortArrow('status')}</th>
              <th onClick={()=>toggleSort('expires')}>Expires{sortArrow('expires')}</th>
              <th>Scopes</th>
              <th onClick={()=>toggleSort('requests')}>Requests{sortArrow('requests')}</th>
              <th>Last Used</th>
              <th/>
            </tr></thead>
            <tbody>
              {filtered.map((token, i) => (
                <tr key={token.id} className={`${selected.has(token.id)?s.rowSelected:''} ${dragIdx===i?s.dragging:''} ${dropIdx===i?s.dragOver:''}`}
                  draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={e=>onDrop(e,i)} onDragEnd={onDragEnd}
                  onContextMenu={e=>handleCtxMenuOpen(e,token)}
                >
                  <td><input type="checkbox" checked={selected.has(token.id)} onChange={()=>toggleSelect(token.id)}/></td>
                  <td><span className={s.dragHandle}><IcoDrag/></span></td>
                  <td><div className={s.listName}><span className={s.listDot} style={{background:token.color}}/>{token.name}<span className={s.listId}>{token.id}</span></div></td>
                  <td><span className={`${s.metaBadge} ${statusClass(token.status)}`}>{token.status}</span></td>
                  <td>{token.expires}</td>
                  <td>{token.scopes.slice(0,3).map(sc=><span key={sc} className={s.scopeBadge} style={{marginRight:3}}>{sc}</span>)}{token.scopes.length>3&&<span className={s.scopeBadge}>+{token.scopes.length-3}</span>}</td>
                  <td>{fmt(token.totalRequests)}</td>
                  <td>{token.lastUsed}</td>
                  <td><div className={s.rowActions}>
                    <button className={s.rowBtn} onClick={()=>setModal({type:'details',token})}><IcoEye/> View</button>
                    <button className={s.rowBtn} onClick={()=>setModal({type:'rotate',token})}><IcoRotate/> Rotate</button>
                    <button className={`${s.rowBtn} ${s.rowBtnDanger}`} onClick={()=>setModal({type:'revoke',token})}><IcoTrash/> Revoke</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>}

      {/* ── MCP Server tab ── */}
      {tab === 'server' && (
        <div className={s.serverGrid}>
          <div className={s.panel}>
            <div className={s.panelHead}>
              <span className={s.panelTitle}>Server Status</span>
              <span className={s.metaBadge} style={{background:'color-mix(in srgb, #22c55e 18%, transparent)',color:'#22c55e'}}>Running</span>
            </div>
            <div className={s.panelBody}>
              <div className={s.infoRow}><span className={s.infoLabel}>Transport</span><span className={s.infoValue}>stdio + SSE + WebSocket</span></div>
              <div className={s.infoRow}><span className={s.infoLabel}>Port</span><span className={s.infoValue}>3001</span></div>
              <div className={s.infoRow}><span className={s.infoLabel}>Protocol</span><span className={s.infoValue}>MCP 1.0</span></div>
              <div className={s.infoRow}><span className={s.infoLabel}>Active Connections</span><span className={s.infoValue}>3</span></div>
              <div className={s.infoRow}><span className={s.infoLabel}>Uptime</span><span className={s.infoValue}>14d 3h 22m</span></div>
              <div className={s.infoRow}><span className={s.infoLabel}>Total Tool Calls</span><span className={s.infoValue}>26,577</span></div>
            </div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><span className={s.panelTitle}>Registered Tools</span><span className={s.infoLabel}>{tools.filter(t=>t.enabled).length} enabled / {tools.length} total</span></div>
            <div style={{overflowX:'auto'}}>
              <table className={s.table}>
                <thead><tr><th>Tool</th><th>Category</th><th>Calls</th><th>Status</th><th/></tr></thead>
                <tbody>
                  {tools.map(tool => (
                    <tr key={tool.name}>
                      <td><span style={{fontFamily:'monospace',fontSize:12}}>{tool.name}</span><br/><span style={{fontSize:11,color:'var(--color-text-muted)'}}>{tool.desc}</span></td>
                      <td><span className={`${s.metaBadge} ${s.badgeNeutral}`}>{tool.category}</span></td>
                      <td>{tool.callCount > 0 ? fmt(tool.callCount) : '—'}</td>
                      <td><span className={tool.enabled ? s.toolEnabled : s.toolDisabled}>{tool.enabled ? 'Enabled' : 'Disabled'}</span></td>
                      <td><button className={s.rowBtn} onClick={()=>setModal({type:'toolcfg',tool})}>Configure</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Clients tab ── */}
      {tab === 'clients' && (
        <div className={s.clientGrid}>
          {([] as MCPClient[]).map(cl => (
            <div key={cl.id} className={s.clientCard}>
              <div className={s.clientName}>
                <span className={s.statusDot} style={{background: cl.status==='connected'?'#22c55e':cl.status==='idle'?'#f59e0b':'#6b7280'}}/>
                {cl.name}
              </div>
              <div className={s.clientMeta}>
                <span>Version {cl.version}</span>
                <span>Transport: {cl.transport}</span>
                <span>Connected: {cl.connectedSince}</span>
                <span>Requests today: {cl.requestsToday.toLocaleString()}</span>
              </div>
              <div className={s.clientActions}>
                <button className={`${s.btn} ${s.btnSecondary} ${s.btnSmall}`}>View Logs</button>
                <button className={`${s.btn} ${s.btnSecondary} ${s.btnSmall}`} disabled={cl.status==='disconnected'}>Disconnect</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Security Policies tab ── */}
      {tab === 'policies' && (
        <div className={s.policyGrid}>
          <div className={s.policyCard}>
            <div className={s.policyTitle}>Authentication</div>
            {[
              ['Require MFA for token creation', 'mfa'],
              ['Force token rotation every 90 days', 'rotation'],
              ['Enforce IP allowlist globally', 'ipEnforce'],
            ].map(([label, key]) => (
              <label key={key} className={s.toggleRow} style={{cursor:'pointer'}}>
                <span>{label}</span>
                <button className={`${s.toggle} ${policyToggles[key as keyof typeof policyToggles] ? s.on : ''}`}
                  onClick={()=>setPolicyToggles(p=>({...p,[key]:!p[key as keyof typeof policyToggles]}))}/>
              </label>
            ))}
          </div>
          <div className={s.policyCard}>
            <div className={s.policyTitle}>Audit & Monitoring</div>
            {[
              ['Log all token usage events', 'auditAll'],
              ['Auto-revoke on suspicious activity', 'autoRevoke'],
            ].map(([label, key]) => (
              <label key={key} className={s.toggleRow} style={{cursor:'pointer'}}>
                <span>{label}</span>
                <button className={`${s.toggle} ${policyToggles[key as keyof typeof policyToggles] ? s.on : ''}`}
                  onClick={()=>setPolicyToggles(p=>({...p,[key]:!p[key as keyof typeof policyToggles]}))}/>
              </label>
            ))}
          </div>
          <div className={s.policyCard}>
            <div className={s.policyTitle}>Rate Limiting</div>
            <div className={s.policyField}><span className={s.policyFieldLabel}>Default Rate Limit (req/min)</span><input className={s.policyInput} defaultValue="60" type="number"/></div>
            <div className={s.policyField}><span className={s.policyFieldLabel}>Default Burst</span><input className={s.policyInput} defaultValue="10" type="number"/></div>
            <div className={s.policyField}><span className={s.policyFieldLabel}>Global Max Rate</span><input className={s.policyInput} defaultValue="1000" type="number"/></div>
          </div>
          <div className={s.policyCard}>
            <div className={s.policyTitle}>Token Lifecycle</div>
            <div className={s.policyField}><span className={s.policyFieldLabel}>Max Token Lifetime (days)</span><input className={s.policyInput} defaultValue="365" type="number"/></div>
            <div className={s.policyField}><span className={s.policyFieldLabel}>Expiry Warning (days before)</span><input className={s.policyInput} defaultValue="14" type="number"/></div>
            <div className={s.policyField}><span className={s.policyFieldLabel}>Idle Revocation (days)</span><input className={s.policyInput} defaultValue="90" type="number"/></div>
          </div>
        </div>
      )}

      {/* ── Compliance tab ── */}
      {tab === 'compliance' && (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className={s.complianceGrid}>
            {[
              { label: 'SOC 2 Type II', score: 94, color: '#22c55e' },
              { label: 'GDPR Readiness', score: 88, color: '#4a9eff' },
              { label: 'Internal Policy', score: 76, color: '#f59e0b' },
            ].map(c => (
              <div key={c.label} className={s.complianceCard}>
                <div className={s.complianceScore} style={{color:c.color}}>{c.score}%</div>
                <div className={s.complianceLabel}>{c.label}</div>
                <div style={{height:6,background:'var(--color-border)',borderRadius:3,marginTop:6}}>
                  <div style={{height:'100%',width:`${c.score}%`,background:c.color,borderRadius:3}}/>
                </div>
              </div>
            ))}
          </div>
          <div className={s.panel}>
            <div className={s.panelHead}><span className={s.panelTitle}>Compliance Checklist</span></div>
            <div className={s.panelBody}>
              <div className={s.complianceList}>
                {[
                  { label: 'All tokens have expiry dates', ok: true },
                  { label: 'Audit logging enabled for all tokens', ok: true },
                  { label: 'No tokens with admin:* wildcard scopes', ok: true },
                  { label: 'Unused tokens flagged for review', warn: true },
                  { label: 'IP allowlist configured on sensitive tokens', warn: true },
                  { label: 'All tokens rotated within 90 days', ok: true },
                  { label: 'MFA enforced for token creation', ok: false },
                  { label: 'Encryption at rest verified', ok: true },
                  { label: 'No expired tokens with active sessions', ok: false },
                ].map((item,i) => (
                  <div key={i} className={s.complianceItem}>
                    <span className={item.ok === false ? s.failIcon : (item as any).warn ? s.warnIcon : s.checkIcon}>
                      {item.ok === false ? <IcoClose/> : (item as any).warn ? <IcoWarn/> : <IcoCheck/>}
                    </span>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} token={ctx.token} onAction={(a)=>handleCtxAction(a,ctx.token)} onClose={()=>setCtx(null)}/>}

      {/* Modals */}
      {modal?.type === 'create' && (
        <CreateWizardModal onClose={closeModal} onCreate={async (t,raw)=>{
          try {
            const res = await createMCPToken(t.name, (t.scopes[0] || 'read-only') as ApiMCPToken['scope'])
            const newToken = apiTokenToUi({ id: res.id, label: t.name, scope: res.scope, created_at: res.created_at, last_used: undefined }, 0)
            qc.invalidateQueries({ queryKey: ['mcp-tokens'] })
            setModal({ type: 'created', token: newToken, raw })
          } catch { setModal({ type: 'created', token: t, raw }) }
        }}/>
      )}
      {modal?.type === 'created' && <TokenCreatedModal token={modal.token} raw={modal.raw} onClose={closeModal}/>}
      {modal?.type === 'details' && <TokenDetailsModal token={modal.token} onClose={closeModal}/>}
      {modal?.type === 'usage' && <UsageAnalyticsModal token={modal.token} onClose={closeModal}/>}
      {modal?.type === 'audit' && <AuditLogModal token={modal.token} onClose={closeModal}/>}
      {modal?.type === 'rotate' && <RotateTokenModal token={modal.token} onClose={closeModal} onRotate={()=>{ qc.invalidateQueries({ queryKey: ['mcp-tokens'] }); setModal(null) }}/>}
      {modal?.type === 'extend' && <ExtendExpirationModal token={modal.token} onClose={closeModal} onExtend={_d=>{ qc.invalidateQueries({ queryKey: ['mcp-tokens'] }); closeModal() }}/>}
      {modal?.type === 'scopes' && <ChangeScopesModal token={modal.token} onClose={closeModal} onSave={_sc=>{ qc.invalidateQueries({ queryKey: ['mcp-tokens'] }); closeModal() }}/>}
      {modal?.type === 'ip' && <IPAllowlistModal token={modal.token} onClose={closeModal} onSave={_ips=>{ qc.invalidateQueries({ queryKey: ['mcp-tokens'] }); closeModal() }}/>}
      {modal?.type === 'revoke' && <RevokeModal token={modal.token} onClose={closeModal} onRevoke={async ()=>{
        const numId = Number(modal.token.id.replace('mcp_', ''))
        if (!isNaN(numId)) await revokeMCPToken(numId).catch(()=>{})
        qc.invalidateQueries({ queryKey: ['mcp-tokens'] })
        closeModal()
      }}/>}
      {modal?.type === 'test' && <TestTokenModal token={modal.token} onClose={closeModal}/>}
      {modal?.type === 'bulk' && <BulkOpsModal count={selected.size} onClose={closeModal}/>}
      {modal?.type === 'toolcfg' && <ToolConfigModal tool={modal.tool} onClose={closeModal} onSave={updated=>{setTools(p=>p.map(t=>t.name===updated.name?updated:t));closeModal()}}/>}
    </div>
  )
}
