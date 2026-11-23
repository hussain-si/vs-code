import { useEffect, useMemo, useRef, useState } from 'react'
import FileIcon from './FileIcon'
import Highlight from './Highlight'
import { fuzzyMatch } from '../lib/fuzzy'
import { parentPath } from '../lib/tree'

const MAX_ITEMS = 80
const NO_MATCH = { score: 0, indices: [] }

/** Quick Open (Ctrl+P) and Command Palette (Ctrl+Shift+P / F1). Type ">" to switch to commands. */
export default function QuickInput({ mode, files, commands, recentIds, onClose, onOpenFile }) {
  const [value, setValue] = useState(mode === 'commands' ? '>' : '')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const isCommand = value.startsWith('>')
  const query = (isCommand ? value.slice(1) : value).trim()

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setSelected(0), [query, isCommand])
  useEffect(() => listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' }), [selected])

  const items = useMemo(() => {
    if (isCommand) {
      const list = commands
        .filter((c) => !c.disabled)
        .map((c) => ({ key: c.id, kind: 'command', command: c, match: query ? fuzzyMatch(query, c.title) : NO_MATCH }))
        .filter((it) => it.match)
      if (query) list.sort((a, b) => b.match.score - a.match.score)
      return list.slice(0, MAX_ITEMS)
    }

    if (!query) {
      const recent = recentIds.map((id) => files.find((f) => f.node.id === id)).filter(Boolean)
      const recentSet = new Set(recent.map((f) => f.node.id))
      return [...recent, ...files.filter((f) => !recentSet.has(f.node.id))]
        .slice(0, MAX_ITEMS)
        .map((file) => ({ key: file.node.id, kind: 'file', file, match: NO_MATCH }))
    }

    const out = []
    for (const file of files) {
      const nameMatch = fuzzyMatch(query, file.node.name)
      if (nameMatch) {
        out.push({ key: file.node.id, kind: 'file', file, match: { ...nameMatch, score: nameMatch.score + 100 } })
        continue
      }
      const pathMatch = fuzzyMatch(query, file.path)
      if (pathMatch) out.push({ key: file.node.id, kind: 'file', file, match: { score: pathMatch.score, indices: [] } })
    }
    return out.sort((a, b) => b.match.score - a.match.score).slice(0, MAX_ITEMS)
  }, [isCommand, query, files, commands, recentIds])

  function pick(item) {
    if (!item) return
    onClose()
    if (item.kind === 'command') item.command.run()
    else onOpenFile(item.file.node)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') setSelected((s) => Math.min(s + 1, items.length - 1))
    else if (e.key === 'ArrowUp') setSelected((s) => Math.max(s - 1, 0))
    else if (e.key === 'Enter') pick(items[selected])
    else if (e.key === 'Escape') onClose()
    else return
    e.preventDefault()
  }

  return (
    <>
      <div className="quick-backdrop" onMouseDown={onClose} />
      <div className="quick-input" role="dialog" aria-label={isCommand ? 'Command Palette' : 'Go to File'}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isCommand ? 'Type the name of a command to run.' : 'Search files by name (type > for commands)'}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="quick-list" ref={listRef} role="listbox">
          {items.length === 0 && (
            <div className="quick-empty">{isCommand ? 'No matching commands' : 'No matching files'}</div>
          )}
          {items.map((item, i) => (
            <div
              key={item.key}
              role="option"
              aria-selected={i === selected}
              className={`quick-item${i === selected ? ' selected' : ''}`}
              onMouseMove={() => i !== selected && setSelected(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
            >
              {item.kind === 'file' ? (
                <>
                  <FileIcon name={item.file.node.name} />
                  <span className="quick-label">
                    <Highlight text={item.file.node.name} indices={item.match.indices} />
                  </span>
                  <span className="quick-desc">{parentPath(item.file.path)}</span>
                </>
              ) : (
                <>
                  <span className="quick-label">
                    <Highlight text={item.command.title} indices={item.match.indices} />
                  </span>
                  {item.command.keys && (
                    <span className="quick-keys">
                      {item.command.keys.split('+').map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
