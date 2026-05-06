import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchDBConnections, fetchDBStats, createDBConnection, updateDBConnection, deleteDBConnection,
  testDBConnection, refreshDBConnection, fetchDBDatabases, fetchDBTables, fetchDBColumns,
  fetchDBTableData, executeDBQuery, fetchDBQueryHistory, deleteDBQueryHistory,
  fetchDBSavedQueries, createDBSavedQuery, deleteDBSavedQuery,
  fetchDBTableIndexes,
  type DBConnection, type DBDatabase, type DBTable, type DBColumn, type QueryResult, type QueryHistoryEntry,
  type SavedQuery, type DBIndex,
} from '@/lib/api'
import styles from './DatabasePage.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcoDatabase()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="10" cy="5" rx="7" ry="2.5"/><path d="M3 5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5"/><path d="M3 9v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9"/><path d="M3 13v3c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-3"/></svg> }
function IcoPlus()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg> }
function IcoRefresh()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8A7 7 0 0 0 4.6 5.6"/><path d="M3 3v5h5"/><path d="M3 12a7 7 0 0 0 12.4 2.4"/><path d="M17 17v-5h-5"/></svg> }
function IcoPlay()      { return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4l11 6-11 6V4z"/></svg> }
function IcoTable()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><line x1="2" y1="8" x2="18" y2="8"/><line x1="8" y1="8" x2="8" y2="17"/></svg> }
function IcoHistory()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7.5"/><polyline points="10,6 10,10 13,12"/></svg> }
function IcoTrash()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14M8 6V4h4v2M5 6l1 11h8l1-11"/></svg> }
function IcoX()         { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg> }
function IcoEdit()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3l3 3L6 17H3v-3L14 3z"/></svg> }
function IcoCheck()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg> }
function IcoSearch()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg> }
function IcoChevron()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="7,8 10,12 13,8"/></svg> }
function IcoInfo()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg> }
function IcoColumns()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="5" height="14" rx="1"/><rect x="8.5" y="3" width="3" height="14" rx="1"/><rect x="13" y="3" width="5" height="14" rx="1"/></svg> }
function IcoKey()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="11" r="4"/><path d="M11 7l8 8M16 9l2 2M14 7l2 2"/></svg> }
function IcoCopy()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="9" height="9" rx="1.5"/><path d="M3 12V5a2 2 0 0 1 2-2h7"/></svg> }
function IcoSave()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 17H3V3h10l4 4z"/><rect x="7" y="11" width="6" height="6" rx=".5"/><rect x="6" y="3" width="7" height="4" rx=".5"/></svg> }
function IcoDownload()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 16h14"/></svg> }
function IcoIndex()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><line x1="2" y1="8" x2="18" y2="8"/><line x1="5" y1="11" x2="15" y2="11"/><line x1="5" y1="14" x2="11" y2="14"/></svg> }
function IcoBookmark()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h10a1 1 0 0 1 1 1v13l-6-3-6 3V4a1 1 0 0 1 1-1z"/></svg> }
function IcoChevLeft()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="13,5 7,10 13,15"/></svg> }
function IcoChevRight() { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="7,5 13,10 7,15"/></svg> }

// ── DB type color map ──────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  postgresql: '#63b3ed', mysql: '#f6ad55', mariadb: '#c084fc',
  redis: '#fc8181', sqlite: '#94a3b8', mongodb: '#68d391',
}
const TYPE_CLASS: Record<string, string> = {
  postgresql: styles.typePostgres, mysql: styles.typeMySQL, mariadb: styles.typeMariaDB,
  redis: styles.typeRedis, sqlite: styles.typeSQLite, mongodb: styles.typeMongo,
}

function typeLabel(t: string) {
  return { postgresql: 'PG', mysql: 'MY', mariadb: 'MD', redis: 'RD', sqlite: 'SQ', mongodb: 'MG' }[t] ?? t.toUpperCase().slice(0, 2)
}

// ── Connection modal ───────────────────────────────────────────────────────────
interface ConnModalProps {
  conn?: DBConnection | null
  onClose: () => void
  onSaved: () => void
}

function ConnModal({ conn, onClose, onSaved }: ConnModalProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: conn?.name ?? '',
    type: conn?.type ?? 'postgresql',
    host: conn?.host ?? 'localhost',
    port: conn?.port ?? 5432,
    username: conn?.username ?? '',
    password: '',
    database_name: conn?.database_name ?? '',
    ssl_mode: conn?.ssl_mode ?? 'prefer',
  })
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const DEFAULT_PORTS: Record<string, number> = { postgresql: 5432, mysql: 3306, mariadb: 3306, redis: 6379, mongodb: 27017, sqlite: 0 }

  function setType(t: string) {
    setForm(f => ({ ...f, type: t, port: DEFAULT_PORTS[t] ?? 5432 }))
  }

  const mutSave = useMutation({
    mutationFn: async () => {
      if (conn) await updateDBConnection(conn.id, form as any)
      else await createDBConnection(form as any)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['db-connections'] }); onSaved(); onClose() },
  })

  async function handleTest() {
    if (!conn) { setTestResult({ ok: false, msg: 'Save the connection first, then test it.' }); return }
    setTesting(true)
    try {
      const r = await testDBConnection(conn.id)
      setTestResult({ ok: r.ok, msg: r.ok ? `Connected — ${r.version} (${r.latency_ms}ms)` : r.error })
    } catch (e: any) { setTestResult({ ok: false, msg: e.message }) }
    finally { setTesting(false) }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>{conn ? 'Edit Connection' : 'New Connection'}</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Connection Name</label>
              <input className={styles.fieldInput} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My PostgreSQL" />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Database Type</label>
              <select className={styles.fieldSelect} value={form.type} onChange={e => setType(e.target.value)}>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="mariadb">MariaDB</option>
                <option value="redis">Redis</option>
                <option value="sqlite">SQLite (file path)</option>
                <option value="mongodb">MongoDB</option>
              </select>
            </div>
          </div>
          {form.type === 'sqlite' ? (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Database File Path</label>
              <input className={styles.fieldInput} value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="/var/lib/myapp/data.db" />
            </div>
          ) : (
            <>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Host</label>
                  <input className={styles.fieldInput} value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="localhost" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Port</label>
                  <input className={styles.fieldInput} type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: +e.target.value }))} />
                </div>
              </div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Username</label>
                  <input className={styles.fieldInput} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="postgres" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Password</label>
                  <input className={styles.fieldInput} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={conn ? '(unchanged)' : '••••••••'} />
                </div>
              </div>
              <div className={styles.formGrid2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Database Name</label>
                  <input className={styles.fieldInput} value={form.database_name} onChange={e => setForm(f => ({ ...f, database_name: e.target.value }))} placeholder="mydb" />
                </div>
                {(form.type === 'postgresql') && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>SSL Mode</label>
                    <select className={styles.fieldSelect} value={form.ssl_mode} onChange={e => setForm(f => ({ ...f, ssl_mode: e.target.value }))}>
                      <option value="disable">Disable</option>
                      <option value="allow">Allow</option>
                      <option value="prefer">Prefer</option>
                      <option value="require">Require</option>
                      <option value="verify-ca">Verify CA</option>
                      <option value="verify-full">Verify Full</option>
                    </select>
                  </div>
                )}
              </div>
            </>
          )}
          {testResult && (
            <div className={`${styles.testResult} ${testResult.ok ? styles.testResultOk : styles.testResultErr}`}>
              {testResult.ok ? <IcoCheck /> : <IcoX />} {testResult.msg}
            </div>
          )}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btn} onClick={handleTest} disabled={testing}>
            {testing ? <span className={styles.spinner} /> : <IcoRefresh />} Test
          </button>
          <button className={styles.btn} onClick={onClose}><IcoX /> Cancel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => mutSave.mutate()} disabled={mutSave.isPending}>
            <IcoCheck /> {mutSave.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save Query Modal ───────────────────────────────────────────────────────────
function SaveQueryModal({ sql, connId, onClose, onSaved }: { sql: string; connId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState('')
  const mutCreate = useMutation({
    mutationFn: () => createDBSavedQuery({ connection_id: connId, name, description: desc, query: sql, database_name: '' }),
    onSuccess: () => { onSaved(); onClose() },
  })
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Save Query</span>
          <button className={styles.modalClose} onClick={onClose}><IcoX /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Query Name</label>
            <input className={styles.fieldInput} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. User count by role" autoFocus />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Description (optional)</label>
            <input className={styles.fieldInput} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this query do?" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Tags (comma-separated)</label>
            <input className={styles.fieldInput} value={tags} onChange={e => setTags(e.target.value)} placeholder="reports, users, analytics" />
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, padding: 10, background: 'var(--color-surface-raised)', borderRadius: 6, maxHeight: 120, overflow: 'auto', color: 'var(--color-text-dim)', whiteSpace: 'pre-wrap' }}>{sql}</div>
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btn} onClick={onClose}><IcoX /> Cancel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => mutCreate.mutate()} disabled={!name.trim() || mutCreate.isPending}>
            <IcoSave /> {mutCreate.isPending ? 'Saving…' : 'Save Query'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DatabasePage() {
  const qc = useQueryClient()
  const [mainTab, setMainTab] = useState<'query' | 'browse' | 'history' | 'saved'>('query')
  const [selectedConn, setSelectedConn] = useState<DBConnection | null>(null)
  const [selectedDB, setSelectedDB] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [openDBs, setOpenDBs] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [executing, setExecuting] = useState(false)
  const [connModal, setConnModal] = useState<'add' | DBConnection | null>(null)
  const [histSearch, setHistSearch] = useState('')
  const [connSearch, setConnSearch] = useState('')
  // Saved queries
  const [savedSearch, setSavedSearch] = useState('')
  const [saveQueryOpen, setSaveQueryOpen] = useState(false)
  // Browse pagination
  const [browsePage, setBrowsePage] = useState(0)
  const [browsePageSize] = useState(50)
  // Browse show indexes
  const [showIndexes, setShowIndexes] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: connections = [], isLoading: loadingConns } = useQuery({ queryKey: ['db-connections'], queryFn: fetchDBConnections, refetchInterval: 30000 })
  const { data: stats } = useQuery({ queryKey: ['db-stats'], queryFn: fetchDBStats, refetchInterval: 30000 })
  const { data: dbsData } = useQuery({
    queryKey: ['db-databases', selectedConn?.id],
    queryFn: () => fetchDBDatabases(selectedConn!.id),
    enabled: !!selectedConn,
  })
  const databases: DBDatabase[] = dbsData?.databases ?? []
  const { data: tablesData } = useQuery({
    queryKey: ['db-tables', selectedConn?.id, selectedDB],
    queryFn: () => fetchDBTables(selectedConn!.id, selectedDB),
    enabled: !!selectedConn && !!selectedDB,
  })
  const tables: DBTable[] = tablesData?.tables ?? []
  const { data: colsData } = useQuery({
    queryKey: ['db-columns', selectedConn?.id, selectedDB, selectedTable],
    queryFn: () => fetchDBColumns(selectedConn!.id, selectedDB, selectedTable),
    enabled: !!selectedConn && !!selectedDB && !!selectedTable,
  })
  const columns: DBColumn[] = colsData?.columns ?? []
  const { data: tableDataResult } = useQuery({
    queryKey: ['db-table-data', selectedConn?.id, selectedDB, selectedTable, browsePage],
    queryFn: () => fetchDBTableData(selectedConn!.id, selectedDB, selectedTable, browsePageSize, browsePage * browsePageSize),
    enabled: mainTab === 'browse' && !!selectedConn && !!selectedDB && !!selectedTable,
  })
  const { data: indexesData } = useQuery({
    queryKey: ['db-indexes', selectedConn?.id, selectedDB, selectedTable],
    queryFn: () => fetchDBTableIndexes(selectedConn!.id, selectedDB, selectedTable),
    enabled: showIndexes && mainTab === 'browse' && !!selectedConn && !!selectedDB && !!selectedTable,
  })
  const tableIndexes: DBIndex[] = (indexesData as any)?.indexes ?? []
  const { data: history = [] } = useQuery({ queryKey: ['db-history'], queryFn: fetchDBQueryHistory, enabled: mainTab === 'history', refetchInterval: 5000 })
  const { data: savedQueries = [] } = useQuery<SavedQuery[]>({ queryKey: ['db-saved-queries'], queryFn: fetchDBSavedQueries, staleTime: 30000 })

  // ── Mutations ────────────────────────────────────────────────────────────
  const mutDelete = useMutation({
    mutationFn: deleteDBConnection,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['db-connections'] }); if (selectedConn) setSelectedConn(null) },
  })
  const mutRefresh = useMutation({
    mutationFn: (id: number) => refreshDBConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['db-connections'] }),
  })
  const mutDeleteHist = useMutation({
    mutationFn: (id: string) => deleteDBQueryHistory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['db-history'] }),
  })
  const mutDeleteSaved = useMutation({
    mutationFn: (id: number) => deleteDBSavedQuery(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['db-saved-queries'] }),
  })

  // ── Execute query ────────────────────────────────────────────────────────
  const runQuery = useCallback(async () => {
    if (!selectedConn || !query.trim()) return
    setExecuting(true)
    try {
      const result = await executeDBQuery({ connection_id: selectedConn.id, database: selectedDB, query: query.trim() })
      setQueryResult(result)
      qc.invalidateQueries({ queryKey: ['db-history'] })
    } catch (e: any) { setQueryResult({ columns: [], rows: [], row_count: 0, affected_rows: 0, execution_time_ms: 0, query, error: e.message, type: 'select' }) }
    finally { setExecuting(false) }
  }, [selectedConn, selectedDB, query, qc])

  // ── Toggle db tree ───────────────────────────────────────────────────────
  function toggleDB(dbName: string) {
    setOpenDBs(prev => {
      const next = new Set(prev)
      if (next.has(dbName)) next.delete(dbName)
      else next.add(dbName)
      return next
    })
    setSelectedDB(dbName)
    setSelectedTable('')
  }

  // ── Export helpers ───────────────────────────────────────
  function exportCSV(result: QueryResult) {
    const header = result.columns.join(',')
    const rows = result.rows.map(row => result.columns.map(c => {
      const v = row[c]
      if (v === null) return 'NULL'
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([header + '\n' + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'query_result.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function exportJSON(result: QueryResult) {
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'query_result.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const filteredConns = connections.filter(c => !connSearch || c.name.toLowerCase().includes(connSearch.toLowerCase()) || c.host.toLowerCase().includes(connSearch.toLowerCase()))
  const filteredHistory = history.filter((h: QueryHistoryEntry) => !histSearch || h.query.toLowerCase().includes(histSearch.toLowerCase()) || h.connection_name.toLowerCase().includes(histSearch.toLowerCase()))
  const filteredSaved = savedQueries.filter((sq: SavedQuery) => !savedSearch || sq.name.toLowerCase().includes(savedSearch.toLowerCase()) || sq.query.toLowerCase().includes(savedSearch.toLowerCase()))

  return (
    <div className={styles.page}>
      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Connections</span>
          <span className={styles.statValue}>{stats?.total_connections ?? 0}</span>
          <span className={styles.statSub}>{stats?.active_connections ?? 0} online</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Databases</span>
          <span className={styles.statValue}>{stats?.total_databases ?? 0}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Queries Run</span>
          <span className={styles.statValue}>{stats?.queries_executed ?? 0}</span>
          <span className={styles.statSub}>{stats?.queries_failed ?? 0} failed</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Slow Queries</span>
          <span className={styles.statValue}>{stats?.slow_queries ?? 0}</span>
          <span className={styles.statSub}>&gt;1s execution</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Size</span>
          <span className={styles.statValue} style={{ fontSize: 16 }}>{stats ? fmtBytes(stats.total_size_bytes) : '—'}</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><IcoSearch /></span>
          <input className={styles.searchInput} placeholder="Search connections…" value={connSearch} onChange={e => setConnSearch(e.target.value)} />
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setConnModal('add')}><IcoPlus /> Add Connection</button>
        <button className={styles.btn} onClick={() => connections.forEach(c => mutRefresh.mutate(c.id))} disabled={mutRefresh.isPending}><IcoRefresh /> Refresh All</button>
      </div>

      <div className={styles.layout}>
        {/* ── Left sidebar ── */}
        <div className={styles.sidebar}>
          {/* Connections list */}
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarHead}>
              <span className={styles.sidebarTitle}>Connections ({filteredConns.length})</span>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} onClick={() => setConnModal('add')}><IcoPlus /></button>
            </div>
            <div className={styles.connList}>
              {loadingConns && <div className={styles.treeEmpty}><span className={styles.spinner} /></div>}
              {!loadingConns && filteredConns.length === 0 && (
                <div className={styles.treeEmpty}>No connections yet.<br />Click + to add one.</div>
              )}
              {filteredConns.map(c => (
                <div
                  key={c.id}
                  className={`${styles.connItem} ${selectedConn?.id === c.id ? styles.connItemActive : ''}`}
                  onClick={() => { setSelectedConn(c); setSelectedDB(''); setSelectedTable(''); }}
                >
                  <span className={`${styles.connDot} ${c.status === 'online' ? styles.connDotOnline : styles.connDotOffline}`} />
                  <div className={styles.connInfo}>
                    <div className={styles.connName}>{c.name}</div>
                    <div className={styles.connMeta}>{c.host}{c.port ? `:${c.port}` : ''}</div>
                  </div>
                  <span className={`${styles.connType} ${TYPE_CLASS[c.type] ?? ''}`}>{typeLabel(c.type)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* DB/Table tree */}
          {selectedConn && (
            <div className={styles.treeCard}>
              <div className={styles.treeHead}>
                <IcoDatabase />
                <span className={styles.treeTitle}>{selectedConn.name}</span>
              </div>
              <div className={styles.treeBody}>
                {databases.length === 0 && <div className={styles.treeEmpty}>No databases found</div>}
                {databases.map(db => (
                  <div key={db.name}>
                    <div
                      className={`${styles.treeItem} ${selectedDB === db.name ? styles.treeItemActive : ''}`}
                      onClick={() => toggleDB(db.name)}
                    >
                      <span className={`${styles.treeChevron} ${openDBs.has(db.name) ? styles.treeChevronOpen : ''}`}><IcoChevron /></span>
                      <IcoDatabase />
                      <span style={{ flex: 1 }}>{db.name}</span>
                      {db.size_human && <span className={styles.treeCount}>{db.size_human}</span>}
                    </div>
                    {openDBs.has(db.name) && (
                      <>
                        {tables.length === 0 && selectedDB === db.name && (
                          <div className={`${styles.treeItem} ${styles.treeIndent2}`} style={{ color: 'var(--color-text-dim)', fontSize: 10 }}>No tables</div>
                        )}
                        {selectedDB === db.name && tables.map(t => (
                          <div
                            key={t.name}
                            className={`${styles.treeItem} ${styles.treeIndent2} ${selectedTable === t.name ? styles.treeItemActive : ''}`}
                            onClick={() => { setSelectedTable(t.name); setMainTab('browse') }}
                          >
                            <IcoTable />
                            <span style={{ flex: 1 }}>{t.name}</span>
                            <span className={styles.treeCount}>{t.row_count.toLocaleString()}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected connection actions */}
          {selectedConn && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`${styles.btn} ${styles.btnSm}`} style={{ flex: 1 }} onClick={() => setConnModal(selectedConn)}><IcoEdit /> Edit</button>
              <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => mutRefresh.mutate(selectedConn.id)} disabled={mutRefresh.isPending}><IcoRefresh /></button>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => { if (confirm('Delete this connection?')) mutDelete.mutate(selectedConn.id) }}><IcoTrash /></button>
            </div>
          )}
        </div>

        {/* ── Main panel ── */}
        <div className={styles.main}>
          {!selectedConn ? (
            /* No connection selected — show connection cards */
            <div className={styles.panelCard}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>All Connections</span>
                <button className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} onClick={() => setConnModal('add')}><IcoPlus /> New Connection</button>
              </div>
              {connections.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}><IcoDatabase /></span>
                  <div className={styles.emptyTitle}>No Database Connections</div>
                  <div className={styles.emptyText}>Add a connection to get started. Supports PostgreSQL, MySQL, MariaDB, Redis, SQLite, and MongoDB.</div>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setConnModal('add')}><IcoPlus /> Add Connection</button>
                </div>
              ) : (
                <div className={styles.connGrid} style={{ padding: 12 }}>
                  {connections.map(c => (
                    <div key={c.id} className={styles.connCard} onClick={() => setSelectedConn(c)}>
                      <div className={styles.connCardAccent} style={{ background: TYPE_COLORS[c.type] ?? '#4a9eff' }} />
                      <div className={styles.connCardBody}>
                        <div className={styles.connCardTop}>
                          <div>
                            <div className={styles.connCardName}>{c.name}</div>
                            <div className={styles.connCardMeta}>{c.type === 'sqlite' ? c.host : `${c.host}:${c.port}`}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                            <span className={c.status === 'online' ? styles.badgeOnline : styles.badgeOffline}>{c.status}</span>
                            <span className={`${styles.connType} ${TYPE_CLASS[c.type] ?? ''}`}>{c.type}</span>
                          </div>
                        </div>
                        {c.version && <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace', marginBottom: 8 }}>{c.version}</div>}
                        <div className={styles.connCardStats}>
                          <div className={styles.connStat}>
                            <span className={styles.connStatLabel}>Databases</span>
                            <span className={styles.connStatValue}>{c.database_count}</span>
                          </div>
                          <div className={styles.connStat}>
                            <span className={styles.connStatLabel}>Size</span>
                            <span className={styles.connStatValue}>{fmtBytes(c.size_bytes)}</span>
                          </div>
                        </div>
                        <div className={styles.connCardFoot} onClick={e => e.stopPropagation()}>
                          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setConnModal(c)}><IcoEdit /> Edit</button>
                          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => mutRefresh.mutate(c.id)}><IcoRefresh /></button>
                          <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => { if (confirm('Delete this connection?')) mutDelete.mutate(c.id) }}><IcoTrash /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Connection selected — show tabs */
            <>
              {/* Info bar */}
              <div className={styles.infoBar}>
                <IcoInfo />
                <span>Connected to <strong>{selectedConn.name}</strong> — {selectedConn.type}{selectedDB ? ` / ${selectedDB}` : ''}{selectedTable ? ` / ${selectedTable}` : ''}</span>
                {selectedConn.version && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-dim)' }}>{selectedConn.version}</span>}
              </div>

              {/* Tab bar */}
              <div className={styles.tabBar}>
                <button className={`${styles.tab} ${mainTab === 'query' ? styles.tabActive : ''}`} onClick={() => setMainTab('query')}><IcoPlay /> Query</button>
                <button className={`${styles.tab} ${mainTab === 'browse' ? styles.tabActive : ''}`} onClick={() => setMainTab('browse')}><IcoTable /> Browse</button>
                <button className={`${styles.tab} ${mainTab === 'history' ? styles.tabActive : ''}`} onClick={() => setMainTab('history')}><IcoHistory /> History</button>
                <button className={`${styles.tab} ${mainTab === 'saved' ? styles.tabActive : ''}`} onClick={() => setMainTab('saved')}><IcoBookmark /> Saved ({savedQueries.length})</button>
              </div>

              {/* ── QUERY TAB ── */}
              {mainTab === 'query' && (
                <>
                  <div className={styles.editorCard}>
                    <div className={styles.editorHead}>
                      <span className={styles.editorTitle}>SQL Query Editor</span>
                      <select className={styles.editorDbSelect} value={selectedDB} onChange={e => setSelectedDB(e.target.value)}>
                        <option value="">Select database…</option>
                        {databases.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.editorArea}>
                      <textarea
                        className={styles.queryTextarea}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={`-- Enter SQL query\nSELECT * FROM table_name LIMIT 100;`}
                        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runQuery() }}
                      />
                    </div>
                    <div className={styles.editorFoot}>
                      <div className={styles.editorFootLeft}>
                        <span className={styles.editorHint}>Ctrl+Enter to run</span>
                        {selectedDB && <span className={styles.editorHint}>· Database: <strong>{selectedDB}</strong></span>}
                      </div>
                      <div className={styles.editorFootRight}>
                        <button className={styles.btn} onClick={() => { setQuery(''); setQueryResult(null) }}><IcoTrash /> Clear</button>
                        <button className={styles.btn} onClick={() => navigator.clipboard.writeText(query)}><IcoCopy /> Copy</button>
                        {query.trim() && selectedConn && (
                          <button className={styles.btn} onClick={() => setSaveQueryOpen(true)}><IcoSave /> Save</button>
                        )}
                        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={runQuery} disabled={executing || !selectedDB}>
                          {executing ? <span className={styles.spinner} /> : <IcoPlay />} {executing ? 'Running…' : 'Run Query'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {queryResult && (
                    <div className={styles.resultCard}>
                      <div className={styles.resultHead}>
                        <span className={styles.resultTitle}>Results</span>
                        {queryResult.error ? (
                          <span style={{ fontSize: 10, color: '#ff4d4d', fontWeight: 600 }}>Error</span>
                        ) : (
                          <span className={styles.resultMeta}><strong>{queryResult.row_count}</strong> rows · <strong>{queryResult.execution_time_ms.toFixed(1)}</strong>ms</span>
                        )}
                        {!queryResult.error && queryResult.row_count > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                            <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => exportCSV(queryResult)}><IcoDownload /> CSV</button>
                            <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => exportJSON(queryResult)}><IcoDownload /> JSON</button>
                          </div>
                        )}
                      </div>
                      {queryResult.error ? (
                        <div className={styles.resultError}>{queryResult.error}</div>
                      ) : queryResult.row_count === 0 && queryResult.type !== 'select' ? (
                        <div className={styles.resultEmpty}>Query executed successfully. {queryResult.affected_rows ? `${queryResult.affected_rows} rows affected.` : ''}</div>
                      ) : queryResult.row_count === 0 ? (
                        <div className={styles.resultEmpty}>No rows returned.</div>
                      ) : (
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead className={styles.thead}>
                              <tr>
                                {queryResult.columns.map(col => <th key={col} className={styles.th}>{col}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResult.rows.map((row, i) => (
                                <tr key={i} className={styles.tr}>
                                  {queryResult.columns.map(col => (
                                    <td key={col} className={`${styles.td} ${styles.tdMono} ${row[col] === null ? styles.tdNull : ''}`}>
                                      {row[col] === null ? 'NULL' : String(row[col])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick queries */}
                  {selectedDB && selectedTable && (
                    <div className={styles.panelCard}>
                      <div className={styles.panelHead}>
                        <span className={styles.panelTitle}>Quick Queries — {selectedTable}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap' }}>
                        {[
                          { label: 'SELECT *', q: `SELECT * FROM "${selectedTable}" LIMIT 100;` },
                          { label: 'COUNT rows', q: `SELECT COUNT(*) AS total FROM "${selectedTable}";` },
                          { label: 'Table DDL', q: selectedConn.type === 'postgresql' ? `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='${selectedTable}' ORDER BY ordinal_position;` : `DESCRIBE \`${selectedTable}\`;` },
                          { label: 'Distinct values', q: `SELECT DISTINCT * FROM "${selectedTable}" LIMIT 50;` },
                        ].map(q => (
                          <button key={q.label} className={styles.btn} onClick={() => setQuery(q.q)}>{q.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── BROWSE TAB ── */}
              {mainTab === 'browse' && (
                <>
                  {!selectedTable ? (
                    <div className={styles.panelCard}>
                      <div className={styles.panelHead}><span className={styles.panelTitle}>Tables in {selectedDB || 'database'}</span></div>
                      {!selectedDB ? (
                        <div className={styles.emptyState}><div className={styles.emptyTitle}>Select a database from the sidebar</div></div>
                      ) : tables.length === 0 ? (
                        <div className={styles.emptyState}><div className={styles.emptyTitle}>No tables found</div></div>
                      ) : (
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead className={styles.thead}>
                              <tr>
                                <th className={styles.th}>Table</th>
                                <th className={styles.th}>Type</th>
                                <th className={styles.th}>Rows</th>
                                <th className={styles.th}>Size</th>
                                <th className={styles.th}>Schema</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tables.map(t => (
                                <tr key={t.name} className={styles.tr} onClick={() => setSelectedTable(t.name)}>
                                  <td className={`${styles.td} ${styles.tdMono}`}>{t.name}</td>
                                  <td className={styles.td}><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}>{t.type}</span></td>
                                  <td className={`${styles.td} ${styles.tdMono}`}>{t.row_count.toLocaleString()}</td>
                                  <td className={styles.td}>{t.size_human || '—'}</td>
                                  <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)' }}>{t.schema}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Columns */}
                      <div className={styles.panelCard}>
                        <div className={styles.panelHead}>
                          <span className={styles.panelTitle}><IcoColumns /> Columns — {selectedTable}</span>
                          <button className={styles.btn} style={{ fontSize: 10 }} onClick={() => setSelectedTable('')}>← Back to tables</button>
                        </div>
                        <div className={styles.colGrid}>
                          {columns.map(col => (
                            <div key={col.name} className={styles.colCard}>
                              <div className={styles.colName}>{col.name}</div>
                              <div className={styles.colType}>{col.data_type}{col.max_length ? `(${col.max_length})` : ''}</div>
                              <div className={styles.colMeta}>
                                {col.is_primary && <span className={`${styles.colBadge} ${styles.colBadgePK}`}><IcoKey /> PK</span>}
                                {col.is_unique && <span className={`${styles.colBadge} ${styles.colBadgeUniq}`}>UNIQUE</span>}
                                {col.nullable
                                  ? <span className={`${styles.colBadge} ${styles.colBadgeNull}`}>NULL</span>
                                  : <span className={`${styles.colBadge} ${styles.colBadgeNotNull}`}>NOT NULL</span>}
                              </div>
                              {col.default_value && <div style={{ fontSize: 9.5, color: 'var(--color-text-dim)', marginTop: 4 }}>Default: {col.default_value}</div>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Indexes panel */}
                      <div className={styles.panelCard}>
                        <div className={styles.panelHead}>
                          <span className={styles.panelTitle}><IcoIndex /> Indexes — {selectedTable}</span>
                          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setShowIndexes(p => !p)}>
                            {showIndexes ? 'Hide Indexes' : 'Show Indexes'}
                          </button>
                        </div>
                        {showIndexes && (
                          tableIndexes.length === 0 ? (
                            <div className={styles.resultEmpty} style={{ padding: 10 }}>No indexes found</div>
                          ) : (
                            <div className={styles.tableWrap}>
                              <table className={styles.table}>
                                <thead className={styles.thead}>
                                  <tr>
                                    <th className={styles.th}>Index Name</th>
                                    <th className={styles.th}>Type</th>
                                    <th className={styles.th}>Columns</th>
                                    <th className={styles.th}>Unique</th>
                                    <th className={styles.th}>Primary</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tableIndexes.map((idx, i) => (
                                    <tr key={i} className={styles.tr}>
                                      <td className={`${styles.td} ${styles.tdMono}`}>{idx.name}</td>
                                      <td className={styles.td}><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}>{idx.type || 'btree'}</span></td>
                                      <td className={`${styles.td} ${styles.tdMono}`} style={{ color: 'var(--color-text-dim)' }}>{idx.columns.join(', ')}</td>
                                      <td className={styles.td}>{idx.unique ? <span style={{ color: '#22c55e', fontSize: 11 }}>Yes</span> : '—'}</td>
                                      <td className={styles.td}>{idx.primary ? <span style={{ color: 'var(--color-accent)', fontSize: 11 }}>Yes</span> : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        )}
                      </div>

                      {/* Data */}
                      <div className={styles.resultCard}>
                        <div className={styles.resultHead}>
                          <span className={styles.resultTitle}>Data — {selectedTable}</span>
                          {tableDataResult && <span className={styles.resultMeta}><strong>{tableDataResult.row_count}</strong> rows · page {browsePage + 1}</span>}
                          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                            {tableDataResult && tableDataResult.row_count > 0 && (
                              <>
                                <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => exportCSV(tableDataResult)}><IcoDownload /> CSV</button>
                                <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => exportJSON(tableDataResult)}><IcoDownload /> JSON</button>
                              </>
                            )}
                            <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => { setMainTab('query'); setQuery(`SELECT * FROM "${selectedTable}" LIMIT ${browsePageSize};`) }}><IcoPlay /> Open in Query</button>
                          </div>
                        </div>
                        {!tableDataResult ? (
                          <div className={styles.resultEmpty}><span className={styles.spinner} /></div>
                        ) : tableDataResult.error ? (
                          <div className={styles.resultError}>{tableDataResult.error}</div>
                        ) : (
                          <>
                            <div className={styles.tableWrap}>
                              <table className={styles.table}>
                                <thead className={styles.thead}>
                                  <tr>{tableDataResult.columns.map(c => <th key={c} className={styles.th}>{c}</th>)}</tr>
                                </thead>
                                <tbody>
                                  {tableDataResult.rows.map((row, i) => (
                                    <tr key={i} className={styles.tr}>
                                      {tableDataResult.columns.map(c => (
                                        <td key={c} className={`${styles.td} ${styles.tdMono} ${row[c] === null ? styles.tdNull : ''}`}>
                                          {row[c] === null ? 'NULL' : String(row[c])}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--color-border)', fontSize: 12 }}>
                              <button className={`${styles.btn} ${styles.btnSm}`} disabled={browsePage === 0} onClick={() => setBrowsePage(0)}><span style={{ fontFamily: 'monospace' }}>|←</span></button>
                              <button className={`${styles.btn} ${styles.btnSm}`} disabled={browsePage === 0} onClick={() => setBrowsePage(p => Math.max(0, p - 1))}><IcoChevLeft /></button>
                              <span style={{ color: 'var(--color-text-dim)' }}>Page <strong>{browsePage + 1}</strong> · rows {browsePage * browsePageSize + 1}–{browsePage * browsePageSize + tableDataResult.rows.length}</span>
                              <button className={`${styles.btn} ${styles.btnSm}`} disabled={tableDataResult.rows.length < browsePageSize} onClick={() => setBrowsePage(p => p + 1)}><IcoChevRight /></button>
                              <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)', fontSize: 11 }}>{browsePageSize} rows/page</span>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── HISTORY TAB ── */}
              {mainTab === 'history' && (
                <div className={styles.panelCard}>
                  <div className={styles.panelHead}>
                    <span className={styles.panelTitle}>Query History</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div className={styles.searchWrap} style={{ width: 200 }}>
                        <span className={styles.searchIcon}><IcoSearch /></span>
                        <input className={styles.searchInput} placeholder="Search…" value={histSearch} onChange={e => setHistSearch(e.target.value)} />
                      </div>
                      <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => { if (confirm('Clear all history?')) mutDeleteHist.mutate('all') }}><IcoTrash /> Clear All</button>
                    </div>
                  </div>
                  <div className={styles.historyList}>
                    {filteredHistory.length === 0 && <div className={styles.treeEmpty}>No history yet.</div>}
                    {filteredHistory.map((h: QueryHistoryEntry) => (
                      <div key={h.id} className={styles.histItem} onClick={() => { setMainTab('query'); setQuery(h.query); setSelectedDB(h.database_name) }}>
                        <span className={h.success ? styles.histBadgeOk : styles.histBadgeErr}>{h.success ? 'OK' : 'ERR'}</span>
                        <span className={styles.histQuery}>{h.query}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                          <span className={styles.histMeta}>{h.execution_time_ms.toFixed(1)}ms · {h.row_count} rows</span>
                          <span className={styles.histMeta}>{new Date(h.executed_at * 1000).toLocaleString()}</span>
                        </div>
                        <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={e => { e.stopPropagation(); mutDeleteHist.mutate(String(h.id)) }}><IcoTrash /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SAVED QUERIES TAB ── */}
              {mainTab === 'saved' && (
                <div className={styles.panelCard}>
                  <div className={styles.panelHead}>
                    <span className={styles.panelTitle}>Saved Queries ({filteredSaved.length})</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div className={styles.searchWrap} style={{ width: 220 }}>
                        <span className={styles.searchIcon}><IcoSearch /></span>
                        <input className={styles.searchInput} placeholder="Search by name, SQL, tags…" value={savedSearch} onChange={e => setSavedSearch(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  {filteredSaved.length === 0 ? (
                    <div className={styles.emptyState}>
                      <IcoBookmark />
                      <div className={styles.emptyTitle}>No saved queries yet</div>
                      <div className={styles.emptyText}>Write a query in the Query tab and click Save to store it here.</div>
                    </div>
                  ) : (
                    <div className={styles.savedList}>
                      {filteredSaved.map((sq: SavedQuery) => (
                        <div key={sq.id} className={styles.savedItem}>
                          <div className={styles.savedItemHead}>
                            <IcoBookmark />
                            <div className={styles.savedItemMeta}>
                              <div className={styles.savedItemName}>{sq.name}</div>
                              {sq.description && <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{sq.description}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
                              <button
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                                onClick={() => { setMainTab('query'); setQuery(sq.query) }}
                              >
                                <IcoPlay /> Run
                              </button>
                              <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => navigator.clipboard.writeText(sq.query)}><IcoCopy /></button>
                              <button
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                                onClick={() => { if (confirm(`Delete saved query "${sq.name}"?`)) mutDeleteSaved.mutate(sq.id) }}
                              ><IcoTrash /></button>
                            </div>
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, padding: '8px 12px', background: 'var(--color-surface-raised)', borderTop: '1px solid var(--color-border)', borderRadius: '0 0 6px 6px', color: 'var(--color-text-dim)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
                            {sq.query}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', padding: '4px 12px', borderTop: '1px solid var(--color-border)' }}>
                            Saved {new Date(sq.created_at * 1000).toLocaleDateString()}
                            {sq.updated_at && sq.updated_at !== sq.created_at ? ` · Updated ${new Date(sq.updated_at * 1000).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Connection modal ── */}
      {connModal && (
        <ConnModal
          conn={connModal === 'add' ? null : connModal}
          onClose={() => setConnModal(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['db-connections'] })}
        />
      )}

      {/* ── Save query modal ── */}
      {saveQueryOpen && selectedConn && (
        <SaveQueryModal
          sql={query}
          connId={selectedConn.id}
          onClose={() => setSaveQueryOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['db-saved-queries'] })}
        />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(b: number) {
  if (!b) return '0 B'
  const units = ['B','KB','MB','GB','TB']
  let i = 0; let n = b
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
