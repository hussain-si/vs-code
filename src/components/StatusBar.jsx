import { formatBytes } from '../lib/format'
import { languageLabel } from '../lib/fileTypes'

export default function StatusBar({
  activities,
  dirtyCount,
  cursor,
  language,
  size,
  autoSave,
  onToggleAutoSave,
  onGoToLine,
}) {
  const activity = activities[0]

  return (
    <footer className="statusbar">
      <div className="status-group">
        <div className="status-item status-remote" title="Files are stored in Supabase">
          <i className="codicon codicon-remote" />
          <span>Supabase</span>
        </div>
        {activity ? (
          <div className="status-item" title={activity.label}>
            <i className="codicon codicon-sync spin" />
            <span>
              {activity.label}
              {activity.progress != null && ` ${Math.round(activity.progress * 100)}%`}
              {activities.length > 1 && ` (+${activities.length - 1})`}
            </span>
          </div>
        ) : dirtyCount ? (
          <div className="status-item" title="Press Ctrl+S to save">
            <i className="codicon codicon-circle-filled" />
            <span>{dirtyCount} unsaved</span>
          </div>
        ) : (
          <div className="status-item">
            <i className="codicon codicon-check" />
            <span>All changes saved</span>
          </div>
        )}
      </div>

      <div className="status-group">
        {cursor && (
          <button className="status-item" title="Go to Line (Ctrl+G)" onClick={onGoToLine}>
            Ln {cursor.line}, Col {cursor.col}
          </button>
        )}
        {language && <div className="status-item hide-narrow">UTF-8</div>}
        {language && <div className="status-item">{languageLabel(language)}</div>}
        {size != null && <div className="status-item hide-narrow">{formatBytes(size)}</div>}
        <button
          className="status-item"
          title={autoSave ? 'Auto Save is on – click to turn off' : 'Auto Save is off – click to turn on'}
          onClick={onToggleAutoSave}
        >
          <i className={`codicon codicon-${autoSave ? 'check-all' : 'circle-slash'}`} />
          <span className="hide-narrow">Auto Save</span>
        </button>
      </div>
    </footer>
  )
}
