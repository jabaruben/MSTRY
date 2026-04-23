import { useEffect, useMemo, useRef, useState } from 'react'
import { VscChevronDown, VscChevronRight, VscClose, VscRefresh, VscSearch } from 'react-icons/vsc'

import type { GitFileStatusEntry } from '../../../shared/contracts'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { GitDiffStats } from './file-explorer/git-diff-stats'
import { statusColorClass, statusLetter } from './file-explorer/git-status-utils'

interface Props {
  collapsed: boolean
  entries: GitFileStatusEntry[]
  selectedFilePath: string | null
  projectName: string | null
  workspaceLabel: string | null
  onToggleCollapsed: () => void
  onRefresh: () => void
  onSelectFile: (filePath: string) => void
}

export function GitPanel({
  collapsed,
  entries,
  selectedFilePath,
  projectName,
  workspaceLabel,
  onToggleCollapsed,
  onRefresh,
  onSelectFile
}: Props) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus()
    } else {
      setQuery('')
    }
  }, [searchOpen])

  const filteredEntries = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase()
    const source = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    if (!trimmedQuery) return source

    return source.filter((entry) => entry.relativePath.toLowerCase().includes(trimmedQuery))
  }, [entries, query])

  const contextLabel = [projectName, workspaceLabel].filter(Boolean).join(' · ')

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col border-t',
        collapsed ? 'shrink-0' : 'min-h-0 flex-1'
      )}
    >
      <div className="flex h-9 shrink-0 items-center border-b">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-4 text-sm uppercase tracking-[0.18em] text-muted hover:text-secondary"
        >
          {collapsed ? (
            <VscChevronRight className="size-3.5" />
          ) : (
            <VscChevronDown className="size-3.5" />
          )}
          Git
          {entries.length > 0 ? (
            <span className="ml-1 font-mono text-sm normal-case tracking-normal text-muted">
              {entries.length}
            </span>
          ) : null}
        </button>

        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-md"
          onClick={(event) => {
            event.stopPropagation()
            setSearchOpen((open) => !open)
          }}
          aria-label={searchOpen ? 'Close search' : 'Search changes'}
          title={searchOpen ? 'Close search' : 'Search changes'}
          disabled={collapsed}
        >
          {searchOpen ? <VscClose className="size-4" /> : <VscSearch className="size-4" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="mr-2 size-7 rounded-md"
          onClick={onRefresh}
          aria-label="Refresh git"
          title="Refresh git"
        >
          <VscRefresh className="size-4" />
        </Button>
      </div>

      {!collapsed ? (
        <>
          {contextLabel ? (
            <div
              className="shrink-0 truncate px-4 py-1 font-mono text-[11px] text-muted"
              title={contextLabel}
            >
              {contextLabel}
            </div>
          ) : null}

          {searchOpen ? (
            <div className="border-b px-2 py-1.5">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setSearchOpen(false)
                  }
                }}
                placeholder="Filter files..."
                className="h-7 w-full rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted"
              />
            </div>
          ) : null}

          <ScrollArea className="min-h-0 min-w-0 flex-1">
            {entries.length === 0 ? (
              <div className="px-4 py-2 text-xs text-muted">No Git changes</div>
            ) : filteredEntries.length === 0 ? (
              <div className="px-4 py-2 text-xs text-muted">No matches</div>
            ) : (
              <div>
                {filteredEntries.map((entry) => {
                  const fileName = entry.relativePath.split('/').pop() ?? entry.relativePath
                  const directory = entry.relativePath
                    .slice(0, Math.max(0, entry.relativePath.length - fileName.length))
                    .replace(/\/$/, '')
                  const isSelected = entry.relativePath === selectedFilePath

                  return (
                    <button
                      key={entry.relativePath}
                      type="button"
                      onClick={() => onSelectFile(entry.relativePath)}
                      title={entry.relativePath}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-1.5 px-2 py-0.5 pr-2 text-left text-sm hover:bg-item-hover',
                        isSelected
                          ? 'bg-item-active text-foreground'
                          : statusColorClass[entry.status],
                        entry.status === 'deleted' && 'line-through opacity-80',
                        entry.status === 'ignored' && 'opacity-60'
                      )}
                    >
                      <span
                        className={cn(
                          'w-3 shrink-0 text-center font-mono text-[10px] font-semibold',
                          statusColorClass[entry.status]
                        )}
                      >
                        {statusLetter[entry.status]}
                      </span>
                      <span className="min-w-0 truncate">{fileName}</span>
                      {directory ? (
                        <span className="min-w-0 truncate text-[11px] text-muted">
                          {directory}
                        </span>
                      ) : null}
                      <GitDiffStats added={entry.added} deleted={entry.deleted} />
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </>
      ) : null}
    </div>
  )
}
