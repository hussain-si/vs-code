const VIEWS = [
  { id: 'explorer', icon: 'files', title: 'Explorer (Ctrl+Shift+E)' },
  { id: 'search', icon: 'search', title: 'Search (Ctrl+Shift+F)' },
]

export default function ActivityBar({ view, sidebarVisible, onSelect, onManage }) {
  return (
    <nav className="activitybar" aria-label="Activity bar">
      <div>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`activity-item${sidebarVisible && view === v.id ? ' active' : ''}`}
            title={v.title}
            onClick={() => onSelect(v.id)}
          >
            <i className={`codicon codicon-${v.icon}`} />
          </button>
        ))}
      </div>
      <div>
        <button className="activity-item" title="Manage" onClick={onManage}>
          <i className="codicon codicon-settings-gear" />
        </button>
      </div>
    </nav>
  )
}
