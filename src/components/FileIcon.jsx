import { iconFor } from '../lib/fileTypes'

export default function FileIcon({ name }) {
  const ic = iconFor(name)
  if (ic.glyph) {
    return (
      <span className="file-icon glyph" style={{ color: ic.color }} aria-hidden="true">
        {ic.glyph}
      </span>
    )
  }
  return <i className={`file-icon codicon codicon-${ic.codicon}`} style={{ color: ic.color }} aria-hidden="true" />
}
