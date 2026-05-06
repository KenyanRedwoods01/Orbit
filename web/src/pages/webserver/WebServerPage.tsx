import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import styles from './WebServerPage.module.css'
import {
  type VirtualHost, type SSLCert, type AccessLogEntry, type SiteLocation, type RewriteRule,
} from './webServerData'
import {
  fetchWebServerSitesExt, fetchWebServerStatus, fetchWebServerPerf, fetchWebServerGlobal,
  fetchWebServerLogs, createWebServerSite, deleteWebServerSite, toggleWebServerSite,
  reloadWebServer, testWebServerConfig, startWebServer, stopWebServer, restartWebServer,
  saveWebServerGlobal,
  fetchCerts, issueCert, renewCert, selfSignedCert,
  type NginxSiteAPI,
  type AccessLogLineAPI, type CertEntryAPI,
} from '@/lib/api'

// ── Map backend types → frontend types ───────────────────────────────────────

function mapSite(s: NginxSiteAPI): VirtualHost {
  const sslType = (v: string): VirtualHost['ssl'] => {
    if (v === 'letsencrypt') return 'letsencrypt'
    if (v === 'custom') return 'custom'
    if (v === 'self-signed') return 'self-signed'
    return 'none'
  }
  const status = (v: string): VirtualHost['status'] =>
    v === 'active' ? 'active' : v === 'error' ? 'error' : 'disabled'

  return {
    id:             s.name,
    domain:         s.server_name || s.name,
    aliases:        s.aliases ?? [],
    docRoot:        s.root || '',
    status:         status(s.status),
    ssl:            sslType(s.ssl),
    sslExpiry:      null,
    sslDaysLeft:    0,
    phpVersion:     s.php ? '8.2' : 'none',
    traffic24h:     0,
    trafficUnit:    'MB',
    requests24h:    0,
    bandwidth:      '0 MB',
    php:            s.php,
    proxy:          s.proxy || undefined,
    gzip:           s.gzip,
    brotli:         s.brotli,
    hsts:           s.hsts,
    httpRedirect:   s.config.includes('return 301'),
    accessLog:      s.access_log,
    errorLog:       s.error_log,
    created:        '—',
    locations:      inferLocations(s),
    rewrites:       [],
    errorCodes:     {},
    rateLimit:      s.rate_limit,
    rateLimitRate:  '10r/s',
    secHeaders:     s.hsts,
    basicAuth:      s.basic_auth,
    ipWhitelist:    [],
    ipBlacklist:    [],
    workerConnType: s.proxy ? 'proxy' : s.php ? 'php-fpm' : 'static',
    configFile:     s.config_file,
    rawConfig:      s.config,
  }
}

function inferLocations(s: NginxSiteAPI): SiteLocation[] {
  const locs: SiteLocation[] = []
  if (s.proxy) {
    locs.push({ id: 'l1', match: '/', type: 'prefix', handler: 'proxy', detail: `proxy_pass ${s.proxy}` })
  } else if (s.php) {
    locs.push({ id: 'l1', match: '/', type: 'prefix', handler: 'static', detail: 'try_files $uri $uri/ /index.php?$args' })
    locs.push({ id: 'l2', match: '~ \\.php$', type: 'regex', handler: 'php-fpm', detail: 'fastcgi_pass unix:/run/php/php8.2-fpm.sock' })
  } else {
    locs.push({ id: 'l1', match: '/', type: 'prefix', handler: 'static', detail: 'try_files $uri $uri/ =404' })
  }
  return locs
}

function mapCert(c: CertEntryAPI): SSLCert {
  const certStatus = (v: string): SSLCert['status'] => {
    if (v === 'expired') return 'expired'
    if (v === 'expiring_soon') return 'expiring'
    if (v === 'valid') return 'valid'
    return 'none'
  }
  const expiry = c.expires_at ? new Date(c.expires_at * 1000).toISOString().slice(0, 10) : '—'
  const issLower = (c.issuer || '').toLowerCase()
  const sslType: SSLCert['type'] = issLower.includes('self') ? 'self-signed' : issLower.includes('letsencrypt') || issLower.includes('let') ? 'letsencrypt' : 'custom'
  return {
    id:        String(c.id),
    domain:    c.domain,
    issuer:    c.issuer || 'Unknown',
    type:      sslType,
    expiry,
    daysLeft:  c.days_left ?? 0,
    status:    certStatus(c.status),
    keyType:   'RSA 2048',
    autoRenew: c.auto_renew,
    ocsp:      false,
  }
}

function mapLog(l: AccessLogLineAPI): AccessLogEntry {
  return { id: l.id, ts: l.ts, ip: l.ip, method: l.method, path: l.path, status: l.status, bytes: l.bytes, referer: '—', ua: l.ua }
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IcoNginx = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <polygon points="12,2 2,7.5 2,16.5 12,22 22,16.5 22,7.5" fill="#009639"/>
    <text x="7" y="15" fontSize="7" fill="#fff" fontWeight="900" fontFamily="Arial,sans-serif">N</text>
  </svg>
)
const IcoLE = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#003A70"/>
    <path d="M8 7h8l-1.5 3H10l-1 3h4.5l-1.5 3H6" stroke="#00A3E0" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IcoGlobe    = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1.5C8 1.5 5.5 4.5 5.5 8s2.5 6.5 2.5 6.5M8 1.5C8 1.5 10.5 4.5 10.5 8S8 14.5 8 14.5M1.5 8h13" stroke="currentColor" strokeWidth="1.2"/></svg>
const IcoPlus     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
const IcoSearch   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcoEdit     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.1" fill="none"/></svg>
const IcoTrash    = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M4 3V2h4v1M5 5v4M7 5v4M3 3l.5 7h5L9 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
const IcoChevDown = () => <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoSort     = () => <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v6M2 5l3-3 3 3M2 7l3 3 3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoList     = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="2" height="2" rx="0.5" fill="currentColor"/><rect x="1" y="6" width="2" height="2" rx="0.5" fill="currentColor"/><rect x="1" y="10" width="2" height="2" rx="0.5" fill="currentColor"/><path d="M5 3h8M5 7h8M5 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const IcoGrid     = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/></svg>
const IcoX        = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
const IcoLock     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5V4a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="8" r="1" fill="currentColor"/></svg>
const IcoUnlock   = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5V4a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.2"/></svg>
const IcoRefresh  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 1 1 1 3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M2 11V7H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoPlay     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2l7 4-7 4V2Z" fill="currentColor"/></svg>
const IcoStop     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1.2" fill="currentColor"/></svg>
const IcoCheck    = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoWarn     = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L1 12.5h12L7 1.5Z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M7 6v3M7 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcoLog      = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h4M5 7.5h4M5 10h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
const IcoChart    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 10l3-3 2 2 4-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoSettings = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.5 2.5l1 1M10.5 10.5l1 1M10.5 2.5l-1 1M3.5 10.5l-1 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
const IcoServer   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="8" width="10" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><circle cx="10" cy="4" r="0.8" fill="currentColor"/><circle cx="10" cy="10" r="0.8" fill="currentColor"/></svg>
const IcoCopy     = () => <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M2 9V2h7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoError    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4v4M7 9.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcoPower    = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v4M3.5 3.5A4 4 0 1 0 8.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>

// ── Helpers ───────────────────────────────────────────────────────────────────
function sslLabel(t: VirtualHost['ssl']) {
  return t === 'letsencrypt' ? "Let's Encrypt" : t === 'custom' ? 'Custom' : t === 'self-signed' ? 'Self-signed' : 'None'
}
function sslClass(t: VirtualHost['ssl']) {
  return t === 'letsencrypt' ? styles.sslLE : t === 'custom' ? styles.sslCustom : t === 'self-signed' ? styles.sslSelf : styles.sslNone
}
function sslIcon(t: VirtualHost['ssl']) {
  return t === 'letsencrypt' ? <IcoLE /> : t === 'custom' || t === 'self-signed' ? <IcoLock /> : <IcoUnlock />
}
function statusColor(s: VirtualHost['status']) {
  return s === 'active' ? '#22c55e' : s === 'disabled' ? '#6b7280' : '#ff4d4d'
}
function httpCodeClass(c: number) {
  if (c < 300) return styles.code2xx; if (c < 400) return styles.code3xx; if (c < 500) return styles.code4xx; return styles.code5xx
}
function methodClass(m: string) {
  return m === 'GET' ? styles.methodGet : m === 'POST' ? styles.methodPost : m === 'DELETE' ? styles.methodDelete : m === 'PUT' ? styles.methodPut : styles.methodOther
}
function certStatusClass(s: SSLCert['status']) {
  return s === 'valid' ? styles.certValid : s === 'expiring' ? styles.certExpiring : s === 'expired' ? styles.certExpired : styles.certNone
}
function daysBarColor(d: number) {
  if (d < 0) return '#ff4d4d'; if (d < 30) return '#f6ad55'; return '#22c55e'
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b}B`; if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`; return `${(b / 1024 / 1024).toFixed(2)}MB`
}
function siteAccentColor(s: VirtualHost) {
  if (s.status === 'error') return '#ff4d4d'
  if (s.status === 'disabled') return '#6b7280'
  if (s.ssl === 'letsencrypt') return 'var(--color-accent)'
  if (s.ssl === 'custom') return '#a78bfa'
  return '#22c55e'
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`${styles.toggleSwitch} ${on ? styles.toggleSwitchOn : styles.toggleSwitchOff}`} onClick={() => onChange(!on)}>
      <span className={`${styles.toggleSwitchThumb} ${on ? styles.toggleThumbOn : styles.toggleThumbOff}`} />
    </button>
  )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${styles.modal} ${wide ? styles.modalWide : ''}`}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>{title}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Site Detail Modal ─────────────────────────────────────────────────────────
const DETAIL_TABS = ['General', 'Locations', 'SSL / TLS', 'Performance', 'Security', 'Rewrites', 'Error Pages', 'Logs'] as const
type DetailTab = typeof DETAIL_TABS[number]

function SiteDetailModal({ site, logs, onClose, onEdit, onDelete, onToggle }: {
  site: VirtualHost; logs: AccessLogEntry[]; onClose: () => void
  onEdit: (s: VirtualHost) => void; onDelete: (s: VirtualHost) => void; onToggle: (s: VirtualHost) => void
}) {
  const [tab, setTab] = useState<DetailTab>('General')
  const secHeadersList = [
    { name: 'X-Frame-Options',           val: 'SAMEORIGIN',                          on: true },
    { name: 'X-Content-Type-Options',    val: 'nosniff',                             on: true },
    { name: 'X-XSS-Protection',          val: '1; mode=block',                       on: true },
    { name: 'Referrer-Policy',           val: 'strict-origin-when-cross-origin',     on: true },
    { name: 'Permissions-Policy',        val: 'geolocation=(), microphone=()',       on: site.secHeaders },
    { name: 'Content-Security-Policy',   val: "default-src 'self'",                  on: false },
    { name: 'Strict-Transport-Security', val: 'max-age=31536000; includeSubDomains', on: site.hsts },
  ]
  const siteLogs = logs.filter(l => l.path.length > 0).slice(0, 6)

  return (
    <Modal title={site.domain} wide onClose={onClose}>
      <div className={styles.modalTabs}>
        {DETAIL_TABS.map(t => (
          <button key={t} className={`${styles.modalTab} ${tab === t ? styles.modalTabActive : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className={styles.modalBody}>
        {tab === 'General' && (
          <>
            <div className={styles.detailGrid}>
              {([
                ['Domain',        site.domain],
                ['Aliases',       site.aliases.length ? site.aliases.join(', ') : '—'],
                ['Document Root', site.docRoot || '—'],
                ['Status',        site.status],
                ['PHP',           site.php ? 'Enabled' : 'Disabled'],
                ['Proxy Backend', site.proxy ?? '—'],
                ['Access Log',    site.accessLog || '—'],
                ['Error Log',     site.errorLog || '—'],
                ['Config File',   site.configFile || '—'],
              ] as [string,string][]).map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className={styles.detailKey}>{k}</span>
                  <span className={styles.detailVal}>{v}</span>
                </React.Fragment>
              ))}
            </div>
            {site.rawConfig && (
              <div>
                <div className={styles.cmdLabel}>Nginx Config</div>
                <div className={styles.configBlock} style={{ maxHeight: 200, overflowY: 'auto', fontSize: 10.5 }}>{site.rawConfig}</div>
              </div>
            )}
          </>
        )}
        {tab === 'Locations' && (
          <>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 6 }}>URL routing rules for this virtual host</div>
            {site.locations.map((loc: SiteLocation) => (
              <div key={loc.id} className={styles.locRow}>
                <span className={styles.locMatch}>{loc.match}</span>
                <span className={styles.locType}>{loc.type}</span>
                <span className={`${styles.locHandler} ${loc.handler === 'static' ? styles.handlerStatic : loc.handler === 'proxy' ? styles.handlerProxy : loc.handler === 'php-fpm' ? styles.handlerPhp : styles.handlerRedirect}`}>
                  {loc.handler}
                </span>
                <span className={styles.locDetail}>{loc.detail}</span>
              </div>
            ))}
          </>
        )}
        {tab === 'SSL / TLS' && (
          <>
            {site.ssl !== 'none' ? (
              <div className={styles.detailGrid}>
                {([
                  ['Certificate', sslLabel(site.ssl)],
                  ['Domains',     [site.domain, ...site.aliases].join(', ')],
                  ['HSTS',        site.hsts ? 'max-age=31536000; includeSubDomains' : 'Disabled'],
                  ['TLS Protocols', 'TLSv1.2, TLSv1.3'],
                ] as [string,string][]).map(([k,v]) => (
                  <React.Fragment key={k}>
                    <span className={styles.detailKey}>{k}</span>
                    <span className={styles.detailVal}>{v}</span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className={styles.confirmBanner}><IcoWarn />No SSL certificate configured for this site.</div>
            )}
          </>
        )}
        {tab === 'Performance' && (
          <>
            <div className={styles.toggleRow}>
              <div><div className={styles.toggleLabel}>Gzip Compression</div><div className={styles.toggleSub}>text/html, css, js, json — level 6</div></div>
              <Toggle on={site.gzip} onChange={() => {}} />
            </div>
            <div className={styles.toggleRow}>
              <div><div className={styles.toggleLabel}>Brotli Compression</div><div className={styles.toggleSub}>Better ratio than gzip — quality 11</div></div>
              <Toggle on={site.brotli} onChange={() => {}} />
            </div>
            <div className={styles.detailGrid} style={{ marginTop: 8 }}>
              {([
                ['Proxy',           site.proxy || '—'],
                ['Worker Type',     site.workerConnType],
              ] as [string,string][]).map(([k,v]) => (
                <React.Fragment key={k}>
                  <span className={styles.detailKey}>{k}</span>
                  <span className={styles.detailVal}>{v}</span>
                </React.Fragment>
              ))}
            </div>
          </>
        )}
        {tab === 'Security' && (
          <>
            <div className={styles.sectionTitle} style={{ marginBottom: 6 }}>Security Headers</div>
            {secHeadersList.map(h => (
              <div key={h.name} className={styles.secHeaderRow}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: h.on ? 'rgba(34,197,94,0.2)' : 'var(--color-surface-raised)', border: `1px solid ${h.on ? 'rgba(34,197,94,0.4)' : 'var(--color-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {h.on && <IcoCheck />}
                </div>
                <span className={styles.secHeaderName}>{h.name}</span>
                <span className={styles.secHeaderVal}>{h.val}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Rate Limiting</div><div className={styles.toggleSub}>{site.rateLimit ? site.rateLimitRate + ' burst 20' : 'Disabled'}</div></div>
                <Toggle on={site.rateLimit} onChange={() => {}} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Basic Authentication</div><div className={styles.toggleSub}>Protect site with username/password</div></div>
                <Toggle on={site.basicAuth} onChange={() => {}} />
              </div>
            </div>
          </>
        )}
        {tab === 'Rewrites' && (
          <>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 6 }}>URL rewrite and redirect rules</div>
            {site.rewrites.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: '20px 0' }}>No rewrite rules configured</div>
            ) : site.rewrites.map((rw: RewriteRule) => (
              <div key={rw.id} className={styles.locRow}>
                <span className={styles.locMatch} style={{ minWidth: 140 }}>{rw.from}</span>
                <span style={{ color: 'var(--color-text-dim)' }}>→</span>
                <span className={styles.locDetail}>{rw.to}</span>
                <span className={`${styles.locHandler} ${rw.type === 'permanent' ? styles.handlerRedirect : styles.handlerStatic}`}>{rw.flags}</span>
              </div>
            ))}
          </>
        )}
        {tab === 'Error Pages' && (
          <>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 8 }}>Custom HTML pages for HTTP error codes</div>
            {Object.keys(site.errorCodes).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: '20px 0' }}>Using default nginx error pages</div>
            ) : (
              <div className={styles.detailGrid}>
                {Object.entries(site.errorCodes).map(([code, path]) => (
                  <React.Fragment key={code}>
                    <span className={styles.detailKey}>
                      <span className={`${styles.statusCode} ${httpCodeClass(parseInt(code))}`}>{code}</span>
                    </span>
                    <span className={styles.detailVal}>{path}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </>
        )}
        {tab === 'Logs' && (
          <>
            <div className={styles.detailGrid} style={{ marginBottom: 8 }}>
              {([
                ['Access Log', site.accessLog || '—'],
                ['Error Log',  site.errorLog  || '—'],
                ['Log Format', 'combined'],
              ] as [string,string][]).map(([k,v]) => (
                <React.Fragment key={k}>
                  <span className={styles.detailKey}>{k}</span>
                  <span className={styles.detailVal}>{v}</span>
                </React.Fragment>
              ))}
            </div>
            <div>
              <div className={styles.cmdLabel} style={{ marginBottom: 5 }}>Recent Access Log</div>
              <div className={styles.configBlock} style={{ fontSize: 10.5 }}>
                {siteLogs.length > 0
                  ? siteLogs.map(l => `${l.ts} ${l.ip} "${l.method} ${l.path}" ${l.status} ${l.bytes}`).join('\n')
                  : 'No log entries available'}
              </div>
            </div>
          </>
        )}
      </div>
      <div className={styles.modalFoot}>
        <button className={`${styles.formBtn} ${styles.formBtnDanger}`} onClick={() => onDelete(site)}><IcoTrash />Delete Site</button>
        <button className={styles.formBtn} onClick={() => onToggle(site)}>
          {site.status === 'active' ? <><IcoStop />Disable</> : <><IcoPlay />Enable</>}
        </button>
        <button className={styles.formBtn} onClick={onClose}>Close</button>
        <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => onEdit(site)}><IcoEdit />Edit Config</button>
      </div>
    </Modal>
  )
}

// ── Edit Config Modal ─────────────────────────────────────────────────────────
function EditConfigModal({ site, onClose, onSave }: {
  site: VirtualHost; onClose: () => void; onSave: (name: string, config: string) => void
}) {
  const [config, setConfig] = useState(site.rawConfig || '')
  return (
    <Modal title={`Edit Config — ${site.domain}`} wide onClose={onClose}>
      <div className={styles.modalBody}>
        <div className={styles.cmdLabel} style={{ marginBottom: 6 }}>{site.configFile}</div>
        <textarea
          style={{ width: '100%', minHeight: 360, fontFamily: 'monospace', fontSize: 11.5, padding: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', resize: 'vertical', outline: 'none' }}
          value={config}
          onChange={e => setConfig(e.target.value)}
        />
      </div>
      <div className={styles.modalFoot}>
        <button className={styles.formBtn} onClick={onClose}>Cancel</button>
        <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => { onSave(site.id, config); onClose() }}><IcoCheck />Save Config</button>
      </div>
    </Modal>
  )
}

// ── Add Site Modal ────────────────────────────────────────────────────────────
const WIZARD_STEPS = ['Basic', 'SSL/TLS', 'Features', 'Advanced'] as const
type WizardStep = typeof WIZARD_STEPS[number]

function AddSiteModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Record<string, unknown>) => void }) {
  const [step, setStep] = useState<WizardStep>('Basic')
  const [form, setForm] = useState({
    domain: '', aliases: '', docRoot: '/var/www/',
    php: true, phpVersion: '8.2',
    ssl: 'letsencrypt', hsts: true, httpRedirect: true,
    gzip: true, brotli: false, proxy: '', enableProxy: false,
    rateLimit: false, rateLimitRate: '10r/s', secHeaders: true, basicAuth: false,
    ipWhitelist: '', ipBlacklist: '',
  })
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const stepIdx = WIZARD_STEPS.indexOf(step)

  const ngxPreview = `server {
    listen 80;${form.httpRedirect ? `
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;` : ''}
    server_name ${form.domain || 'example.com'}${form.aliases ? ' ' + form.aliases : ''};
    root ${form.docRoot || '/var/www/example.com'};
    index index.html index.htm index.php;${form.ssl === 'letsencrypt' ? `
    ssl_certificate /etc/letsencrypt/live/${form.domain || 'example.com'}/fullchain.pem;` : ''}${form.gzip ? `
    gzip on;` : ''}
}`

  return (
    <Modal title="Add Virtual Host" wide onClose={onClose}>
      <div className={styles.modalTabs}>
        {WIZARD_STEPS.map((s, i) => (
          <button key={s} className={`${styles.modalTab} ${step === s ? styles.modalTabActive : ''}`} onClick={() => setStep(s)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: i <= stepIdx ? 'var(--color-accent)' : 'var(--color-surface-raised)', color: i <= stepIdx ? '#fff' : 'var(--color-text-dim)', fontSize: 9, fontWeight: 700, marginRight: 5 }}>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className={styles.modalBody}>
        {step === 'Basic' && (
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>Domain Name</div>
              <input className={styles.fieldInput} placeholder="example.com" value={form.domain} onChange={e => set('domain', e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>Aliases (comma-separated)</div>
              <input className={styles.fieldInput} placeholder="www.example.com" value={form.aliases} onChange={e => set('aliases', e.target.value)} />
            </div>
            <div className={`${styles.fieldGroup} ${styles.formFull}`}>
              <div className={styles.fieldLabel}>Document Root</div>
              <input className={styles.fieldInput} placeholder="/var/www/example.com/html" value={form.docRoot} onChange={e => set('docRoot', e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>PHP Version</div>
              <select className={styles.fieldSelect} value={form.phpVersion} onChange={e => set('phpVersion', e.target.value)}>
                <option value="none">No PHP (static only)</option>
                <option value="8.3">PHP 8.3</option>
                <option value="8.2">PHP 8.2</option>
                <option value="8.1">PHP 8.1</option>
                <option value="8.0">PHP 8.0</option>
                <option value="7.4">PHP 7.4</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>Web Server User</div>
              <input className={styles.fieldInput} defaultValue="www-data" />
            </div>
          </div>
        )}
        {step === 'SSL/TLS' && (
          <div className={styles.formGrid}>
            <div className={`${styles.fieldGroup} ${styles.formFull}`}>
              <div className={styles.fieldLabel}>SSL Mode</div>
              <select className={styles.fieldSelect} value={form.ssl} onChange={e => set('ssl', e.target.value)}>
                <option value="letsencrypt">Auto HTTPS — Let's Encrypt</option>
                <option value="custom">Custom Certificate</option>
                <option value="self-signed">Self-signed</option>
                <option value="none">HTTP Only (no SSL)</option>
              </select>
            </div>
            <div className={`${styles.formFull}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Force HTTPS Redirect</div><div className={styles.toggleSub}>301 redirect from HTTP to HTTPS</div></div>
                <Toggle on={form.httpRedirect} onChange={v => set('httpRedirect', v)} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>HSTS (HTTP Strict Transport Security)</div><div className={styles.toggleSub}>max-age=31536000; includeSubDomains</div></div>
                <Toggle on={form.hsts} onChange={v => set('hsts', v)} />
              </div>
            </div>
          </div>
        )}
        {step === 'Features' && (
          <div className={styles.formGrid}>
            <div className={`${styles.formFull}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Gzip Compression</div><div className={styles.toggleSub}>text/html, css, js, json — level 6 — saves 60-70% bandwidth</div></div>
                <Toggle on={form.gzip} onChange={v => set('gzip', v)} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Brotli Compression</div><div className={styles.toggleSub}>Better than gzip — quality 11</div></div>
                <Toggle on={form.brotli} onChange={v => set('brotli', v)} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Reverse Proxy</div><div className={styles.toggleSub}>Forward requests to backend server</div></div>
                <Toggle on={form.enableProxy} onChange={v => set('enableProxy', v)} />
              </div>
            </div>
            {form.enableProxy && (
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabel}>Backend URL</div>
                <input className={styles.fieldInput} placeholder="http://localhost:3000" value={form.proxy} onChange={e => set('proxy', e.target.value)} />
              </div>
            )}
          </div>
        )}
        {step === 'Advanced' && (
          <div className={styles.formGrid}>
            <div className={`${styles.formFull}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Security Headers</div><div className={styles.toggleSub}>X-Frame-Options, CSP, XSS-Protection, Referrer-Policy</div></div>
                <Toggle on={form.secHeaders} onChange={v => set('secHeaders', v)} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Rate Limiting</div><div className={styles.toggleSub}>{form.rateLimitRate} burst 20 (per IP)</div></div>
                <Toggle on={form.rateLimit} onChange={v => set('rateLimit', v)} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Basic Authentication</div><div className={styles.toggleSub}>Protect with username/password</div></div>
                <Toggle on={form.basicAuth} onChange={v => set('basicAuth', v)} />
              </div>
            </div>
            <div className={`${styles.fieldGroup} ${styles.formFull}`}>
              <div className={styles.cmdLabel}>Generated Config Preview</div>
              <div className={styles.configBlock}>{ngxPreview}</div>
            </div>
          </div>
        )}
      </div>
      <div className={styles.modalFoot}>
        <button className={styles.formBtn} onClick={onClose}>Cancel</button>
        {stepIdx > 0 && <button className={styles.formBtn} onClick={() => setStep(WIZARD_STEPS[stepIdx - 1])}>Back</button>}
        {stepIdx < WIZARD_STEPS.length - 1 && (
          <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={() => setStep(WIZARD_STEPS[stepIdx + 1])}>Next</button>
        )}
        {stepIdx === WIZARD_STEPS.length - 1 && (
          <button className={`${styles.formBtn} ${styles.formBtnSuccess}`} onClick={() => {
            onSave({
              domain:          form.domain,
              aliases:         form.aliases,
              doc_root:        form.docRoot,
              php:             form.php,
              php_version:     form.phpVersion,
              ssl:             form.ssl,
              hsts:            form.hsts,
              http_redirect:   form.httpRedirect,
              gzip:            form.gzip,
              proxy:           form.enableProxy ? form.proxy : '',
              rate_limit:      form.rateLimit,
              rate_limit_rate: form.rateLimitRate,
              sec_headers:     form.secHeaders,
            })
            onClose()
          }}>
            <IcoCheck />Create Virtual Host
          </button>
        )}
      </div>
    </Modal>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ site, onClose, onConfirm }: { site: VirtualHost; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Delete Virtual Host" onClose={onClose}>
      <div className={styles.modalBody}>
        <div className={styles.confirmBanner}>
          <IcoWarn />
          <span>This will permanently delete <strong>{site.domain}</strong> and its configuration file.</span>
        </div>
        <div className={styles.detailGrid}>
          {([['Domain', site.domain], ['Config File', site.configFile || '—'], ['SSL', sslLabel(site.ssl)]] as [string,string][]).map(([k,v]) => (
            <React.Fragment key={k}>
              <span className={styles.detailKey}>{k}</span>
              <span className={styles.detailVal}>{v}</span>
            </React.Fragment>
          ))}
        </div>
        <div>
          <div className={styles.cmdLabel}>Equivalent Commands</div>
          <div className={styles.configBlock}>{`unlink /etc/nginx/sites-enabled/${site.domain}
rm /etc/nginx/sites-available/${site.domain}
nginx -s reload`}</div>
        </div>
      </div>
      <div className={styles.modalFoot}>
        <button className={styles.formBtn} onClick={onClose}>Cancel</button>
        <button className={`${styles.formBtn} ${styles.formBtnDanger}`} onClick={onConfirm}><IcoTrash />Delete Virtual Host</button>
      </div>
    </Modal>
  )
}

// ── SSL Cert detail modal ─────────────────────────────────────────────────────
function CertDetailModal({ cert, onClose, onRenew }: { cert: SSLCert; onClose: () => void; onRenew?: (domain: string) => void }) {
  const [copied, setCopied] = useState(false)
  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Modal title={`Certificate — ${cert.domain}`} onClose={onClose}>
      <div className={styles.modalBody}>
        <div className={styles.detailGrid}>
          {([
            ['Domain',     cert.domain],
            ['Issuer',     cert.issuer],
            ['Type',       cert.type],
            ['Key Type',   cert.keyType],
            ['Expires',    cert.expiry],
            ['Days Left',  cert.daysLeft > 0 ? `${cert.daysLeft} days` : `Expired ${Math.abs(cert.daysLeft)} days ago`],
            ['Status',     cert.status],
            ['Auto-Renew', cert.autoRenew ? 'Enabled (30 days before expiry)' : 'Disabled'],
          ] as [string,string][]).map(([k,v]) => (
            <React.Fragment key={k}>
              <span className={styles.detailKey}>{k}</span>
              <span className={styles.detailVal}>{v}</span>
            </React.Fragment>
          ))}
        </div>
        <div>
          <div className={styles.cmdLabel}>Renewal Command</div>
          <div className={styles.configBlock}>{`certbot renew --nginx -d ${cert.domain}`}</div>
        </div>
      </div>
      <div className={styles.modalFoot}>
        <button className={styles.formBtn} onClick={() => copy(`certbot renew --nginx -d ${cert.domain}`)}><IcoCopy />{copied ? 'Copied!' : 'Copy Command'}</button>
        <button className={styles.formBtn} onClick={onClose}>Close</button>
        {onRenew && <button className={`${styles.formBtn} ${styles.formBtnSuccess}`} onClick={() => { onRenew(cert.domain); onClose() }}><IcoRefresh />Renew Now</button>}
      </div>
    </Modal>
  )
}

// ── Request / Add Cert Modal ──────────────────────────────────────────────────
type CertMode = 'letsencrypt' | 'self-signed'

function RequestCertModal({ onClose, onResult }: { onClose: () => void; onResult: (r: { ok: boolean; output: string }) => void }) {
  const [mode, setMode] = useState<CertMode>('letsencrypt')
  const [domain, setDomain] = useState('')
  const [email, setEmail] = useState('')
  const [sans, setSans] = useState('')
  const [autoRenew, setAutoRenew] = useState(true)
  const [staging, setStaging] = useState(false)
  const [days, setDays] = useState('365')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!domain.trim()) { setErr('Domain is required'); return }
    if (mode === 'letsencrypt' && !email.trim()) { setErr('Email is required for Let\'s Encrypt'); return }
    setErr(''); setBusy(true)
    try {
      if (mode === 'letsencrypt') {
        const sanList = sans.split(',').map(s => s.trim()).filter(Boolean)
        const r = await issueCert({ domain: domain.trim(), sans: sanList, email: email.trim(), auto_renew: autoRenew, staging })
        onResult({ ok: r.ok, output: r.output })
      } else {
        const r = await selfSignedCert({ domain: domain.trim(), days: parseInt(days) || 365 })
        onResult({ ok: r.ok, output: r.ok ? `Self-signed cert created for ${r.domain}` : 'Failed' })
      }
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Request SSL Certificate" onClose={onClose}>
      <div className={styles.modalBody}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['letsencrypt', 'self-signed'] as CertMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${mode === m ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: mode === m ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                color: mode === m ? 'var(--color-accent)' : 'var(--color-text-dim)',
              }}
            >
              {m === 'letsencrypt' ? "Let's Encrypt" : 'Self-Signed'}
            </button>
          ))}
        </div>
        <div className={styles.formGrid}>
          <div className={`${styles.fieldGroup} ${styles.formFull}`}>
            <div className={styles.fieldLabel}>Domain</div>
            <input className={styles.fieldInput} placeholder="example.com" value={domain} onChange={e => setDomain(e.target.value)} autoFocus />
          </div>
          {mode === 'letsencrypt' && (
            <>
              <div className={`${styles.fieldGroup} ${styles.formFull}`}>
                <div className={styles.fieldLabel}>Email (for Let's Encrypt account)</div>
                <input className={styles.fieldInput} placeholder="admin@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className={`${styles.fieldGroup} ${styles.formFull}`}>
                <div className={styles.fieldLabel}>SANs / Aliases (comma-separated, optional)</div>
                <input className={styles.fieldInput} placeholder="www.example.com, sub.example.com" value={sans} onChange={e => setSans(e.target.value)} />
              </div>
              <div className={styles.toggleRow} style={{ padding: 0 }}>
                <div><div className={styles.toggleLabel}>Auto-Renew</div><div className={styles.toggleSub}>Renew automatically 30 days before expiry</div></div>
                <Toggle on={autoRenew} onChange={setAutoRenew} />
              </div>
              <div className={styles.toggleRow} style={{ padding: 0 }}>
                <div><div className={styles.toggleLabel}>Staging Mode</div><div className={styles.toggleSub}>Use Let's Encrypt staging server for testing (no rate limits)</div></div>
                <Toggle on={staging} onChange={setStaging} />
              </div>
            </>
          )}
          {mode === 'self-signed' && (
            <div className={`${styles.fieldGroup} ${styles.formFull}`}>
              <div className={styles.fieldLabel}>Validity (days)</div>
              <input className={styles.fieldInput} type="number" min="1" max="3650" value={days} onChange={e => setDays(e.target.value)} />
            </div>
          )}
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: '#ff4d4d', fontWeight: 500 }}>{err}</div>}
        {mode === 'letsencrypt' && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
            Requires certbot to be installed and the domain to point to this server. HTTP port 80 must be accessible.
          </div>
        )}
      </div>
      <div className={styles.modalFoot}>
        <button className={styles.formBtn} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`${styles.formBtn} ${styles.formBtnSuccess}`} onClick={submit} disabled={busy}>
          {busy ? 'Requesting…' : mode === 'letsencrypt' ? 'Issue Certificate' : 'Generate Self-Signed'}
        </button>
      </div>
    </Modal>
  )
}

// ── Command output toast ──────────────────────────────────────────────────────
function CmdResult({ result, onClose }: { result: { ok: boolean; output: string } | null; onClose: () => void }) {
  if (!result) return null
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 2000, background: 'var(--color-bg)', border: `1px solid ${result.ok ? '#22c55e' : '#ff4d4d'}`, borderRadius: 8, padding: '10px 14px', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {result.ok ? <IcoCheck /> : <IcoError />}
        <span style={{ fontWeight: 600, color: result.ok ? '#22c55e' : '#ff4d4d', fontSize: 12 }}>{result.ok ? 'Success' : 'Error'}</span>
        <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)' }} onClick={onClose}><IcoX /></button>
      </div>
      {result.output && <pre style={{ fontSize: 10.5, color: 'var(--color-text-dim)', margin: 0, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{result.output}</pre>}
    </div>
  )
}

// ── Nginx Rolling Performance Chart ──────────────────────────────────────────
type PerfPoint = { t: number; conns: number; reading: number; writing: number; waiting: number }

function NginxRollingChart({ history }: { history: PerfPoint[] }) {
  const W = 800, H = 110, padL = 36, padR = 8, padT = 8, padB = 24
  const iW = W - padL - padR
  const iH = H - padT - padB
  const N  = Math.max(history.length, 1)

  if (history.length < 2) {
    return (
      <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'12px 16px', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.35)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Real-time Connection History</div>
        <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.25)', textAlign:'center', padding:'18px 0' }}>Collecting data… chart appears after the first few data points (auto-refreshes every 15 seconds)</div>
      </div>
    )
  }

  const allVals = history.flatMap(p => [p.conns, p.reading, p.writing, p.waiting])
  const maxVal  = Math.max(1, ...allVals)

  const toX = (i: number) => padL + (i / (N - 1)) * iW
  const toY = (v: number) => padT + iH - (v / maxVal) * iH

  const line = (key: keyof PerfPoint, color: string) => {
    const pts = history.map((p, i) => `${toX(i).toFixed(1)},${toY(p[key] as number).toFixed(1)}`).join(' ')
    return pts.length ? <polyline key={key} points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} /> : null
  }

  const labelStep = Math.max(1, Math.floor(N / 6))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxVal))

  const series = [
    { key: 'conns'   as keyof PerfPoint, color: 'var(--color-accent,#3b82f6)', label: 'Active' },
    { key: 'reading' as keyof PerfPoint, color: '#63b3ed',  label: 'Reading' },
    { key: 'writing' as keyof PerfPoint, color: '#22c55e',  label: 'Writing' },
    { key: 'waiting' as keyof PerfPoint, color: '#a78bfa',  label: 'Waiting' },
  ]

  return (
    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'12px 16px', marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'.05em' }}>Real-time Connection History ({history.length} points)</div>
        <div style={{ display:'flex', gap:14 }}>
          {series.map(s => (
            <div key={s.key} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:18, height:2, background:s.color, borderRadius:1 }} />
              <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.45)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:'block', overflow:'visible' }}>
        {/* Grid lines */}
        {yTicks.map(v => {
          const y = toY(v)
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={padL - 4} y={y + 3.5} textAnchor="end" fill="rgba(255,255,255,0.28)" fontSize={8}>{v}</text>
            </g>
          )
        })}
        {/* X axis labels */}
        {history.filter((_, i) => i % labelStep === 0 || i === history.length - 1).map((p, _) => {
          const origIdx = history.indexOf(p)
          const t = new Date(p.t)
          const label = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`
          return <text key={origIdx} x={toX(origIdx)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize={8}>{label}</text>
        })}
        {/* Area fills */}
        {series.map(s => {
          const pts = history.map((p, i) => ({ x: toX(i), y: toY(p[s.key] as number) }))
          const pathD = `M${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${pts[pts.length-1].x},${padT + iH} L${pts[0].x},${padT + iH} Z`
          return <path key={s.key + '-fill'} d={pathD} fill={s.color} fillOpacity={0.04} />
        })}
        {/* Lines */}
        {series.map(s => line(s.key, s.color))}
        {/* Latest value dots */}
        {series.map(s => {
          const last = history[history.length - 1]
          return <circle key={s.key + '-dot'} cx={toX(history.length - 1)} cy={toY(last[s.key] as number)} r={3} fill={s.color} opacity={0.9} />
        })}
      </svg>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type PageTab = 'sites' | 'ssl' | 'logs' | 'performance' | 'global'

export default function WebServerPage() {
  const qc = useQueryClient()

  // ── Data queries
  const { data: rawSites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ['webserver-sites'],
    queryFn:  fetchWebServerSitesExt,
    refetchInterval: 30000,
  })
  const { data: nginxStatus } = useQuery({
    queryKey: ['webserver-status'],
    queryFn:  fetchWebServerStatus,
    refetchInterval: 15000,
  })
  const { data: nginxPerf } = useQuery({
    queryKey: ['webserver-perf'],
    queryFn:  fetchWebServerPerf,
    refetchInterval: 15000,
  })
  const { data: globalCfg } = useQuery({
    queryKey: ['webserver-global'],
    queryFn:  fetchWebServerGlobal,
    refetchInterval: 60000,
  })
  const { data: rawLogs = [] } = useQuery({
    queryKey: ['webserver-logs'],
    queryFn:  () => fetchWebServerLogs(undefined, 200),
    refetchInterval: 30000,
  })
  const { data: rawCerts = [] } = useQuery({
    queryKey: ['certs'],
    queryFn:  fetchCerts,
    refetchInterval: 60000,
  })

  // ── Map to UI types
  const sites: VirtualHost[] = useMemo(() => rawSites.map(mapSite), [rawSites])
  const certs: SSLCert[]     = useMemo(() => rawCerts.map(mapCert), [rawCerts])
  const logs:  AccessLogEntry[] = useMemo(() => rawLogs.map(mapLog), [rawLogs])

  // ── Mutations
  const mutDelete = useMutation({
    mutationFn: (name: string) => deleteWebServerSite(name),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['webserver-sites'] }); setDeleting(null); setDetail(null) },
  })
  const mutToggle = useMutation({
    mutationFn: (name: string) => toggleWebServerSite(name),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['webserver-sites'] }) },
  })
  const mutCreate = useMutation({
    mutationFn: (d: Parameters<typeof createWebServerSite>[0]) => createWebServerSite(d),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['webserver-sites'] }),
  })
  const mutUpdateConfig = useMutation({
    mutationFn: ({ name, config }: { name: string; config: string }) =>
      fetch(`/api/webserver/sites/${encodeURIComponent(name)}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webserver-sites'] }),
  })
  const mutReload  = useMutation({ mutationFn: reloadWebServer,     onSuccess: (r) => setCmdResult(r) })
  const mutTest    = useMutation({ mutationFn: testWebServerConfig,  onSuccess: (r) => setCmdResult(r) })
  const mutStart   = useMutation({ mutationFn: startWebServer,       onSuccess: (r) => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['webserver-status'] }) } })
  const mutStop    = useMutation({ mutationFn: stopWebServer,        onSuccess: (r) => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['webserver-status'] }) } })
  const mutRestart = useMutation({ mutationFn: restartWebServer,     onSuccess: (r) => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['webserver-status'] }) } })
  const mutSaveGlobal = useMutation({ mutationFn: (raw: string) => saveWebServerGlobal(raw), onSuccess: (r) => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['webserver-global'] }) } })

  // ── Tab / UI state
  const [pageTab,  setPageTab]  = useState<PageTab>('sites')
  const [view,     setView]     = useState<'list'|'grid'>('list')
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'all'|'active'|'disabled'|'error'>('all')
  const [sort,     setSort]     = useState<'domain'|'status'>('domain')
  const [sortDir,  setSortDir]  = useState<'asc'|'desc'>('asc')
  const [logFilter,setLogFilter]= useState<'all'|'2xx'|'3xx'|'4xx'|'5xx'>('all')
  const [globalRaw,setGlobalRaw]= useState<string>('')

  // Cert mutations
  const mutRenewCert = useMutation({
    mutationFn: (domain: string) => renewCert(domain),
    onSuccess: (r) => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['certs'] }) },
  })
  const mutRenewAll = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(certs.map(c => renewCert(c.domain)))
      const failed = results.filter(r => r.status === 'rejected').length
      return { ok: failed === 0, output: `Renewed ${results.length - failed} of ${results.length} certificates.` }
    },
    onSuccess: (r) => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['certs'] }) },
  })

  // Modals
  const [detail,      setDetail]      = useState<VirtualHost|null>(null)
  const [editing,     setEditing]     = useState<VirtualHost|null>(null)
  const [addOpen,     setAddOpen]     = useState(false)
  const [deleting,    setDeleting]    = useState<VirtualHost|null>(null)
  const [certModal,   setCertModal]   = useState<SSLCert|null>(null)
  const [addCertOpen, setAddCertOpen] = useState(false)
  const [cmdResult,   setCmdResult]   = useState<{ ok: boolean; output: string } | null>(null)

  // Sync global config raw text when data loads
  React.useEffect(() => {
    if (globalCfg?.raw && !globalRaw) setGlobalRaw(globalCfg.raw)
  }, [globalCfg])

  // ── Filtered / sorted sites
  const filteredSites = useMemo(() => {
    let list = sites.filter(s => {
      const q = search.toLowerCase()
      const matchQ = !q || s.domain.toLowerCase().includes(q) || s.docRoot.toLowerCase().includes(q)
      const matchF = filter === 'all' || s.status === filter
      return matchQ && matchF
    })
    list = list.slice().sort((a, b) => {
      let cmp = 0
      if (sort === 'domain') cmp = a.domain.localeCompare(b.domain)
      if (sort === 'status') cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [sites, search, filter, sort, sortDir])

  // ── Filtered logs
  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs
    const min = { '2xx': 200, '3xx': 300, '4xx': 400, '5xx': 500 }[logFilter]!
    return logs.filter(l => l.status >= min && l.status < min + 100)
  }, [logs, logFilter])

  const toggleSort = (col: typeof sort) => {
    if (sort === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setSortDir('asc') }
  }

  const activeCount = sites.filter(s => s.status === 'active').length
  const expiring    = certs.filter(c => c.status === 'expiring' || c.status === 'expired').length
  const status      = nginxStatus
  const perf        = nginxPerf

  // ── Rolling perf history for chart ──
  const perfHistory = useRef<PerfPoint[]>([])
  useEffect(() => {
    if (!perf) return
    const point: PerfPoint = { t: Date.now(), conns: perf.active_conns ?? 0, reading: perf.reading ?? 0, writing: perf.writing ?? 0, waiting: perf.waiting ?? 0 }
    perfHistory.current = [...perfHistory.current.slice(-59), point]
  }, [perf])

  const SortTh = ({ col, label }: { col: typeof sort; label: string }) => (
    <th className={`${styles.th} ${styles.thSort} ${sort === col ? styles.thSortActive : ''}`} onClick={() => toggleSort(col)}>
      {label}<span className={styles.thSortIcon}><IcoSort /></span>
    </th>
  )

  // Nginx availability
  const nginxNotInstalled = status && !status.running && !status.version

  return (
    <div className={styles.page}>
      {/* ── Nginx warning banner ── */}
      {nginxNotInstalled && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:10, borderRadius:7, border:'1px solid rgba(246,173,85,0.3)', background:'rgba(246,173,85,0.07)', fontSize:12.5, color:'#f6ad55' }}>
          <IcoWarn />
          <div>
            <strong>Nginx is not installed or not running.</strong>
            {' '}Install Nginx on this server and start the service to enable web server management.
          </div>
        </div>
      )}
      {!nginxNotInstalled && status && !status.running && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', marginBottom:10, borderRadius:7, border:'1px solid rgba(255,77,77,0.25)', background:'rgba(255,77,77,0.07)', fontSize:12.5, color:'#ff8080' }}>
          <IcoError />
          <div>
            <strong>Nginx is stopped.</strong>
            {' '}Use the Start button below to bring it back online.
          </div>
          <button onClick={() => mutStart.mutate()} disabled={mutStart.isPending} style={{ marginLeft:'auto', background:'none', border:'1px solid currentColor', borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', color:'inherit', whiteSpace:'nowrap' }}>
            Start Nginx
          </button>
        </div>
      )}

      {/* ── Status bar ── */}
      <div className={styles.statusBar}>
        <div className={styles.backendChip}>
          <IcoNginx />
          <span style={{ color: '#009639', fontWeight: 700 }}>Nginx</span>
          {status?.version && <span style={{ color: 'var(--color-text-dim)' }}>{status.version}</span>}
        </div>
        {status ? (
          <>
            <span className={`${styles.statusDot} ${status.running ? styles.statusRunning : styles.statusStopped}`} />
            <span className={styles.statusLabel} style={{ color: status.running ? '#22c55e' : '#ff4d4d' }}>
              {status.running ? 'RUNNING' : 'STOPPED'}
            </span>
            {status.pid > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>pid {status.pid}</span>}
            {status.uptime && <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>up {status.uptime}</span>}
            {status.workers > 0 && <div className={styles.workerChip}><IcoServer />{status.workers} workers</div>}
          </>
        ) : (
          <>
            <span className={styles.statusDot} style={{ background: 'var(--color-text-dim)' }} />
            <span className={styles.statusLabel} style={{ color: 'var(--color-text-dim)' }}>Checking…</span>
          </>
        )}
        {perf && perf.active_conns > 0 && <div className={styles.workerChip}><IcoChart />{perf.active_conns} conns</div>}
        <div className={styles.statusBarRight}>
          <button className={styles.statusBtn} disabled={mutStart.isPending}   onClick={() => mutStart.mutate()}><IcoPlay />Start</button>
          <button className={styles.statusBtn} disabled={mutStop.isPending}    onClick={() => mutStop.mutate()}><IcoPower />Stop</button>
          <button className={styles.statusBtn} disabled={mutRestart.isPending} onClick={() => mutRestart.mutate()}><IcoRefresh />Restart</button>
          <button className={styles.statusBtn} disabled={mutReload.isPending}  onClick={() => mutReload.mutate()}><IcoRefresh />Reload</button>
          <button className={`${styles.statusBtn} ${styles.statusBtnPrimary}`} disabled={mutTest.isPending} onClick={() => mutTest.mutate()}><IcoCheck />Test Config</button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {[
          { label: 'Virtual Hosts',  val: sites.length,    sub: `${activeCount} active`,           color: 'rgba(74,158,255,0.12)', icon: <IcoGlobe />,  tc: 'var(--color-accent)' },
          { label: 'Active Conns',   val: perf?.active_conns ?? '—',  sub: perf ? `R:${perf.reading} W:${perf.writing} Idle:${perf.waiting}` : 'stub_status not available', color: 'rgba(167,139,250,0.12)', icon: <IcoServer />, tc: '#a78bfa' },
          { label: 'SSL Certs',      val: certs.length,    sub: expiring ? `${expiring} need attention` : 'All valid', color: expiring ? 'rgba(246,173,85,0.12)' : 'rgba(34,197,94,0.12)', icon: <IcoLock />, tc: expiring ? '#f6ad55' : '#22c55e' },
          { label: 'Log Entries',    val: logs.length,     sub: `${logs.filter(l => l.status >= 500).length} errors`, color: 'rgba(74,158,255,0.12)', icon: <IcoLog />, tc: 'var(--color-accent)' },
          { label: 'Config Status',  val: status?.config_ok ? 'OK' : status ? 'FAIL' : '—', sub: status?.config_ok ? 'nginx -t passed' : 'Run Test Config', color: status?.config_ok ? 'rgba(34,197,94,0.12)' : 'rgba(255,77,77,0.12)', icon: <IcoCheck />, tc: status?.config_ok ? '#22c55e' : '#ff4d4d' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.color }}><span style={{ color: s.tc }}>{s.icon}</span></div>
            <div><div className={styles.statVal} style={{ color: s.tc }}>{s.val}</div><div className={styles.statLbl}>{s.label}</div></div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        <button className={`${styles.tab} ${pageTab === 'sites' ? styles.tabActive : ''}`} onClick={() => setPageTab('sites')}>
          <IcoGlobe />Sites<span className={styles.tabBadge}>{sites.length}</span>
        </button>
        <button className={`${styles.tab} ${pageTab === 'ssl' ? styles.tabActive : ''}`} onClick={() => setPageTab('ssl')}>
          <IcoLock />SSL / TLS
          {expiring > 0 && <span className={`${styles.tabBadge} ${styles.tabBadgeWarn}`}>{expiring}</span>}
        </button>
        <button className={`${styles.tab} ${pageTab === 'logs' ? styles.tabActive : ''}`} onClick={() => setPageTab('logs')}>
          <IcoLog />Access Logs<span className={styles.tabBadge}>{logs.length}</span>
        </button>
        <button className={`${styles.tab} ${pageTab === 'performance' ? styles.tabActive : ''}`} onClick={() => setPageTab('performance')}>
          <IcoChart />Performance
        </button>
        <button className={`${styles.tab} ${pageTab === 'global' ? styles.tabActive : ''}`} onClick={() => setPageTab('global')}>
          <IcoSettings />Global Config
        </button>
      </div>

      {/* ══ Sites tab ═══════════════════════════════════════════════════════════ */}
      {pageTab === 'sites' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}>
              <span className={styles.sectionTitle}>Virtual Hosts</span>
              <span className={styles.resultCount}><strong>{filteredSites.length}</strong> of {sites.length}</span>
            </div>
            <div className={styles.sectionHeadRight}>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => setAddOpen(true)}><IcoPlus />Add Site</button>
            </div>
          </div>
          <div className={styles.toolbar} style={{ padding: '8px 12px 2px' }}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><IcoSearch /></span>
                <input className={styles.searchInput} placeholder="Search domain or docroot…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className={styles.pillRow}>
                {(['all','active','disabled','error'] as const).map(f => (
                  <button key={f} className={`${styles.pill} ${filter === f ? (f === 'error' ? styles.statusError : f === 'active' ? styles.statusActive : f === 'disabled' ? styles.statusDisabled : '') : ''}`} onClick={() => setFilter(f)}
                    style={filter === f && f === 'all' ? { background: 'var(--color-accent-dim)', color: 'var(--color-accent)', borderColor: 'rgba(74,158,255,0.3)' } : {}}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className={styles.selectWrap}>
                <select className={styles.tbSelect} value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
                  <option value="domain">Sort: Domain</option>
                  <option value="status">Sort: Status</option>
                </select>
                <IcoChevDown />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')}><IcoList /></button>
                <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')}><IcoGrid /></button>
              </div>
            </div>
          </div>

          {sitesLoading ? (
            <div className={styles.empty}><IcoRefresh /><span style={{ fontSize: 13 }}>Loading sites from nginx…</span></div>
          ) : filteredSites.length === 0 ? (
            <div className={styles.empty}>
              <IcoGlobe />
              <span style={{ fontSize: 13 }}>{search || filter !== 'all' ? 'No sites match your filter' : 'No nginx sites found — add sites to /etc/nginx/sites-available/'}</span>
            </div>
          ) : view === 'list' ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th} style={{ width: 28 }}>#</th>
                    <SortTh col="domain" label="Domain" />
                    <th className={styles.th}>Document Root</th>
                    <th className={styles.th}>SSL</th>
                    <th className={styles.th}>PHP</th>
                    <SortTh col="status" label="Status" />
                    <th className={styles.th}>Features</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.map((s, i) => (
                    <tr key={s.id} className={styles.tr} onClick={() => setDetail(s)}>
                      <td className={`${styles.td} ${styles.tdCode}`} style={{ color: 'var(--color-text-dim)' }}>{i + 1}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span className={styles.statusDot} style={{ background: statusColor(s.status) }} />
                          <div>
                            <div className={styles.tdCode} style={{ fontWeight: 700 }}>{s.domain}</div>
                            {s.aliases.length > 0 && <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{s.aliases[0]}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={`${styles.td} ${styles.tdCode}`} style={{ color: 'var(--color-text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.docRoot || '—'}</td>
                      <td className={styles.td}>
                        <span className={`${styles.sslBadge} ${sslClass(s.ssl)}`}>{sslIcon(s.ssl)}&nbsp;{sslLabel(s.ssl)}</span>
                      </td>
                      <td className={styles.td}>
                        {s.php ? <span className={styles.phpBadge}>PHP</span> : <span className={styles.phpNone}>—</span>}
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.siteStatusBadge} ${s.status === 'active' ? styles.statusActive : s.status === 'disabled' ? styles.statusDisabled : styles.statusError}`}>{s.status}</span>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.featurePills} style={{ flexWrap: 'nowrap' }}>
                          <span className={`${styles.featurePill} ${s.gzip ? styles.featurePillOn : ''}`}>gz</span>
                          <span className={`${styles.featurePill} ${s.hsts ? styles.featurePillOn : ''}`}>hsts</span>
                          <span className={`${styles.featurePill} ${s.proxy ? styles.featurePillOn : ''}`}>proxy</span>
                          <span className={`${styles.featurePill} ${s.rateLimit ? styles.featurePillOn : ''}`}>rl</span>
                        </div>
                      </td>
                      <td className={styles.td} onClick={e => e.stopPropagation()}>
                        <div className={styles.rowBtns}>
                          <button className={styles.rowBtn} title="Edit Config" onClick={() => setEditing(s)}><IcoEdit /></button>
                          <button className={styles.rowBtn} title={s.status === 'active' ? 'Disable' : 'Enable'} onClick={() => mutToggle.mutate(s.id)}>
                            {s.status === 'active' ? <IcoStop /> : <IcoPlay />}
                          </button>
                          <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} title="Delete" onClick={() => setDeleting(s)}><IcoTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.gridWrap}>
              {filteredSites.map(s => (
                <div key={s.id} className={styles.gridCard} onClick={() => setDetail(s)}>
                  <div className={styles.gridCardAccent} style={{ background: siteAccentColor(s) }} />
                  <div className={styles.gridCardBody}>
                    <div className={styles.gridCardHead}>
                      <div>
                        <div className={styles.gridCardDomain}>{s.domain}</div>
                        {s.aliases.length > 0 && <div className={styles.gridCardAlias}>{s.aliases.join(', ')}</div>}
                      </div>
                      <span className={`${styles.siteStatusBadge} ${s.status === 'active' ? styles.statusActive : s.status === 'disabled' ? styles.statusDisabled : styles.statusError}`}>{s.status}</span>
                    </div>
                    <div className={styles.gridCardDocRoot}>{s.docRoot || '—'}</div>
                    <div className={styles.gridCardBadges} style={{ marginBottom: 8 }}>
                      <span className={`${styles.sslBadge} ${sslClass(s.ssl)}`}>{sslIcon(s.ssl)}&nbsp;{sslLabel(s.ssl)}</span>
                      {s.php && <span className={styles.phpBadge}>PHP</span>}
                    </div>
                    <div className={styles.featurePills}>
                      <span className={`${styles.featurePill} ${s.gzip ? styles.featurePillOn : ''}`}>gzip</span>
                      <span className={`${styles.featurePill} ${s.brotli ? styles.featurePillOn : ''}`}>brotli</span>
                      <span className={`${styles.featurePill} ${s.hsts ? styles.featurePillOn : ''}`}>hsts</span>
                      <span className={`${styles.featurePill} ${s.rateLimit ? styles.featurePillOn : ''}`}>ratelimit</span>
                      <span className={`${styles.featurePill} ${s.proxy ? styles.featurePillOn : ''}`}>proxy</span>
                    </div>
                    <div className={styles.gridCardFoot}>
                      <div className={styles.gridCardStat}><strong>{s.workerConnType}</strong></div>
                      <div className={styles.rowBtns} onClick={e => e.stopPropagation()}>
                        <button className={styles.rowBtn} onClick={() => setEditing(s)}><IcoEdit /></button>
                        <button className={styles.rowBtn} onClick={() => mutToggle.mutate(s.id)}>{s.status === 'active' ? <IcoStop /> : <IcoPlay />}</button>
                        <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => setDeleting(s)}><IcoTrash /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ SSL / TLS tab ═══════════════════════════════════════════════════════ */}
      {pageTab === 'ssl' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}>
              <IcoLock />
              <span className={styles.sectionTitle}>SSL / TLS Certificates</span>
              {expiring > 0 && <span className={`${styles.tabBadge} ${styles.tabBadgeWarn}`}>{expiring} need attention</span>}
            </div>
            <div className={styles.sectionHeadRight}>
              <button className={styles.iconBtn} disabled={mutRenewAll.isPending || certs.length === 0} onClick={() => mutRenewAll.mutate()}><IcoRefresh />{mutRenewAll.isPending ? 'Renewing…' : 'Renew All'}</button>
              <button className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} onClick={() => setAddCertOpen(true)}><IcoPlus />Request New</button>
            </div>
          </div>
          {certs.length === 0 ? (
            <div className={styles.empty}><IcoLock /><span style={{ fontSize: 13 }}>No SSL certificates found. Install certbot and run certbot certonly to get started.</span></div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Domain</th>
                    <th className={styles.th}>Issuer</th>
                    <th className={styles.th}>Key Type</th>
                    <th className={styles.th}>Expires</th>
                    <th className={styles.th}>Days Left</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Auto-Renew</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map(c => (
                    <tr key={c.id} className={styles.tr} onClick={() => setCertModal(c)}>
                      <td className={`${styles.td} ${styles.tdCode}`}>{c.domain}</td>
                      <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{c.issuer}</td>
                      <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize: 11 }}>{c.keyType}</td>
                      <td className={`${styles.td} ${styles.tdCode}`} style={{ fontSize: 11 }}>{c.expiry}</td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span className={styles.tdCode} style={{ fontSize: 11, color: daysBarColor(c.daysLeft), minWidth: 40 }}>
                            {c.daysLeft > 0 ? `${c.daysLeft}d` : `−${Math.abs(c.daysLeft)}d`}
                          </span>
                          <div className={styles.daysBar}>
                            <div className={styles.daysBarFill} style={{ width: `${Math.max(0, Math.min(100, (c.daysLeft / 180) * 100))}%`, background: daysBarColor(c.daysLeft) }} />
                          </div>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.certBadge} ${certStatusClass(c.status)}`}>{c.status}</span>
                      </td>
                      <td className={styles.td}>
                        <span style={{ fontSize: 11, color: c.autoRenew ? '#22c55e' : 'var(--color-text-dim)' }}>{c.autoRenew ? 'On' : 'Off'}</span>
                      </td>
                      <td className={styles.td} onClick={e => e.stopPropagation()}>
                        <div className={styles.rowBtns}>
                          <button className={`${styles.rowBtn} ${styles.rowBtnSuccess}`} title="Renew" disabled={mutRenewCert.isPending} onClick={e => { e.stopPropagation(); mutRenewCert.mutate(c.domain) }}><IcoRefresh /></button>
                          <button className={styles.rowBtn} title="View" onClick={e => { e.stopPropagation(); setCertModal(c) }}><IcoLog /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ Logs tab ════════════════════════════════════════════════════════════ */}
      {pageTab === 'logs' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadLeft}>
              <IcoLog />
              <span className={styles.sectionTitle}>Access Logs</span>
              <span className={styles.resultCount}><strong>{filteredLogs.length}</strong> entries</span>
            </div>
            <div className={styles.sectionHeadRight}>
              <div className={styles.pillRow}>
                {(['all','2xx','3xx','4xx','5xx'] as const).map(f => (
                  <button key={f}
                    className={`${styles.pill} ${logFilter === f ? (f === '2xx' ? styles.statusActive : f === '5xx' ? styles.statusError : '') : ''}`}
                    style={logFilter === f && f === 'all' ? { background: 'var(--color-accent-dim)', color: 'var(--color-accent)', borderColor: 'rgba(74,158,255,0.3)' } : logFilter === f && f === '4xx' ? { background: 'rgba(246,173,85,0.1)', color: '#f6ad55', borderColor: 'rgba(246,173,85,0.3)' } : {}}
                    onClick={() => setLogFilter(f)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {logs.length === 0 ? (
            <div className={styles.empty}><IcoLog /><span style={{ fontSize: 13 }}>No log entries found. Ensure nginx access_log is enabled and pointing to /var/log/nginx/access.log</span></div>
          ) : (
            <div style={{ maxHeight: 450, overflowY: 'auto' }}>
              {filteredLogs.map(l => (
                <div key={l.id} className={styles.logRow}>
                  <span className={styles.logTs}>{l.ts}</span>
                  <span className={styles.logIp}>{l.ip}</span>
                  <span className={`${styles.logMethod} ${methodClass(l.method)}`}>{l.method}</span>
                  <span className={styles.logPath}>{l.path}</span>
                  <span className={`${styles.statusCode} ${httpCodeClass(l.status)}`}>{l.status}</span>
                  <span className={styles.logBytes}>{fmtBytes(l.bytes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Performance tab ═════════════════════════════════════════════════════ */}
      {pageTab === 'performance' && (
        <>
          {/* Rolling real-time chart */}
          <NginxRollingChart history={perfHistory.current} />
          <div className={styles.metricsGrid}>
            {[
              { label: 'Active Conns',  val: perf?.active_conns ?? '—',  sub: 'Currently active connections', pct: perf ? Math.min(100, perf.active_conns / 10) : 0, color: 'var(--color-accent)' },
              { label: 'Reading',       val: perf?.reading      ?? '—',  sub: 'Requests being read',           pct: perf ? Math.min(100, perf.reading * 5)         : 0, color: '#63b3ed' },
              { label: 'Writing',       val: perf?.writing      ?? '—',  sub: 'Sending response to client',    pct: perf ? Math.min(100, perf.writing * 5)         : 0, color: '#22c55e' },
              { label: 'Waiting',       val: perf?.waiting      ?? '—',  sub: 'Keepalive idle connections',    pct: perf ? Math.min(100, perf.waiting / 10)        : 0, color: '#a78bfa' },
              { label: 'Total Accepts', val: perf?.accepts      ?? '—',  sub: 'Accepted connections (total)',  pct: 60,                                               color: '#f6ad55' },
              { label: 'Workers',       val: status?.workers    ?? '—',  sub: 'nginx worker processes',        pct: status?.workers ? Math.min(100, status.workers * 25) : 0, color: '#22c55e' },
            ].map(m => (
              <div key={m.label} className={styles.metricCard}>
                <div className={styles.metricVal} style={{ color: m.color }}>{m.val}</div>
                <div className={styles.metricLbl}>{m.label}</div>
                <div className={styles.metricSub}>{m.sub}</div>
                <div className={styles.statusBarMini}><div className={styles.statusBarMiniFill} style={{ width: `${m.pct}%`, background: m.color }} /></div>
              </div>
            ))}
          </div>
          {(!perf || perf.active_conns === 0) && (
            <div className={styles.sectionCard} style={{ marginTop: 12 }}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>Enable Nginx Status Module</span>
              </div>
              <div style={{ padding: '10px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 8 }}>
                  Real-time connection stats require the nginx stub_status module. Add this to your nginx config:
                </div>
                <div className={styles.configBlock}>{`server {
    listen 127.0.0.1:80;
    location /nginx_status {
        stub_status on;
        allow 127.0.0.1;
        deny all;
    }
}`}</div>
              </div>
            </div>
          )}
          <div className={styles.sectionCard} style={{ marginTop: 12 }}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>Performance Recommendations</span>
            </div>
            <div style={{ padding: '6px 0' }}>
              {[
                { id: 'wp',  label: 'Worker Processes',   sub: globalCfg?.worker_processes ? `Currently: ${globalCfg.worker_processes}` : 'Set to auto for best performance',                       cmd: 'worker_processes auto;' },
                { id: 'wc',  label: 'Worker Connections', sub: globalCfg?.worker_connections ? `Currently: ${globalCfg.worker_connections}` : 'Increase for high traffic',                           cmd: 'worker_connections 4096;' },
                { id: 'kt',  label: 'Keepalive Timeout',  sub: globalCfg?.keepalive_timeout ? `Currently: ${globalCfg.keepalive_timeout}s` : '65s is recommended for most workloads',               cmd: 'keepalive_timeout 65;' },
                { id: 'ofc', label: 'Open File Cache',    sub: 'Enable for faster static file serving',                                                                                                cmd: 'open_file_cache max=1000 inactive=20s;' },
                { id: 'gz',  label: 'Global Gzip',        sub: globalCfg?.gzip ? 'Already enabled globally' : 'Enable to save 60-70% bandwidth',                                                     cmd: 'gzip on; gzip_types text/plain text/css application/javascript;' },
              ].map(r => (
                <div key={r.id} className={styles.toggleRow} style={{ padding: '9px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <div className={styles.toggleLabel}>{r.label}</div>
                    <div className={styles.toggleSub}>{r.sub}</div>
                    <div className={styles.configBlock} style={{ marginTop: 5, fontSize: 10.5, padding: '4px 8px' }}>{r.cmd}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══ Global Config tab ═══════════════════════════════════════════════════ */}
      {pageTab === 'global' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Global Nginx Settings</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{globalCfg?.raw ? '/etc/nginx/nginx.conf' : 'Not found'}</span>
          </div>
          {globalCfg && (
            <div style={{ padding: '6px 16px' }}>
              <div className={styles.detailGrid} style={{ marginBottom: 12 }}>
                {([
                  ['Worker Processes',   globalCfg.worker_processes],
                  ['Worker Connections', globalCfg.worker_connections],
                  ['Keepalive Timeout',  globalCfg.keepalive_timeout + 's'],
                  ['Max Body Size',      globalCfg.client_max_body_size],
                ] as [string,string][]).map(([k,v]) => (
                  <React.Fragment key={k}>
                    <span className={styles.detailKey}>{k}</span>
                    <span className={styles.detailVal}>{v}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Hide Nginx Version (server_tokens off)</div><div className={styles.toggleSub}>Reduces information disclosure to attackers</div></div>
                <Toggle on={globalCfg.server_tokens_off} onChange={() => {}} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>TCP_NOPUSH / TCP_CORK</div><div className={styles.toggleSub}>Optimize packet headers for performance</div></div>
                <Toggle on={globalCfg.tcp_nopush} onChange={() => {}} />
              </div>
              <div className={styles.toggleRow}>
                <div><div className={styles.toggleLabel}>Global Gzip</div><div className={styles.toggleSub}>Compress responses for all sites</div></div>
                <Toggle on={globalCfg.gzip} onChange={() => {}} />
              </div>
            </div>
          )}
          {globalCfg?.raw ? (
            <>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
                <div className={styles.cmdLabel} style={{ marginBottom: 8 }}>nginx.conf — live edit</div>
                <textarea
                  style={{ width: '100%', minHeight: 280, fontFamily: 'monospace', fontSize: 11.5, padding: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', resize: 'vertical', outline: 'none' }}
                  value={globalRaw}
                  onChange={e => setGlobalRaw(e.target.value)}
                />
              </div>
              <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)' }}>
                <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} disabled={mutSaveGlobal.isPending} onClick={() => mutSaveGlobal.mutate(globalRaw)}><IcoCheck />Apply & Reload</button>
                <button className={styles.formBtn} disabled={mutTest.isPending} onClick={() => mutTest.mutate()}><IcoRefresh />Test Config</button>
              </div>
            </>
          ) : (
            <div className={styles.empty}><IcoWarn /><span style={{ fontSize: 13 }}>nginx.conf not found or not readable at /etc/nginx/nginx.conf</span></div>
          )}
        </div>
      )}

      {/* ══ Modals ══════════════════════════════════════════════════════════════ */}
      {detail && !editing && (
        <SiteDetailModal
          site={detail} logs={logs}
          onClose={() => setDetail(null)}
          onEdit={s => { setEditing(s); setDetail(null) }}
          onDelete={s => { setDeleting(s); setDetail(null) }}
          onToggle={s => mutToggle.mutate(s.id)}
        />
      )}
      {editing && (
        <EditConfigModal
          site={editing}
          onClose={() => setEditing(null)}
          onSave={(name, config) => { mutUpdateConfig.mutate({ name, config }); setEditing(null) }}
        />
      )}
      {addOpen && (
        <AddSiteModal
          onClose={() => setAddOpen(false)}
          onSave={d => mutCreate.mutate(d as Parameters<typeof createWebServerSite>[0])}
        />
      )}
      {deleting && (
        <DeleteModal site={deleting} onClose={() => setDeleting(null)} onConfirm={() => mutDelete.mutate(deleting.id)} />
      )}
      {certModal && (
        <CertDetailModal cert={certModal} onClose={() => setCertModal(null)} onRenew={d => mutRenewCert.mutate(d)} />
      )}
      {addCertOpen && (
        <RequestCertModal
          onClose={() => setAddCertOpen(false)}
          onResult={r => { setCmdResult(r); qc.invalidateQueries({ queryKey: ['certs'] }) }}
        />
      )}
      <CmdResult result={cmdResult} onClose={() => setCmdResult(null)} />
    </div>
  )
}
