import { useEffect, useMemo, useRef, useState } from 'react'
import FileIcon from './FileIcon'
import { ROOT, findChild } from '../lib/tree'
import { formatBytes } from '../lib/format'

const INDENT = 12
const BASE_PAD = 6
const NODE_MIME = 'application/x-codevault-node'

/** Visible rows of the tree (expanded folders only), plus the inline "new item" row. */
function flatten(index, expanded, creating) {
  const rows = []
  const walk = (parentId, depth) => {
    if (creating && creating.parentId === parentId) rows.push({ kind: 'create', depth, key: '__create__' })
    for (const node of index.children.get(parentId ?? ROOT) || []) {
      rows.push({ kind: 'node', node, depth, key: node.id })
      if (node.type === 'folder' && expanded.has(node.id)) walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/** Map<folder id, total bytes of every file inside it, at any depth>. */
function folderSizes(index) {
  const sizes = new Map()
  const total = (parentId) => {
    let sum = 0
    for (const n of index.children.get(parentId ?? ROOT) || []) sum += n.type === 'folder' ? total(n.id) : Number(n.size) || 0
    if (parentId) sizes.set(parentId, sum)
    return sum
  }
  total(null)
  return sizes
}

function downloadTitle(index, selectedId) {
  const node = selectedId ? index.byId.get(selectedId) : null
  if (!node) return 'Download All as Zip'
  return node.type === 'folder' ? `Download '${node.name}' as Zip` : `Download '${node.name}'`
}

export default function Explorer({
  title,
  index,
  loading,
  expanded,
  selectedId,
  activeId,
  creating,
  renamingId,
  busy,
  progress,
  stats,
  onToggle,
  onExpand,
  onSelect,
  onOpen,
  onCreateSubmit,
  onCreateCancel,
  onStartRename,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
  onContextMenu,
  onMove,
  onDropFiles,
  onNewFile,
  onNewFolder,
  onUpload,
  onDownload,
  onRefresh,
  onCollapseAll,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [dropTarget, setDropTarget] = useState(undefined) // undefined = none, null = root, id = folder
  const treeRef = useRef(null)
  const hover = useRef({ id: null, timer: 0 })

  const rows = useMemo(() => flatten(index, expanded, creating), [index, expanded, creating])
  const nodeRows = useMemo(() => rows.filter((r) => r.kind === 'node'), [rows])
  const sizes = useMemo(() => folderSizes(index), [index])

  useEffect(() => {
    if (!selectedId) return
    const el = treeRef.current?.querySelector(`[data-id="${selectedId}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  useEffect(() => () => clearTimeout(hover.current.timer), [])

  /* ------------------------------------------------------ validation */

  function validate(value, parentId, { allowPath, excludeId }) {
    const v = value.trim()
    if (!v) return 'A file or folder name must be provided.'
    if (v.includes('\\')) return 'The name cannot contain a backslash (\\).'
    if (!allowPath && v.includes('/')) return "The name cannot contain '/'."
    const segments = allowPath ? v.split('/').map((s) => s.trim()).filter(Boolean) : [v]
    if (!segments.length) return 'A file or folder name must be provided.'
    if (segments.some((s) => s === '.' || s === '..')) return `'${v}' is not a valid name.`
    if (segments.some((s) => s.length > 255)) return 'The name is too long (max 255 characters).'
    const sibling = findChild(index, parentId, segments[0])
    if (sibling && sibling.id !== excludeId && (segments.length === 1 || sibling.type === 'file')) {
      return `A file or folder '${segments[0]}' already exists at this location. Please choose a different name.`
    }
    return null
  }

  /* ----------------------------------------------------- drag & drop */

  const isInternal = (e) => e.dataTransfer.types.includes(NODE_MIME)
  const isExternal = (e) => e.dataTransfer.types.includes('Files')

  function clearHover() {
    clearTimeout(hover.current.timer)
    hover.current = { id: null, timer: 0 }
  }

  function dragOver(e, targetId, node) {
    if (!isInternal(e) && !isExternal(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = isInternal(e) ? 'move' : 'copy'
    if (dropTarget !== targetId) setDropTarget(targetId)

    // Hovering a collapsed folder for a moment expands it (like VS Code).
    const folderId = node?.type === 'folder' && !expanded.has(node.id) ? node.id : null
    if (hover.current.id !== folderId) {
      clearHover()
      if (folderId) hover.current = { id: folderId, timer: setTimeout(() => onExpand(folderId), 700) }
    }
  }

  function drop(e, targetId) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(undefined)
    clearHover()
    const id = e.dataTransfer.getData(NODE_MIME)
    if (id) onMove(id, targetId)
    else if (isExternal(e)) onDropFiles(e.dataTransfer, targetId)
  }

  /* -------------------------------------------------------- keyboard */

  function onKeyDown(e) {
    if (e.target !== treeRef.current || renamingId || creating) return
    const i = nodeRows.findIndex((r) => r.node.id === selectedId)
    const row = nodeRows[i]
    const node = row?.node
    const select = (r) => r && onSelect(r.node.id)

    switch (e.key) {
      case 'ArrowDown':
        select(nodeRows[Math.min(i + 1, nodeRows.length - 1)] || nodeRows[0])
        break
      case 'ArrowUp':
        select(nodeRows[Math.max(i - 1, 0)])
        break
      case 'Home':
        select(nodeRows[0])
        break
      case 'End':
        select(nodeRows[nodeRows.length - 1])
        break
      case 'ArrowRight':
        if (node?.type === 'folder') {
          if (!expanded.has(node.id)) onToggle(node.id)
          else if (nodeRows[i + 1]?.depth > row.depth) select(nodeRows[i + 1])
        }
        break
      case 'ArrowLeft':
        if (node?.type === 'folder' && expanded.has(node.id)) onToggle(node.id)
        else if (node?.parent_id) onSelect(node.parent_id)
        break
      case 'Enter':
        if (!node) return
        if (node.type === 'folder') onToggle(node.id)
        else onOpen(node)
        break
      case 'F2':
        if (node) onStartRename(node)
        break
      case 'Delete':
        if (node) onDelete(node)
        break
      default:
        return
    }
    e.preventDefault()
  }

  /* ---------------------------------------------------------- render */

  let highlightDepth = -1 // rows deeper than this belong to the drop-target folder

  return (
    <div className="explorer">
      <div className="sidebar-title">
        <span>Explorer</span>
      </div>

      <div className="pane-header" onClick={() => setCollapsed((c) => !c)}>
        <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
        <span className="pane-title">{title}</span>
        <div className="pane-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="New File…" onClick={onNewFile}>
            <i className="codicon codicon-new-file" />
          </button>
          <button className="icon-btn" title="New Folder…" onClick={onNewFolder}>
            <i className="codicon codicon-new-folder" />
          </button>
          <button className="icon-btn" title="Upload Files…" onClick={onUpload}>
            <i className="codicon codicon-cloud-upload" />
          </button>
          <button className="icon-btn" title={downloadTitle(index, selectedId)} onClick={onDownload}>
            <i className="codicon codicon-cloud-download" />
          </button>
          <button className="icon-btn" title="Refresh Explorer" onClick={onRefresh}>
            <i className="codicon codicon-refresh" />
          </button>
          <button className="icon-btn" title="Collapse Folders in Explorer" onClick={onCollapseAll}>
            <i className="codicon codicon-collapse-all" />
          </button>
        </div>
      </div>

      <div className={`progress-bar${busy || loading ? ' active' : ''}${progress == null ? ' indeterminate' : ''}`}>
        <div style={progress == null ? undefined : { width: `${Math.round(progress * 100)}%` }} />
      </div>

      {!collapsed && (
        <div
          ref={treeRef}
          className={`tree${dropTarget === null ? ' drop-root' : ''}`}
          tabIndex={0}
          role="tree"
          aria-label="Files"
          onKeyDown={onKeyDown}
          onMouseDown={(e) => e.target === e.currentTarget && onSelect(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            onSelect(null)
            onContextMenu(e, null)
          }}
          onDragOver={(e) => dragOver(e, null, null)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setDropTarget(undefined)
              clearHover()
            }
          }}
          onDrop={(e) => drop(e, null)}
        >
          {!loading && rows.length === 0 && (
            <div className="explorer-empty">
              <p>Your storage is empty. Create a file, or upload files and folders from your computer.</p>
              <button className="btn primary block" onClick={onNewFile}>
                New File
              </button>
              <button className="btn primary block" onClick={onUpload}>
                Upload Files
              </button>
              <p className="muted">Tip: you can also drag files or whole folders here.</p>
            </div>
          )}

          {rows.map((row) => {
            let inTarget = false
            if (highlightDepth >= 0) {
              if (row.depth > highlightDepth) inTarget = true
              else highlightDepth = -1
            }
            if (row.kind === 'node' && dropTarget && row.node.id === dropTarget) {
              inTarget = true
              highlightDepth = row.depth
            }

            const guides = Array.from({ length: row.depth }, (_, i) => (
              <span key={i} className="indent-guide" style={{ left: BASE_PAD + i * INDENT + 8 }} />
            ))
            const padding = { paddingLeft: BASE_PAD + row.depth * INDENT }

            if (row.kind === 'create') {
              return (
                <InlineInput
                  key={row.key}
                  style={padding}
                  guides={guides}
                  type={creating.type}
                  initial=""
                  validate={(v) => validate(v, creating.parentId, { allowPath: true })}
                  onSubmit={onCreateSubmit}
                  onCancel={onCreateCancel}
                />
              )
            }

            const { node } = row
            const isFolder = node.type === 'folder'
            const open = isFolder && expanded.has(node.id)
            const size = formatBytes(isFolder ? sizes.get(node.id) : node.size)

            if (renamingId === node.id) {
              return (
                <InlineInput
                  key={row.key}
                  style={padding}
                  guides={guides}
                  type={node.type}
                  open={open}
                  initial={node.name}
                  validate={(v) => validate(v, node.parent_id, { allowPath: false, excludeId: node.id })}
                  onSubmit={(name) => onRenameSubmit(node, name)}
                  onCancel={onRenameCancel}
                />
              )
            }

            const classes = ['tree-row']
            if (selectedId === node.id) classes.push('selected')
            if (activeId === node.id) classes.push('active-file')
            if (inTarget) classes.push('drop-target')

            return (
              <div
                key={row.key}
                data-id={node.id}
                role="treeitem"
                aria-expanded={isFolder ? open : undefined}
                aria-selected={selectedId === node.id}
                className={classes.join(' ')}
                style={padding}
                title={`${node.name} · ${size}`}
                draggable
                onClick={() => {
                  onSelect(node.id)
                  if (isFolder) onToggle(node.id)
                  else onOpen(node)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSelect(node.id)
                  onContextMenu(e, node)
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData(NODE_MIME, node.id)
                  e.dataTransfer.setData('text/plain', node.name)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  setDropTarget(undefined)
                  clearHover()
                }}
                onDragOver={(e) => dragOver(e, isFolder ? node.id : node.parent_id ?? null, node)}
                onDrop={(e) => drop(e, isFolder ? node.id : node.parent_id ?? null)}
              >
                {guides}
                <span className="twistie">
                  {isFolder && <i className={`codicon codicon-chevron-${open ? 'down' : 'right'}`} />}
                </span>
                {!isFolder && <FileIcon name={node.name} />}
                <span className="label">{node.name}</span>
                <span className="size">{size}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="pane-footer" title="Total storage used by your files">
        <i className="codicon codicon-database" />
        <span>Storage</span>
        <span className="pane-meta">
          {stats.files} file{stats.files === 1 ? '' : 's'} · {formatBytes(stats.bytes)}
        </span>
      </div>
    </div>
  )
}

/** The in-tree text box used for "New File/Folder" and "Rename" (Enter = OK, Esc = cancel). */
function InlineInput({ style, guides, type, open, initial, validate, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef(null)
  const done = useRef(false)
  const error = value ? validate(value) : null

  useEffect(() => {
    const el = inputRef.current
    el.focus()
    if (initial) {
      const dot = type === 'file' ? initial.lastIndexOf('.') : -1
      el.setSelectionRange(0, dot > 0 ? dot : initial.length)
    }
  }, [initial, type])

  function finish(commit) {
    if (done.current) return
    done.current = true
    const v = value.trim()
    if (commit && v && !validate(v)) onSubmit(v)
    else onCancel()
  }

  return (
    <div className="tree-row editing" style={style}>
      {guides}
      <span className="twistie">
        {type === 'folder' && <i className={`codicon codicon-chevron-${open ? 'down' : 'right'}`} />}
      </span>
      {type === 'file' && <FileIcon name={value || 'file'} />}
      <div className="inline-input">
        <input
          ref={inputRef}
          className={error ? 'invalid' : undefined}
          value={value}
          spellCheck={false}
          aria-label={type === 'folder' ? 'Folder name' : 'File name'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              if (value.trim() && !error) finish(true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              finish(false)
            }
          }}
          onBlur={() => finish(true)}
          onClick={(e) => e.stopPropagation()}
        />
        {error && <div className="input-message">{error}</div>}
      </div>
    </div>
  )
}
