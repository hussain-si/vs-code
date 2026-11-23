/**
 * Turns a drop event's DataTransfer into a flat list of
 *   { path: 'folder/sub/file.js', file: File }   for files
 *   { path: 'folder/empty-sub', dir: true }      for (possibly empty) folders
 * Whole folders dragged from the OS are walked recursively.
 *
 * NOTE: must be called synchronously inside the drop handler – the browser
 * clears DataTransfer items as soon as the event handler returns.
 */
export function filesFromDataTransfer(dataTransfer) {
  const items = dataTransfer.items ? [...dataTransfer.items].filter((i) => i.kind === 'file') : []
  const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
  const plainFiles = [...(dataTransfer.files || [])]

  if (!entries.length) return Promise.resolve(plainFiles.map((file) => ({ path: file.name, file })))

  const out = []
  const readFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject))
  const readBatch = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject))

  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await readFile(entry)
      out.push({ path: prefix + file.name, file })
    } else if (entry.isDirectory) {
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
    return out
  })()
}

/** From <input type="file" multiple> or <input webkitdirectory>. */
export function filesFromFileList(fileList) {
  return [...fileList].map((file) => ({ path: file.webkitRelativePath || file.name, file }))
}
