/**
 * Dependency, build-cache and version-control folders that tools re-create.
 * They are skipped when found inside an uploaded folder (but not when the
 * folder itself is what the user picked or dropped).
 */
export const IGNORED_FOLDERS = new Set([
  '.git',
  // JavaScript / TypeScript
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.parcel-cache',
  '.angular',
  // Java / Kotlin (Maven, Gradle)
  'target',
  '.gradle',
  '.m2',
  // Python
  '__pycache__',
  '.venv',
  'venv',
])

/**
 * Turns a drop event's DataTransfer into { items, skipped }:
 *   items:   { path: 'folder/sub/file.js', file: File }   for files
 *            { path: 'folder/empty-sub', dir: true }      for (possibly empty) folders
 *   skipped: Set of IGNORED_FOLDERS names that were left out
 * Whole folders dragged from the OS are walked recursively.
 *
 * NOTE: must be called synchronously inside the drop handler – the browser
 * clears DataTransfer items as soon as the event handler returns.
 */
export function filesFromDataTransfer(dataTransfer) {
  const items = dataTransfer.items ? [...dataTransfer.items].filter((i) => i.kind === 'file') : []
  const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
  const plainFiles = [...(dataTransfer.files || [])]
  const skipped = new Set()

  if (!entries.length) return Promise.resolve({ items: plainFiles.map((file) => ({ path: file.name, file })), skipped })

  const out = []
  const readFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject))
  const readBatch = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject))

  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await readFile(entry)
      out.push({ path: prefix + file.name, file })
    } else if (entry.isDirectory) {
      if (prefix && IGNORED_FOLDERS.has(entry.name)) {
        skipped.add(entry.name)
        return // not even read – walking node_modules is most of the time spent
      }
      const dirPath = prefix + entry.name
      out.push({ path: dirPath, dir: true })
      const reader = entry.createReader()
      // readEntries returns at most ~100 entries per call – keep reading until empty.
      for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) {
        for (const child of batch) await walk(child, dirPath + '/')
      }
    }
  }

  return (async () => {
    for (const entry of entries) await walk(entry, '')
    return { items: out, skipped }
  })()
}

/** From <input type="file" multiple> or <input webkitdirectory>. Same { items, skipped } shape. */
export function filesFromFileList(fileList) {
  const items = []
  const skipped = new Set()
  for (const file of fileList) {
    const path = file.webkitRelativePath || file.name
    // Folder segments below the picked folder; the last segment is the file name.
    const ignored = path.split('/').slice(1, -1).find((seg) => IGNORED_FOLDERS.has(seg))
    if (ignored) skipped.add(ignored)
    else items.push({ path, file })
  }
  return { items, skipped }
}
