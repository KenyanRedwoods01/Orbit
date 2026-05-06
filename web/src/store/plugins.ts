import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PLUGINS, type PluginStatus } from '@/pages/plugins/pluginsData'

interface PluginsState {
  statuses: Record<string, PluginStatus>
  setStatus: (id: string, status: PluginStatus) => void
  toggle: (id: string) => void
  isEnabled: (id: string) => boolean
}

export const usePluginsStore = create<PluginsState>()(
  persist(
    (set, get) => ({
      statuses: Object.fromEntries(PLUGINS.map(p => [p.id, p.status])),
      setStatus: (id, status) =>
        set(s => ({ statuses: { ...s.statuses, [id]: status } })),
      toggle: (id) => {
        const current = get().statuses[id]
        if (current === 'not_installed') {
          set(s => ({ statuses: { ...s.statuses, [id]: 'installing' } }))
          setTimeout(() =>
            set(s => ({ statuses: { ...s.statuses, [id]: 'enabled' } })), 1800)
        } else if (current === 'enabled') {
          set(s => ({ statuses: { ...s.statuses, [id]: 'disabled' } }))
        } else {
          set(s => ({ statuses: { ...s.statuses, [id]: 'enabled' } }))
        }
      },
      isEnabled: (id) => get().statuses[id] === 'enabled',
    }),
    { name: 'orbit-plugins' }
  )
)
