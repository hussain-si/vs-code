/**
 * Small fuzzy matcher for Quick Open / Command Palette.
 * Returns { score, indices } or null when `query` does not match `text`.
 */
export function fuzzyMatch(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return { score: 0, indices: [] }
  const t = text.toLowerCase()

  const at = t.indexOf(q)
  if (at >= 0) {
    const indices = Array.from({ length: q.length }, (_, i) => at + i)
    return { score: 100 + (at === 0 ? 50 : 0) - at - t.length * 0.1, indices }
  }

  const indices = []
  let score = 0
  let from = 0
  let prev = -2
  for (const ch of q) {
    const found = t.indexOf(ch, from)
    if (found < 0) return null
    if (found === prev + 1) score += 3
    if (found === 0 || /[\s/._-]/.test(t[found - 1])) score += 2
    indices.push(found)
    prev = found
    from = found + 1
  }
  return { score: score - t.length * 0.1, indices }
}

export function substringIndices(query, text) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const at = text.toLowerCase().indexOf(q)
  return at < 0 ? [] : Array.from({ length: q.length }, (_, i) => at + i)
}
