import styles from './ui.module.css'

interface PageHeaderProps {
  title: string
  description?: string
  icon?: string
  actions?: React.ReactNode
  live?: boolean
}

export function PageHeader({ title, description, icon, actions, live }: PageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderLeft}>
        <div className={styles.pageHeaderTop}>
          {icon && <span className={styles.pageHeaderIcon}>{icon}</span>}
          <h1 className={styles.pageTitle}>{title}</h1>
          {live && (
            <span className={styles.liveBadge}>
              <span className={styles.liveIndicator} />
              Live
            </span>
          )}
        </div>
        {description && <p className={styles.pageDesc}>{description}</p>}
      </div>
      {actions && (
        <div className={styles.pageHeaderActions}>{actions}</div>
      )}
    </div>
  )
}
