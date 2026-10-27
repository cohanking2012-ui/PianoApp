import { useEffect, type ReactNode } from 'react'
import { Icon } from './icons'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  help?: string
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span style={{ fontWeight: 600 }}>{label}</span>
        {help && <span className="field-help" style={{ display: 'block' }}>{help}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Stars({ count, big = false }: { count: number; big?: boolean }) {
  return (
    <span className={`stars${big ? ' big' : ''}`} aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? '' : 'off'}>
          <Icon name="star" />
        </span>
      ))}
    </span>
  )
}

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export function ScreenHeader({ title, back, sub, right }: { title: string; back?: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="screen-header">
      {back && (
        <a className="icon-btn" href={back} aria-label="Back">
          <Icon name="back" />
        </a>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  )
}
