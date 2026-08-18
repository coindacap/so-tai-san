import { useStore } from '../store/useStore'
import type { Screen } from '../types'
import { AppIcon, type AppIconName } from './AppIcon'

export function Tab({
  id,
  label,
  icon,
}: {
  id: Screen
  label: string
  icon: AppIconName
}) {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const selected = screen === id

  return (
    <button
      type="button"
      className={`tab ${selected ? 'on' : ''}`}
      onClick={() => setScreen(id)}
      aria-current={selected ? 'page' : undefined}
    >
      <span className="ico">
        <AppIcon name={icon} size={22} />
      </span>
      <span>{label}</span>
    </button>
  )
}

