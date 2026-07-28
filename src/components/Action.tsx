export function Action({
  mark,
  cls,
  title,
  desc,
  onClick,
}: {
  mark: string
  cls: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button className="action" onClick={onClick}>
      <div className={`aico mark ${cls}`}>{mark}</div>
      <div>
        <div className="t">{title}</div>
        <div className="d">{desc}</div>
      </div>
    </button>
  )
}

