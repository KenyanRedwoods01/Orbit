import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDeployHook } from '@/lib/api'
import { Modal, Spinner } from '@/components/ui'

interface HookFormProps {
  open: boolean
  onClose: () => void
}

export function HookForm({ open, onClose }: HookFormProps) {
  const [name, setName] = useState('')
  const [project, setProject] = useState('')
  const [scriptPath, setScriptPath] = useState('')
  const [strategy, setStrategy] = useState<'exec' | 'blue-green'>('exec')
  const [err, setErr] = useState<string | null>(null)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createDeployHook({ name, project, script_path: scriptPath, strategy }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deploy-hooks'] })
      setName(''); setProject(''); setScriptPath(''); setErr(null)
      onClose()
    },
    onError: (e: Error) => setErr(e.message),
  })

  const handleSubmit = () => {
    setErr(null)
    if (!name.trim() || !project.trim() || !scriptPath.trim()) {
      setErr('All fields are required')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Deploy Hook"
      subtitle="Register a new webhook-triggered deploy pipeline"
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Spinner size="sm" />}
            Create Hook
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ background: 'var(--color-danger-dim)', border: '1px solid rgba(244,67,54,.25)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--color-danger)' }}>{err}</div>}

        <div className="field-group">
          <label className="field-label">Hook Name</label>
          <input className="field-input" placeholder="e.g. my-api" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">Project</label>
          <input className="field-input" placeholder="e.g. backend-api" value={project} onChange={e => setProject(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">Deploy Script Path</label>
          <input className="field-input" placeholder="/opt/deploy/my-api.sh" value={scriptPath} onChange={e => setScriptPath(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">Strategy</label>
          <select className="field-select" value={strategy} onChange={e => setStrategy(e.target.value as 'exec' | 'blue-green')}>
            <option value="exec">Direct exec</option>
            <option value="blue-green">Blue/green (zero-downtime)</option>
          </select>
        </div>
      </div>
    </Modal>
  )
}
