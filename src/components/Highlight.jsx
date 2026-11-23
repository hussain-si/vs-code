/** Renders `text` with the characters at `indices` wrapped in <mark>. */
export default function Highlight({ text, indices }) {
  if (!indices?.length) return text
  const hits = new Set(indices)
  const parts = []
  let buffer = ''
  let on = false
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i)
    if (hit !== on && buffer) {
      parts.push(on ? <mark key={i}>{buffer}</mark> : buffer)
      buffer = ''
    }
    on = hit
    buffer += text[i]
  }
  if (buffer) parts.push(on ? <mark key="end">{buffer}</mark> : buffer)
  return <>{parts}</>
}
