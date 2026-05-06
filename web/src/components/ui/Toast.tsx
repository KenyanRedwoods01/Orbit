import { useToastStore, type Toast } from '@/store/toast'
import styles from './Toast.module.css'

const IcoCheck = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoX     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWarn  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l8 16H2z"/><line x1="10" y1="9" x2="10" y2="13"/><circle cx="10" cy="15.5" r=".7" fill="currentColor" stroke="none"/></svg>
const IcoInfo  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r=".7" fill="currentColor" stroke="none"/></svg>

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToastStore(s => s.dismiss)
  const duration = t.duration ?? 4000

  const cls = {
    success: styles.toastSuccess,
    error:   styles.toastError,
    warning: styles.toastWarning,
    info:    styles.toastInfo,
  }[t.type]

  const iconCls = {
    success: styles.iconSuccess,
    error:   styles.iconError,
    warning: styles.iconWarning,
    info:    styles.iconInfo,
  }[t.type]

  const progCls = {
    success: styles.progressSuccess,
    error:   styles.progressError,
    warning: styles.progressWarning,
    info:    styles.progressInfo,
  }[t.type]

  const icon = t.type === 'success' ? <IcoCheck />
    : t.type === 'error'   ? <IcoX />
    : t.type === 'warning' ? <IcoWarn />
    : <IcoInfo />

  return (
    <div className={`${styles.toast} ${cls}`}>
      <div className={`${styles.iconWrap} ${iconCls}`}>{icon}</div>
      <div className={styles.body}>
        <div className={styles.title}>{t.title}</div>
        {t.message && <div className={styles.message}>{t.message}</div>}
      </div>
      <button className={styles.close} onClick={() => dismiss(t.id)}><IcoX /></button>
      {duration > 0 && (
        <div
          className={`${styles.progress} ${progCls}`}
          style={{ '--duration': `${duration}ms` } as React.CSSProperties}
        />
      )}
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  return (
    <div className={styles.container}>
      {toasts.map(t => <ToastItem key={t.id} t={t} />)}
    </div>
  )
}
