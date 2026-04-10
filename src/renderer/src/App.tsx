import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHotkeys } from '@tanstack/react-hotkeys'
import {
  VscAdd,
  VscCheck,
  VscChevronDown,
  VscChevronRight,
  VscClose,
  VscFolder,
  VscFolderOpened,
  VscRefresh,
  VscRepo,
  VscSettingsGear,
  VscSourceControl,
  VscTerminalBash,
  VscTrash
} from 'react-icons/vsc'

import type { ClaudeSessionInfo, PersistedTab, Project, WorkspaceItem } from '../../shared/contracts'
import { CommandPalette, type CommandItem } from './components/command-palette'
import { SettingsPanel } from './components/settings-panel'
import { WorktreeTerminal } from './components/worktree-terminal'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { ScrollArea } from './components/ui/scroll-area'
import { getElectronBridge } from './lib/electron-bridge'
import { cn } from './lib/utils'

interface TerminalTab {
  id: string
  workspacePath: string
  initialCommand?: string
  tmuxSessionName: string | null
  sessionId: string | null
  pid: number | null
  processName: string | null
}

const createTab = (workspacePath: string, initialCommand?: string): TerminalTab => ({
  id: crypto.randomUUID(),
  workspacePath,
  initialCommand,
  tmuxSessionName: null,
  sessionId: null,
  pid: null,
  processName: null
})

const createRestoredTab = (persisted: PersistedTab): TerminalTab => ({
  id: persisted.id,
  workspacePath: persisted.workspacePath,
  tmuxSessionName: persisted.tmuxSessionName,
  sessionId: null,
  pid: null,
  processName: null
})

const isClaudeProcess = (name: string | null) =>
  name != null && /\bclaude\b/i.test(name)

const selectedWorkspaceQueryKey = ['ui', 'selected-workspace'] as const

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Ha ocurrido un error inesperado.'
}

const useSelectedWorkspace = () => {
  const queryClient = useQueryClient()
  const selectedWorkspaceQuery = useQuery({
    queryKey: selectedWorkspaceQueryKey,
    queryFn: async () =>
      queryClient.getQueryData<string | null>(selectedWorkspaceQueryKey) ?? null,
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity
  })

  return {
    selectedWorkspacePath: selectedWorkspaceQuery.data,
    setSelectedWorkspacePath: (value: string | null) => {
      queryClient.setQueryData(selectedWorkspaceQueryKey, value)
    }
  }
}

const randomAdjectives = ['swift', 'bold', 'calm', 'dark', 'eager', 'fair', 'keen', 'neat', 'warm', 'wise']
const randomNouns = ['oak', 'fox', 'elm', 'ray', 'dew', 'ash', 'bay', 'ivy', 'owl', 'sky']

const generateRandomWorktreeName = () => {
  const adj = randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)]
  const noun = randomNouns[Math.floor(Math.random() * randomNouns.length)]
  return `${adj}-${noun}`
}

const getWorkspaceMeta = (item: WorkspaceItem) => {
  if (item.kind === 'directory') {
    return 'folder'
  }

  if (item.isMain) {
    return 'main'
  }

  return item.branch ?? 'worktree'
}

export function App() {
  const queryClient = useQueryClient()
  const { selectedWorkspacePath, setSelectedWorkspacePath } = useSelectedWorkspace()
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<Record<string, string>>({})
  const [projectsCollapsed, setProjectsCollapsed] = useState(false)
  const [worktreesCollapsed, setWorktreesCollapsed] = useState(false)
  const [draftWorktreeName, setDraftWorktreeName] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const isResizing = useRef(false)

  const appConfigQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: () => getElectronBridge().workspace.getConfig()
  })

  const activeProject = useMemo(
    () =>
      appConfigQuery.data?.projects.find(
        (project) => project.rootPath === appConfigQuery.data?.activeProjectPath
      ) ?? null,
    [appConfigQuery.data]
  )

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', activeProject?.rootPath],
    queryFn: () => getElectronBridge().worktrees.list(),
    enabled: Boolean(activeProject?.rootPath)
  })

  const pickProjectMutation = useMutation({
    mutationFn: () => getElectronBridge().workspace.pickPath(),
    onSuccess: (config) => {
      if (!config) {
        return
      }

      queryClient.setQueryData(['app-config'], config)
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const selectProjectMutation = useMutation({
    mutationFn: (projectPath: string) => getElectronBridge().workspace.selectProject(projectPath),
    onSuccess: (config) => {
      queryClient.setQueryData(['app-config'], config)
      setDraftWorktreeName(null)
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const removeProjectMutation = useMutation({
    mutationFn: (project: Project) => getElectronBridge().workspace.removeProject(project.rootPath),
    onSuccess: (config, removedProject) => {
      queryClient.setQueryData(['app-config'], config)
      const electree = getElectronBridge()
      setTabs((current) => {
        const removed = current.filter((tab) => {
          if (tab.workspacePath === removedProject.rootPath) return true
          if (removedProject.worktreeRoot && tab.workspacePath.startsWith(removedProject.worktreeRoot)) return true
          return false
        })
        for (const tab of removed) {
          if (tab.tmuxSessionName) void electree.terminal.destroySession(tab.tmuxSessionName)
        }
        return current.filter((tab) => !removed.includes(tab))
      })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const createWorktreeMutation = useMutation({
    mutationFn: (name: string) => getElectronBridge().worktrees.create({ name }),
    onSuccess: (workspace) => {
      setDraftWorktreeName(null)
      setSelectedWorkspacePath(workspace.path)
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const removeWorktreeMutation = useMutation({
    mutationFn: (workspacePath: string) => getElectronBridge().worktrees.remove({ path: workspacePath }),
    onSuccess: (_value, workspacePath) => {
      if (selectedWorkspacePath === workspacePath) {
        setSelectedWorkspacePath(null)
      }

      const electree = getElectronBridge()
      setTabs((current) => {
        for (const tab of current) {
          if (tab.workspacePath === workspacePath && tab.tmuxSessionName) {
            void electree.terminal.destroySession(tab.tmuxSessionName)
          }
        }
        return current.filter((tab) => tab.workspacePath !== workspacePath)
      })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  useEffect(() => {
    const availableItems = workspacesQuery.data ?? []

    if (availableItems.length === 0) {
      setSelectedWorkspacePath(null)
      return
    }

    const stillExists = availableItems.some((item) => item.path === selectedWorkspacePath)
    if (!stillExists) {
      setSelectedWorkspacePath(availableItems[0].path)
    }
  }, [selectedWorkspacePath, setSelectedWorkspacePath, workspacesQuery.data])

  useEffect(() => {
    if (!selectedWorkspacePath) {
      return
    }

    const hasTabsForWorkspace = tabs.some((tab) => tab.workspacePath === selectedWorkspacePath)
    if (!hasTabsForWorkspace) {
      const tab = createTab(selectedWorkspacePath)
      setTabs((current) => [...current, tab])
      setActiveTabId((current) => ({ ...current, [selectedWorkspacePath]: tab.id }))
    }
  }, [selectedWorkspacePath, tabs])

  useEffect(() => {
    const electree = getElectronBridge()
    const off = electree.terminal.onProcessChange((event) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.sessionId === event.sessionId ? { ...tab, processName: event.processName } : tab
        )
      )
    })
    return off
  }, [])

  const [claudeSessions, setClaudeSessions] = useState<ClaudeSessionInfo[]>([])
  const tabsRestoredRef = useRef(false)

  useEffect(() => {
    const electree = getElectronBridge()
    const off = electree.claude.onSessionChange(setClaudeSessions)
    return off
  }, [])

  // Restore persisted tabs on startup.
  useEffect(() => {
    if (tabsRestoredRef.current) return
    tabsRestoredRef.current = true

    const electree = getElectronBridge()
    void (async () => {
      const [persisted, aliveSessions] = await Promise.all([
        electree.terminal.getPersistedTabs(),
        electree.terminal.listTmuxSessions()
      ])

      const aliveSet = new Set(aliveSessions)
      const validTabs = persisted.tabs.filter((t) => aliveSet.has(t.tmuxSessionName))

      if (validTabs.length > 0) {
        setTabs(validTabs.map(createRestoredTab))
        setActiveTabId(persisted.activeTabId)
      }
    })()
  }, [])

  // Persist tabs whenever they change.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!tabsRestoredRef.current) return
    const persistable = tabs.filter((t) => t.tmuxSessionName)
    if (persistable.length === 0 && tabs.length > 0) return

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      void getElectronBridge().terminal.persistTabs({
        tabs: persistable.map((t) => ({
          id: t.id,
          workspacePath: t.workspacePath,
          tmuxSessionName: t.tmuxSessionName!
        })),
        activeTabId
      })
    }, 500)
  }, [tabs, activeTabId])

  const handleSessionCreated = useCallback(
    (tabId: string, sessionId: string, pid: number, tmuxSessionName: string) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId ? { ...tab, sessionId, pid, tmuxSessionName } : tab
        )
      )
    },
    []
  )

  const currentTabs = useMemo(
    () => (selectedWorkspacePath ? tabs.filter((tab) => tab.workspacePath === selectedWorkspacePath) : []),
    [tabs, selectedWorkspacePath]
  )

  const currentActiveTabId = selectedWorkspacePath ? activeTabId[selectedWorkspacePath] ?? null : null

  const handleNewTab = useCallback(() => {
    if (!selectedWorkspacePath) return
    const tab = createTab(selectedWorkspacePath)
    setTabs((current) => [...current, tab])
    setActiveTabId((current) => ({ ...current, [selectedWorkspacePath]: tab.id }))
  }, [selectedWorkspacePath])

  const handleNewClaudeTab = useCallback(() => {
    if (!selectedWorkspacePath) return
    const tab = createTab(selectedWorkspacePath, 'claude --dangerously-skip-permissions')
    setTabs((current) => [...current, tab])
    setActiveTabId((current) => ({ ...current, [selectedWorkspacePath]: tab.id }))
  }, [selectedWorkspacePath])

  const handleSwitchTab = useCallback(
    (index: number) => {
      if (!selectedWorkspacePath) return
      const workspaceTabs = tabs.filter((tab) => tab.workspacePath === selectedWorkspacePath)
      const tab = workspaceTabs[index]
      if (tab) {
        setActiveTabId((current) => ({ ...current, [selectedWorkspacePath]: tab.id }))
      }
    },
    [selectedWorkspacePath, tabs]
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (!selectedWorkspacePath) return

      const workspaceTabs = tabs.filter((tab) => tab.workspacePath === selectedWorkspacePath)
      if (workspaceTabs.length <= 1) return

      const closingTab = workspaceTabs.find((tab) => tab.id === tabId)
      const closingIndex = workspaceTabs.findIndex((tab) => tab.id === tabId)

      // Kill the tmux session — the user intentionally closed the tab.
      if (closingTab?.tmuxSessionName) {
        void getElectronBridge().terminal.destroySession(closingTab.tmuxSessionName)
      }

      setTabs((current) => current.filter((tab) => tab.id !== tabId))

      if (currentActiveTabId === tabId) {
        const nextTab = workspaceTabs[closingIndex + 1] ?? workspaceTabs[closingIndex - 1]
        if (nextTab) {
          setActiveTabId((current) => ({ ...current, [selectedWorkspacePath]: nextTab.id }))
        }
      }
    },
    [selectedWorkspacePath, tabs, currentActiveTabId]
  )

  const selectedWorkspace = useMemo(
    () => workspacesQuery.data?.find((item) => item.path === selectedWorkspacePath) ?? null,
    [selectedWorkspacePath, workspacesQuery.data]
  )

  const isGitProject = activeProject?.mode === 'git'
  const configErrorMessage = appConfigQuery.isError
    ? getErrorMessage(appConfigQuery.error)
    : pickProjectMutation.isError
      ? getErrorMessage(pickProjectMutation.error)
      : selectProjectMutation.isError
        ? getErrorMessage(selectProjectMutation.error)
        : removeProjectMutation.isError
          ? getErrorMessage(removeProjectMutation.error)
          : null

  const worktreeErrorMessage = workspacesQuery.isError
    ? getErrorMessage(workspacesQuery.error)
    : createWorktreeMutation.isError
      ? getErrorMessage(createWorktreeMutation.error)
      : removeWorktreeMutation.isError
        ? getErrorMessage(removeWorktreeMutation.error)
        : null

  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.min(Math.max(ev.clientX, 200), 600)
      setSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['app-config'] })
    queryClient.invalidateQueries({ queryKey: ['workspaces'] })
  }

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'new-tab',
        label: 'New Terminal',
        shortcut: '⌘T',
        icon: <VscAdd className="size-4" />,
        onSelect: () => handleNewTab()
      },
      {
        id: 'new-claude-tab',
        label: 'New Claude (skip permissions)',
        shortcut: '⌘⇧C',
        icon: <span className="text-[10px] font-bold">C</span>,
        onSelect: () => handleNewClaudeTab()
      },
      {
        id: 'close-tab',
        label: 'Close Terminal',
        shortcut: '⌘W',
        icon: <VscClose className="size-4" />,
        onSelect: () => {
          if (currentActiveTabId) handleCloseTab(currentActiveTabId)
        }
      },
      {
        id: 'settings',
        label: 'Settings',
        shortcut: '⌘,',
        icon: <VscSettingsGear className="size-4" />,
        onSelect: () => setSettingsOpen(true)
      },
      {
        id: 'refresh',
        label: 'Refresh',
        shortcut: '⌘R',
        icon: <VscRefresh className="size-4" />,
        onSelect: handleRefresh
      },
      {
        id: 'new-worktree',
        label: 'New Worktree',
        icon: <VscSourceControl className="size-4" />,
        onSelect: () => setDraftWorktreeName((c) => (c !== null ? null : generateRandomWorktreeName()))
      },
      {
        id: 'open-folder',
        label: 'Open Folder',
        icon: <VscFolderOpened className="size-4" />,
        onSelect: () => void pickProjectMutation.mutateAsync()
      }
    ],
    [handleNewTab, handleNewClaudeTab, handleCloseTab, currentActiveTabId, handleRefresh, pickProjectMutation]
  )

  useHotkeys(
    [
      {
        hotkey: 'Mod+T',
        callback: () => handleNewTab()
      },
      {
        hotkey: 'Mod+W',
        callback: () => {
          if (currentActiveTabId) handleCloseTab(currentActiveTabId)
        }
      },
      {
        hotkey: 'Mod+K',
        callback: () => setCommandPaletteOpen((open) => !open)
      },
      {
        hotkey: 'Mod+Shift+C',
        callback: () => handleNewClaudeTab()
      },
      { hotkey: 'Mod+1', callback: () => handleSwitchTab(0) },
      { hotkey: 'Mod+2', callback: () => handleSwitchTab(1) },
      { hotkey: 'Mod+3', callback: () => handleSwitchTab(2) },
      { hotkey: 'Mod+4', callback: () => handleSwitchTab(3) },
      { hotkey: 'Mod+5', callback: () => handleSwitchTab(4) },
      { hotkey: 'Mod+6', callback: () => handleSwitchTab(5) },
      { hotkey: 'Mod+7', callback: () => handleSwitchTab(6) },
      { hotkey: 'Mod+8', callback: () => handleSwitchTab(7) },
      { hotkey: 'Mod+9', callback: () => handleSwitchTab(8) }
    ],
    { preventDefault: true }
  )

  const handleCreateWorktree = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draftWorktreeName) return
    await createWorktreeMutation.mutateAsync(draftWorktreeName)
  }

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(`Quitar ${project.name} de la lista de proyectos.`)) {
      return
    }

    await removeProjectMutation.mutateAsync(project)
  }

  const handleDeleteWorktree = async (workspace: WorkspaceItem) => {
    if (
      !window.confirm(
        `Borrar ${workspace.branch ?? workspace.name}.\n\nGit bloqueara la operacion si hay cambios sin guardar en ese worktree.`
      )
    ) {
      return
    }

    await removeWorktreeMutation.mutateAsync(workspace.path)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen overflow-hidden">
        <aside className="flex shrink-0 flex-col border-r bg-sidebar" style={{ width: sidebarWidth }}>
          {/* Drag region for macOS traffic lights */}
          <div className="drag-region h-11 shrink-0 border-b pl-[78px]">
            <div className="no-drag flex h-full items-center gap-1 px-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void pickProjectMutation.mutateAsync()}
                aria-label="Open folder"
                title="Open folder"
              >
                <VscFolderOpened className="size-4" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={handleRefresh}
                aria-label="Refresh"
                title="Refresh"
              >
                <VscRefresh className="size-4" />
              </Button>

              <div className="flex-1" />

              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                title="Settings"
              >
                <VscSettingsGear className="size-4" />
              </Button>
            </div>
          </div>

          {configErrorMessage ? (
            <div className="border-b border-red-500/10 bg-red-500/[0.06] px-4 py-2.5 text-xs text-error">
              {configErrorMessage}
            </div>
          ) : null}

          <div className="border-b">
            <button
              type="button"
              onClick={() => setProjectsCollapsed((c) => !c)}
              className="flex h-9 w-full items-center gap-2 px-4 text-[11px] uppercase tracking-[0.18em] text-muted hover:text-secondary"
            >
              {projectsCollapsed ? (
                <VscChevronRight className="size-3.5" />
              ) : (
                <VscChevronDown className="size-3.5" />
              )}
              Projects
            </button>

            {!projectsCollapsed ? (
              <ScrollArea className="max-h-[220px]">
                <div className="px-2 pb-2">
                  {appConfigQuery.data?.projects.map((project) => {
                    const isActive = project.rootPath === activeProject?.rootPath

                    return (
                      <div
                        key={project.rootPath}
                        className={cn(
                          'group flex items-center gap-2 rounded-md px-2 py-1.5',
                          isActive ? 'bg-item-active text-foreground' : 'text-secondary hover:bg-item-hover'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => void selectProjectMutation.mutateAsync(project.rootPath)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-overlay text-icon">
                            {project.mode === 'git' ? (
                              <VscRepo className="size-4" />
                            ) : (
                              <VscFolder className="size-4" />
                            )}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{project.name}</span>
                            <span className="block truncate text-[11px] uppercase tracking-[0.16em] text-muted">
                              {project.mode === 'git' ? 'repo' : 'folder'}
                            </span>
                          </span>
                        </button>

                        {isActive && isGitProject ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-md opacity-0 group-hover:opacity-100"
                            onClick={() => setDraftWorktreeName((current) => current !== null ? null : generateRandomWorktreeName())}
                            aria-label="Create worktree"
                            title="Create worktree"
                          >
                            <VscAdd className="size-4" />
                          </Button>
                        ) : null}

                        {appConfigQuery.data.projects.length > 1 ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-md opacity-0 group-hover:opacity-100"
                            onClick={() => void handleDeleteProject(project)}
                            aria-label={`Quitar ${project.name}`}
                            title="Quitar proyecto"
                          >
                            <VscTrash className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : null}
          </div>

          {draftWorktreeName !== null && isGitProject ? (
            <div className="border-b px-3 py-3">
              <form className="flex items-center gap-2" onSubmit={handleCreateWorktree}>
                <Input
                  value={draftWorktreeName}
                  onChange={(event) => setDraftWorktreeName(event.target.value)}
                  placeholder="feature/nuevo-worktree"
                  className="h-9 rounded-lg text-sm"
                  disabled={createWorktreeMutation.isPending}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={createWorktreeMutation.isPending || !draftWorktreeName.trim()}
                >
                  <VscCheck className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setDraftWorktreeName(null)}
                >
                  <VscClose className="size-3.5" />
                </Button>
              </form>
            </div>
          ) : null}

          {worktreeErrorMessage ? (
            <div className="border-b border-red-500/10 bg-red-500/[0.06] px-4 py-2.5 text-xs text-error">
              {worktreeErrorMessage}
            </div>
          ) : null}

          <div className="flex h-9 shrink-0 items-center border-b">
            <button
              type="button"
              onClick={() => setWorktreesCollapsed((c) => !c)}
              className="flex min-w-0 flex-1 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.18em] text-muted hover:text-secondary"
            >
              {worktreesCollapsed ? (
                <VscChevronRight className="size-3.5" />
              ) : (
                <VscChevronDown className="size-3.5" />
              )}
              {isGitProject ? 'Worktrees' : 'Workspace'}
            </button>

            {isGitProject ? (
              <Button
                size="icon"
                variant="ghost"
                className="mr-2 size-7 rounded-md"
                onClick={() => setDraftWorktreeName((current) => current !== null ? null : generateRandomWorktreeName())}
                aria-label="Create worktree"
                title="Create worktree"
              >
                <VscAdd className="size-4" />
              </Button>
            ) : null}
          </div>

          {!worktreesCollapsed ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-2 py-2">
                {workspacesQuery.isPending ? (
                  <div className="px-2 py-2 text-sm text-muted">Loading...</div>
                ) : null}

                {!workspacesQuery.isPending && (workspacesQuery.data?.length ?? 0) === 0 ? (
                  <div className="px-2 py-2 text-sm text-muted">No items</div>
                ) : null}

                {workspacesQuery.data?.map((item) => {
                  const isSelected = selectedWorkspacePath === item.path
                  const canDelete = item.kind === 'worktree' && !item.isMain

                  return (
                    <div
                      key={item.path}
                      className={cn(
                        'group flex items-center gap-2 rounded-md px-2 py-1.5',
                        isSelected ? 'bg-item-active text-foreground' : 'text-secondary hover:bg-item-hover'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedWorkspacePath(item.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-overlay text-icon">
                          {item.kind === 'directory' ? (
                            <VscFolder className="size-4" />
                          ) : (
                            <VscSourceControl className="size-4" />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{item.name}</span>
                          <span className="block truncate text-[11px] uppercase tracking-[0.16em] text-muted">
                            {getWorkspaceMeta(item)}
                          </span>
                        </span>
                      </button>

                      {canDelete ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 rounded-md opacity-0 group-hover:opacity-100"
                          onClick={() => void handleDeleteWorktree(item)}
                          aria-label={`Borrar ${item.name}`}
                          title="Borrar worktree"
                        >
                          <VscTrash className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          ) : null}
        </aside>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleSidebarResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-focus-ring active:bg-focus-ring transition-colors"
        />

        <main className="flex min-w-0 flex-1 flex-col bg-surface">
          <div className="drag-region flex h-11 shrink-0 items-center border-b">
            <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
              {currentTabs.map((tab, index) => {
                const isActive = tab.id === currentActiveTabId
                const claudeInfo = tab.pid
                  ? claudeSessions.find((s) => s.shellPid === tab.pid) ?? null
                  : null
                const isClaude = claudeInfo !== null || isClaudeProcess(tab.processName)

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      selectedWorkspacePath &&
                      setActiveTabId((current) => ({ ...current, [selectedWorkspacePath]: tab.id }))
                    }
                    className={cn(
                      'no-drag group relative flex h-8 max-w-[200px] items-center gap-1.5 rounded-md px-3 text-xs',
                      isActive
                        ? 'bg-item-active text-foreground'
                        : 'text-muted hover:bg-item-hover hover:text-secondary'
                    )}
                  >
                    {currentTabs.length > 1 && index < 9 ? (
                      <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded bg-overlay font-mono text-[9px] text-muted">
                        {index + 1}
                      </span>
                    ) : null}
                    {isClaude ? (
                      <span
                        className={cn(
                          'relative flex size-3.5 shrink-0 items-center justify-center text-[10px] font-bold',
                          claudeInfo?.status === 'working' ? 'text-green-400' : 'text-red-400'
                        )}
                        title={claudeInfo?.status === 'working' ? 'Claude is working' : 'Waiting for input'}
                      >
                        C
                      </span>
                    ) : (
                      <VscTerminalBash className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {isClaude
                        ? (claudeInfo?.name ?? claudeInfo?.prompt ?? 'Claude')
                        : (selectedWorkspace?.branch ?? selectedWorkspace?.name ?? 'Terminal')}
                    </span>
                    {isClaude && claudeInfo ? (
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          claudeInfo.status === 'working' ? 'bg-green-400' : 'bg-red-400 animate-pulse'
                        )}
                        title={claudeInfo.status === 'working' ? 'Working...' : 'Needs input'}
                      />
                    ) : null}
                    {currentTabs.length > 1 ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCloseTab(tab.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation()
                            handleCloseTab(tab.id)
                          }
                        }}
                        className="ml-0.5 flex size-4 items-center justify-center rounded opacity-0 hover:bg-overlay group-hover:opacity-100"
                      >
                        <VscClose className="size-3" />
                      </span>
                    ) : null}
                  </button>
                )
              })}

              {selectedWorkspacePath ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="no-drag size-7 shrink-0 rounded-md"
                  onClick={handleNewTab}
                  aria-label="New terminal tab"
                  title="New terminal tab"
                >
                  <VscAdd className="size-3.5" />
                </Button>
              ) : null}
            </div>

            <div className="no-drag flex shrink-0 items-center gap-2 px-4">
              <kbd className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[10px] text-muted" title="Command palette">
                ⌘K
              </kbd>
              <kbd className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[10px] text-muted" title="New terminal">
                ⌘T
              </kbd>
              <kbd className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[10px] text-muted" title="Close terminal">
                ⌘W
              </kbd>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-2">
            {currentTabs.length > 0 ? (
              <div className="relative h-full overflow-hidden rounded-md border bg-terminal">
                {currentTabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={cn(
                      'absolute inset-0',
                      tab.id === currentActiveTabId ? 'visible' : 'invisible'
                    )}
                  >
                    <WorktreeTerminal
                      active={tab.id === currentActiveTabId}
                      cwd={tab.workspacePath}
                      initialCommand={tab.initialCommand}
                      tmuxSessionName={tab.tmuxSessionName}
                      onNewTab={handleNewTab}
                      onCloseTab={() => handleCloseTab(tab.id)}
                      onSessionCreated={(sessionId, pid, tmux) =>
                        handleSessionCreated(tab.id, sessionId, pid, tmux)
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted">
                Open folder para empezar.
              </div>
            )}
          </div>
        </main>
      </div>

      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
      {commandPaletteOpen ? (
        <CommandPalette commands={commands} onClose={() => setCommandPaletteOpen(false)} />
      ) : null}
    </div>
  )
}
