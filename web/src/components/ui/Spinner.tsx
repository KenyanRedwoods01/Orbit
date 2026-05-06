import styles from './ui.module.css'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
}

export function Spinner({ size = 'md' }: SpinnerProps) {
  const cls = size === 'sm' ? styles.spinnerSm : size === 'lg' ? styles.spinnerLg : styles.spinnerMd
  return <span className={`${styles.spinner} ${cls}`} />
}
