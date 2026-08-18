import { AppIcon, type AppIconName } from './AppIcon'

export function Action({
  icon,
  cls,
  title,
  desc,
  onClick,
  disabled = false,
  loading = false,
}: {
  icon: AppIconName
  cls: string
  title: string
  desc: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className="action"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      <span className={`aico mark ${cls}`}>
        <AppIcon name={icon} size={18} />
      </span>
      <div>
        <div className="t">{title}</div>
        <div className="d">{loading ? 'Đang xử lý…' : desc}</div>
      </div>
    </button>
  )
}

