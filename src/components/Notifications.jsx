const ICONS = { error: 'error', warning: 'warning', info: 'info' }

export default function Notifications({ items, onDismiss }) {
  if (!items.length) return null
  return (
    <div className="notifications" role="status" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className={`toast ${n.type}`}>
          <i className={`codicon codicon-${ICONS[n.type] || 'info'}`} aria-hidden="true" />
          <div className="toast-message">{n.message}</div>
          <button className="icon-btn" title="Clear notification" onClick={() => onDismiss(n.id)}>
            <i className="codicon codicon-close" />
          </button>
        </div>
      ))}
    </div>
  )
}
