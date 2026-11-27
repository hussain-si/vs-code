/**
 * Folder downloads as .zip, built in the browser.
 *
 * The archive is a stream: each file is fetched from Supabase Storage and
 * piped straight into the zip, so memory use stays small however big the
 * folder is (when the caller streams the result to disk). Zip64 is used
 * automatically for archives / files above 4 GB.
 */
import { makeZip, predictLength } from 'client-zip'
import { childrenOf } from './tree'
import { getSignedUrls } from './storage'

const SIGN_BATCH = 100 // signed URLs requested per round trip
const SIGN_EXPIRY = 6 * 3600 // long enough for big archives; URLs are created just before use
const LOOKAHEAD_FILES = 6 // small files are fetched a few at a time…
const LOOKAHEAD_BYTES = 16 * 1024 * 1024 // …but never more than this much ahead
const PROGRESS_INTERVAL = 150 // ms

const modified = (node) => {
  const d = new Date(node.updated_at || node.created_at || Date.now())
  return Number.isNaN(d.getTime()) ? new Date() : d
}

/**
 * Everything to put in the zip, parents first: [{ node, path }].
 * With a folder, its contents sit inside a top-level `<folder name>/`;
 * with `null`, the whole storage is included as-is.
 */
export function zipEntries(index, folder) {
  const out = []
  const stack = folder ? [[folder, folder.name]] : childrenOf(index, null).map((n) => [n, n.name]).reverse()
  while (stack.length) {
    const [node, path] = stack.pop()
    out.push({ node, path })
    if (node.type === 'folder') {
      const kids = childrenOf(index, node.id)
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], `${path}/${kids[i].name}`])
    }
  }
  return out
}

/**
 * Builds the zip as a ReadableStream.
 *  onProgress(fraction)          – throttled, 0…1
 *  onFileError(entry, error)     – a file that could not be fetched is left out and reported here
 */
export function zipStream(entries, { onProgress, onFileError } = {}) {
  const total = Number(
    predictLength(
      entries.map(({ node, path }) => (node.type === 'folder' ? { name: `${path}/` } : { name: path, size: Number(node.size) || 0 })),
    ),
  )
  let written = 0
  let lastReport = 0
  const counter = new TransformStream({
    transform(chunk, controller) {
      written += chunk.byteLength
      const now = Date.now()
      if (onProgress && now - lastReport > PROGRESS_INTERVAL) {
        lastReport = now
        onProgress(total ? Math.min(written / total, 1) : 0)
      }
      controller.enqueue(chunk)
    },
  })
  return makeZip(zipInputs(entries, onFileError), { buffersAreUTF8: true }).pipeThrough(counter)
}

async function* zipInputs(entries, onFileError) {
  const stored = entries.filter((e) => e.node.type === 'file' && Number(e.node.size) > 0)
  const aborter = new AbortController()
  const signed = new Map() // batch number → Promise<Map<id, url>>
  const fetches = new Map() // position in `stored` → Promise<Response>

  const urlFor = (i) => {
    const batch = Math.floor(i / SIGN_BATCH)
    if (!signed.has(batch)) {
      const nodes = stored.slice(batch * SIGN_BATCH, (batch + 1) * SIGN_BATCH).map((e) => e.node)
      signed.set(batch, getSignedUrls(nodes, SIGN_EXPIRY))
    }
    return signed.get(batch).then((urls) => {
      const url = urls.get(stored[i].node.id)
      if (!url) throw new Error('the file contents are missing from storage')
      return url
    })
  }

  const prefetch = (i) => {
    if (fetches.has(i)) return
    const p = urlFor(i)
      .then((url) => fetch(url, { signal: aborter.signal }))
      .then((res) => {
        if (!res.ok) throw new Error(`storage responded with ${res.status}`)
        return res
      })
    p.catch(() => {}) // reported when it's this file's turn
    fetches.set(i, p)
  }

  try {
    let next = 0
    for (const entry of entries) {
      const { node, path } = entry
      const lastModified = modified(node)
      if (node.type === 'folder') {
        yield { name: `${path}/`, lastModified }
        continue
      }
      if (!Number(node.size)) {
        yield { name: path, input: '', lastModified } // empty files have no stored object
        continue
      }

      const i = next++
      prefetch(i)
      let budget = LOOKAHEAD_BYTES
      for (let j = i + 1; j < stored.length && j <= i + LOOKAHEAD_FILES; j++) {
        budget -= Number(stored[j].node.size)
        if (budget < 0) break
        prefetch(j)
      }

      let res = null
      try {
        res = await fetches.get(i)
      } catch (err) {
        onFileError?.(entry, err)
      }
      fetches.delete(i)
      if (res) yield { name: path, input: res, lastModified, size: Number(node.size) }
    }
  } finally {
    aborter.abort() // stops read-ahead requests if the download was cancelled or failed
  }
}
