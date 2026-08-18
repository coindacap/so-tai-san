import type { ReactNode } from 'react'
import { AppIcon } from './AppIcon'

type Props = {
  tone: 'loading' | 'empty' | 'error' | 'success'
  title: string
  message?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function StatePanel({
  tone,
  title,
  message,
  action,
  compact = false,
}: Props) {
  const isLoading = tone === 'loading'
  const icon =
    tone === 'error'
      ? 'warning'
      : tone === 'success'
        ? 'check'
        : tone === 'loading'
          ? 'loader'
          : 'cloud'

  return (
    <div
      className={`state-panel state-panel--${tone}${compact ? ' is-compact' : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      aria-busy={isLoading}
    >
      <span className={`state-panel__icon${isLoading ? ' is-loading' : ''}`}>
        <AppIcon name={icon} size={22} />
      </span>
      <div className="state-panel__body">
        <h3>{title}</h3>
        {message ? <div className="state-panel__message">{message}</div> : null}
      </div>
      {action ? <div className="state-panel__action">{action}</div> : null}
    </div>
  )
}
