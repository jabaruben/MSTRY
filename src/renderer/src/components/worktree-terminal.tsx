import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'

import { getElectronBridge } from '../lib/electron-bridge'

const darkTheme: ITheme = {
  background: '#181818',
  foreground: '#d4d4d4',
  cursor: '#f3f4f6',
  cursorAccent: '#181818',
  selectionBackground: '#264f7840',
  black: '#181818',
  red: '#f28b82',
  green: '#b5cea8',
  yellow: '#dcdcaa',
  blue: '#9cdcfe',
  magenta: '#c586c0',
  cyan: '#4ec9b0',
  white: '#d4d4d4',
  brightBlack: '#6a6a6a',
  brightRed: '#ff9da4',
  brightGreen: '#ce9178',
  brightYellow: '#f9f1a5',
  brightBlue: '#9cdcfe',
  brightMagenta: '#d7bae0',
  brightCyan: '#4ec9b0',
  brightWhite: '#ffffff'
}

const lightTheme: ITheme = {
  background: '#f5f5f6',
  foreground: '#1c1c1c',
  cursor: '#1c1c1c',
  cursorAccent: '#f5f5f6',
  selectionBackground: '#add6ff80',
  black: '#1c1c1c',
  red: '#cd3131',
  green: '#008000',
  yellow: '#795e26',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#1c1c1c'
}

const getTerminalTheme = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? darkTheme : lightTheme

const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 6
const MAX_FONT_SIZE = 48
const FONT_SIZE_STORAGE_KEY = 'electree:terminalFontSize'
const FONT_SIZE_EVENT = 'electree:terminalFontSizeChange'

const getStoredFontSize = (): number => {
  try {
    const raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE) return n
  } catch {
    // ignore
  }
  return DEFAULT_FONT_SIZE
}

const setStoredFontSize = (size: number) => {
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(size))
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent<number>(FONT_SIZE_EVENT, { detail: size }))
}

const clampFontSize = (n: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, n))

interface WorktreeTerminalProps {
  active: boolean
  cwd: string
  initialCommand?: string
  /** When set, reattach to this existing tmux session instead of creating a new one. */
  tmuxSessionName?: string | null
  /** Whether tmux mouse mode is enabled (for forceSelection handling). */
  mouseMode?: boolean
  onNewTab?: () => void
  onCloseTab?: () => void
  onSessionCreated?: (sessionId: string, pid: number, tmuxSessionName: string) => void
}

export function WorktreeTerminal({ active, cwd, initialCommand, tmuxSessionName, mouseMode, onNewTab, onCloseTab, onSessionCreated }: WorktreeTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const activeRef = useRef(active)
  const mouseModeRef = useRef(mouseMode ?? false)
  const onNewTabRef = useRef(onNewTab)
  const onCloseTabRef = useRef(onCloseTab)
  const onSessionCreatedRef = useRef(onSessionCreated)
  activeRef.current = active
  mouseModeRef.current = mouseMode ?? false
  onNewTabRef.current = onNewTab
  onCloseTabRef.current = onCloseTab
  onSessionCreatedRef.current = onSessionCreated

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let sessionId: string | null = null
    let disposed = false
    const bridge = getElectronBridge()

    const terminal = new Terminal({
      altClickMovesCursor: false,
      convertEol: true,
      cursorBlink: true,
      macOptionClickForcesSelection: true,
      macOptionIsMeta: true,
      fontFamily:
        '"SF Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: getStoredFontSize(),
      fontWeight: '400',
      lineHeight: 1.35,
      letterSpacing: 0.1,
      scrollback: 10_000,
      theme: getTerminalTheme()
    })

    const fitAddon = new FitAddon()
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const copySelectionToClipboard = (event?: ClipboardEvent) => {
      const selection = terminal.getSelection()
      if (!selection) {
        return false
      }

      event?.preventDefault()
      event?.clipboardData?.setData('text/plain', selection)
      void bridge.clipboard.writeText(selection)
      return true
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true
      }

      const key = event.key.toLowerCase()
      const isMacCopyShortcut =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && key === 'c'
      const isShiftCopyShortcut =
        event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && key === 'c'

      if (isMacCopyShortcut || isShiftCopyShortcut) {
        if (copySelectionToClipboard()) {
          event.preventDefault()
          event.stopPropagation()
        }
        return false
      }

      // Zoom shortcuts: Cmd/Ctrl +  /  -  /  0. Accept both '=' and '+' (and numpad variants).
      const isZoomModifier =
        (event.metaKey && !event.ctrlKey && !event.altKey) ||
        (event.ctrlKey && !event.metaKey && !event.altKey)
      if (isZoomModifier) {
        const isZoomIn =
          event.key === '+' ||
          event.key === '=' ||
          event.code === 'Equal' ||
          event.code === 'NumpadAdd'
        const isZoomOut =
          event.key === '-' ||
          event.key === '_' ||
          event.code === 'Minus' ||
          event.code === 'NumpadSubtract'
        const isZoomReset = event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0'

        if (isZoomIn || isZoomOut || isZoomReset) {
          event.preventDefault()
          event.stopPropagation()
          const current =
            typeof terminal.options.fontSize === 'number'
              ? terminal.options.fontSize
              : DEFAULT_FONT_SIZE
          const next = isZoomReset
            ? DEFAULT_FONT_SIZE
            : clampFontSize(current + (isZoomIn ? 1 : -1))
          if (next !== current) {
            setStoredFontSize(next)
          }
          return false
        }
      }

      // Only intercept Cmd (metaKey) shortcuts for tab management.
      // Ctrl key combos (Ctrl+R, Ctrl+W, etc.) must pass through to the terminal.
      if (!event.metaKey) {
        return true
      }

      // Let these Cmd shortcuts bubble up to the app-level hotkey handler
      if (
        key === 't' ||
        key === 'w' ||
        key === 'k' ||
        key === 'b' ||
        key === 'm' ||
        (event.shiftKey && key === 'c') ||
        (key >= '1' && key <= '9')
      ) {
        return false
      }

      return true
    })

    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    // Force selection mode for left-click even when mouse tracking is active.
    // tmux `mouse on` enables mouse tracking (needed for scroll support), but
    // this prevents normal text selection in xterm.js and causes garbled input
    // when mouse escape sequences reach the shell. We intercept left-click
    // mousedown events and re-dispatch them with shiftKey=true so xterm.js
    // enters selection mode instead of forwarding mouse events to the app.
    // Wheel events are unaffected, so tmux scroll still works.
    const screen = terminal.element?.querySelector('.xterm-screen')
    let forcingSelection = false
    const forceSelectionOnMouseDown = (e: Event) => {
      // Only intercept when tmux mouse is ON — otherwise xterm.js handles selection natively.
      if (!mouseModeRef.current) return
      const me = e as MouseEvent
      if (forcingSelection || me.button !== 0 || me.shiftKey) return

      me.stopImmediatePropagation()
      forcingSelection = true
      const selectionEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: me.clientX,
        clientY: me.clientY,
        button: me.button,
        buttons: me.buttons,
        shiftKey: true
      })
      ;(me.target as Element).dispatchEvent(selectionEvent)
      forcingSelection = false
    }
    screen?.addEventListener('mousedown', forceSelectionOnMouseDown, { capture: true })

    const handleCopy = (event: ClipboardEvent) => {
      if (!activeRef.current || !terminal.hasSelection()) {
        return
      }

      const activeElement = document.activeElement
      const terminalOwnsFocus =
        activeElement == null ||
        activeElement === document.body ||
        activeElement === document.documentElement ||
        (activeElement instanceof Element && containerRef.current?.contains(activeElement))

      if (!terminalOwnsFocus) {
        return
      }

      copySelectionToClipboard(event)
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      if (!sessionId || !e.dataTransfer?.files.length) return
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => bridge.webUtils.getPathForFile(f))
        .filter(Boolean)
      if (paths.length) {
        void bridge.terminal.write(sessionId, paths.join(' '))
      }
    }

    const container = containerRef.current
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)
    window.addEventListener('copy', handleCopy)

    requestAnimationFrame(() => {
      fitAddon.fit()
      terminal.focus()
    })

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = () => {
      terminal.options.theme = getTerminalTheme()
    }
    mql.addEventListener('change', handleThemeChange)

    const handleFontSizeChange = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail
      const next = typeof detail === 'number' ? detail : getStoredFontSize()
      if (terminal.options.fontSize === next) return
      terminal.options.fontSize = next
      try {
        fitAddon.fit()
      } catch {
        // ignore fit errors when container not measured yet
      }
      if (sessionId && containerRef.current?.offsetParent) {
        void bridge.terminal.resize(sessionId, terminal.cols, terminal.rows)
      }
    }
    window.addEventListener(FONT_SIZE_EVENT, handleFontSizeChange)

    const offData = bridge.terminal.onData((event) => {
      if (event.sessionId === sessionId) {
        terminal.write(event.data)
      }
    })

    const offExit = bridge.terminal.onExit((event) => {
      if (event.sessionId === sessionId) {
        terminal.writeln(`\r\n[process exited with code ${event.exitCode ?? 0}]`)
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()

      if (sessionId && containerRef.current?.offsetParent) {
        void bridge.terminal.resize(sessionId, terminal.cols, terminal.rows)
      }
    })

    resizeObserver.observe(containerRef.current)

    // Poll every 200ms to keep the terminal size in sync with the container,
    // since the initial fit may fire before the layout is fully resolved.
    let lastCols = terminal.cols
    let lastRows = terminal.rows
    const fitPollInterval = setInterval(() => {
      fitAddon.fit()
      if (sessionId && (terminal.cols !== lastCols || terminal.rows !== lastRows)) {
        lastCols = terminal.cols
        lastRows = terminal.rows
        void bridge.terminal.resize(sessionId, terminal.cols, terminal.rows)
      }
    }, 200)

    const terminalInputDisposable = terminal.onData((data) => {
      if (sessionId) {
        void bridge.terminal.write(sessionId, data)
      }
    })

    // Receive Ctrl+key combos forwarded from the main process (which intercepts
    // them via before-input-event to prevent Chromium from swallowing them).
    const offControlInput = bridge.terminal.onControlInput((data) => {
      console.log('[control-input] received', JSON.stringify(data), { sessionId, active: activeRef.current })
      if (sessionId && activeRef.current) {
        console.log('[control-input] writing to PTY session', sessionId)
        void bridge.terminal.write(sessionId, data)
      }
    })

    // Reattach to an existing tmux session or create a new one.
    const sessionPromise = tmuxSessionName
      ? bridge.terminal
          .attachSession({ tmuxSessionName, cols: terminal.cols, rows: terminal.rows })
          .then((r) => ({ ...r, tmuxSessionName }))
      : bridge.terminal.createSession({ cwd, cols: terminal.cols, rows: terminal.rows })

    void sessionPromise
      .then((result) => {
        if (disposed) {
          return
        }

        sessionId = result.sessionId
        sessionIdRef.current = result.sessionId
        if (activeRef.current) {
          void bridge.terminal.setActiveSession(result.sessionId)
        }
        onSessionCreatedRef.current?.(result.sessionId, result.pid, result.tmuxSessionName)

        if (!tmuxSessionName && initialCommand) {
          void bridge.terminal.write(result.sessionId, initialCommand + '\n')
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not open the terminal.'
        terminal.writeln(`\r\n${message}`)
      })

    return () => {
      disposed = true
      clearInterval(fitPollInterval)
      mql.removeEventListener('change', handleThemeChange)
      window.removeEventListener(FONT_SIZE_EVENT, handleFontSizeChange)
      resizeObserver.disconnect()
      offData()
      offExit()
      offControlInput()
      terminalInputDisposable.dispose()
      window.removeEventListener('copy', handleCopy)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
      screen?.removeEventListener('mousedown', forceSelectionOnMouseDown, { capture: true })

      if (sessionId) {
        void bridge.terminal.detach(sessionId)
      }

      terminal.dispose()

      terminalRef.current = null
      fitAddonRef.current = null
      sessionIdRef.current = null
    }
  }, [cwd, initialCommand, tmuxSessionName])

  useEffect(() => {
    if (!active) {
      return
    }

    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current

    if (!terminal || !fitAddon) {
      return
    }

    const bridge = getElectronBridge()

    const sid = sessionIdRef.current
    if (sid) {
      void bridge.terminal.setActiveSession(sid)
    }

    requestAnimationFrame(() => {
      fitAddon.fit()
      terminal.focus()

      if (sid) {
        void bridge.terminal.resize(sid, terminal.cols, terminal.rows)
      }
    })
  }, [active])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
}
