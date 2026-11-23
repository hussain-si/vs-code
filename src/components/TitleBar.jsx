import { useCallback, useRef, useState } from 'react'
import ContextMenu from './ContextMenu'

/** Top bar: logo, File/Edit/View… menus, command center and layout toggle. */
export default function TitleBar({ menus, centerLabel, onCommandCenter, sidebarVisible, onToggleSidebar }) {
  const [open, setOpen] = useState(null) // { name, x, y }
  const barRef = useRef(null)
  const close = useCallback(() => setOpen(null), [])

  const openAt = (name, el) => {
    const r = el.getBoundingClientRect()
    setOpen({ name, x: r.left, y: r.bottom })
  }

  const openMenu = open && menus.find((m) => m.name === open.name)

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <img className="titlebar-logo" src="/favicon.svg" alt="CodeVault" />
        <nav className="menubar" ref={barRef}>
          {menus.map((m) => (
            <div
              key={m.name}
              className={`menubar-item${open?.name === m.name ? ' open' : ''}`}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                if (open?.name === m.name) setOpen(null)
                else openAt(m.name, e.currentTarget)
              }}
              onMouseEnter={(e) => open && open.name !== m.name && openAt(m.name, e.currentTarget)}
            >
              {m.name}
            </div>
          ))}
        </nav>
      </div>

      <button className="command-center" onClick={onCommandCenter} title="Search files (Ctrl+P)">
        <i className="codicon codicon-search" />
        <span>{centerLabel}</span>
      </button>

      <div className="titlebar-right">
        <button
          className={`icon-btn${sidebarVisible ? ' on' : ''}`}
          title="Toggle Primary Side Bar (Ctrl+B)"
          onClick={onToggleSidebar}
        >
          <i className={`codicon codicon-layout-sidebar-left${sidebarVisible ? '' : '-off'}`} />
        </button>
      </div>

      {openMenu && <ContextMenu x={open.x} y={open.y} items={openMenu.items} onClose={close} ignoreRef={barRef} />}
    </header>
  )
}
