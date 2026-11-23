import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * items: Array<'-' | { label, onClick, shortcut?, checked?, disabled?, header? }>
 * ignoreRef: clicks inside this element don't close the menu (used by the menu bar).
 */
export default function ContextMenu({ x, y, items, onClose, ignoreRef }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y, visibility: 'hidden' })
  const [focus, setFocus] = useState(-1)
  const hasChecks = items.some((it) => it !== '-' && 'checked' in it)

  useLayoutEffect(() => {
    const rect = ref.current.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - 4) left = Math.max(4, window.innerWidth - rect.width - 4)
    if (top + rect.height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - rect.height - 4)
    setPos({ left, top, visibility: 'visible' })
    ref.current.focus({ preventScroll: true })
  }, [x, y, items.length])

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || ignoreRef?.current?.contains(e.target)) return
      onClose()
    }
    const onBlur = () => onClose()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onBlur)
    }
  }, [onClose, ignoreRef])

  const selectable = (i) => items[i] !== '-' && !items[i].disabled && !items[i].header

  function move(step) {
    for (let n = 1; n <= items.length; n++) {
      const i = (focus + step * n + items.length * 2) % items.length
      if (selectable(i)) return setFocus(i)
    }
  }

  function activate(item) {
    onClose()
    item.onClick?.()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'Enter' && focus >= 0) activate(items[focus])
    else if (e.key === 'Escape' || e.key === 'Tab') onClose()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      ref={ref}
      className="context-menu"
      style={pos}
      tabIndex={-1}
      role="menu"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === '-' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            className={`menu-item${focus === i ? ' focused' : ''}${item.disabled ? ' disabled' : ''}${
              item.header ? ' header' : ''
            }`}
            onMouseEnter={() => selectable(i) && setFocus(i)}
            onMouseLeave={() => setFocus(-1)}
            onClick={() => selectable(i) && activate(item)}
          >
            {hasChecks && (
              <span className="menu-check">{item.checked && <i className="codicon codicon-check" />}</span>
            )}
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </div>
        ),
      )}
    </div>
  )
}
