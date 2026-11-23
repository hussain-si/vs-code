import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  deleteNodeRow,
  deleteNodeTree,
  fetchAllNodes,
  getSignedUrl,
  insertNode,
  readContent,
  updateNode,
  writeContent,
} from '../lib/storage'
import { buildIndex, findChild, getAncestors, getDescendants, getPath, isAncestorOf } from '../lib/tree'
import { isKnownBinary, LARGE_FILE_BYTES, languageFor, looksBinary, mediaKind } from '../lib/fileTypes'
import { filesFromDataTransfer, filesFromFileList } from '../lib/dropFiles'
import { formatBytes, uuid } from '../lib/format'
import { MODEL_SCHEME, idFromModel, modelPath } from '../lib/models'
import { useActivities, useNotifications, usePersistentState } from '../hooks'
import { useDialog } from './Dialog'
import TitleBar from './TitleBar'
import ActivityBar from './ActivityBar'
import Explorer from './Explorer'
import SearchPanel from './SearchPanel'
import EditorArea from './EditorArea'
import StatusBar from './StatusBar'
import ContextMenu from './ContextMenu'
import QuickInput from './QuickInput'
import Notifications from './Notifications'

const AUTO_SAVE_DELAY = 1000
const UPLOAD_CONCURRENCY = 4
const MOBILE_QUERY = '(max-width: 760px)'
const isMobile = () => window.matchMedia(MOBILE_QUERY).matches
const splitPath = (p) => p.split('/').filter(Boolean)

export default function Workbench({ session }) {
  const user = session.user
  const userId = user.id

  /* =============================================================== state */

  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const index = useMemo(() => buildIndex(nodes), [nodes])

  const [view, setView] = usePersistentState('cv.view', 'explorer')
  const [sidebarVisible, setSidebarVisible] = usePersistentState('cv.sidebar', () => !isMobile())
  const [sidebarWidth, setSidebarWidth] = usePersistentState('cv.sidebarWidth', 260)
  const [autoSave, setAutoSave] = usePersistentState('cv.autoSave', false)
  const [wordWrap, setWordWrap] = usePersistentState('cv.wordWrap', false)
  const [minimap, setMinimap] = usePersistentState('cv.minimap', true)
  const [expandedList, setExpandedList] = usePersistentState(`cv.expanded.${userId}`, [])
  const expanded = useMemo(() => new Set(expandedList), [expandedList])

  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(null) // { parentId, type }
  const [renamingId, setRenamingId] = useState(null)
  const [tabs, setTabs] = useState([]) // { id, kind, text?, savedVersion?, dirty?, media?, url?, error? }
  const [activeId, setActiveId] = useState(null)
  const [recentIds, setRecentIds] = useState([])
  const [cursor, setCursor] = useState(null)
  const [menu, setMenu] = useState(null) // { x, y, items }
  const [quick, setQuick] = useState(null) // 'files' | 'commands'

  const { notifications, notify, dismiss } = useNotifications()
  const [activities, startActivity] = useActivities()
  const { showDialog, dialogElement } = useDialog()

  const monacoRef = useRef(null)
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const uploadTargetRef = useRef(null)
  const saveChains = useRef(new Map())
  const autoSaveTimers = useRef(new Map())
  const blobUrls = useRef(new Map())

  // Latest values for async code and long-lived event listeners.
  const live = useRef(null)
  live.current = { nodes, index, tabs, activeId, selectedId, autoSave }
  const fn = useRef(null)

  /* ========================================================= tree state */

  const upsertNodes = useCallback((list) => {
    setNodes((prev) => {
      const map = new Map(prev.map((n) => [n.id, n]))
      for (const n of list) map.set(n.id, n)
      return [...map.values()]
    })
  }, [])

  const removeNodes = useCallback((ids) => {
    const gone = new Set(ids)
    setNodes((prev) => prev.filter((n) => !gone.has(n.id)))
  }, [])

  const expand = useCallback(
    (ids) =>
      setExpandedList((prev) => {
        const set = new Set(prev)
        let changed = false
        for (const id of ids) {
          if (id && !set.has(id)) {
            set.add(id)
            changed = true
          }
        }
        return changed ? [...set] : prev
      }),
    [setExpandedList],
  )

  const toggleFolder = useCallback(
    (id) => setExpandedList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [setExpandedList],
  )

  const collapseAll = () => setExpandedList([])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setNodes(await fetchAllNodes())
      setLoaded(true)
    } catch (e) {
      notify('error', `Could not load your files: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Drop tabs / expanded state / selection that point at nodes which no longer exist.
  useEffect(() => {
    if (!loaded || loading) return
    setTabs((prev) => {
      const next = prev.filter((t) => index.byId.has(t.id))
      return next.length === prev.length ? prev : next
    })
    setExpandedList((prev) => {
      const next = prev.filter((id) => index.byId.get(id)?.type === 'folder')
      return next.length === prev.length ? prev : next
    })
    setSelectedId((id) => (id && !index.byId.has(id) ? null : id))
  }, [index, loaded, loading, setExpandedList])

  /* ================================================================ tabs */

  useEffect(() => {
    if (activeId && !tabs.some((t) => t.id === activeId)) setActiveId(tabs.length ? tabs[tabs.length - 1].id : null)
  }, [tabs, activeId])

  useEffect(() => {
    if (activeId) setRecentIds((prev) => [activeId, ...prev.filter((id) => id !== activeId)].slice(0, 20))
  }, [activeId])

  // Free editor models, blob URLs and timers of closed tabs.
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.id))
    const monaco = monacoRef.current
    if (monaco) {
      for (const model of monaco.editor.getModels()) {
        const id = idFromModel(model)
        if (id && !open.has(id)) model.dispose()
      }
    }
    for (const [id, url] of blobUrls.current) {
      if (!open.has(id)) {
        URL.revokeObjectURL(url)
        blobUrls.current.delete(id)
      }
    }
    for (const [id, timer] of autoSaveTimers.current) {
      if (!open.has(id)) {
        clearTimeout(timer)
        autoSaveTimers.current.delete(id)
      }
    }
  }, [tabs])

  useEffect(
    () => () => {
      monacoRef.current?.editor.getModels().forEach((m) => m.uri.scheme === MODEL_SCHEME && m.dispose())
      blobUrls.current.forEach((url) => URL.revokeObjectURL(url))
      autoSaveTimers.current.forEach((t) => clearTimeout(t))
    },
    [],
  )

  const getModel = (id) => {
    const monaco = monacoRef.current
    return monaco ? monaco.editor.getModel(monaco.Uri.parse(modelPath(id))) : null
  }

  const patchTab = useCallback(
    (id, patch) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    [],
  )

  /** Downloads a file's content and decides how to show it (editor, preview, or a notice). */
  async function loadTab(node, { force = false } = {}) {
    getModel(node.id)?.dispose()
    patchTab(node.id, { kind: 'loading', error: null, dirty: false })
    try {
      const media = mediaKind(node.name)
      if (media) {
        if (!Number(node.size)) return patchTab(node.id, { kind: 'media', media, url: null })
        let url
        if (media === 'pdf') {
          const blob = await readContent(node)
          url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
          const old = blobUrls.current.get(node.id)
          if (old) URL.revokeObjectURL(old)
          blobUrls.current.set(node.id, url)
        } else {
          url = await getSignedUrl(node)
        }
        return patchTab(node.id, { kind: 'media', media, url })
      }
      if (!force && isKnownBinary(node.name)) return patchTab(node.id, { kind: 'binary' })
      if (!force && Number(node.size) > LARGE_FILE_BYTES) return patchTab(node.id, { kind: 'large' })

      const blob = await readContent(node)
      if (!force && (await looksBinary(blob))) return patchTab(node.id, { kind: 'binary' })
      const text = await blob.text()
      // A fresh Monaco model starts at alternative version 1 → that's our "saved" version.
      patchTab(node.id, { kind: 'text', text, savedVersion: 1, dirty: false })
    } catch (e) {
      patchTab(node.id, { kind: 'error', error: e.message || String(e) })
    }
  }

  function addTab(tab) {
    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev
      const at = prev.findIndex((t) => t.id === live.current.activeId)
      const next = [...prev]
      next.splice(at < 0 ? prev.length : at + 1, 0, tab)
      return next
    })
    setActiveId(tab.id)
  }

  function openFile(node) {
    if (!node || node.type !== 'file') return
    setSelectedId(node.id)
    expand(getAncestors(node.id, live.current.index.byId))
    if (isMobile()) setSidebarVisible(false)
    if (live.current.tabs.some((t) => t.id === node.id)) return setActiveId(node.id)
    addTab({ id: node.id, kind: 'loading' })
    loadTab(node)
  }

  /* ============================================================== saving */

  async function doSave(id) {
    const { tabs: currentTabs, index: currentIndex } = live.current
    const tab = currentTabs.find((t) => t.id === id)
    const node = currentIndex.byId.get(id)
    const model = getModel(id)
    if (!tab || tab.kind !== 'text' || !node || !model) return true

    const version = model.getAlternativeVersionId()
    if (version === tab.savedVersion && !tab.dirty) return true

    const activity = startActivity(`Saving ${node.name}`)
    try {
      const updated = await writeContent(node, model.getValue(), {
        onProgress: (p) => activity.update({ progress: p }),
      })
      upsertNodes([updated])
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                savedVersion: version,
                dirty: model.isDisposed() ? false : model.getAlternativeVersionId() !== version,
              }
            : t,
        ),
      )
      return true
    } catch (e) {
      notify('error', `Failed to save '${node.name}': ${e.message}`)
      return false
    } finally {
      activity.done()
    }
  }

  /** Saves are queued per file so two saves of the same file never overlap. */
  function saveTab(id) {
    const run = (saveChains.current.get(id) || Promise.resolve()).then(() => doSave(id))
    saveChains.current.set(id, run)
    return run
  }

  const saveActive = () => live.current.activeId && saveTab(live.current.activeId)
  const saveAll = () => Promise.all(live.current.tabs.filter((t) => t.dirty).map((t) => saveTab(t.id)))

  function scheduleAutoSave(id) {
    clearTimeout(autoSaveTimers.current.get(id))
    autoSaveTimers.current.set(
      id,
      setTimeout(() => {
        autoSaveTimers.current.delete(id)
        fn.current.saveTab(id)
      }, AUTO_SAVE_DELAY),
    )
  }

  function toggleAutoSave() {
    const next = !live.current.autoSave
    setAutoSave(next)
    if (next) saveAll()
  }

  /* ============================================================== editor */

  const editorHandlers = useMemo(
    () => ({
      beforeMount: (monaco) => {
        monacoRef.current = monaco
      },
      onMount: (editor) => {
        editorRef.current = editor
        const update = () => {
          const p = editor.getPosition()
          setCursor(p ? { line: p.lineNumber, col: p.column } : null)
        }
        editor.onDidChangeCursorPosition(update)
        editor.onDidChangeModel(update)
        // Subscribing directly (instead of the wrapper's onChange) avoids copying the
        // whole document on every keystroke, which matters for very large files.
        editor.onDidChangeModelContent(() => onContentChange(editor.getModel()))
        editor.onDidDispose(() => {
          if (editorRef.current === editor) editorRef.current = null
          setCursor(null)
        })
        update()
      },
    }),
    [],
  )

  /** Marks a tab dirty/clean by comparing Monaco's version id with the last saved one. */
  function onContentChange(model) {
    const id = idFromModel(model)
    if (!id) return
    const version = model.getAlternativeVersionId()
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.id === id)
      if (i < 0) return prev
      const dirty = version !== prev[i].savedVersion
      if (prev[i].dirty === dirty) return prev
      const next = prev.slice()
      next[i] = { ...prev[i], dirty }
      return next
    })
    if (live.current.autoSave) fn.current.scheduleAutoSave(id)
  }

  const editorOptions = useMemo(
    () => ({
      fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 19,
      minimap: { enabled: minimap },
      wordWrap: wordWrap ? 'on' : 'off',
      automaticLayout: true,
      scrollBeyondLastLine: true,
      smoothScrolling: true,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      stickyScroll: { enabled: true },
      tabSize: 2,
      padding: { top: 4 },
      fixedOverflowWidgets: true,
      mouseWheelZoom: true,
    }),
    [minimap, wordWrap],
  )

  function editorAction(actionId) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const action = editor.getAction(actionId)
    if (action) action.run()
    else editor.trigger('menu', actionId, null)
  }

  /* ================================================================ close */

  async function closeTab(id) {
    const tab = live.current.tabs.find((t) => t.id === id)
    if (!tab) return true
    if (tab.dirty) {
      const name = live.current.index.byId.get(id)?.name || 'this file'
      const choice = await showDialog({
        type: 'warning',
        message: `Do you want to save the changes you made to ${name}?`,
        detail: "Your changes will be lost if you don't save them.",
        buttons: ['Save', "Don't Save", 'Cancel'],
        cancelId: 2,
      })
      if (choice === 2 || choice === -1) return false
      if (choice === 0 && !(await saveTab(id))) return false
    }
    const current = live.current.tabs
    if (live.current.activeId === id) {
      const i = current.findIndex((t) => t.id === id)
      const rest = current.filter((t) => t.id !== id)
      setActiveId(rest.length ? rest[Math.min(i, rest.length - 1)].id : null)
    }
    setTabs((prev) => prev.filter((t) => t.id !== id))
    return true
  }

  async function closeTabs(ids) {
    for (const id of ids) if (!(await closeTab(id))) return false
    return true
  }

  const closeAll = () => closeTabs(live.current.tabs.map((t) => t.id))

  /* ======================================================= file operations */

  function targetFolderId() {
    const { index: idx, selectedId: sel } = live.current
    const node = sel ? idx.byId.get(sel) : null
    if (!node) return null
    return node.type === 'folder' ? node.id : node.parent_id ?? null
  }

  function startCreate(type, parentId = targetFolderId()) {
    setSidebarVisible(true)
    setView('explorer')
    setRenamingId(null)
    if (parentId) expand([parentId, ...getAncestors(parentId, live.current.index.byId)])
    setCreating({ parentId: parentId ?? null, type })
  }

  function startRename(node) {
    setCreating(null)
    setSidebarVisible(true)
    setView('explorer')
    setSelectedId(node.id)
    expand(getAncestors(node.id, live.current.index.byId))
    setRenamingId(node.id)
  }

  /** Looks up / creates folders by name while a multi-step operation is running. */
  function createResolver() {
    const key = (parentId, name) => `${parentId ?? ''}\u0000${name}`
    const known = new Map(live.current.nodes.map((n) => [key(n.parent_id, n.name), n]))
    const createdIds = []
    const find = (parentId, name) => known.get(key(parentId, name)) || null
    const add = (n) => known.set(key(n.parent_id, n.name), n)

    async function ensureFolder(parentId, name) {
      const hit = find(parentId, name)
      if (hit) {
        if (hit.type !== 'folder') throw new Error(`'${name}' already exists and is a file.`)
        return hit
      }
      const node = await insertNode({ id: uuid(), parentId, name, type: 'folder', userId })
      add(node)
      createdIds.push(node.id)
      upsertNodes([node])
      return node
    }

    async function ensurePath(parentId, segments) {
      let pid = parentId ?? null
      for (const s of segments) pid = (await ensureFolder(pid, s)).id
      return pid
    }

    return { find, add, ensureFolder, ensurePath, createdIds }
  }

  async function submitCreate(rawName) {
    const job = creating
    setCreating(null)
    if (!job) return
    try {
      const segments = splitPath(rawName).map((s) => s.trim())
      const name = segments.pop()
      const resolver = createResolver()
      const parentId = await resolver.ensurePath(job.parentId, segments) // "src/app/index.js" works too
      const node = await insertNode({ id: uuid(), parentId, name, type: job.type, userId })
      upsertNodes([node])
      expand([parentId, ...resolver.createdIds])
      setSelectedId(node.id)
      if (node.type === 'file') {
        if (isMobile()) setSidebarVisible(false)
        addTab({ id: node.id, kind: 'text', text: '', savedVersion: 1, dirty: false })
      }
    } catch (e) {
      notify('error', e.message)
    }
  }

  async function submitRename(node, newName) {
    setRenamingId(null)
    if (!newName || newName === node.name) return
    upsertNodes([{ ...node, name: newName }]) // optimistic
    try {
      upsertNodes([await updateNode(node.id, { name: newName })])
    } catch (e) {
      upsertNodes([node])
      notify('error', `Could not rename '${node.name}': ${e.message}`)
    }
  }

  async function moveNode(id, targetId) {
    const { index: idx } = live.current
    const node = idx.byId.get(id)
    const target = targetId ?? null
    if (!node || (node.parent_id ?? null) === target) return
    if (target && (target === id || isAncestorOf(id, target, idx.byId))) {
      return notify('warning', `Cannot move '${node.name}' into itself.`)
    }
    if (findChild(idx, target, node.name)) {
      return notify('warning', `A file or folder named '${node.name}' already exists in the destination folder.`)
    }
    upsertNodes([{ ...node, parent_id: target }]) // optimistic
    if (target) expand([target])
    try {
      upsertNodes([await updateNode(id, { parent_id: target })])
    } catch (e) {
      upsertNodes([node])
      notify('error', `Could not move '${node.name}': ${e.message}`)
    }
  }

  async function deleteNode(node) {
    const descendants = getDescendants(node.id, live.current.index)
    const choice = await showDialog({
      type: 'warning',
      message:
        node.type === 'folder'
          ? `Are you sure you want to delete '${node.name}' and its contents?`
          : `Are you sure you want to delete '${node.name}'?`,
      detail:
        node.type === 'folder' && descendants.length
          ? `${descendants.length} item${descendants.length === 1 ? '' : 's'} inside will be deleted from Supabase. This cannot be undone.`
          : 'The file will be deleted from Supabase. This cannot be undone.',
      buttons: ['Delete', 'Cancel'],
      cancelId: 1,
    })
    if (choice !== 0) return
    const activity = startActivity(`Deleting ${node.name}`)
    try {
      await deleteNodeTree(node, descendants)
      removeNodes([node.id, ...descendants.map((d) => d.id)])
    } catch (e) {
      notify('error', `Could not delete '${node.name}': ${e.message}`)
    } finally {
      activity.done()
    }
  }

  function triggerDownload(href, name, revoke) {
    const a = document.createElement('a')
    a.href = href
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (revoke) setTimeout(() => URL.revokeObjectURL(href), 2000)
  }

  async function downloadNode(node) {
    if (!node || node.type !== 'file') return
    try {
      if (!Number(node.size)) return triggerDownload(URL.createObjectURL(new Blob([])), node.name, true)
      triggerDownload(await getSignedUrl(node, { download: true, expiresIn: 300 }), node.name)
    } catch (e) {
      notify('error', `Could not download '${node.name}': ${e.message}`)
    }
  }

  function copyPath(node) {
    navigator.clipboard?.writeText(getPath(node.id, live.current.index.byId)).catch(() => {})
  }

  function reveal(id) {
    const node = live.current.index.byId.get(id)
    if (!node) return
    setView('explorer')
    setSidebarVisible(true)
    expand(getAncestors(id, live.current.index.byId))
    setSelectedId(id)
  }

  /* ============================================================== uploads */

  function pickUpload(parentId, folder) {
    uploadTargetRef.current = parentId ?? null
    ;(folder ? folderInputRef : fileInputRef).current?.click()
  }

  function onInputFiles(e) {
    const items = filesFromFileList(e.target.files || [])
    e.target.value = ''
    if (items.length) uploadItems(items, uploadTargetRef.current)
  }

  function dropFiles(dataTransfer, targetId) {
    filesFromDataTransfer(dataTransfer)
      .then((items) => uploadItems(items, targetId))
      .catch((e) => notify('error', `Could not read the dropped files: ${e.message}`))
  }

  /** items: [{ path: 'a/b/c.txt', file }] and/or [{ path: 'a/empty', dir: true }] */
  async function uploadItems(items, targetId = null) {
    if (!items.length) return
    const files = items.filter((it) => it.file)
    const resolver = createResolver()

    // Ask once about files that would be overwritten.
    const conflicts = files.filter((it) => {
      const segs = splitPath(it.path)
      let pid = targetId
      for (const s of segs.slice(0, -1)) {
        const f = resolver.find(pid, s)
        if (!f || f.type !== 'folder') return false
        pid = f.id
      }
      return resolver.find(pid, segs[segs.length - 1])?.type === 'file'
    })
    let replace = false
    if (conflicts.length) {
      const list = conflicts
        .slice(0, 8)
        .map((c) => `• ${c.path}`)
        .join('\n')
      const choice = await showDialog({
        type: 'warning',
        message:
          conflicts.length === 1
            ? `'${conflicts[0].path}' already exists. Do you want to replace it?`
            : `${conflicts.length} files already exist. Do you want to replace them?`,
        detail:
          conflicts.length === 1
            ? 'Its current contents will be overwritten.'
            : list + (conflicts.length > 8 ? `\n…and ${conflicts.length - 8} more` : ''),
        buttons: ['Replace', 'Skip Existing', 'Cancel'],
        cancelId: 2,
      })
      if (choice === 2 || choice === -1) return
      replace = choice === 0
    }

    const totalBytes = files.reduce((sum, it) => sum + it.file.size, 0)
    const sent = new Map()
    let done = 0
    let failed = 0
    let skipped = 0
    const activity = startActivity(files.length === 1 ? `Uploading ${files[0].file.name}` : `Uploading 0/${files.length}`)
    const report = () => {
      let bytes = 0
      for (const v of sent.values()) bytes += v
      activity.update({
        progress: totalBytes ? bytes / totalBytes : files.length ? done / files.length : null,
        ...(files.length > 1 && { label: `Uploading ${done}/${files.length}` }),
      })
    }

    try {
      // 1) Folders, parents first, one at a time so nothing gets created twice.
      const folderPaths = new Set()
      for (const it of items) {
        const segs = splitPath(it.path)
        const depth = it.file ? segs.length - 1 : segs.length
        for (let i = 1; i <= depth; i++) folderPaths.add(segs.slice(0, i).join('/'))
      }
      const folderIds = new Map()
      const sortedFolders = [...folderPaths].sort((a, b) => splitPath(a).length - splitPath(b).length)
      for (const p of sortedFolders) {
        const segs = splitPath(p)
        const name = segs.pop()
        const parentId = segs.length ? folderIds.get(segs.join('/')) : targetId
        folderIds.set(p, (await resolver.ensureFolder(parentId, name)).id)
      }
      expand([targetId])

      // 2) Files, a few in parallel.
      const queue = [...files]
      const worker = async () => {
        while (queue.length) {
          const it = queue.shift()
          const segs = splitPath(it.path)
          const name = segs.pop()
          const parentId = segs.length ? folderIds.get(segs.join('/')) : targetId
          try {
            const existing = resolver.find(parentId, name)
            if (existing?.type === 'folder') throw new Error('a folder with the same name already exists')
            if (existing && !replace) {
              skipped++
              continue
            }
            let node = existing
            const created = !existing
            if (created) {
              node = await insertNode({ id: uuid(), parentId, name, type: 'file', userId })
              resolver.add(node)
              upsertNodes([node])
            }
            try {
              const updated = await writeContent(node, it.file, {
                onProgress: (p) => {
                  sent.set(it, p * it.file.size)
                  report()
                },
              })
              upsertNodes([updated])
              resolver.add(updated)
              if (!created && live.current.tabs.some((t) => t.id === updated.id)) loadTab(updated)
            } catch (err) {
              if (created) {
                await deleteNodeRow(node.id).catch(() => {})
                removeNodes([node.id])
              }
              throw err
            }
          } catch (err) {
            failed++
            notify('error', `Failed to upload '${it.path}': ${err.message}`)
          } finally {
            done++
            sent.set(it, it.file.size)
            report()
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker))

      if (files.length) {
        const ok = files.length - failed - skipped
        notify(
          failed ? 'warning' : 'info',
          `Uploaded ${ok} of ${files.length} file${files.length === 1 ? '' : 's'} (${formatBytes(totalBytes)})` +
            (skipped ? `, ${skipped} skipped` : '') +
            (failed ? `, ${failed} failed` : '') +
            '.',
        )
      }
    } catch (e) {
      notify('error', `Upload failed: ${e.message}`)
    } finally {
      activity.done()
    }
  }

  /* =============================================================== layout */

  function showView(next) {
    setView(next)
    setSidebarVisible(true)
  }

  function onActivity(next) {
    if (sidebarVisible && view === next) setSidebarVisible(false)
    else showView(next)
  }

  const toggleSidebar = () => setSidebarVisible((v) => !v)

  function startResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const move = (ev) => setSidebarWidth(Math.max(170, Math.min(720, startWidth + ev.clientX - startX)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.classList.add('resizing')
  }

  async function signOut() {
    const dirty = live.current.tabs.filter((t) => t.dirty).length
    if (dirty) {
      const choice = await showDialog({
        type: 'warning',
        message: `You have ${dirty} unsaved file${dirty === 1 ? '' : 's'}. Sign out anyway?`,
        detail: 'Unsaved changes will be lost.',
        buttons: ['Sign Out', 'Cancel'],
        cancelId: 1,
      })
      if (choice !== 0) return
    }
    await supabase.auth.signOut()
  }

  /* ============================================================ commands */

  const activeTab = tabs.find((t) => t.id === activeId) || null
  const activeNode = activeTab ? index.byId.get(activeTab.id) || null : null
  const hasEditor = activeTab?.kind === 'text'
  const dirtyCount = tabs.filter((t) => t.dirty).length

  const commands = {
    newFile: { category: 'File', label: 'New File…', run: () => startCreate('file') },
    newFolder: { category: 'File', label: 'New Folder…', run: () => startCreate('folder') },
    uploadFiles: { category: 'File', label: 'Upload Files…', run: () => pickUpload(targetFolderId(), false) },
    uploadFolder: { category: 'File', label: 'Upload Folder…', run: () => pickUpload(targetFolderId(), true) },
    save: { category: 'File', label: 'Save', keys: 'Ctrl+S', disabled: !hasEditor, run: saveActive },
    saveAll: { category: 'File', label: 'Save All', disabled: !dirtyCount, run: saveAll },
    autoSave: { category: 'File', label: 'Auto Save', checked: autoSave, run: toggleAutoSave },
    download: { category: 'File', label: 'Download', disabled: !activeNode, run: () => downloadNode(activeNode) },
    closeEditor: { category: 'View', label: 'Close Editor', disabled: !activeId, run: () => closeTab(activeId) },
    closeAll: { category: 'View', label: 'Close All Editors', disabled: !tabs.length, run: closeAll },
    signOut: { category: 'Account', label: 'Sign Out', run: signOut },
    undo: { category: 'Edit', label: 'Undo', keys: 'Ctrl+Z', disabled: !hasEditor, run: () => editorAction('undo') },
    redo: { category: 'Edit', label: 'Redo', keys: 'Ctrl+Y', disabled: !hasEditor, run: () => editorAction('redo') },
    find: { category: 'Edit', label: 'Find', keys: 'Ctrl+F', disabled: !hasEditor, run: () => editorAction('actions.find') },
    replace: {
      category: 'Edit',
      label: 'Replace',
      keys: 'Ctrl+H',
      disabled: !hasEditor,
      run: () => editorAction('editor.action.startFindReplaceAction'),
    },
    format: {
      category: 'Edit',
      label: 'Format Document',
      keys: 'Shift+Alt+F',
      disabled: !hasEditor,
      run: () => editorAction('editor.action.formatDocument'),
    },
    palette: { category: 'View', label: 'Command Palette…', keys: 'Ctrl+Shift+P', run: () => setQuick('commands') },
    explorer: { category: 'View', label: 'Explorer', keys: 'Ctrl+Shift+E', run: () => showView('explorer') },
    search: { category: 'View', label: 'Search', keys: 'Ctrl+Shift+F', run: () => showView('search') },
    sidebar: { category: 'View', label: 'Primary Side Bar', keys: 'Ctrl+B', checked: sidebarVisible, run: toggleSidebar },
    wordWrap: { category: 'View', label: 'Word Wrap', keys: 'Alt+Z', checked: wordWrap, run: () => setWordWrap((v) => !v) },
    minimap: { category: 'View', label: 'Minimap', checked: minimap, run: () => setMinimap((v) => !v) },
    goFile: { category: 'Go', label: 'Go to File…', keys: 'Ctrl+P', run: () => setQuick('files') },
    goLine: {
      category: 'Go',
      label: 'Go to Line…',
      keys: 'Ctrl+G',
      disabled: !hasEditor,
      run: () => editorAction('editor.action.gotoLine'),
    },
    refresh: { category: 'Explorer', label: 'Refresh', run: refresh },
    collapse: { category: 'Explorer', label: 'Collapse Folders', run: collapseAll },
    shortcuts: {
      category: 'Help',
      label: 'Keyboard Shortcuts',
      run: () =>
        showDialog({
          type: 'info',
          message: 'Keyboard shortcuts',
          detail: [
            'Ctrl+P            Go to file',
            'Ctrl+Shift+P, F1  Command palette',
            'Ctrl+S            Save',
            'Ctrl+B            Toggle side bar',
            'Ctrl+Shift+E      Explorer',
            'Ctrl+Shift+F      Search',
            'Alt+Z             Toggle word wrap',
            'F2 / Delete       Rename / delete (in Explorer)',
            'Ctrl+F / Ctrl+H   Find / replace (in editor)',
            '',
            'On macOS use ⌘ instead of Ctrl.',
          ].join('\n'),
        }),
    },
    about: {
      category: 'Help',
      label: 'About',
      run: () =>
        showDialog({
          type: 'info',
          message: 'CodeVault',
          detail:
            'A VS Code style file storage app.\n\nFolder structure is stored in Supabase Postgres; file contents are stored in Supabase Storage with no size limit in the app (large files use resumable uploads).',
        }),
    },
  }

  const toMenuItem = (key) => {
    if (key === '-') return '-'
    const c = commands[key]
    return { label: c.label, shortcut: c.keys, checked: c.checked, disabled: c.disabled, onClick: c.run }
  }

  const menus = [
    ['File', ['newFile', 'newFolder', '-', 'uploadFiles', 'uploadFolder', '-', 'save', 'saveAll', 'autoSave', '-', 'download', '-', 'closeEditor', 'closeAll', '-', 'signOut']],
    ['Edit', ['undo', 'redo', '-', 'find', 'replace', '-', 'format']],
    ['View', ['palette', '-', 'explorer', 'search', '-', 'sidebar', 'wordWrap', 'minimap']],
    ['Go', ['goFile', 'goLine']],
    ['Help', ['shortcuts', 'about']],
  ].map(([name, keys]) => ({ name, items: keys.map(toMenuItem) }))

  const paletteCommands = Object.entries(commands).map(([id, c]) => ({
    id,
    title: `${c.category}: ${c.label.replace('…', '')}`,
    keys: c.keys,
    disabled: c.disabled,
    run: c.run,
  }))

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenuAt = (e, items) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ x: r.right + 2, y: r.top, items })
  }

  function openNodeMenu(e, node) {
    const folderId = node ? (node.type === 'folder' ? node.id : node.parent_id ?? null) : null
    const items = []
    if (!node || node.type === 'folder') {
      items.push(
        { label: 'New File…', onClick: () => startCreate('file', folderId) },
        { label: 'New Folder…', onClick: () => startCreate('folder', folderId) },
        '-',
        { label: 'Upload Files…', onClick: () => pickUpload(folderId, false) },
        { label: 'Upload Folder…', onClick: () => pickUpload(folderId, true) },
      )
    } else {
      items.push({ label: 'Open', onClick: () => openFile(node) }, { label: 'Download', onClick: () => downloadNode(node) })
    }
    if (node) {
      items.push(
        '-',
        { label: 'Copy Path', onClick: () => copyPath(node) },
        '-',
        { label: 'Rename…', shortcut: 'F2', onClick: () => startRename(node) },
        { label: 'Delete', shortcut: 'Delete', onClick: () => deleteNode(node) },
      )
    } else {
      items.push('-', { label: 'Refresh', onClick: refresh }, { label: 'Collapse Folders', onClick: collapseAll })
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  function openTabMenu(e, id) {
    const node = index.byId.get(id)
    const ids = tabs.map((t) => t.id)
    const at = ids.indexOf(id)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Close', onClick: () => closeTab(id) },
        { label: 'Close Others', disabled: ids.length < 2, onClick: () => closeTabs(ids.filter((x) => x !== id)) },
        { label: 'Close to the Right', disabled: at === ids.length - 1, onClick: () => closeTabs(ids.slice(at + 1)) },
        { label: 'Close All', onClick: closeAll },
        '-',
        { label: 'Copy Path', onClick: () => node && copyPath(node) },
        { label: 'Reveal in Explorer', onClick: () => reveal(id) },
        { label: 'Download', onClick: () => downloadNode(node) },
      ],
    })
  }

  /* ======================================================= global events */

  function onGlobalKey(e) {
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && !e.shiftKey && !e.altKey && k === 's') saveActive()
    else if (mod && !e.shiftKey && !e.altKey && k === 'p') setQuick('files')
    else if ((mod && e.shiftKey && k === 'p') || e.key === 'F1') setQuick('commands')
    else if (mod && !e.shiftKey && !e.altKey && k === 'b') toggleSidebar()
    else if (mod && e.shiftKey && k === 'e') showView('explorer')
    else if (mod && e.shiftKey && k === 'f') showView('search')
    else if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyZ') setWordWrap((v) => !v)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  fn.current = { saveTab, scheduleAutoSave, onGlobalKey }

  useEffect(() => {
    const onKey = (e) => fn.current.onGlobalKey(e)
    const preventFileDrop = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    const beforeUnload = (e) => {
      if (live.current.tabs.some((t) => t.dirty)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('dragover', preventFileDrop)
    window.addEventListener('drop', preventFileDrop)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('dragover', preventFileDrop)
      window.removeEventListener('drop', preventFileDrop)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])

  useEffect(() => {
    document.title = activeNode ? `${activeTab?.dirty ? '● ' : ''}${activeNode.name} - CodeVault` : 'CodeVault'
  }, [activeNode, activeTab?.dirty])

  /* ============================================================== derived */

  const fileList = useMemo(
    () =>
      nodes
        .filter((n) => n.type === 'file')
        .map((n) => ({ node: n, path: getPath(n.id, index.byId) }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [nodes, index],
  )

  const stats = useMemo(() => {
    let files = 0
    let folders = 0
    let bytes = 0
    for (const n of nodes) {
      if (n.type === 'file') {
        files++
        bytes += Number(n.size) || 0
      } else folders++
    }
    return { files, folders, bytes }
  }, [nodes])

  const recent = useMemo(
    () =>
      [...fileList]
        .sort((a, b) => String(b.node.updated_at).localeCompare(String(a.node.updated_at)))
        .slice(0, 8),
    [fileList],
  )

  const currentActivity = activities[0]
  const accountItems = [
    { label: user.email, header: true },
    '-',
    { label: 'Sign Out', onClick: signOut },
  ]
  const manageItems = [
    { label: 'Command Palette…', shortcut: 'Ctrl+Shift+P', onClick: () => setQuick('commands') },
    { label: 'Keyboard Shortcuts', onClick: commands.shortcuts.run },
    '-',
    { label: 'Auto Save', checked: autoSave, onClick: toggleAutoSave },
    { label: 'Word Wrap', checked: wordWrap, onClick: () => setWordWrap((v) => !v) },
    { label: 'Minimap', checked: minimap, onClick: () => setMinimap((v) => !v) },
  ]

  /* =============================================================== render */

  return (
    <div className="workbench">
      <TitleBar
        menus={menus}
        centerLabel={activeNode ? getPath(activeNode.id, index.byId) : 'Search files'}
        onCommandCenter={() => setQuick('files')}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={toggleSidebar}
      />

      <div className="main">
        <ActivityBar
          view={view}
          sidebarVisible={sidebarVisible}
          onSelect={onActivity}
          onAccount={(e) => openMenuAt(e, accountItems)}
          onManage={(e) => openMenuAt(e, manageItems)}
        />

        {sidebarVisible && (
          <>
            <div className="sidebar-backdrop" onClick={() => setSidebarVisible(false)} />
            <aside className="sidebar" style={{ width: sidebarWidth }}>
              {view === 'search' ? (
                <SearchPanel files={fileList} activeId={activeId} onOpen={openFile} />
              ) : (
                <Explorer
                  title={user.email?.split('@')[0] || 'My Files'}
                  index={index}
                  loading={loading}
                  expanded={expanded}
                  selectedId={selectedId}
                  activeId={activeId}
                  creating={creating}
                  renamingId={renamingId}
                  busy={activities.length > 0}
                  progress={currentActivity?.progress ?? null}
                  stats={stats}
                  onToggle={toggleFolder}
                  onExpand={(id) => expand([id])}
                  onSelect={setSelectedId}
                  onOpen={openFile}
                  onCreateSubmit={submitCreate}
                  onCreateCancel={() => setCreating(null)}
                  onStartRename={startRename}
                  onRenameSubmit={submitRename}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={deleteNode}
                  onContextMenu={openNodeMenu}
                  onMove={moveNode}
                  onDropFiles={dropFiles}
                  onNewFile={() => startCreate('file')}
                  onNewFolder={() => startCreate('folder')}
                  onUpload={() => pickUpload(targetFolderId(), false)}
                  onRefresh={refresh}
                  onCollapseAll={collapseAll}
                />
              )}
            </aside>
            <div
              className="sash"
              onPointerDown={startResize}
              onDoubleClick={() => setSidebarWidth(260)}
              title="Drag to resize"
            />
          </>
        )}

        <EditorArea
          tabs={tabs}
          activeId={activeId}
          index={index}
          editorOptions={editorOptions}
          editorHandlers={editorHandlers}
          onActivate={setActiveId}
          onClose={closeTab}
          onTabContextMenu={openTabMenu}
          onReveal={reveal}
          onRetry={(node) => loadTab(node)}
          onOpenAnyway={(node) => loadTab(node, { force: true })}
          onDownload={downloadNode}
          welcome={{
            stats,
            recent,
            onNewFile: () => startCreate('file'),
            onNewFolder: () => startCreate('folder'),
            onUploadFiles: () => pickUpload(targetFolderId(), false),
            onUploadFolder: () => pickUpload(targetFolderId(), true),
            onQuickOpen: () => setQuick('files'),
            onOpen: openFile,
          }}
        />
      </div>

      <StatusBar
        activities={activities}
        dirtyCount={dirtyCount}
        cursor={hasEditor ? cursor : null}
        language={hasEditor && activeNode ? languageFor(activeNode.name) : null}
        size={activeNode ? Number(activeNode.size) || 0 : null}
        autoSave={autoSave}
        email={user.email}
        onToggleAutoSave={toggleAutoSave}
        onGoToLine={() => editorAction('editor.action.gotoLine')}
        onAccount={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ x: r.left, y: r.top - 80, items: accountItems })
        }}
      />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
      {quick && (
        <QuickInput
          key={quick}
          mode={quick}
          files={fileList}
          commands={paletteCommands}
          recentIds={recentIds}
          onClose={() => setQuick(null)}
          onOpenFile={openFile}
        />
      )}
      {dialogElement}
      <Notifications items={notifications} onDismiss={dismiss} />

      <input ref={fileInputRef} type="file" multiple hidden onChange={onInputFiles} />
      <input ref={folderInputRef} type="file" multiple hidden webkitdirectory="" directory="" onChange={onInputFiles} />
    </div>
  )
}
