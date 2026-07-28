import { useStore } from '../store/useStore'
import type { Screen } from '../types'

export function Tab({
  id,
  label,
  ico,
}: {
  id: Screen
  label: string
  ico: string
}) {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  return (
    <button
      className={`tab ${screen === id ? 'on' : ''}`}
      onClick={() => setScreen(id)}
    >
      <div className="ico">{ico}</div>
      <span>{label}</span>
    </button>
  )
}

