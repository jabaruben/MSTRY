import { useEffect, useState } from 'react'

import type { AppConfig, CodingToolInfo } from '../../../shared/contracts'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { getElectronBridge } from '../lib/electron-bridge'
import { cn } from '../lib/utils'

interface SettingsPanelProps {
  defaultTabCommand: string
  onConfigUpdated: (config: AppConfig) => void
  onClose: () => void
}

const CODING_TOOL_PLACEHOLDERS = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'OpenAI Codex' },
  { id: 'gemini', name: 'Gemini CLI' },
  { id: 'opencode', name: 'OpenCode' }
] as const

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not save settings.'

export function SettingsPanel({ defaultTabCommand: initialDefaultTabCommand, onConfigUpdated, onClose }: SettingsPanelProps) {
  const [hooksEnabled, setHooksEnabled] = useState<boolean | null>(null)
  const [codexHooksEnabled, setCodexHooksEnabled] = useState<boolean | null>(null)
  const [geminiHooksEnabled, setGeminiHooksEnabled] = useState<boolean | null>(null)
  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null)
  const [integrationBusy, setIntegrationBusy] = useState<string | null>(null)
  const [cliBusy, setCliBusy] = useState(false)
  const [defaultTabCommand, setDefaultTabCommand] = useState(initialDefaultTabCommand)
  const [commandBusy, setCommandBusy] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [commandSaved, setCommandSaved] = useState(false)
  const [codingTools, setCodingTools] = useState<CodingToolInfo[]>([])
  const [installingTool, setInstallingTool] = useState<string | null>(null)
  const [toolError, setToolError] = useState<string | null>(null)

  useEffect(() => {
    const bridge = getElectronBridge()
    void bridge.claude.isHooksEnabled().then(setHooksEnabled)
    void bridge.codex.isHooksEnabled().then(setCodexHooksEnabled)
    void bridge.gemini.isHooksEnabled().then(setGeminiHooksEnabled)
    void bridge.cli.isInstalled().then(setCliInstalled)
    void bridge.tools.checkAll().then(setCodingTools)
  }, [])

  useEffect(() => {
    setDefaultTabCommand(initialDefaultTabCommand)
    setCommandError(null)
  }, [initialDefaultTabCommand])

  const toggleClaudeIntegration = async () => {
    setIntegrationBusy('claude')
    const bridge = getElectronBridge()
    try {
      if (hooksEnabled) {
        await bridge.claude.disableHooks()
        setHooksEnabled(false)
      } else {
        await bridge.claude.enableHooks()
        setHooksEnabled(true)
      }
    } finally {
      setIntegrationBusy(null)
    }
  }

  const toggleGeminiIntegration = async () => {
    setIntegrationBusy('gemini')
    const bridge = getElectronBridge()
    try {
      if (geminiHooksEnabled) {
        await bridge.gemini.disableHooks()
        setGeminiHooksEnabled(false)
      } else {
        await bridge.gemini.enableHooks()
        setGeminiHooksEnabled(true)
      }
    } finally {
      setIntegrationBusy(null)
    }
  }

  const toggleCodexIntegration = async () => {
    setIntegrationBusy('codex')
    const bridge = getElectronBridge()
    try {
      if (codexHooksEnabled) {
        await bridge.codex.disableHooks()
        setCodexHooksEnabled(false)
      } else {
        await bridge.codex.enableHooks()
        setCodexHooksEnabled(true)
      }
    } finally {
      setIntegrationBusy(null)
    }
  }

  const supportsIntegration = (toolId: string) =>
    toolId === 'claude' || toolId === 'codex' || toolId === 'gemini'

  const isIntegrationEnabled = (toolId: string) => {
    if (toolId === 'claude') return hooksEnabled
    if (toolId === 'codex') return codexHooksEnabled
    if (toolId === 'gemini') return geminiHooksEnabled
    return null
  }

  const toggleIntegration = async (toolId: string) => {
    if (toolId === 'claude') {
      await toggleClaudeIntegration()
      return
    }

    if (toolId === 'codex') {
      await toggleCodexIntegration()
      return
    }

    if (toolId === 'gemini') {
      await toggleGeminiIntegration()
    }
  }

  const normalizedDefaultTabCommand = defaultTabCommand.trim()
  const isCommandDirty = normalizedDefaultTabCommand !== initialDefaultTabCommand
  const bridge = getElectronBridge()
  const canSaveDefaultTabCommand =
    typeof bridge.workspace.setDefaultTabCommand === 'function'
  const toolsLoaded = codingTools.length > 0
  const visibleTools = toolsLoaded
    ? codingTools
    : CODING_TOOL_PLACEHOLDERS.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: '',
        installed: false
      }))

  const handleSaveDefaultCommand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSaveDefaultTabCommand) {
      setCommandError('Restart MSTRY to load the new settings bridge and try again.')
      return
    }

    if (!isCommandDirty) {
      return
    }

    setCommandBusy(true)
    setCommandError(null)
    setCommandSaved(false)

    try {
      const updatedConfig = await bridge.workspace.setDefaultTabCommand(defaultTabCommand)
      onConfigUpdated(updatedConfig)
      setDefaultTabCommand(updatedConfig.defaultTabCommand)
      setCommandSaved(true)
    } catch (error) {
      setCommandError(getErrorMessage(error))
    } finally {
      setCommandBusy(false)
    }
  }

  return (
    <div className="no-drag fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="drawer-backdrop absolute inset-0 bg-black/40" />

      {/* Drawer */}
      <div
        className="drawer-panel relative ml-auto flex h-full w-[460px] max-w-[90vw] flex-col border-l bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <h2 className="text-sm font-medium">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="no-drag text-muted hover:text-foreground"
            aria-label="Close settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Default command for new tabs</p>
              <p className="mt-1 text-xs text-muted">
                Runs automatically when a new tab is opened. Leave empty to open just the shell.
                You can use something like <code className="font-mono text-secondary">claude</code> or{' '}
                <code className="font-mono text-secondary">claude --dangerously-skip-permissions</code>.
              </p>
            </div>

            <form className="mt-3 flex items-center gap-2" onSubmit={(event) => void handleSaveDefaultCommand(event)}>
              <Input
                value={defaultTabCommand}
                onChange={(event) => {
                  setDefaultTabCommand(event.target.value)
                  setCommandError(null)
                  setCommandSaved(false)
                }}
                placeholder="claude"
                className="h-9 rounded-lg font-mono text-sm"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={commandBusy || !canSaveDefaultTabCommand}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={commandBusy || !isCommandDirty || !canSaveDefaultTabCommand}
              >
                Save
              </Button>
            </form>

            {commandError ? (
              <div className="mt-3 rounded-lg bg-red-500/[0.06] px-3 py-2 text-xs text-error">
                {commandError}
              </div>
            ) : !canSaveDefaultTabCommand ? (
              <div className="mt-3 rounded-lg bg-red-500/[0.06] px-3 py-2 text-xs text-error">
                This window is still using an older version of the bridge. Restart MSTRY to enable this option.
              </div>
            ) : commandSaved ? (
              <div className="mt-3 rounded-lg bg-overlay px-3 py-2 text-xs text-secondary">
                Saved. New tabs will use this command.
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-overlay px-3 py-2 text-xs text-muted">
                Current value: {initialDefaultTabCommand ? <code className="font-mono text-secondary">{initialDefaultTabCommand}</code> : 'plain shell'}
              </div>
            )}
          </div>

          <div className="mt-5 border-t pt-5">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Command in PATH</p>
                <p className="mt-1 text-xs text-muted">
                  Install the <code className="font-mono text-secondary">mstry</code> command to open projects
                  from the terminal with <code className="font-mono text-secondary">mstry .</code>
                </p>
              </div>

              <button
                type="button"
                disabled={cliInstalled === null || cliBusy}
                onClick={async () => {
                  setCliBusy(true)
                  const bridge = getElectronBridge()
                  try {
                    if (cliInstalled) {
                      await bridge.cli.uninstall()
                      setCliInstalled(false)
                    } else {
                      await bridge.cli.install()
                      setCliInstalled(true)
                    }
                  } finally {
                    setCliBusy(false)
                  }
                }}
                className={cn(
                  'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50',
                  cliInstalled ? 'bg-purple-500' : 'bg-overlay-hover'
                )}
              >
                <span
                  className={cn(
                    'inline-block size-3.5 rounded-full bg-white shadow transition-transform',
                    cliInstalled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  )}
                />
              </button>
            </div>

          </div>

          <div className="mt-5 border-t pt-5">
            <p className="text-sm font-medium">Coding tools</p>
            <p className="mt-1 text-[10px] leading-none text-muted">
              Install CLIs and enable integration with Claude, Codex, and Gemini.
            </p>

            <div className="mt-2 space-y-1">
              {visibleTools.map((tool) => (
                <div
                  key={tool.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md bg-overlay px-2.5 py-1.5',
                    !toolsLoaded && 'opacity-60'
                  )}
                >
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      tool.installed ? 'bg-green-500' : 'bg-muted/40'
                    )}
                    aria-hidden="true"
                  />

                  <p className="min-w-0 flex-1 text-xs text-secondary">{tool.name}</p>

                  {tool.installed ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      disabled={!toolsLoaded || installingTool !== null}
                      onClick={async () => {
                        setInstallingTool(tool.id)
                        setToolError(null)
                        try {
                          const bridge = getElectronBridge()
                          await bridge.tools.install(tool.id)
                          const updated = await bridge.tools.checkAll()
                          setCodingTools(updated)
                        } catch (error) {
                          setToolError(
                            `${tool.name}: ${error instanceof Error ? error.message : 'Install error'}`
                          )
                        } finally {
                          setInstallingTool(null)
                        }
                      }}
                    >
                      {installingTool === tool.id ? '...' : 'Install'}
                    </Button>
                  )}

                  {supportsIntegration(tool.id) ? (
                    <label className="ml-1 flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                      <span>Integration</span>
                      <input
                        type="checkbox"
                        className="size-3.5 accent-purple-500"
                        checked={Boolean(isIntegrationEnabled(tool.id))}
                        disabled={
                          !toolsLoaded ||
                          isIntegrationEnabled(tool.id) === null ||
                          integrationBusy !== null
                        }
                        onChange={() => {
                          void toggleIntegration(tool.id)
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>

            {toolError && (
              <div className="mt-3 rounded-lg bg-red-500/[0.06] px-3 py-2 text-xs text-error">
                {toolError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
