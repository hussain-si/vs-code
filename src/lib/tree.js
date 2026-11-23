export const ROOT = '__root__'
const EMPTY = []

export function compareNodes(a, b) {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/** byId: Map<id, node>; children: Map<parentId | ROOT, node[]> (sorted, folders first). */
export function buildIndex(nodes) {
  const byId = new Map()
  const children = new Map()
  for (const n of nodes) byId.set(n.id, n)
  for (const n of nodes) {
    const key = n.parent_id ?? ROOT
    if (!children.has(key)) children.set(key, [])
    children.get(key).push(n)
  }
  for (const list of children.values()) list.sort(compareNodes)
  return { byId, children }
}

export const childrenOf = (index, parentId) => index.children.get(parentId ?? ROOT) || EMPTY

export const findChild = (index, parentId, name) =>
  childrenOf(index, parentId).find((n) => n.name === name) || null

/** Ids of all folders above `id`, nearest first. */
export function getAncestors(id, byId) {
  const out = []
  const seen = new Set()
  let cur = byId.get(id)
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    seen.add(cur.parent_id)
    out.push(cur.parent_id)
    cur = byId.get(cur.parent_id)
  }
  return out
}

export function getPath(id, byId) {
  const node = byId.get(id)
  if (!node) return ''
  const parts = getAncestors(id, byId)
    .reverse()
    .map((a) => byId.get(a)?.name)
  return [...parts, node.name].join('/')
}

export function getDescendants(id, index) {
  const out = []
  const stack = [id]
  while (stack.length) {
    for (const child of index.children.get(stack.pop()) || EMPTY) {
      out.push(child)
      if (child.type === 'folder') stack.push(child.id)
    }
  }
  return out
}

export const isAncestorOf = (ancestorId, id, byId) => getAncestors(id, byId).includes(ancestorId)

export function parentPath(path) {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : ''
}
