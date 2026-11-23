import { useCallback, useEffect, useState } from 'react'
import { loadJSON, saveJSON, shortId } from './lib/format'

/** useState that is remembered in localStorage. */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = loadJSON(key, undefined)
    if (stored !== undefined) return stored
    return typeof initial === 'function' ? initial() : initial
  })
  useEffect(() => saveJSON(key, value), [key, value])
  return [value, setValue]
}

/** VS Code-style toasts in the bottom-right corner. */
export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const dismiss = useCallback((id) => setNotifications((list) => list.filter((n) => n.id !== id)), [])
  const notify = useCallback(
    (type, message) => {
      const id = shortId()
      setNotifications((list) => [...list.slice(-4), { id, type, message }])
      setTimeout(() => dismiss(id), type === 'error' ? 10000 : 5000)
    },
    [dismiss],
  )
  return { notifications, notify, dismiss }
}

/** Background operations (saving, uploading…) shown in the status bar. */
export function useActivities() {
  const [activities, setActivities] = useState([])
  const start = useCallback((label) => {
    const id = shortId()
    setActivities((list) => [...list, { id, label, progress: null }])
    return {
      update: (patch) => setActivities((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a))),
      done: () => setActivities((list) => list.filter((a) => a.id !== id)),
    }
  }, [])
  return [activities, start]
}
