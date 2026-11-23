/**
 * Data layer.
 *  - Tree (folders/files metadata) lives in the `nodes` Postgres table.
 *  - File contents live in Supabase Storage at `<user_id>/<node_id>`.
 *    Contents are never size-limited by the app: small files use a normal
 *    upload, anything above 6 MB uses resumable (TUS) chunked uploads,
 *    which is what Supabase recommends for large files (up to 500 GB).
 */
import * as tus from 'tus-js-client'
import { supabase, SUPABASE_URL, SUPABASE_KEY, BUCKET } from './supabase'
import { contentTypeFor } from './fileTypes'

export const RESUMABLE_THRESHOLD = 6 * 1024 * 1024
const TUS_CHUNK_SIZE = 6 * 1024 * 1024 // Supabase requires exactly 6 MB chunks
const PAGE_SIZE = 1000

export const objectPath = (node) => `${node.user_id}/${node.id}`

function dbError(error) {
  if (!error) return new Error('Unexpected database error')
  if (error.code === '23505') return new Error('A file or folder with that name already exists in this location.')
  if (error.code === '23514') return new Error('That name is not allowed.')
  return new Error(error.message || 'Unexpected database error')
}

function storageError(error) {
  const raw = String(error?.message || error || 'Storage error')
  if (/maximum allowed size|payload too large|entity too large|\b413\b/i.test(raw)) {
    return new Error(
      'The file is larger than the upload limit of your Supabase project. ' +
        'Raise it in Supabase → Project Settings → Storage → "Upload file size limit".',
    )
  }
  if (/bucket not found/i.test(raw)) {
    return new Error(`Storage bucket "${BUCKET}" was not found. Run supabase/schema.sql in the SQL editor.`)
  }
  return new Error(raw)
}

/* ------------------------------------------------------------------ tree */

export async function fetchAllNodes() {
  const all = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('nodes')
      .select('*')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw dbError(error)
    all.push(...data)
    if (data.length < PAGE_SIZE) return all
  }
}

export async function insertNode({ id, parentId, name, type, userId, size = 0, mime = null }) {
  const { data, error } = await supabase
    .from('nodes')
    .insert({ id, parent_id: parentId ?? null, name, type, user_id: userId, size, mime_type: mime })
    .select()
    .single()
  if (error) throw dbError(error)
  return data
}

export async function updateNode(id, patch) {
  const { data, error } = await supabase.from('nodes').update(patch).eq('id', id).select().single()
  if (error) throw dbError(error)
  return data
}

export async function deleteNodeRow(id) {
  const { error } = await supabase.from('nodes').delete().eq('id', id)
  if (error) throw dbError(error)
}

/** Deletes a node (and, through ON DELETE CASCADE, its subtree) plus all stored bytes. */
export async function deleteNodeTree(node, descendants) {
  await deleteNodeRow(node.id)
  const paths = [node, ...descendants].filter((n) => n.type === 'file').map(objectPath)
  for (let i = 0; i < paths.length; i += 500) {
    // Rows are already gone; a failure here only leaves orphaned bytes behind.
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 500))
  }
}

/* -------------------------------------------------------------- contents */

/**
 * Stores `data` (string, Blob or File) as the content of `node`.
 * Returns the updated node row (new size / mime type).
 */
export async function writeContent(node, data, { onProgress } = {}) {
  const path = objectPath(node)
  const isText = typeof data === 'string'
  const contentType = contentTypeFor(node.name, isText ? '' : data.type)
  const body = isText ? new Blob([data], { type: contentType }) : data

  if (body.size === 0) {
    // Empty file → no object at all (size 0 means "empty" everywhere in the app).
    await supabase.storage.from(BUCKET).remove([path])
  } else if (body.size > RESUMABLE_THRESHOLD) {
    await resumableUpload(path, body, contentType, onProgress)
  } else {
    const upload = body.type === contentType ? body : new Blob([body], { type: contentType })
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, upload, { upsert: true, contentType, cacheControl: '0' })
    if (error) throw storageError(error)
    onProgress?.(1)
  }

  return updateNode(node.id, { size: body.size, mime_type: contentType })
}

function resumableUpload(path, blob, contentType, onProgress) {
  const isFile = typeof File !== 'undefined' && blob instanceof File
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { apikey: SUPABASE_KEY, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Only real files from disk can be resumed after a reload; editor saves start fresh.
      storeFingerprintForResuming: isFile,
      fingerprint: async () =>
        ['codevault', path, blob.size, isFile ? blob.name : '', isFile ? blob.lastModified : Date.now()].join('|'),
      chunkSize: TUS_CHUNK_SIZE,
      metadata: { bucketName: BUCKET, objectName: path, contentType, cacheControl: '0' },
      onBeforeRequest: async (req) => {
        // Long uploads can outlive an access token, so always send a fresh one.
        const { data } = await supabase.auth.getSession()
        req.setHeader('Authorization', `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`)
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (err) => reject(storageError(err)),
    })

    const start = async () => {
      if (isFile) {
        const previous = await upload.findPreviousUploads()
        if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      }
      upload.start()
    }
    start().catch((err) => reject(storageError(err)))
  })
}

export async function readContent(node) {
  if (!Number(node.size)) return new Blob([''], { type: 'text/plain' })
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath(node))
  if (error) throw storageError(error)
  return data
}

/** Short-lived URL for previews (images, video, audio) and direct downloads. */
export async function getSignedUrl(node, { download = false, expiresIn = 3600 } = {}) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath(node), expiresIn, download ? { download: node.name } : undefined)
  if (error) throw storageError(error)
  return data.signedUrl
}
