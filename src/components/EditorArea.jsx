import { Fragment, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import FileIcon from './FileIcon'
import Welcome from './Welcome'
import { getAncestors, getPath } from '../lib/tree'
import { languageFor } from '../lib/fileTypes'
import { formatBytes } from '../lib/format'
import { modelPath } from '../lib/models'

export default function EditorArea({
  tabs,
  activeId,
  index,
  editorOptions,
  editorHandlers,
  onActivate,
  onClose,
  onTabContextMenu,
  onReveal,
  onRetry,
  onOpenAnyway,
  onDownload,
  welcome,
}) {
  const tabsRef = useRef(null)

  useEffect(() => {
    tabsRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  if (!tabs.length) {
    return (
      <section className="editor-area">
        <Welcome {...welcome} />
      </section>
    )
  }

  const tab = tabs.find((t) => t.id === activeId)
  const node = tab ? index.byId.get(tab.id) : null

  return (
    <section className="editor-area">
      <div
        className="tabs"
        ref={tabsRef}
        role="tablist"
        onWheel={(e) => {
          if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY
        }}
      >
        {tabs.map((t) => {
          const n = index.byId.get(t.id)
          if (!n) return null
          const active = t.id === activeId
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              className={`tab${active ? ' active' : ''}${t.dirty ? ' dirty' : ''}`}
              title={getPath(n.id, index.byId)}
              onClick={() => onActivate(t.id)}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClick={(e) => e.button === 1 && onClose(t.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onTabContextMenu(e, t.id)
              }}
            >
              <FileIcon name={n.name} />
              <span className="tab-label">{n.name}</span>
              <button
                className="tab-close"
                title={t.dirty ? 'Unsaved changes – close' : 'Close'}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(t.id)
                }}
              >
                <i className="codicon codicon-close" />
                <i className="codicon codicon-circle-filled" />
              </button>
            </div>
          )
        })}
      </div>

      {node && <Breadcrumbs node={node} index={index} onReveal={onReveal} />}

      <div className="editor-content">
        {tab && node && (
          <TabContent
            tab={tab}
            node={node}
            editorOptions={editorOptions}
            editorHandlers={editorHandlers}
            onRetry={onRetry}
            onOpenAnyway={onOpenAnyway}
            onDownload={onDownload}
          />
        )}
      </div>
    </section>
  )
}

function Breadcrumbs({ node, index, onReveal }) {
  const folders = getAncestors(node.id, index.byId)
    .reverse()
    .map((id) => index.byId.get(id))
    .filter(Boolean)
  return (
    <div className="breadcrumbs">
      {folders.map((f) => (
        <Fragment key={f.id}>
          <button className="crumb" onClick={() => onReveal(f.id)}>
            {f.name}
          </button>
          <i className="codicon codicon-chevron-right" />
        </Fragment>
      ))}
      <button className="crumb current" onClick={() => onReveal(node.id)}>
        <FileIcon name={node.name} />
        {node.name}
      </button>
    </div>
  )
}

function Message({ icon, title, detail, actions }) {
  return (
    <div className="viewer-center">
      <i className={`codicon codicon-${icon} viewer-icon`} />
      <div className="viewer-title">{title}</div>
      {detail && <div className="viewer-detail">{detail}</div>}
      {actions && (
        <div className="viewer-actions">
          {actions.map((a, i) => (
            <button key={a.label} className={`btn ${i === 0 ? 'primary' : 'secondary'}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TabContent({ tab, node, editorOptions, editorHandlers, onRetry, onOpenAnyway, onDownload }) {
  switch (tab.kind) {
    case 'loading':
      return (
        <div className="editor-progress">
          <div />
        </div>
      )

    case 'error':
      return (
        <Message
          icon="error"
          title={`Could not open '${node.name}'`}
          detail={tab.error}
          actions={[
            { label: 'Try Again', onClick: () => onRetry(node) },
            { label: 'Download', onClick: () => onDownload(node) },
          ]}
        />
      )

    case 'binary':
      return (
        <Message
          icon="file-binary"
          title="The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding."
          detail={formatBytes(node.size)}
          actions={[
            { label: 'Download', onClick: () => onDownload(node) },
            { label: 'Open Anyway', onClick: () => onOpenAnyway(node) },
          ]}
        />
      )

    case 'large':
      return (
        <Message
          icon="warning"
          title={`This file is ${formatBytes(node.size)}. Opening very large files in the browser editor can be slow.`}
          detail="It is stored safely in Supabase either way."
          actions={[
            { label: 'Open Anyway', onClick: () => onOpenAnyway(node) },
            { label: 'Download', onClick: () => onDownload(node) },
          ]}
        />
      )

    case 'media':
      return <MediaViewer tab={tab} node={node} onDownload={onDownload} />

    case 'text':
      return (
        <div className="editor-host">
          <Editor
            theme="vs-dark"
            path={modelPath(tab.id)}
            defaultValue={tab.text ?? ''}
            language={languageFor(node.name)}
            options={editorOptions}
            keepCurrentModel
            saveViewState
            beforeMount={editorHandlers.beforeMount}
            onMount={editorHandlers.onMount}
            loading={<div className="editor-loading">Loading editor…</div>}
          />
        </div>
      )

    default:
      return null
  }
}

function MediaViewer({ tab, node, onDownload }) {
  if (!tab.url) return <Message icon="file-media" title={`'${node.name}' is empty.`} />
  const download = (
    <button className="btn secondary media-download" onClick={() => onDownload(node)}>
      <i className="codicon codicon-cloud-download" /> Download
    </button>
  )
  switch (tab.media) {
    case 'image':
      return (
        <div className="image-viewer">
          <img src={tab.url} alt={node.name} />
          <div className="media-footer">
            {formatBytes(node.size)} {download}
          </div>
        </div>
      )
    case 'video':
      return (
        <div className="viewer-center">
          <video className="media-element" src={tab.url} controls />
          {download}
        </div>
      )
    case 'audio':
      return (
        <div className="viewer-center">
          <i className="codicon codicon-unmute viewer-icon" />
          <div className="viewer-title">{node.name}</div>
          <audio src={tab.url} controls />
          {download}
        </div>
      )
    case 'pdf':
      return <iframe className="pdf-viewer" src={tab.url} title={node.name} />
    default:
      return null
  }
}
