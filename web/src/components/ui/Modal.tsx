import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './ui.module.css'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const sizeClass = {
    sm: styles.dialogSm,
    md: styles.dialogMd,
    lg: styles.dialogLg,
    xl: styles.dialogXl,
  }[size]

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={`${styles.dialog} ${sizeClass}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <div>
            <div className={styles.dialogTitle}>{title}</div>
            {subtitle && <div className={styles.dialogSubtitle}>{subtitle}</div>}
          </div>
          <button className={styles.dialogClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.dialogBody}>{children}</div>
        {footer && <div className={styles.dialogFooter}>{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
