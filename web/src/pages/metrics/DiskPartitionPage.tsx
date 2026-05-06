import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMetricsStream } from './useMetricsStream'
import { fetchFSList, fetchFSRead, writeFSFile, mkdirFS, deleteFS, type FSEntry } from '@/lib/api'
import { formatBytes, formatBps, pctColor } from '@/lib/utils'
import Editor from '@monaco-editor/react'
import { EXT_TO_MONACO } from '../ftp/fileTypes'
import styles from './MetricsPage.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoBack      = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,2.5 4,7 9,11.5"/></svg>
const IcoFolder    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3a1 1 0 0 1 1-1h3.5l1.5 2H12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z"/></svg>
const IcoFile      = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 1h6l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/><polyline points="9,1 9,4 12,4"/></svg>
const IcoRefresh   = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 6.5A5 5 0 1 1 9 2.2"/><polyline points="9,1 11.5,2.2 10,4.5"/></svg>
const IcoClose     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
const IcoSave      = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12H2V2h8l2 2v8z"/><path d="M4 2v4h6V2"/><rect x="4" y="8" width="6" height="4"/></svg>
const IcoTrash     = () => <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,3 11,3"/><path d="M4.5 3V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V3"/><path d="M3.5 3l.6 7a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-7"/></svg>
const IcoPlus      = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
const IcoChevRight = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,2 7,5.5 4,9"/></svg>
const IcoDisk      = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><ellipse cx="8" cy="6" rx="6" ry="2.5"/><path d="M2 6v5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V6"/><path d="M2 8.5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5"/></svg>

// ── Language detection ────────────────────────────────────────────────────────
function getMonacoLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MONACO[ext] ?? 'plaintext'
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split('/').filter(Boolean)
  const crumbs: { label: string; path: string }[] = [{ label: '/', path: '/' }]
  parts.forEach((p, i) => {
    crumbs.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') })
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minWidth: 0 }}>
      {crumbs.map((c, i) => (
        <span key={c.path} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          {i > 0 && <span style={{ color: 'var(--color-text-dim)', fontSize: 10 }}><IcoChevRight /></span>}
          <button
            onClick={() => onNavigate(c.path)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'monospace', fontSize: 11,
              color: i === crumbs.length - 1 ? 'var(--color-text)' : 'var(--color-accent)',
              fontWeight: i === crumbs.length - 1 ? 600 : 400,
              padding: '1px 3px', borderRadius: 3,
              maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </button>
        </span>
      ))}
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────
function FileRow({ entry, onOpen, onDelete }: {
  entry: FSEntry
  onOpen: (e: FSEntry) => void
  onDelete: (e: FSEntry) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(entry)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
        cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
        background: hover ? 'var(--color-surface-raised)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: entry.is_dir ? '#4a9eff' : 'var(--color-text-muted)', flexShrink: 0 }}>
        {entry.is_dir ? <IcoFolder /> : <IcoFile />}
      </span>
      <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.name}
      </span>
      {!entry.is_dir && (
        <span style={{ fontSize: 10, color: 'var(--color-text-dim)', flexShrink: 0, fontFamily: 'monospace' }}>
          {formatBytes(entry.size)}
        </span>
      )}
      {!entry.is_dir && entry.mode && (
        <span style={{ fontSize: 10, color: 'var(--color-text-dim)', flexShrink: 0, fontFamily: 'monospace' }}>
          {entry.mode}
        </span>
      )}
      {hover && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(entry) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)',
            display: 'flex', alignItems: 'center', padding: 2, borderRadius: 3, flexShrink: 0,
          }}
          title="Delete"
        >
          <IcoTrash />
        </button>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DiskPartitionPage() {
  const { mount: mountEncoded } = useParams<{ mount: string }>()
  const navigate = useNavigate()
  const mount = mountEncoded ? decodeURIComponent(mountEncoded) : '/'

  // Metrics for disk stats
  const { snapshot } = useMetricsStream()
  const diskInfo = snapshot?.disk?.find(d => d.mount === mount) ?? snapshot?.disk?.[0]

  // File browser state — start at mount point
  const [currentPath, setCurrentPath] = useState(mount)
  const [entries, setEntries]         = useState<FSEntry[]>([])
  const [fsLoading, setFsLoading]     = useState(false)
  const [fsErr, setFsErr]             = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)

  // Editor state
  const [openFile, setOpenFile]       = useState<FSEntry | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [fileErr, setFileErr]         = useState('')
  const [saveErr, setSaveErr]         = useState('')
  const [saveDone, setSaveDone]       = useState(false)
  const [saving, setSaving]           = useState(false)

  const loadDir = useCallback(async (path: string) => {
    setFsLoading(true); setFsErr('')
    try {
      const res = await fetchFSList(path)
      const data = res.files ?? []
      const sorted = [...data].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    } catch (e: unknown) {
      setFsErr(e instanceof Error ? e.message : 'Failed to load directory')
    } finally { setFsLoading(false) }
  }, [])

  useEffect(() => { loadDir(currentPath) }, [currentPath, loadDir])

  const openEntry = async (entry: FSEntry) => {
    if (entry.is_dir) {
      setCurrentPath(currentPath.endsWith('/') ? currentPath + entry.name : currentPath + '/' + entry.name)
      return
    }
    setOpenFile(entry)
    setFileLoading(true); setFileErr(''); setSaveErr(''); setSaveDone(false)
    try {
      const filePath = currentPath.endsWith('/') ? currentPath + entry.name : currentPath + '/' + entry.name
      const res = await fetchFSRead(filePath)
      const text = res.content ?? ''
      setEditorContent(text)
    } catch (e: unknown) {
      setFileErr(e instanceof Error ? e.message : 'Failed to read file')
    } finally { setFileLoading(false) }
  }

  const handleSave = async () => {
    if (!openFile) return
    setSaving(true); setSaveErr(''); setSaveDone(false)
    try {
      const filePath = currentPath.endsWith('/') ? currentPath + openFile.name : currentPath + '/' + openFile.name
      await writeFSFile(filePath, editorContent)
      setSaveDone(true)
      setTimeout(() => setSaveDone(false), 2500)
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  const handleDelete = async (entry: FSEntry) => {
    if (!confirm(`Delete ${entry.name}?`)) return
    const targetPath = currentPath.endsWith('/') ? currentPath + entry.name : currentPath + '/' + entry.name
    try {
      await deleteFS(targetPath)
      loadDir(currentPath)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return
    const folderPath = currentPath.endsWith('/') ? currentPath + newFolderName : currentPath + '/' + newFolderName
    try {
      await mkdirFS(folderPath)
      setNewFolderName(''); setShowNewFolder(false)
      loadDir(currentPath)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Create folder failed')
    }
  }

  const goUp = () => {
    if (currentPath === '/' || currentPath === mount) return
    const parts = currentPath.replace(/\/$/, '').split('/').filter(Boolean)
    parts.pop()
    const parent = parts.length ? '/' + parts.join('/') : '/'
    setCurrentPath(parent.startsWith(mount) ? parent : mount)
  }

  const monacoLang = openFile ? getMonacoLang(openFile.name) : 'plaintext'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 0 24px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/metrics')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: '1px solid var(--color-border)',
            borderRadius: 7, padding: '5px 10px',
            fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer',
          }}
        >
          <IcoBack /> Metrics
        </button>
        <span style={{ color: 'var(--color-text-dim)' }}>·</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-dim)' }}>
          <IcoDisk />
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{mount}</span>
        </div>
        {diskInfo && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 5,
            background: `${pctColor(diskInfo.used_pct)}1a`,
            border: `1px solid ${pctColor(diskInfo.used_pct)}44`,
            color: pctColor(diskInfo.used_pct), fontFamily: 'monospace', fontWeight: 600,
          }}>
            {diskInfo.used_pct.toFixed(1)}% used
          </span>
        )}
      </div>

      {/* ── Disk stat cards ── */}
      {diskInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {[
            { label: 'Device',     value: diskInfo.device,                         mono: true  },
            { label: 'Total',      value: formatBytes(diskInfo.total_bytes),        mono: true  },
            { label: 'Used',       value: formatBytes(diskInfo.used_bytes),         mono: true  },
            { label: 'Free',       value: formatBytes(diskInfo.total_bytes - diskInfo.used_bytes), mono: true },
            { label: 'Read',       value: formatBps(diskInfo.read_bps ?? 0),        mono: true  },
            { label: 'Write',      value: formatBps(diskInfo.write_bps ?? 0),       mono: true  },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 7, padding: '10px 14px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              <div style={{ fontSize: 13, fontFamily: s.mono ? 'monospace' : undefined, fontWeight: 600, color: 'var(--color-text)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Usage bar ── */}
      {diskInfo && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 7, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Disk Usage</span>
            <span style={{ fontFamily: 'monospace', color: pctColor(diskInfo.used_pct), fontWeight: 600 }}>
              {formatBytes(diskInfo.used_bytes)} of {formatBytes(diskInfo.total_bytes)} ({diskInfo.used_pct.toFixed(1)}%)
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, diskInfo.used_pct)}%`,
              background: pctColor(diskInfo.used_pct),
              borderRadius: 4,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--color-text-dim)' }}>
            <span>0</span>
            <span>Free: {formatBytes(diskInfo.total_bytes - diskInfo.used_bytes)}</span>
          </div>
        </div>
      )}

      {/* ── File Manager ── */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>

        {/* File manager header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-raised)',
        }}>
          <IcoFolder />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginRight: 4 }}>File Manager</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Breadcrumb path={currentPath} onNavigate={p => setCurrentPath(p)} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button
              onClick={goUp}
              disabled={currentPath === '/' || currentPath === mount}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '4px 8px', fontSize: 11,
                color: 'var(--color-text-muted)', cursor: 'pointer',
              }}
              title="Go up"
            >
              ↑ Up
            </button>
            <button
              onClick={() => setShowNewFolder(f => !f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '4px 8px', fontSize: 11,
                color: 'var(--color-text-muted)', cursor: 'pointer',
              }}
              title="New folder"
            >
              <IcoPlus /> Folder
            </button>
            <button
              onClick={() => loadDir(currentPath)}
              style={{
                display: 'flex', alignItems: 'center',
                background: 'none', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '4px 7px', fontSize: 11,
                color: 'var(--color-text-muted)', cursor: 'pointer',
              }}
              title="Refresh"
            >
              <IcoRefresh />
            </button>
          </div>
        </div>

        {/* New folder row */}
        {showNewFolder && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}>
            <IcoFolder />
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNewFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
              placeholder="Folder name…"
              style={{
                flex: 1, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 5, padding: '4px 8px', fontSize: 12, color: 'var(--color-text)', outline: 'none',
              }}
            />
            <button onClick={handleNewFolder} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>Create</button>
            <button onClick={() => setShowNewFolder(false)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Cancel</button>
          </div>
        )}

        {/* Two-pane layout: file list + editor */}
        <div style={{ display: 'grid', gridTemplateColumns: openFile ? '300px 1fr' : '1fr', minHeight: 400 }}>

          {/* File list */}
          <div style={{ borderRight: openFile ? '1px solid var(--color-border)' : 'none', overflowY: 'auto', maxHeight: 560 }}>
            {fsLoading && (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-dim)' }}>Loading…</div>
            )}
            {fsErr && (
              <div style={{ padding: '14px', fontSize: 12, color: 'var(--color-danger)' }}>{fsErr}</div>
            )}
            {!fsLoading && !fsErr && entries.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-dim)' }}>Empty directory</div>
            )}
            {entries.map(e => (
              <FileRow
                key={e.name}
                entry={e}
                onOpen={openEntry}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Editor pane */}
          {openFile && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
              {/* Editor header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface-raised)',
              }}>
                <IcoFile />
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {openFile.name}
                </span>
                {saveDone && (
                  <span style={{ fontSize: 11, color: '#68d391' }}>Saved</span>
                )}
                {saveErr && (
                  <span style={{ fontSize: 11, color: 'var(--color-danger)' }} title={saveErr}>Save failed</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'var(--color-accent)', border: 'none',
                    borderRadius: 5, padding: '4px 10px', fontSize: 11,
                    color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <IcoSave /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setOpenFile(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', padding: 3 }}
                  title="Close"
                >
                  <IcoClose />
                </button>
              </div>

              {/* Monaco editor */}
              {fileLoading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: 12 }}>
                  Loading file…
                </div>
              )}
              {fileErr && (
                <div style={{ padding: 16, fontSize: 12, color: 'var(--color-danger)' }}>{fileErr}</div>
              )}
              {!fileLoading && !fileErr && (
                <div style={{ flex: 1, minHeight: 360 }}>
                  <Editor
                    height="100%"
                    defaultLanguage={monacoLang}
                    language={monacoLang}
                    value={editorContent}
                    onChange={v => setEditorContent(v ?? '')}
                    theme="vs-dark"
                    options={{
                      fontSize: 12,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      renderWhitespace: 'boundary',
                      tabSize: 2,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
