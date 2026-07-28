import { useMemo } from 'react'
import type { NavPoint } from '../lib/navHistory'

type Props = {
  points: NavPoint[]
  /** Ẩn tooltip số tuyệt đối khi privacy */
  privacy?: boolean
  width?: number
  height?: number
  className?: string
}

/**
 * Sparkline SVG thuần — không lib.
 * Cần ≥ 2 điểm để vẽ đường; 1 điểm → chấm.
 */
export function NavSparkline({
  points,
  privacy = false,
  width = 280,
  height = 48,
  className = '',
}: Props) {
  const geo = useMemo(() => {
    if (!points.length) return null
    const vals = points.map((p) => p.value)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const padX = 2
    const padY = 4
    const span = max - min || 1
    const n = points.length
    const coords = points.map((p, i) => {
      const x =
        n === 1
          ? width / 2
          : padX + (i / (n - 1)) * (width - padX * 2)
      const y =
        height - padY - ((p.value - min) / span) * (height - padY * 2)
      return { x, y, ...p }
    })
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
    // area fill under line
    const last = coords[coords.length - 1]!
    const first = coords[0]!
    const area = `${line} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`
    const up = last.value >= first.value
    return { coords, line, area, up, min, max }
  }, [points, width, height])

  if (!geo || points.length === 0) {
    return (
      <div className={`nav-spark empty ${className}`}>
        <span>Chưa có lịch sử NAV — mở app vài ngày sẽ hiện biểu đồ</span>
      </div>
    )
  }

  const stroke = geo.up ? '#34d399' : '#f87171'
  const fill = geo.up
    ? 'url(#navSparkUp)'
    : 'url(#navSparkDown)'

  return (
    <div
      className={`nav-spark ${className}`}
      title={
        privacy
          ? `${points.length} ngày`
          : `${points[0]!.date} → ${points[points.length - 1]!.date}`
      }
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="navSparkUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="navSparkDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length >= 2 && (
          <>
            <path d={geo.area} fill={fill} />
            <path
              d={geo.line}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {/* last point dot */}
        <circle
          cx={geo.coords[geo.coords.length - 1]!.x}
          cy={geo.coords[geo.coords.length - 1]!.y}
          r="3"
          fill={stroke}
        />
      </svg>
    </div>
  )
}
