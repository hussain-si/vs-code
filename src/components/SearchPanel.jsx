import { useEffect, useMemo, useRef, useState } from 'react'
import FileIcon from './FileIcon'
import Highlight from './Highlight'
import { substringIndices } from '../lib/fuzzy'
import { parentPath } from '../lib/tree'

const LIMIT = 500

export default function SearchPanel({ files, activeId, onOpen }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => inputRef.current?.focus(), [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const byName = []
    const byPath = []
    for (const f of files) {
      if (f.node.name.toLowerCase().includes(q)) byName.push(f)
      else if (f.path.toLowerCase().includes(q)) byPath.push(f)
      if (byName.length >= LIMIT) break
    }
    return [...byName, ...byPath].slice(0, LIMIT)
  }, [query, files])

  return (
    <div className="search-panel">
      <div className="sidebar-title">
        <span>Search</span>
      </div>
      <div className="search-box">
        <input
          ref={inputRef}
          value={query}
          placeholder="Search file and folder names"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) onOpen(results[0].node)
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {query && (
          <button className="icon-btn" title="Clear" onClick={() => setQuery('')}>
            <i className="codicon codicon-close" />
          </button>
        )}
      </div>
      <div className="search-summary">
        {query.trim()
          ? `${results.length}${results.length === LIMIT ? '+' : ''} result${results.length === 1 ? '' : 's'}`
          : 'Type to search your stored files by name or path.'}
      </div>
      <div className="search-results">
        {results.map(({ node, path }) => (
          <div
            key={node.id}
            className={`search-result${activeId === node.id ? ' selected' : ''}`}
            title={path}
            onClick={() => onOpen(node)}
          >
            <FileIcon name={node.name} />
            <span className="search-name">
              <Highlight text={node.name} indices={substringIndices(query, node.name)} />
            </span>
            <span className="search-dir">{parentPath(path)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
