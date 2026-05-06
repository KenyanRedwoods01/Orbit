import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pullContainerImage } from '@/lib/api'

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoX       = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="2" x2="11" y2="11"/><line x1="11" y1="2" x2="2" y2="11"/></svg>
const IcoSearch  = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4"/><line x1="8.5" y1="8.5" x2="12" y2="12"/></svg>
const IcoPull    = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6.5,1 6.5,9"/><polyline points="3.5,6.5 6.5,9 9.5,6.5"/><line x1="1.5" y1="12" x2="11.5" y2="12"/></svg>
const IcoBack    = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8,2.5 3.5,6.5 8,10.5"/></svg>
const IcoStar    = () => <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><polygon points="6,1 7.5,4.5 11.5,4.5 8.5,7 9.5,11 6,9 2.5,11 3.5,7 0.5,4.5 4.5,4.5"/></svg>
const IcoVerify  = () => <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1l1.2 2.4L10 4.2l-2 2 .5 2.8L6 7.8l-2.5 1.2.5-2.8-2-2L4.8 3.4z" fill="#63b3ed" stroke="#63b3ed"/><polyline points="4,6.2 5.5,7.5 8,5" stroke="white" strokeWidth="1.4" fill="none"/></svg>
const IcoOfficial = () => <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1L1 4v4l5 3 5-3V4L6 1z" fill="#68d391" fillOpacity="0.9"/><polyline points="4,6.5 5.5,8 8,5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoChevron = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,5 6,7 8,5"/></svg>
const IcoTag     = () => <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1h4.5l5.5 5.5-4.5 4.5L1 5.5V1z"/><circle cx="3.5" cy="3.5" r="0.8" fill="currentColor" stroke="none"/></svg>
const IcoCheck   = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>

// ── Docker Hub types ──────────────────────────────────────────────────────────
interface HubResult {
  name: string
  description: string
  is_official: boolean
  is_automated: boolean
  star_count: number
  pull_count: number
}

interface HubTag {
  name: string
  full_size: number
  last_updated: string
  images: { architecture: string; os: string; size: number }[]
  tag_status: string
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtBytes(b: number): string {
  if (!b) return '—'
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB'
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB'
  if (b >= 1024)       return (b / 1024).toFixed(1) + ' KB'
  return b + ' B'
}

function fmtDate(s: string): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return s }
}

// ── Modal Component ───────────────────────────────────────────────────────────
export function PullImageModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [query, setQuery]                 = useState('')
  const [results, setResults]             = useState<HubResult[]>([])
  const [loading, setLoading]             = useState(false)
  const [searchErr, setSearchErr]         = useState('')
  const [selected, setSelected]           = useState<HubResult | null>(null)
  const [tags, setTags]                   = useState<HubTag[]>([])
  const [tagsLoading, setTagsLoading]     = useState(false)
  const [tagsErr, setTagsErr]             = useState('')
  const [selectedTag, setSelectedTag]     = useState('latest')
  const [customTag, setCustomTag]         = useState('')
  const [pullSuccess, setPullSuccess]     = useState(false)
  const [pullErr, setPullErr]             = useState('')
  const [tagFilter, setTagFilter]         = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const pullMut = useMutation({
    mutationFn: (image: string) => pullContainerImage(image),
    onSuccess: () => {
      setPullSuccess(true)
      setPullErr('')
      qc.invalidateQueries({ queryKey: ['container-images'] })
      qc.invalidateQueries({ queryKey: ['docker-info'] })
    },
    onError: (e: Error) => { setPullErr(e.message || 'Pull failed') },
  })

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true); setSearchErr('')
    try {
      const res = await fetch(
        `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(q)}&page_size=20`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) throw new Error('Docker Hub search failed')
      const data = await res.json()
      setResults(data.results ?? [])
    } catch (e: unknown) {
      setSearchErr(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 420)
    return () => clearTimeout(t)
  }, [query, doSearch])

  const selectImage = async (r: HubResult) => {
    setSelected(r)
    setSelectedTag('latest')
    setCustomTag('')
    setTagFilter('')
    setPullSuccess(false)
    setPullErr('')
    setTagsLoading(true); setTagsErr('')
    try {
      const namespace = r.is_official ? 'library' : r.name.split('/')[0]
      const repoName  = r.is_official ? r.name : (r.name.includes('/') ? r.name.split('/').slice(1).join('/') : r.name)
      const res = await fetch(
        `https://hub.docker.com/v2/repositories/${namespace}/${repoName}/tags?page_size=50&ordering=last_updated`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json()
      setTags(data.results ?? [])
    } catch (e: unknown) {
      setTagsErr(e instanceof Error ? e.message : 'Failed to load tags')
      setTags([])
    } finally { setTagsLoading(false) }
  }

  const handlePull = () => {
    if (!selected) return
    const tag = customTag.trim() || selectedTag
    const image = selected.is_official ? `${selected.name}:${tag}` : `${selected.name}:${tag}`
    setPullSuccess(false); setPullErr('')
    pullMut.mutate(image)
  }

  const filteredTags = tags.filter(t => !tagFilter || t.name.includes(tagFilter))
  const activeTag    = customTag.trim() || selectedTag

  const selectedTagInfo = tags.find(t => t.name === selectedTag)
  const arch = selectedTagInfo?.images.map(i => i.architecture).filter(Boolean).join(', ') || '—'
  const os   = selectedTagInfo?.images.map(i => i.os).filter(Boolean)[0] || '—'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 7,
        width: 680,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          {selected && (
            <button
              onClick={() => { setSelected(null); setResults([]); setPullSuccess(false); setPullErr('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
            >
              <IcoBack />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
              {selected ? `Pull — ${selected.name}` : 'Pull Image from Docker Hub'}
            </div>
            {!selected && (
              <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 1 }}>
                Search Docker Hub and pull an image to your local cache
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 5 }}
          >
            <IcoX />
          </button>
        </div>

        {/* Search bar (always visible when no selection) */}
        {!selected && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 10, color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <IcoSearch />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search Docker Hub (e.g. nginx, postgres, redis)…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 7, padding: '8px 12px 8px 32px',
                  fontSize: 13, color: 'var(--color-text)',
                  outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              />
              {loading && (
                <span style={{ position: 'absolute', right: 10, width: 14, height: 14 }}>
                  <svg viewBox="0 0 14 14" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M7 1.5A5.5 5.5 0 1 1 1.5 7"/>
                  </svg>
                </span>
              )}
            </div>
            {searchErr && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-danger)' }}>{searchErr}</div>}
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* Search results */}
          {!selected && (
            <>
              {!query && results.length === 0 && (
                <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
                  Start typing to search Docker Hub
                </div>
              )}
              {query && !loading && results.length === 0 && !searchErr && (
                <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
                  No images found for "{query}"
                </div>
              )}
              {results.map(r => (
                <div
                  key={r.name}
                  onClick={() => selectImage(r)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Left: name + description */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{r.name}</span>
                      {r.is_official && (
                        <span title="Official Image" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#68d391', background: 'rgba(104,211,145,0.12)', border: '1px solid rgba(104,211,145,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                          <IcoOfficial /> Official
                        </span>
                      )}
                      {r.is_automated && (
                        <span title="Automated Build" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#63b3ed', background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                          <IcoVerify /> Verified
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.description || 'No description available.'}
                    </div>
                  </div>
                  {/* Right: stats */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#f6ad55' }}>
                      <IcoStar /> {fmtNum(r.star_count)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                      {fmtNum(r.pull_count)} pulls
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Selected image detail */}
          {selected && (
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Image info row */}
              <div style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 7, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{selected.name}</span>
                  {selected.is_official && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#68d391', background: 'rgba(104,211,145,0.12)', border: '1px solid rgba(104,211,145,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                      <IcoOfficial /> Official
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: 10 }}>
                  {selected.description || 'No description available.'}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Stars', value: fmtNum(selected.star_count) },
                    { label: 'Pulls', value: fmtNum(selected.pull_count) },
                    { label: 'OS', value: os },
                    { label: 'Arch', value: arch },
                    { label: 'Size', value: selectedTagInfo ? fmtBytes(selectedTagInfo.full_size) : '—' },
                    { label: 'Updated', value: selectedTagInfo ? fmtDate(selectedTagInfo.last_updated) : '—' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 1 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text)', fontWeight: 500 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tag picker */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Select Tag
                </div>

                {/* Custom tag input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 8, color: 'var(--color-text-dim)', display: 'flex', pointerEvents: 'none' }}><IcoTag /></span>
                    <input
                      value={customTag}
                      onChange={e => setCustomTag(e.target.value)}
                      placeholder="Custom tag (or pick below)…"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 7, padding: '7px 10px 7px 26px',
                        fontSize: 12, color: 'var(--color-text)', outline: 'none',
                        fontFamily: 'monospace',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                    />
                  </div>
                </div>

                {/* Tag filter */}
                {tags.length > 8 && (
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)', pointerEvents: 'none' }}><IcoSearch /></span>
                    <input
                      value={tagFilter}
                      onChange={e => setTagFilter(e.target.value)}
                      placeholder="Filter tags…"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 7, padding: '6px 10px 6px 26px',
                        fontSize: 11, color: 'var(--color-text)', outline: 'none',
                      }}
                    />
                  </div>
                )}

                {/* Tag list */}
                <div style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 7,
                  maxHeight: 200,
                  overflowY: 'auto',
                  background: 'var(--color-surface-raised)',
                }}>
                  {tagsLoading && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 12 }}>Loading tags…</div>
                  )}
                  {tagsErr && (
                    <div style={{ padding: '12px 14px', color: 'var(--color-danger)', fontSize: 12 }}>{tagsErr}</div>
                  )}
                  {!tagsLoading && filteredTags.length === 0 && !tagsErr && (
                    <div style={{ padding: '12px 14px', color: 'var(--color-text-dim)', fontSize: 12 }}>No tags found</div>
                  )}
                  {filteredTags.map(t => {
                    const isSelected = !customTag && selectedTag === t.name
                    return (
                      <div
                        key={t.name}
                        onClick={() => { setSelectedTag(t.name); setCustomTag('') }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(var(--color-accent-rgb, 99,179,237),0.1)' : 'transparent',
                          borderBottom: '1px solid var(--color-border)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(99,179,237,0.1)' : 'transparent' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: isSelected ? 'var(--color-accent)' : 'var(--color-text)', fontFamily: 'monospace', fontSize: 12, fontWeight: isSelected ? 600 : 400 }}>{t.name}</span>
                          {t.images.length > 0 && (
                            <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                              {t.images.map(i => i.architecture).filter(Boolean).slice(0, 3).join(', ')}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{fmtBytes(t.full_size)}</span>
                          <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{fmtDate(t.last_updated)}</span>
                          {isSelected && <IcoCheck />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Pull preview */}
              <div style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 7, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-dim)', flexShrink: 0 }}>Will pull:</span>
                <code style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>
                  {selected.name}:{activeTag}
                </code>
                <IcoChevron />
              </div>

              {/* Status messages */}
              {pullSuccess && (
                <div style={{
                  background: 'rgba(104,211,145,0.1)', border: '1px solid rgba(104,211,145,0.3)',
                  borderRadius: 7, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#68d391',
                }}>
                  <IcoCheck /> Image pulled successfully — it is now available in your local cache.
                </div>
              )}
              {pullErr && (
                <div style={{
                  background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)',
                  borderRadius: 7, padding: '10px 14px',
                  fontSize: 13, color: 'var(--color-danger)',
                }}>
                  {pullErr}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {selected && (
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            flexShrink: 0,
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid var(--color-border)',
                borderRadius: 7, padding: '7px 14px',
                fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handlePull}
              disabled={pullMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: pullMut.isPending ? 'var(--color-accent-dim)' : 'var(--color-accent)',
                border: 'none', borderRadius: 7, padding: '7px 16px',
                fontSize: 12, fontWeight: 600, color: '#fff', cursor: pullMut.isPending ? 'not-allowed' : 'pointer',
                opacity: pullMut.isPending ? 0.7 : 1,
              }}
            >
              {pullMut.isPending ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M7 1.5A5.5 5.5 0 1 1 1.5 7"/>
                  </svg>
                  Pulling…
                </>
              ) : (
                <><IcoPull /> Pull {selected.name}:{activeTag}</>
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
