import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { VscCheck, VscClose, VscRefresh, VscSave } from 'react-icons/vsc'

import { Button } from './ui/button'
import { cn } from '../lib/utils'

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

interface Props {
  filePath: string
  value: string
  savedValue: string
  isLoading: boolean
  isSaving: boolean
  errorMessage: string | null
  onChange: (value: string) => void
  onSave: () => void
  onReload: () => void
  onClose: () => void
}

export function FileEditor({
  filePath,
  value,
  savedValue,
  isLoading,
  isSaving,
  errorMessage,
  onChange,
  onSave,
  onReload,
  onClose
}: Props) {
  const [preferredTheme, setPreferredTheme] = useState<'vs' | 'vs-dark'>('vs-dark')
  const language = useMemo(() => detectLanguage(filePath), [filePath])
  const isDirty = value !== savedValue

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
            {errorMessage
              ? errorMessage
              : isLoading
                ? 'Cargando archivo…'
                : isSaving
                  ? 'Guardando…'
                  : isDirty
                    ? 'Cambios sin guardar'
                    : 'Guardado'}
          </div>
        </div>

        {!errorMessage && !isLoading ? (
          <span
            className={cn(
              'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
              isDirty ? 'border-amber-500/30 text-amber-500' : 'border-emerald-500/30 text-emerald-500'
            )}
          >
            {isDirty ? 'Dirty' : 'Saved'}
          </span>
        ) : null}

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-md"
          onClick={onReload}
          aria-label="Reload file"
          title="Reload file"
        >
          <VscRefresh className="size-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-md"
          onClick={onSave}
          disabled={isLoading || isSaving || !!errorMessage || !isDirty}
          aria-label="Save file"
          title="Save file"
        >
          {isSaving ? <VscCheck className="size-4" /> : <VscSave className="size-4" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-md"
          onClick={onClose}
          aria-label="Close editor"
          title="Close editor"
        >
          <VscClose className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {errorMessage ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-error">
            {errorMessage}
          </div>
        ) : (
          <Editor
            key={filePath}
            height="100%"
            language={language}
            theme={preferredTheme}
            value={value}
            loading={<div className="px-4 py-3 text-sm text-muted">Cargando editor…</div>}
            onChange={(nextValue) => onChange(nextValue ?? '')}
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                onSave()
              })
            }}
            options={{
              automaticLayout: true,
              fontSize: 13,
              minimap: { enabled: false },
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              wordWrap: 'on'
            }}
          />
        )}
      </div>
    </div>
  )
}
