import { useCallback, useEffect, useRef, useState } from 'react'

const ICONS = { warning: 'warning', info: 'info', error: 'error' }

/**
 * const { showDialog, dialogElement } = useDialog()
 * const index = await showDialog({ type, message, detail, buttons: ['Save', "Don't Save", 'Cancel'], cancelId: 2 })
 */
export function useDialog() {
  const [dialog, setDialog] = useState(null)
  const current = useRef(null)
  current.current = dialog

  const showDialog = useCallback(
    (options) =>
      new Promise((resolve) => {
        current.current?.resolve(current.current.cancelId ?? -1)
        setDialog({ type: 'info', buttons: ['OK'], cancelId: 0, ...options, resolve })
      }),
    [],
  )

  const close = useCallback((index) => {
    current.current?.resolve(index)
    current.current = null
    setDialog(null)
  }, [])

  const dialogElement = dialog ? <Dialog key={dialog.message} {...dialog} onClose={close} /> : null
  return { showDialog, dialogElement }
}

function Dialog({ type, message, detail, buttons, cancelId, onClose }) {
  const firstButton = useRef(null)

  useEffect(() => {
    firstButton.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose(cancelId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelId, onClose])

  return (
    <div className="dialog-overlay">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-message">
        <i className={`dialog-icon codicon codicon-${ICONS[type] || 'info'} ${type}`} aria-hidden="true" />
        <div className="dialog-body">
          <div id="dialog-message" className="dialog-message">
            {message}
          </div>
          {detail && <div className="dialog-detail">{detail}</div>}
        </div>
        <div className="dialog-buttons">
          {buttons.map((label, i) => (
            <button
              key={label}
              ref={i === 0 ? firstButton : undefined}
              className={`btn ${i === 0 ? 'primary' : 'secondary'}`}
              onClick={() => onClose(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
