import FileIcon from './FileIcon'
import { formatBytes } from '../lib/format'
import { parentPath } from '../lib/tree'

const SHORTCUTS = [
  ['Go to File', 'Ctrl+P'],
  ['Command Palette', 'Ctrl+Shift+P'],
  ['Save', 'Ctrl+S'],
  ['Toggle Side Bar', 'Ctrl+B'],
  ['Rename (in Explorer)', 'F2'],
  ['Toggle Word Wrap', 'Alt+Z'],
]

function Action({ icon, children, onClick }) {
  return (
    <button className="welcome-link" onClick={onClick}>
      <i className={`codicon codicon-${icon}`} />
      <span>{children}</span>
    </button>
  )
}

export default function Welcome({ stats, recent, onNewFile, onNewFolder, onUploadFiles, onUploadFolder, onQuickOpen, onOpen }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>CodeVault</h1>
        <p className="welcome-subtitle">Your files, stored in Supabase</p>

        <div className="welcome-grid">
          <div>
            <h2>Start</h2>
            <Action icon="new-file" onClick={onNewFile}>New File…</Action>
            <Action icon="new-folder" onClick={onNewFolder}>New Folder…</Action>
            <Action icon="cloud-upload" onClick={onUploadFiles}>Upload Files…</Action>
            <Action icon="file-directory-create" onClick={onUploadFolder}>Upload Folder…</Action>
            <Action icon="go-to-file" onClick={onQuickOpen}>Go to File…</Action>

            <h2 className="spaced">Recently changed</h2>
            {recent.length ? (
              recent.map(({ node, path }) => (
                <button key={node.id} className="welcome-recent" onClick={() => onOpen(node)} title={path}>
                  <FileIcon name={node.name} />
                  <span className="welcome-recent-name">{node.name}</span>
                  <span className="muted">{parentPath(path)}</span>
                </button>
              ))
            ) : (
              <p className="muted">No files yet – create one or drop files onto the Explorer.</p>
            )}
          </div>

          <div>
            <h2>Storage</h2>
            <div className="welcome-stats">
              <div>
                <strong>{stats.files}</strong>
                <span>files</span>
              </div>
              <div>
                <strong>{stats.folders}</strong>
                <span>folders</span>
              </div>
              <div>
                <strong>{formatBytes(stats.bytes)}</strong>
                <span>used</span>
              </div>
            </div>

            <h2 className="spaced">Keyboard shortcuts</h2>
            <dl className="welcome-shortcuts">
              {SHORTCUTS.map(([label, keys]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {keys.split('+').map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
