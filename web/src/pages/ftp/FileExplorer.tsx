import { useState, useRef, useEffect, useCallback, memo } from 'react'
import Editor from '@monaco-editor/react'
import {
  EXT_TO_MONACO, EXT_TO_ICON, getViewerMode,
  type TreeNode, type IconKind, type ViewerMode,
} from './fileTypes'
import {
  fetchFSList, fetchFSRead, writeFSFile, mkdirFS, deleteFS,
  renameFS, chmodFS, uploadFSFile, fetchFSHex, fetchFSArchiveList, extractFSArchive,
  type FSEntry,
} from '@/lib/api'
import styles from './FileExplorer.module.css'

// ── Custom Checkbox ───────────────────────────────────────────────────────────
function Checkbox({
  checked, indeterminate = false, onChange,
}: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      className={styles.cbWrap}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
    >
      <span className={`${styles.cbBox} ${checked || indeterminate ? styles.cbChecked : ''} ${indeterminate ? styles.cbIndeterminate : ''}`}>
        {checked && !indeterminate && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {indeterminate && (
          <svg width="8" height="2" viewBox="0 0 8 2">
            <rect width="8" height="2" rx="1" fill="white"/>
          </svg>
        )}
      </span>
    </span>
  )
}

// ── Inline folder SVG icons (blue) ───────────────────────────────────────────
const FolderClosedIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M1 4a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293L8.707 4.707A1 1 0 0 0 9.414 5H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"
      fill="#4a9eff" fillOpacity="0.85"/>
    <path d="M1 6h14" stroke="#3080e8" strokeWidth="0.6" strokeOpacity="0.4"/>
  </svg>
)
const FolderOpenIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M1 4a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293L8.707 4.707A1 1 0 0 0 9.414 5H14a1 1 0 0 1 1 1v1H1V4z"
      fill="#4a9eff" fillOpacity="0.7"/>
    <path d="M1 7h14l-1.5 6a1 1 0 0 1-.97.75H3.47A1 1 0 0 1 2.5 13L1 7z"
      fill="#4a9eff" fillOpacity="0.95"/>
  </svg>
)
const FolderSpecialIcon = ({ size, color = '#4a9eff' }: { size: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M1 4a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293L8.707 4.707A1 1 0 0 0 9.414 5H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"
      fill={color} fillOpacity="0.8"/>
    <path d="M1 6h14" stroke={color} strokeWidth="0.6" strokeOpacity="0.4"/>
  </svg>
)

// ── Material Icon CDN (file types only — folders handled inline) ──────────────
const MATERIAL_CDN = 'https://raw.githubusercontent.com/material-extensions/vscode-material-icon-theme/main/icons/'
const MATERIAL_MAP: Record<string, string> = {
  'js':            'javascript.svg',
  'ts':            'typescript.svg',
  'jsx':           'react.svg',
  'tsx':           'react_ts.svg',
  'html':          'html.svg',
  'css':           'css.svg',
  'scss':          'scss.svg',
  'less':          'less.svg',
  'json':          'json.svg',
  'yaml':          'yaml.svg',
  'toml':          'toml.svg',
  'xml':           'xml.svg',
  'php':           'php.svg',
  'python':        'python.svg',
  'shell':         'shell.svg',
  'sql':           'database.svg',
  'go':            'go.svg',
  'rust':          'rust.svg',
  'java':          'java.svg',
  'c':             'c.svg',
  'cpp':           'cpp.svg',
  'csharp':        'csharp.svg',
  'ruby':          'ruby.svg',
  'swift':         'swift.svg',
  'kotlin':        'kotlin.svg',
  'dart':          'dart.svg',
  'markdown':      'markdown.svg',
  'svg':           'svg.svg',
  'image':         'image.svg',
  'video':         'video.svg',
  'audio':         'audio.svg',
  'pdf':           'pdf.svg',
  'archive':       'zip.svg',
  'binary':        'binary.svg',
  'symlink':       'file.svg',
  'env':           'dotenv.svg',
  'docker':        'docker.svg',
  'config':        'settings.svg',
  'git':           'git.svg',
  'lock':          'lock.svg',
  'vue':           'vue.svg',
  'svelte':        'svelte.svg',
  'graphql':       'graphql.svg',
  'database':      'database.svg',
  'makefile':      'makefile.svg',
  'nginx-conf':    'nginx.svg',
  'file':          'file.svg',
}

// Special folder colors
const FOLDER_SPECIAL_COLORS: Record<string, string> = {
  'folder-git':    '#f14e32',
  'folder-docker': '#2496ed',
  'folder-node':   '#339933',
  'folder-nginx':  '#009900',
  'folder-config': '#e5a00d',
  'folder-src':    '#4a9eff',
  'folder-scripts':'#a855f7',
  'folder-log':    '#f59e0b',
  'folder-tmp':    '#9ca3af',
  'folder-backup': '#22c55e',
  'folder-lib':    '#4a9eff',
  'folder-home':   '#4a9eff',
  'folder-var':    '#4a9eff',
  'folder-etc':    '#4a9eff',
}

const FOLDER_KINDS = new Set([
  'folder', 'folder-open', 'folder-etc', 'folder-home', 'folder-var', 'folder-log',
  'folder-tmp', 'folder-git', 'folder-config', 'folder-backup', 'folder-src',
  'folder-scripts', 'folder-node', 'folder-docker', 'folder-nginx', 'folder-lib',
])

const FallbackFileIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="#6b7080" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 1h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
    <polyline points="10,1 10,4 13,4"/>
  </svg>
)

const FileTypeIcon = memo(function FileTypeIcon({ kind, size = 16 }: { kind: IconKind; size?: number }) {
  const [err, setErr] = useState(false)

  // Render inline blue SVG for all folder kinds
  if (FOLDER_KINDS.has(kind)) {
    if (kind === 'folder-open') return <FolderOpenIcon size={size} />
    const specialColor = FOLDER_SPECIAL_COLORS[kind]
    if (specialColor && kind !== 'folder' && kind !== 'folder-home' && kind !== 'folder-var' && kind !== 'folder-etc' && kind !== 'folder-lib') {
      return <FolderSpecialIcon size={size} color={specialColor} />
    }
    return <FolderClosedIcon size={size} />
  }

  const fileName = MATERIAL_MAP[kind] ?? 'file.svg'
  const src = MATERIAL_CDN + fileName
  if (err) return <FallbackFileIcon size={size} />
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      onError={() => setErr(true)}
    />
  )
})

function getNodeIconKind(node: TreeNode): IconKind {
  if (node.kind === 'folder') return 'folder'
  if (!node.ext) return 'file'
  const e = node.ext.toLowerCase()
  if (e === 'tar.gz' || e === 'tar.bz2' || e === 'tar.xz') return 'archive'
  return EXT_TO_ICON[e] ?? 'file'
}

function getMonacoLang(ext?: string): string {
  if (!ext) return 'plaintext'
  return EXT_TO_MONACO[ext.toLowerCase()] ?? 'plaintext'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getNodePath(node: TreeNode, _tree: TreeNode[]): string {
  return node.id
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

function fsEntryToNode(e: FSEntry): TreeNode {
  const ext = !e.is_dir && e.name.includes('.') ? e.name.split('.').pop()?.toLowerCase() : undefined
  const dt = new Date(e.mod_time * 1000)
  const modified = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  return {
    id: e.path,
    name: e.name,
    kind: e.is_dir ? 'folder' : e.is_symlink ? 'symlink' : 'file',
    ext,
    size: formatBytes(e.size),
    sizeBytes: e.size,
    modified,
    permissions: e.mode,
    owner: e.owner,
    group: e.group,
    hidden: e.name.startsWith('.'),
    target: e.link_target,
    ...(e.is_dir ? { children: undefined } : {}),
  }
}

function updateNodeInTree(nodes: TreeNode[], id: string, fn: (n: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map(n => {
    if (n.id === id) return fn(n)
    if (n.children) return { ...n, children: updateNodeInTree(n.children, id, fn) }
    return n
  })
}

// ── Markdown Renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--color-accent)">$1</a>')
}


// ── Viewer components ─────────────────────────────────────────────────────────
function MarkdownViewer({ content }: { content: string }) {
  return (
    <div className={styles.mdViewer} dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
  )
}

function ImageViewer({ node }: { node: TreeNode }) {
  return (
    <div className={styles.imageViewer}>
      <div className={styles.imagePlaceholder}>
        <div className={styles.imagePlaceholderIcon}><FileTypeIcon kind="image" size={48} /></div>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{node.name}</div>
        <div className={styles.imagePlaceholderText}>Image preview requires a live server.<br/>Click Download to view this file.</div>
        <div className={styles.imageMeta}>{node.size} · {node.ext?.toUpperCase()}</div>
      </div>
    </div>
  )
}

function SvgViewer({ node, content }: { node: TreeNode; content: string }) {
  return (
    <div className={styles.svgViewer}>
      <div className={styles.svgViewerLeft}>
        <div className={styles.svgPreview} dangerouslySetInnerHTML={{ __html: content }} />
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--color-text-muted)' }}>{node.name} · {node.size}</div>
      </div>
      <div className={styles.svgViewerRight}>
        <Editor height="100%" defaultLanguage="xml" value={content} theme="vs-dark"
          options={{ readOnly: false, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', wordWrap: 'on' }} />
      </div>
    </div>
  )
}

function PdfViewer({ node }: { node: TreeNode }) {
  return (
    <div className={styles.pdfViewer}>
      <div className={styles.pdfIcon}><FileTypeIcon kind="pdf" size={40} /></div>
      <div className={styles.pdfTitle}>{node.name}</div>
      <div className={styles.pdfMeta}>{node.size} · PDF Document</div>
      <div className={styles.pdfActions}>
        <button style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--color-accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Download PDF</button>
        <button style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--color-surface-overlay)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontSize: 12, cursor: 'pointer' }}>Open in New Tab</button>
      </div>
    </div>
  )
}

function ArchiveViewer({ node }: { node: TreeNode }) {
  const [entries, setEntries] = useState<Array<{name:string;type:string;size:string;modified:string}>>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState('')

  useEffect(() => {
    if (!node.id) return
    setLoading(true)
    fetchFSArchiveList(node.id).then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [node.id])

  const handleExtract = () => {
    if (!node.id) return
    setExtracting(true)
    setExtractMsg('')
    extractFSArchive(node.id)
      .then(r => setExtractMsg('Extracted to: ' + r.output))
      .catch(e => setExtractMsg('Error: ' + (e as Error).message))
      .finally(() => setExtracting(false))
  }

  return (
    <div className={styles.archiveViewer}>
      <div className={styles.archiveMeta}>
        {[
          { label: 'Archive', value: node.name },
          { label: 'Size', value: node.size ?? '-' },
          { label: 'Format', value: (node.ext ?? 'unknown').toUpperCase() },
          { label: 'Entries', value: loading ? '…' : `${entries.length} files` },
        ].map(m => (
          <div key={m.label} className={styles.archiveMetaCard}>
            <div className={styles.archiveMetaLabel}>{m.label}</div>
            <div className={styles.archiveMetaValue}>{m.value}</div>
          </div>
        ))}
      </div>
      <table className={styles.archiveTable}>
        <thead><tr><th>Path</th><th>Size</th><th>Modified</th></tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={3} style={{ fontSize: 11, color: 'var(--color-text-dim)', padding: 8 }}>Loading…</td></tr>
          ) : entries.map(e => (
            <tr key={e.name}>
              <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileTypeIcon kind={e.type === 'folder' ? 'folder' : 'file'} size={13} />
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.name}</span>
              </td>
              <td>{e.size}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{e.modified}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {extractMsg && (
        <div style={{ fontSize: 11, padding: '4px 0', color: extractMsg.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>{extractMsg}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ padding: '7px 14px', borderRadius: 6, background: 'var(--color-accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: extracting ? 0.6 : 1 }}
          onClick={handleExtract}
          disabled={extracting}
        >
          {extracting ? 'Extracting…' : 'Extract Archive'}
        </button>
        <button style={{ padding: '7px 14px', borderRadius: 6, background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontSize: 12, cursor: 'pointer' }}>Download</button>
      </div>
    </div>
  )
}

function MediaViewer({ node }: { node: TreeNode }) {
  const isAudio = ['mp3','wav','ogg','flac'].includes(node.ext?.toLowerCase() ?? '')
  return (
    <div className={styles.mediaViewer}>
      <FileTypeIcon kind={isAudio ? 'audio' : 'video'} size={48} />
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{node.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{node.size} · {node.ext?.toUpperCase()}</div>
      {isAudio ? <audio className={styles.mediaPlayer} controls><source src="#" /></audio>
               : <video className={styles.mediaPlayer} controls><source src="#" /></video>}
    </div>
  )
}

function BinaryViewer({ node }: { node: TreeNode }) {
  const [rows, setRows] = useState<Array<{addr:string;bytes:string;ascii:string}>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!node.id) return
    setLoading(true)
    fetchFSHex(node.id).then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [node.id])

  return (
    <div className={styles.binaryViewer}>
      <div className={styles.binaryHeader}>
        <div className={styles.binaryIconWrap}><FileTypeIcon kind={getNodeIconKind(node)} size={28} /></div>
        <div>
          <div className={styles.binaryFileName}>{node.name}</div>
          <div className={styles.binaryFileMeta}>{node.size} · {node.permissions} · {node.owner} · Modified {node.modified}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--color-surface-overlay)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontSize: 11, cursor: 'pointer' }}>Download</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '0 2px' }}>Hex preview (first 256 bytes):</div>
      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-dim)', padding: 8 }}>Loading…</div>
      ) : (
        <div className={styles.hexGrid}>
          {rows.map(row => (
            <div key={row.addr} className={styles.hexRow}>
              <span className={styles.hexAddr}>{row.addr}</span>
              <span className={styles.hexBytes}>{row.bytes}</span>
              <span className={styles.hexAscii}>{row.ascii}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MonacoViewer({ node, readOnly = false, onContentChange }: { node: TreeNode; readOnly?: boolean; onContentChange?: (v: string) => void }) {
  const lang = getMonacoLang(node.ext)
  const content = node.content ?? ''
  return (
    <div className={styles.monacoWrap}>
      <Editor height="100%" language={lang} value={content} theme="vs-dark"
        onChange={v => { if (!readOnly && onContentChange) onContentChange(v ?? '') }}
        options={{ readOnly, minimap: { enabled: true }, fontSize: 13, lineNumbers: 'on', wordWrap: 'off',
          scrollBeyondLastLine: false, renderWhitespace: 'selection', bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true }, smoothScrolling: true, cursorBlinking: 'smooth',
          formatOnPaste: true, padding: { top: 12 },
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontLigatures: true, folding: true, glyphMargin: false, overviewRulerLanes: 2 }} />
    </div>
  )
}

// ── Context Menu ──────────────────────────────────────────────────────────────
interface CtxPos { x: number; y: number }
interface ContextMenuProps {
  node: TreeNode
  pos: CtxPos
  onClose: () => void
  onAction: (action: string, node: TreeNode) => void
}

function ContextMenu({ node, pos, onClose, onAction }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isFolder = node.kind === 'folder'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', escHandler) }
  }, [onClose])

  const sep = <div className={styles.ctxSep} />
  const item = (icon: JSX.Element, label: string, action: string, danger = false, disabled = false) => (
    <button key={action} className={`${styles.ctxItem} ${danger ? styles.ctxItemDanger : ''} ${disabled ? styles.ctxItemDisabled : ''}`}
      onClick={() => { if (!disabled) { onAction(action, node); onClose() } }}>
      <span className={styles.ctxIcon}>{icon}</span>
      <span>{label}</span>
    </button>
  )

  const iconOpen     = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 1h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/><polyline points="10,1 10,4 13,4"/></svg>
  const iconEdit     = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3L6 13H3v-3L11 2z"/></svg>
  const iconCopy     = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>
  const iconMove     = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h8M10 5l3 3-3 3"/></svg>
  const iconRename   = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3l-1 1-2-2 1-1a1 1 0 0 1 1.41 0L13 2a1 1 0 0 1 0 1z"/><path d="M10 4L3 11v2h2l7-7-2-2z"/><line x1="2" y1="15" x2="14" y2="15"/></svg>
  const iconDownload = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v9M4 8l4 4 4-4"/><path d="M2 13h12"/></svg>
  const iconUpload   = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11V2M4 5l4-4 4 4"/><path d="M2 13h12"/></svg>
  const iconNewFile  = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 1h6l3 3v10a1 1 0 0 1-1 1H4"/><polyline points="10,1 10,4 13,4"/><line x1="2" y1="11" x2="7" y2="11"/><line x1="4.5" y1="8.5" x2="4.5" y2="13.5"/></svg>
  const iconNewDir   = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3a1 1 0 0 1 1-1h4l1.5 1.5H14a1 1 0 0 1 1 1V12"/><line x1="9" y1="9" x2="14" y2="9"/><line x1="11.5" y1="6.5" x2="11.5" y2="11.5"/></svg>
  const iconPerms    = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>
  const iconInfo     = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="7"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none"/></svg>
  const iconDelete   = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>
  const iconCopyPath = <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="4,7 2,10 4,13"/><polyline points="12,7 14,10 12,13"/><line x1="9" y1="4" x2="7" y2="16"/></svg>

  return (
    <div ref={ref} className={styles.ctxMenu} style={{ top: pos.y, left: pos.x }}>
      <div className={styles.ctxHeader}>
        <FileTypeIcon kind={isFolder ? 'folder' : getNodeIconKind(node)} size={13} />
        <span className={styles.ctxHeaderName}>{node.name}</span>
      </div>
      {item(iconOpen, isFolder ? 'Open Folder' : 'Open File', 'open')}
      {!isFolder && item(iconEdit, 'Edit', 'edit')}
      {sep}
      {item(iconCopy, 'Copy', 'copy')}
      {item(iconMove, 'Move', 'move')}
      {item(iconRename, 'Rename', 'rename')}
      {sep}
      {item(iconDownload, 'Download', 'download')}
      {isFolder && item(iconUpload, 'Upload Here', 'upload')}
      {!isFolder && item(iconUpload, 'Replace File', 'upload')}
      {sep}
      {isFolder && item(iconNewFile, 'New File', 'newfile')}
      {isFolder && item(iconNewDir, 'New Folder', 'newfolder')}
      {isFolder && sep}
      {item(iconPerms, 'Permissions', 'permissions')}
      {item(iconInfo, 'Properties', 'properties')}
      {item(iconCopyPath, 'Copy Path', 'copypath')}
      {sep}
      {item(iconDelete, 'Delete', 'delete', true)}
    </div>
  )
}

// ── Permissions Modal ─────────────────────────────────────────────────────────
function PermissionsModal({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const permsStr = node.permissions ?? '-rwxr-xr-x'
  const parsePerms = (p: string) => ({
    ur: p[1] === 'r', uw: p[2] === 'w', ux: p[3] === 'x',
    gr: p[4] === 'r', gw: p[5] === 'w', gx: p[6] === 'x',
    or: p[7] === 'r', ow: p[8] === 'w', ox: p[9] === 'x',
  })
  const [perms, setPerms] = useState(parsePerms(permsStr))
  const [owner, setOwner] = useState(node.owner ?? 'root')
  const [group, setGroup] = useState(node.group ?? 'root')
  const [recursive, setRecursive] = useState(false)
  const [saved, setSaved] = useState(false)

  const octal = () => {
    const u = (perms.ur ? 4 : 0) + (perms.uw ? 2 : 0) + (perms.ux ? 1 : 0)
    const g = (perms.gr ? 4 : 0) + (perms.gw ? 2 : 0) + (perms.gx ? 1 : 0)
    const o = (perms.or ? 4 : 0) + (perms.ow ? 2 : 0) + (perms.ox ? 1 : 0)
    return `${u}${g}${o}`
  }
  const sym = () => {
    const b = (p: boolean, c: string) => p ? c : '-'
    return `${node.kind === 'folder' ? 'd' : '-'}${b(perms.ur,'r')}${b(perms.uw,'w')}${b(perms.ux,'x')}${b(perms.gr,'r')}${b(perms.gw,'w')}${b(perms.gx,'x')}${b(perms.or,'r')}${b(perms.ow,'w')}${b(perms.ox,'x')}`
  }
  const toggle = (k: keyof typeof perms) => setPerms(p => ({ ...p, [k]: !p[k] }))

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
          <span className={styles.fmModalTitle}>Permissions — {node.name}</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div className={styles.permsPreview}>
            <span className={styles.permsSym}>{sym()}</span>
            <span className={styles.permsOctal}>{octal()}</span>
            <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>chmod {octal()} {node.name}</span>
          </div>
          <table className={styles.permsTable}>
            <thead>
              <tr>
                <th></th>
                <th><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="6" r="3"/><path d="M2 14a6 6 0 0 1 12 0"/></svg> Read</th>
                <th><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3L6 13H3v-3L11 2z"/></svg> Write</th>
                <th><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="5,3 13,8 5,13"/></svg> Execute</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Owner', r: 'ur' as const, w: 'uw' as const, x: 'ux' as const },
                { label: 'Group', r: 'gr' as const, w: 'gw' as const, x: 'gx' as const },
                { label: 'Others', r: 'or' as const, w: 'ow' as const, x: 'ox' as const },
              ].map(row => (
                <tr key={row.label}>
                  <td className={styles.permsCat}>{row.label}</td>
                  {([row.r, row.w, row.x] as const).map(k => (
                    <td key={k} className={styles.permsCell}>
                      <label className={styles.permsCb}>
                        <input type="checkbox" checked={perms[k]} onChange={() => toggle(k)} />
                        <span className={`${styles.permsCbBox} ${perms[k] ? styles.permsCbOn : ''}`}>
                          {perms[k] && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.fmFormRow}>
            <div className={styles.fmFormGroup}>
              <label className={styles.fmLabel}>Owner</label>
              <input className={styles.fmInput} value={owner} onChange={e => setOwner(e.target.value)} />
            </div>
            <div className={styles.fmFormGroup}>
              <label className={styles.fmLabel}>Group</label>
              <input className={styles.fmInput} value={group} onChange={e => setGroup(e.target.value)} />
            </div>
          </div>
          {node.kind === 'folder' && (
            <label className={styles.fmCheck}>
              <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} />
              <span>Apply recursively to all contents</span>
            </label>
          )}
          {saved && <div className={styles.fmSuccess}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,8 7,12 13,4"/></svg> Permissions updated successfully</div>}
        </div>
        <div className={styles.fmModalFoot}>
          <button className={styles.fmBtn} onClick={onClose}>Cancel</button>
          <button className={`${styles.fmBtn} ${styles.fmBtnPrimary}`} onClick={() => {
            chmodFS(node.id, octal())
              .then(() => { setSaved(true); setTimeout(onClose, 1200) })
              .catch(() => { setSaved(true); setTimeout(onClose, 1200) })
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,8 7,12 13,4"/></svg>
            Apply chmod {octal()}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<{ name: string; size: string; progress: number; file: File }[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const destPath = node.kind === 'folder' ? node.id : '/'
  const dest = node.kind === 'folder' ? node.name : 'current directory'

  const addFiles = (fl: FileList) => {
    const newFiles = Array.from(fl).map(f => ({
      name: f.name,
      size: f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`,
      progress: 0,
      file: f,
    }))
    setFiles(prev => [...prev, ...newFiles])
  }

  const doUpload = () => {
    if (files.length === 0) return
    setUploading(true)
    const pending = files.filter(f => f.progress < 100)
    let done = 0
    pending.forEach((f) => {
      const idx = files.indexOf(f)
      setFiles(prev => { const next = [...prev]; next[idx] = { ...next[idx], progress: 10 }; return next })
      uploadFSFile(destPath, f.file)
        .then(() => {
          setFiles(prev => { const next = [...prev]; next[idx] = { ...next[idx], progress: 100 }; return next })
        })
        .catch(() => {
          setFiles(prev => { const next = [...prev]; next[idx] = { ...next[idx], progress: 100 }; return next })
        })
        .finally(() => {
          done++
          if (done === pending.length) setUploading(false)
        })
    })
  }

  const formatIcon = (name: string) => {
    const ext = name.split('.').pop() ?? ''
    const kind = EXT_TO_ICON[ext.toLowerCase()] ?? 'file'
    return <FileTypeIcon kind={kind} size={16} />
  }

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11V2M4 5l4-4 4 4"/><path d="M2 13h12"/></svg>
          <span className={styles.fmModalTitle}>Upload to /{dest}</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => e.target.files && addFiles(e.target.files)} />
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M24 32V16M16 22l8-8 8 8"/><rect x="8" y="8" width="32" height="32" rx="4"/>
            </svg>
            <div className={styles.dropZoneText}>Drop files here or <span style={{ color: 'var(--color-accent)' }}>click to browse</span></div>
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Any file type · Max 5 GB</div>
          </div>
          {files.length > 0 && (
            <div className={styles.uploadList}>
              {files.map((f, i) => (
                <div key={i} className={styles.uploadItem}>
                  {formatIcon(f.name)}
                  <div className={styles.uploadItemInfo}>
                    <div className={styles.uploadItemName}>{f.name}</div>
                    <div className={styles.uploadItemSize}>{f.size}</div>
                    <div className={styles.uploadBar}>
                      <div className={styles.uploadBarFill} style={{ width: `${f.progress}%`, background: f.progress >= 100 ? 'var(--color-success)' : 'var(--color-accent)' }} />
                    </div>
                  </div>
                  <div className={styles.uploadItemStatus}>
                    {f.progress >= 100 ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,8 7,12 13,4"/></svg>
                    ) : f.progress > 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{Math.round(f.progress)}%</span>
                    ) : (
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', fontSize: 11, padding: 2 }}
                        onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.fmModalFoot}>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', marginRight: 'auto' }}>{files.length} file{files.length !== 1 ? 's' : ''} queued</span>
          <button className={styles.fmBtn} onClick={onClose}>Close</button>
          <button className={`${styles.fmBtn} ${styles.fmBtnPrimary}`} disabled={files.length === 0 || uploading} onClick={doUpload}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11V2M4 5l4-4 4 4"/><path d="M2 13h12"/></svg>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rename Modal ──────────────────────────────────────────────────────────────
function RenameModal({ node, onClose, onRename }: { node: TreeNode; onClose: () => void; onRename: (id: string, name: string) => void }) {
  const [name, setName] = useState(node.name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.select() }, [])

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3l-1 1-2-2 1-1a1 1 0 0 1 1.41 0L13 2a1 1 0 0 1 0 1z"/><path d="M10 4L3 11v2h2l7-7-2-2z"/><line x1="2" y1="15" x2="14" y2="15"/></svg>
          <span className={styles.fmModalTitle}>Rename — {node.name}</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div className={styles.fmFormGroup}>
            <label className={styles.fmLabel}>New name</label>
            <input ref={inputRef} className={styles.fmInput} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onRename(node.id, name.trim()); onClose() } }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            Original: <code style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{node.name}</code>
          </div>
        </div>
        <div className={styles.fmModalFoot}>
          <button className={styles.fmBtn} onClick={onClose}>Cancel</button>
          <button className={`${styles.fmBtn} ${styles.fmBtnPrimary}`} disabled={!name.trim() || name === node.name}
            onClick={() => { onRename(node.id, name.trim()); onClose() }}>Rename</button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ nodes, onClose, onDelete }: { nodes: TreeNode[]; onClose: () => void; onDelete: (ids: string[]) => void }) {
  const [confirm, setConfirm] = useState('')
  const multi = nodes.length > 1
  const target = multi ? `${nodes.length} items` : nodes[0].name
  const needsConfirm = nodes.some(n => n.kind === 'folder')

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead} style={{ borderBottom: '1px solid rgba(255,77,77,0.3)' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#ff4d4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>
          <span className={styles.fmModalTitle} style={{ color: '#ff4d4d' }}>Delete {target}</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div className={styles.fmDangerBanner}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#ff4d4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1l7 14H1z"/><line x1="8" y1="6" x2="8" y2="10"/><circle cx="8" cy="12.5" r=".5" fill="#ff4d4d" stroke="none"/></svg>
            <span>This action is <strong>permanent</strong> and cannot be undone. {nodes.some(n => n.kind === 'folder') ? 'All contents of the folder(s) will be deleted.' : ''}</span>
          </div>
          {multi && (
            <div className={styles.deleteList}>
              {nodes.map(n => (
                <div key={n.id} className={styles.deleteItem}>
                  <FileTypeIcon kind={n.kind === 'folder' ? 'folder' : getNodeIconKind(n)} size={13} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{n.name}</span>
                </div>
              ))}
            </div>
          )}
          {needsConfirm && (
            <div className={styles.fmFormGroup}>
              <label className={styles.fmLabel}>Type <strong style={{ color: 'var(--color-text)' }}>delete</strong> to confirm</label>
              <input className={styles.fmInput} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="delete" />
            </div>
          )}
        </div>
        <div className={styles.fmModalFoot}>
          <button className={styles.fmBtn} onClick={onClose}>Cancel</button>
          <button className={`${styles.fmBtn} ${styles.fmBtnDanger}`}
            disabled={needsConfirm && confirm !== 'delete'}
            onClick={() => { onDelete(nodes.map(n => n.id)); onClose() }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>
            Delete {multi ? `${nodes.length} items` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Copy / Move Destination Modal ─────────────────────────────────────────────
function MoveModal({ nodes, mode, tree, onClose }: { nodes: TreeNode[]; mode: 'copy' | 'move'; tree: TreeNode[]; onClose: () => void }) {
  const [dest, setDest] = useState('/')
  const [done, setDone] = useState(false)
  const folders = ['/']
  const collectFolders = (ns: TreeNode[], path: string) => {
    ns.forEach(n => { if (n.kind === 'folder') { const p = `${path}/${n.name}`; folders.push(p); if (n.children) collectFolders(n.children, p) } })
  }
  collectFolders(tree, '')

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead}>
          {mode === 'copy'
            ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>
            : <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h8M10 5l3 3-3 3"/></svg>
          }
          <span className={styles.fmModalTitle}>{mode === 'copy' ? 'Copy' : 'Move'} {nodes.length === 1 ? nodes[0].name : `${nodes.length} items`}</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div className={styles.fmFormGroup}>
            <label className={styles.fmLabel}>Destination folder</label>
            <select className={styles.fmSelect} value={dest} onChange={e => setDest(e.target.value)}>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            {nodes.length === 1 ? (
              <span>Will {mode} <code style={{ fontFamily:'monospace', color:'var(--color-text-muted)' }}>{nodes[0].name}</code> to <code style={{ fontFamily:'monospace', color:'var(--color-text-muted)' }}>{dest}/{nodes[0].name}</code></span>
            ) : (
              <span>Will {mode} {nodes.length} items to <code style={{ fontFamily:'monospace', color:'var(--color-text-muted)' }}>{dest}/</code></span>
            )}
          </div>
          {done && <div className={styles.fmSuccess}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,8 7,12 13,4"/></svg> {mode === 'copy' ? 'Copied' : 'Moved'} successfully</div>}
        </div>
        <div className={styles.fmModalFoot}>
          <button className={styles.fmBtn} onClick={onClose}>Cancel</button>
          <button className={`${styles.fmBtn} ${styles.fmBtnPrimary}`} onClick={() => { setDone(true); setTimeout(onClose, 1200) }}>
            {mode === 'copy' ? 'Copy Here' : 'Move Here'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New File / Folder Modal ────────────────────────────────────────────────────
function NewItemModal({ parent, type, onClose, onCreate }: { parent: TreeNode | null; type: 'file' | 'folder'; onClose: () => void; onCreate: (name: string, type: 'file' | 'folder') => void }) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const dest = parent ? `/${parent.name}/` : '/'

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead}>
          {type === 'file'
            ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 1h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/><polyline points="10,1 10,4 13,4"/><line x1="5" y1="9" x2="8" y2="9"/><line x1="5" y1="12" x2="11" y2="12"/></svg>
            : <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3a1 1 0 0 1 1-1h4l1.5 1.5H14a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z"/></svg>
          }
          <span className={styles.fmModalTitle}>New {type === 'file' ? 'File' : 'Folder'}</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div className={styles.fmFormGroup}>
            <label className={styles.fmLabel}>{type === 'file' ? 'File' : 'Folder'} name</label>
            <input ref={inputRef} className={styles.fmInput} value={name} onChange={e => setName(e.target.value)} placeholder={type === 'file' ? 'newfile.txt' : 'new-folder'}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onCreate(name.trim(), type); onClose() } }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Will be created at <code style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{dest}{name || (type === 'file' ? 'newfile' : 'new-folder')}</code></div>
        </div>
        <div className={styles.fmModalFoot}>
          <button className={styles.fmBtn} onClick={onClose}>Cancel</button>
          <button className={`${styles.fmBtn} ${styles.fmBtnPrimary}`} disabled={!name.trim()}
            onClick={() => { onCreate(name.trim(), type); onClose() }}>Create</button>
        </div>
      </div>
    </div>
  )
}

// ── Properties Modal ──────────────────────────────────────────────────────────
function PropertiesModal({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const kind = node.kind === 'folder' ? 'folder' : getNodeIconKind(node)
  const rows = [
    { label: 'Name', value: node.name },
    { label: 'Type', value: node.kind === 'folder' ? 'Directory' : (node.ext?.toUpperCase() ?? 'File') },
    { label: 'Size', value: node.size ?? 'Calculating…' },
    { label: 'Permissions', value: node.permissions ?? 'Unknown' },
    { label: 'Owner', value: node.owner ?? 'root' },
    { label: 'Group', value: node.group ?? 'root' },
    { label: 'Modified', value: node.modified ?? 'Unknown' },
    ...(node.kind === 'symlink' && node.target ? [{ label: 'Target', value: node.target }] : []),
  ]

  return (
    <div className={styles.fmOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.fmModal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className={styles.fmModalHead}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="7"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5" r=".5" fill="currentColor" stroke="none"/></svg>
          <span className={styles.fmModalTitle}>Properties</span>
          <button className={styles.fmModalClose} onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
        </div>
        <div className={styles.fmModalBody}>
          <div className={styles.propsIcon}><FileTypeIcon kind={kind} size={40} /></div>
          <table className={styles.propsTable}>
            <tbody>
              {rows.map(r => (
                <tr key={r.label}>
                  <td className={styles.propsTdLabel}>{r.label}</td>
                  <td className={styles.propsTdValue}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.fmModalFoot}>
          <button className={`${styles.fmBtn} ${styles.fmBtnPrimary}`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Tree node component ───────────────────────────────────────────────────────
interface TreeNodeProps {
  node: TreeNode
  depth: number
  selectedId: string | null
  openFolders: Set<string>
  selectedFiles: Set<string>
  onSelect: (node: TreeNode) => void
  onToggle: (id: string) => void
  onCheck: (id: string, v: boolean) => void
  onCtxMenu: (e: React.MouseEvent, node: TreeNode) => void
  searchTerm: string
}

function TreeNodeItem({
  node, depth, selectedId, openFolders, selectedFiles,
  onSelect, onToggle, onCheck, onCtxMenu, searchTerm,
}: TreeNodeProps) {
  const isFolder = node.kind === 'folder'
  const isOpen = openFolders.has(node.id)
  const isActive = selectedId === node.id
  const isChecked = selectedFiles.has(node.id)
  const kind: IconKind = isFolder ? (isOpen ? 'folder-open' : 'folder') : getNodeIconKind(node)

  const nameMatch = !searchTerm || node.name.toLowerCase().includes(searchTerm.toLowerCase())
  const childrenMatch = node.children?.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  if (!nameMatch && !childrenMatch) return null

  const paddingLeft = depth * 12 + 4

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.treeRow} ${isActive ? styles.treeRowActive : ''} ${isChecked ? styles.treeRowSelected : ''}`}
        style={{ paddingLeft }}
        onClick={() => { if (isFolder) onToggle(node.id); onSelect(node) }}
        onContextMenu={e => { e.preventDefault(); onCtxMenu(e, node) }}
      >
        {isFolder ? (
          <span className={`${styles.treeChevron} ${isOpen ? styles.treeChevronOpen : ''}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M3 1l4 4-4 4" strokeWidth="0" fillRule="evenodd"/>
            </svg>
          </span>
        ) : (
          <span className={styles.treeChevronSpacer} />
        )}
        <span className={styles.treeIcon}><FileTypeIcon kind={kind} size={15} /></span>
        <span className={styles.treeName} title={node.name}>{node.name}</span>
        <span style={{ marginRight: 4, opacity: isChecked ? 1 : 0, transition: 'opacity 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
          <Checkbox checked={isChecked} onChange={v => onCheck(node.id, v)} />
        </span>
      </div>
      {isFolder && isOpen && node.children && (
        <div className={styles.treeNodeChildren}>
          {node.children.map(child => (
            <TreeNodeItem key={child.id} node={child} depth={depth + 1}
              selectedId={selectedId} openFolders={openFolders} selectedFiles={selectedFiles}
              onSelect={onSelect} onToggle={onToggle} onCheck={onCheck} onCtxMenu={onCtxMenu}
              searchTerm={searchTerm} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Open tab ──────────────────────────────────────────────────────────────────
interface OpenTab { node: TreeNode; viewerMode: ViewerMode }

// ── Modal types ───────────────────────────────────────────────────────────────
type ActiveModal =
  | { type: 'permissions'; node: TreeNode }
  | { type: 'upload'; node: TreeNode }
  | { type: 'rename'; node: TreeNode }
  | { type: 'delete'; nodes: TreeNode[] }
  | { type: 'copy' | 'move'; nodes: TreeNode[] }
  | { type: 'newfile' | 'newfolder'; parent: TreeNode | null }
  | { type: 'properties'; node: TreeNode }
  | null

// ── Find node by id ───────────────────────────────────────────────────────────
function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

// ── Main FileExplorer ─────────────────────────────────────────────────────────
export default function FileExplorer() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [treeWidth, setTreeWidth] = useState(260)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState<string | undefined>(undefined)
  const [showHidden, setShowHidden] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ node: TreeNode; pos: CtxPos } | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const resizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  const activeTab = tabs.find(t => t.node.id === activeTabId) ?? null

  // Load root directory on mount
  useEffect(() => {
    fetchFSList('/').then(resp => {
      setTree((resp.files ?? []).map(fsEntryToNode))
    }).catch(() => {})
  }, [])

  const toggleFolder = useCallback((id: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        setTree(t => {
          const node = findNode(t, id)
          if (node && node.kind === 'folder' && node.children === undefined) {
            fetchFSList(id).then(resp => {
              setTree(t2 => updateNodeInTree(t2, id, n => ({ ...n, children: (resp.files ?? []).map(fsEntryToNode) })))
            }).catch(() => {
              setTree(t2 => updateNodeInTree(t2, id, n => ({ ...n, children: [] })))
            })
          }
          return t
        })
      }
      return next
    })
  }, [])

  const selectNode = useCallback((node: TreeNode) => {
    setSelectedId(node.id)
    if (node.kind === 'file') {
      const mode = getViewerMode(node.ext ?? '')
      setTabs(prev => {
        if (prev.find(t => t.node.id === node.id)) return prev
        return [...prev, { node, viewerMode: mode }]
      })
      setActiveTabId(node.id)
      setIsEditing(false)
      setEditContent(undefined)
      if ((mode === 'monaco' || mode === 'markdown' || mode === 'svg') && node.content === undefined) {
        fetchFSRead(node.id).then(resp => {
          const updated = { ...node, content: resp.content }
          setTree(t => updateNodeInTree(t, node.id, () => updated))
          setTabs(prev => prev.map(t => t.node.id === node.id ? { ...t, node: updated } : t))
        }).catch(() => {})
      }
    }
  }, [])

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTabs(prev => {
      const next = prev.filter(t => t.node.id !== id)
      if (activeTabId === id) setActiveTabId(next[next.length - 1]?.node.id ?? null)
      return next
    })
  }, [activeTabId])

  const checkFile = useCallback((id: string, v: boolean) => {
    setSelectedFiles(prev => { const next = new Set(prev); v ? next.add(id) : next.delete(id); return next })
  }, [])

  const openCtxMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 400)
    setCtxMenu({ node, pos: { x, y } })
  }, [])

  const handleAction = useCallback((action: string, node: TreeNode) => {
    switch (action) {
      case 'open':
        if (node.kind === 'folder') { toggleFolder(node.id) }
        else selectNode(node)
        break
      case 'edit':
        selectNode(node)
        setTimeout(() => setIsEditing(true), 50)
        break
      case 'permissions': setActiveModal({ type: 'permissions', node }); break
      case 'upload': setActiveModal({ type: 'upload', node }); break
      case 'rename': setActiveModal({ type: 'rename', node }); break
      case 'delete': setActiveModal({ type: 'delete', nodes: selectedFiles.size > 1 ? [...selectedFiles].map(id => findNode(tree, id)).filter(Boolean) as TreeNode[] : [node] }); break
      case 'copy': setActiveModal({ type: 'copy', nodes: selectedFiles.size > 1 ? [...selectedFiles].map(id => findNode(tree, id)).filter(Boolean) as TreeNode[] : [node] }); break
      case 'move': setActiveModal({ type: 'move', nodes: selectedFiles.size > 1 ? [...selectedFiles].map(id => findNode(tree, id)).filter(Boolean) as TreeNode[] : [node] }); break
      case 'newfile': setActiveModal({ type: 'newfile', parent: node.kind === 'folder' ? node : null }); break
      case 'newfolder': setActiveModal({ type: 'newfolder', parent: node.kind === 'folder' ? node : null }); break
      case 'properties': setActiveModal({ type: 'properties', node }); break
      case 'copypath': navigator.clipboard.writeText(node.id).catch(() => {}); break
      case 'download': {
        const a = document.createElement('a')
        a.href = `/api/files/download?path=${encodeURIComponent(node.id)}`
        a.download = node.name
        a.click()
        break
      }
    }
  }, [selectedFiles, tree, selectNode, toggleFolder])

  const handleRename = useCallback((id: string, newName: string) => {
    const node = findNode(tree, id)
    if (!node) return
    const parentPath = id.substring(0, id.lastIndexOf('/')) || '/'
    const newPath = `${parentPath === '/' ? '' : parentPath}/${newName}`
    renameFS(id, newPath)
      .then(() => {
        setTree(t => updateNodeInTree(t, id, n => ({ ...n, id: newPath, name: newName })))
        setTabs(prev => prev.map(t => t.node.id === id ? { ...t, node: { ...t.node, id: newPath, name: newName } } : t))
        if (activeTabId === id) setActiveTabId(newPath)
      })
      .catch(() => {})
  }, [tree, activeTabId])

  const handleDelete = useCallback((ids: string[]) => {
    ids.forEach(id => {
      const node = findNode(tree, id)
      deleteFS(id, node?.kind === 'folder').catch(() => {})
    })
    const deleteFromTree = (nodes: TreeNode[]): TreeNode[] =>
      nodes.filter(n => !ids.includes(n.id)).map(n => ({ ...n, children: n.children ? deleteFromTree(n.children) : undefined }))
    setTree(t => deleteFromTree(t))
    setTabs(prev => prev.filter(t => !ids.includes(t.node.id)))
    setSelectedFiles(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
  }, [tree])

  const handleCreate = useCallback((name: string, type: 'file' | 'folder', parent?: TreeNode | null) => {
    const parentPath = parent?.id ?? '/'
    const newPath = `${parentPath === '/' ? '' : parentPath}/${name}`
    const newNode: TreeNode = {
      id: newPath, name, kind: type === 'file' ? 'file' : 'folder',
      permissions: type === 'folder' ? 'drwxr-xr-x' : '-rw-r--r--',
      owner: 'root', group: 'root', modified: new Date().toISOString().slice(0, 10),
      ...(type === 'file' ? { size: '0 B', ext: name.split('.').pop(), content: '' } : { children: [] }),
    }
    if (type === 'folder') {
      mkdirFS(newPath).catch(() => {})
    } else {
      writeFSFile(newPath, '').catch(() => {})
    }
    if (parent) {
      setTree(t => updateNodeInTree(t, parent.id, n => ({ ...n, children: [...(n.children ?? []), newNode] })))
    } else {
      setTree(t => [...t, newNode])
    }
  }, [])

  // Resize panel
  const startResize = (e: React.MouseEvent) => {
    resizing.current = true; resizeStartX.current = e.clientX; resizeStartW.current = treeWidth
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      setTreeWidth(Math.max(160, Math.min(480, resizeStartW.current + e.clientX - resizeStartX.current)))
    }
    const onUp = () => { resizing.current = false; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // Visible tree (hide hidden files if needed)
  const visibleTree = showHidden ? tree : tree.map(n => ({ ...n }))

  // Flatten tree for select all
  const allFileIds: string[] = []
  const collectIds = (nodes: TreeNode[]) => {
    for (const n of nodes) { if (n.kind === 'file') allFileIds.push(n.id); if (n.children) collectIds(n.children) }
  }
  collectIds(tree)
  const allChecked = allFileIds.length > 0 && allFileIds.every(id => selectedFiles.has(id))
  const someChecked = allFileIds.some(id => selectedFiles.has(id))

  const selectedNode = selectedId ? findNode(tree, selectedId) : null
  const selectedFilesArr = [...selectedFiles].map(id => findNode(tree, id)).filter(Boolean) as TreeNode[]

  return (
    <div className={styles.explorer} onClick={() => ctxMenu && setCtxMenu(null)}>
      {/* ── Context Menu ── */}
      {ctxMenu && (
        <ContextMenu node={ctxMenu.node} pos={ctxMenu.pos}
          onClose={() => setCtxMenu(null)} onAction={handleAction} />
      )}

      {/* ── Modals ── */}
      {activeModal?.type === 'permissions' && <PermissionsModal node={activeModal.node} onClose={() => setActiveModal(null)} />}
      {activeModal?.type === 'upload' && <UploadModal node={activeModal.node} onClose={() => setActiveModal(null)} />}
      {activeModal?.type === 'rename' && <RenameModal node={activeModal.node} onClose={() => setActiveModal(null)} onRename={handleRename} />}
      {activeModal?.type === 'delete' && <DeleteModal nodes={activeModal.nodes} onClose={() => setActiveModal(null)} onDelete={handleDelete} />}
      {(activeModal?.type === 'copy' || activeModal?.type === 'move') && (
        <MoveModal nodes={activeModal.nodes} mode={activeModal.type} tree={tree} onClose={() => setActiveModal(null)} />
      )}
      {(activeModal?.type === 'newfile' || activeModal?.type === 'newfolder') && (() => {
        const parent = activeModal.parent
        return (
          <NewItemModal parent={parent} type={activeModal.type === 'newfile' ? 'file' : 'folder'}
            onClose={() => setActiveModal(null)}
            onCreate={(name, type) => handleCreate(name, type, parent)} />
        )
      })()}
      {activeModal?.type === 'properties' && <PropertiesModal node={activeModal.node} onClose={() => setActiveModal(null)} />}

      {/* ── Left Tree Panel ── */}
      <div className={styles.treePanel} style={{ width: treeWidth }}>
        <div className={styles.treePanelHeader}>
          <span className={styles.treePanelTitle}>Server Files</span>
          {selectedFiles.size > 0 && (
            <span style={{ fontSize: 10, background: 'var(--color-accent)', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>
              {selectedFiles.size}
            </span>
          )}
          <button className={styles.iconBtn} title="New File" onClick={() => setActiveModal({ type: 'newfile', parent: selectedNode?.kind === 'folder' ? selectedNode : null })}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 1h5l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/><polyline points="8,1 8,4 11,4"/><line x1="4" y1="8" x2="7" y2="8"/><line x1="5.5" y1="6.5" x2="5.5" y2="9.5"/></svg>
          </button>
          <button className={styles.iconBtn} title="New Folder" onClick={() => setActiveModal({ type: 'newfolder', parent: selectedNode?.kind === 'folder' ? selectedNode : null })}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 3a1 1 0 0 1 1-1h3l1.5 1.5H12a1 1 0 0 1 1 1V10"/><line x1="8" y1="8" x2="12" y2="8"/><line x1="10" y1="6" x2="10" y2="10"/></svg>
          </button>
          <button className={styles.iconBtn} title="Upload" onClick={() => setActiveModal({ type: 'upload', node: selectedNode?.kind === 'folder' ? selectedNode : (tree[0] ?? tree[0]) })}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 9V2M3 4l3-3 3 3"/><path d="M1 10h10"/></svg>
          </button>
          <button className={styles.iconBtn} title="Collapse all" onClick={() => setOpenFolders(new Set())}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4l4-3 4 3M2 8l4 3 4-3"/></svg>
          </button>
          <button className={styles.iconBtn} title={showHidden ? 'Hide hidden files' : 'Show hidden files'} onClick={() => setShowHidden(v => !v)}
            style={{ color: showHidden ? 'var(--color-accent)' : undefined }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {showHidden ? <><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></>
                          : <><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><line x1="2" y1="2" x2="14" y2="14"/></>}
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className={styles.treePanelSearch}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/>
          </svg>
          <input className={styles.treePanelSearchInput} placeholder="Filter files…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          {searchTerm && (
            <button className={styles.iconBtn} onClick={() => setSearchTerm('')}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
              </svg>
            </button>
          )}
        </div>

        {/* Path label */}
        <div style={{ padding: '4px 10px 2px', fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="2" width="14" height="12" rx="2"/><line x1="1" y1="6" x2="15" y2="6"/><line x1="5" y1="2" x2="5" y2="6"/></svg>
          / (root)
        </div>

        {/* Tree */}
        <div className={styles.treeScroll}>
          {visibleTree.map(node => (
            <TreeNodeItem key={node.id} node={node} depth={0}
              selectedId={selectedId} openFolders={openFolders} selectedFiles={selectedFiles}
              onSelect={selectNode} onToggle={toggleFolder} onCheck={checkFile}
              onCtxMenu={openCtxMenu} searchTerm={searchTerm} />
          ))}
        </div>

        {/* Bottom: multi-select bulk ops bar */}
        {selectedFiles.size > 0 && (
          <div className={styles.bulkBar}>
            <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked}
              onChange={v => { if (v) setSelectedFiles(new Set(allFileIds)); else setSelectedFiles(new Set()) }} />
            <span className={styles.bulkCount}>{selectedFiles.size} selected</span>
            <button className={styles.bulkBtn} title="Copy" onClick={() => setActiveModal({ type: 'copy', nodes: selectedFilesArr })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>
            </button>
            <button className={styles.bulkBtn} title="Move" onClick={() => setActiveModal({ type: 'move', nodes: selectedFilesArr })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h8M10 5l3 3-3 3"/></svg>
            </button>
            <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} title="Delete" onClick={() => setActiveModal({ type: 'delete', nodes: selectedFilesArr })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>
            </button>
            <button className={styles.bulkBtn} title="Deselect all" onClick={() => setSelectedFiles(new Set())}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="9" y2="9"/><line x1="9" y1="2" x2="2" y2="9"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} onMouseDown={startResize} />

      {/* ── Right Viewer Panel ── */}
      <div className={styles.viewerPanel}>
        {/* Tabs */}
        {tabs.length > 0 && (
          <div className={styles.tabsBar}>
            {tabs.map(tab => (
              <button key={tab.node.id}
                className={`${styles.fileTab} ${activeTabId === tab.node.id ? styles.fileTabActive : ''}`}
                onClick={() => { setActiveTabId(tab.node.id); setIsEditing(false) }}>
                <FileTypeIcon kind={getNodeIconKind(tab.node)} size={13} />
                <span className={styles.fileTabName}>{tab.node.name}</span>
                <span className={styles.fileTabClose} onClick={e => closeTab(tab.node.id, e)}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/>
                  </svg>
                </span>
              </button>
            ))}
            <div className={styles.tabsBarSpacer} />
            <div className={styles.tabsBarActions}>
              <button className={styles.iconBtn} title="Close all" onClick={() => { setTabs([]); setActiveTabId(null) }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Viewer toolbar */}
        {activeTab && (
          <div className={styles.viewerToolbar}>
            <span className={styles.viewerFilePath}>
              {getNodePath(activeTab.node, tree)}
            </span>
            {activeTab.viewerMode === 'monaco' && (
              <span className={styles.viewerLangBadge}>{getMonacoLang(activeTab.node.ext)}</span>
            )}
            <span className={styles.viewerLangBadge}>{activeTab.node.size}</span>

            {activeTab.viewerMode === 'monaco' && (
              <button className={isEditing ? styles.toolBtnAccent : styles.toolBtn} onClick={() => setIsEditing(v => !v)}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3L6 13H3v-3L11 2z"/></svg>
                {isEditing ? 'Editing' : 'Edit'}
              </button>
            )}
            {isEditing && (
              <button className={styles.toolBtnAccent} onClick={() => {
                const content = editContent ?? activeTab?.node.content ?? ''
                writeFSFile(activeTab!.node.id, content)
                  .then(() => setIsEditing(false))
                  .catch(() => {})
              }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H5a1 1 0 0 0-1 1v1h8a1 1 0 0 1 1 1v9a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/><rect x="2" y="5" width="10" height="9" rx="1"/></svg>
                Save
              </button>
            )}
            <button className={styles.toolBtn} onClick={() => setActiveModal({ type: 'permissions', node: activeTab.node })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>
              Permissions
            </button>
            <button className={styles.toolBtn} onClick={() => setActiveModal({ type: 'rename', node: activeTab.node })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3L6 13H3v-3L11 2z"/></svg>
              Rename
            </button>
            <button className={styles.toolBtn} onClick={() => setActiveModal({ type: 'copy', nodes: [activeTab.node] })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>
              Copy
            </button>
            <button className={styles.toolBtn} onClick={() => setActiveModal({ type: 'move', nodes: [activeTab.node] })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h8M10 5l3 3-3 3"/></svg>
              Move
            </button>
            <button className={styles.toolBtn} onClick={() => {
              const a = document.createElement('a')
              a.href = `/api/files/download?path=${encodeURIComponent(activeTab.node.id)}`
              a.download = activeTab.node.name
              a.click()
            }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v9M4 8l4 4 4-4"/><path d="M2 13h12"/></svg>
              Download
            </button>
            <button className={styles.toolBtn} onClick={() => navigator.clipboard.writeText(activeTab.node.id).catch(() => {})}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>
              Copy Path
            </button>
            <button className={styles.toolBtn} onClick={() => setActiveModal({ type: 'properties', node: activeTab.node })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="7"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5" r=".5" fill="currentColor" stroke="none"/></svg>
              Info
            </button>
            <button className={styles.toolBtnDanger} onClick={() => setActiveModal({ type: 'delete', nodes: [activeTab.node] })}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,4 14,4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>
              Delete
            </button>
          </div>
        )}

        {/* Content */}
        <div className={styles.viewerContent}>
          {!activeTab ? (
            <div className={styles.emptyViewer}>
              <svg className={styles.emptyViewerIcon} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="4" width="36" height="48" rx="3"/><path d="M36 4l8 8H36V4z"/>
                <line x1="16" y1="20" x2="36" y2="20"/><line x1="16" y1="28" x2="36" y2="28"/><line x1="16" y1="36" x2="28" y2="36"/>
                <circle cx="50" cy="50" r="12" strokeWidth="1.2"/><line x1="46" y1="50" x2="54" y2="50"/><line x1="50" y1="46" x2="50" y2="54"/>
              </svg>
              <div className={styles.emptyViewerTitle}>No file open</div>
              <div className={styles.emptyViewerSub}>Select a file from the explorer to view or edit it</div>
              <div className={styles.emptyViewerHints}>
                <div className={styles.emptyViewerHint}><span className={styles.kbd}>Click</span> a file to open it</div>
                <div className={styles.emptyViewerHint}><span className={styles.kbd}>Right-click</span> for context menu</div>
                <div className={styles.emptyViewerHint}><span className={styles.kbd}>Hover + checkbox</span> to multi-select</div>
              </div>
            </div>
          ) : (() => {
            const { node, viewerMode } = activeTab
            switch (viewerMode) {
              case 'monaco':   return <MonacoViewer node={node} readOnly={!isEditing} onContentChange={setEditContent} />
              case 'markdown': return node.content ? <MarkdownViewer content={node.content} /> : <MonacoViewer node={node} readOnly={!isEditing} onContentChange={setEditContent} />
              case 'svg':      return node.content ? <SvgViewer node={node} content={node.content} /> : <ImageViewer node={node} />
              case 'image':    return <ImageViewer node={node} />
              case 'pdf':      return <PdfViewer node={node} />
              case 'archive':  return <ArchiveViewer node={node} />
              case 'audio': case 'video': return <MediaViewer node={node} />
              default: return <BinaryViewer node={node} />
            }
          })()}
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          {activeTab ? (
            <>
              <div className={styles.statusItem}><span className={`${styles.statusDot} ${styles.statusDotGreen}`} /><span>Ready</span></div>
              <div className={styles.statusItem}><FileTypeIcon kind={getNodeIconKind(activeTab.node)} size={11} /><span>{getMonacoLang(activeTab.node.ext)}</span></div>
              {activeTab.viewerMode === 'monaco' && <div className={styles.statusItem}><span>Ln 1, Col 1</span></div>}
              <div className={styles.statusSpacer} />
              <div className={styles.statusItem}><span>{activeTab.node.permissions}</span></div>
              <div className={styles.statusItem}><span>{activeTab.node.owner}:{activeTab.node.group}</span></div>
              <div className={styles.statusItem}><span>{activeTab.node.modified}</span></div>
              <div className={`${styles.statusItem} ${styles.statusEncoding}`}>UTF-8</div>
              <div className={`${styles.statusItem} ${styles.statusEncoding}`}>LF</div>
            </>
          ) : (
            <>
              <div className={styles.statusItem}><span className={`${styles.statusDot} ${styles.statusDotBlue}`} /><span>File Manager</span></div>
              <div className={styles.statusSpacer} />
              <div className={styles.statusItem}>
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="2" width="14" height="12" rx="2"/></svg>
                <span>{tree.length} items at /</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
