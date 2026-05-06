import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

let seq = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push(t) {
    const id = `toast-${++seq}`
    const duration = t.duration ?? 4000
    set(s => ({ toasts: [...s.toasts, { ...t, id }] }))
    if (duration > 0) {
      setTimeout(() => {
        set(s => ({ toasts: s.toasts.filter(x => x.id !== id) }))
      }, duration)
    }
  },
  dismiss(id) {
    set(s => ({ toasts: s.toasts.filter(x => x.id !== id) }))
  },
}))

export function toast(title: string, type: ToastType = 'info', message?: string, duration?: number) {
  useToastStore.getState().push({ title, type, message, duration })
}
export const toastSuccess = (title: string, msg?: string) => toast(title, 'success', msg)
export const toastError   = (title: string, msg?: string) => toast(title, 'error', msg, 6000)
export const toastWarn    = (title: string, msg?: string) => toast(title, 'warning', msg)
export const toastInfo    = (title: string, msg?: string) => toast(title, 'info', msg)
