import { useEffect, useMemo, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { VscClose, VscRefresh } from 'react-icons/vsc'

import type { GitFileStatus } from '../../../shared/contracts'
import { cn } from '../lib/utils'
import { statusColorClass, statusLetter } from './file-explorer/git-status-utils'
import { Button } from './ui/button'

interface Props {
  filePath: string
  status: GitFileStatus
  originalValue: string
  modifiedValue: string
  isLoading: boolean
  errorMessage: string | null
  onReload: () => void
  onClose: () => void
}

const languageByExtension: Record<string, string> = {
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  css: 'css',
  go: 'go',
  h: 'c',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  sql: 'sql',
  svg: 'xml',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml'
}

const detectLanguage = (filePath: string) => {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
  return languageByExtension[extension] ?? 'plaintext'
}

export function GitDiffEditor({
  filePath,
  status,
  originalValue,
  modifiedValue,
  isLoading,
  errorMessage,
  onReload,
  onClose
}: Props) {
  const [preferredTheme, setPreferredTheme] = useState<'vs' | 'vs-dark'>('vs-dark')
  const language = useMemo(() => detectLanguage(filePath), [filePath])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = () => setPreferredTheme(mediaQuery.matches ? 'vs-dark' : 'vs')

    syncTheme()
    mediaQuery.addEventListener('change', syncTheme)
    return () => mediaQuery.removeEventListener('change', syncTheme)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm text-foreground">{filePath}</div>
          <div className="text-xs text-muted">
            {errorMessage ? errorMessage : isLoading ? 'Loading diff…' : 'Diff against HEAD'}
          </div>
        </div>

        <span
          className={cn(
            'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
            statusColorClass[status]
          )}
        >
          {statusLetter[status]} {status}
        </span>

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-md"
          onClick={onReload}
          aria-label="Reload diff"
          title="Reload diff"
        >
          <VscRefresh className="size-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-md"
          onClick={onClose}
          aria-label="Close diff"
          title="Close diff"
        >
          <VscClose className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {errorMessage ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-error">
            {errorMessage}
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
            Loading diff…
          </div>
        ) : (
          <DiffEditor
            key={filePath}
            height="100%"
            language={language}
            theme={preferredTheme}
            original={originalValue}
            modified={modifiedValue}
            loading={<div className="px-4 py-3 text-sm text-muted">Loading diff…</div>}
            options={{
              automaticLayout: true,
              fontSize: 13,
              minimap: { enabled: false },
              padding: { top: 12, bottom: 12 },
              readOnly: true,
              renderSideBySide: true,
              scrollBeyondLastLine: false
            }}
          />
        )}
      </div>
    </div>
  )
}
