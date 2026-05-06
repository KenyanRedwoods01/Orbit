import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createManagedServer } from '@/lib/api'
import { Modal, Spinner } from '@/components/ui'

interface AddServerFormProps {
  open: boolean
  onClose: () => void
}

export function AddServerForm({ open, onClose }: AddServerFormProps) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [user, setUser] = useState('root')
  const [keyFile, setKeyFile] = useState('~/.ssh/id_rsa')
  const [err, setErr] = useState<string | null>(null)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createManagedServer({ name, host, port: 22, user, auth_method: 'key', key_file: keyFile }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servers'] })
      setName(''); setHost(''); setErr(null)
      onClose()
    },
    onError: (e: Error) => setErr(e.message),
  })

  const handleSubmit = () => {
    setErr(null)
    if (!name.trim() || !host.trim()) { setErr('Name and host are required'); return }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Remote Server"
      subtitle="Connect via SSH key — no agent install required"
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Spinner size="sm" />}
            Add Server
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ background: 'var(--color-danger-dim)', border: '1px solid rgba(244,67,54,.25)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--color-danger)' }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field-group">
            <label className="field-label">Server Name</label>
            <input className="field-input" placeholder="prod-web-01" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Host / IP</label>
            <input className="field-input" placeholder="192.168.1.10 or hostname" value={host} onChange={e => setHost(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field-group">
            <label className="field-label">SSH User</label>
            <input className="field-input" placeholder="root" value={user} onChange={e => setUser(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Key File</label>
            <input className="field-input" placeholder="~/.ssh/id_rsa" value={keyFile} onChange={e => setKeyFile(e.target.value)} />
          </div>
        </div>

        <div style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(74,158,255,.2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          ℹ The SSH private key must be accessible on this server at the specified path. The remote server does not need Orbit installed.
        </div>
      </div>
    </Modal>
  )
}
